/**
 * assets/js/supabaseSync.js
 *
 * CAMADA DE SINCRONIZAÇÃO LOCAL-FIRST ⇄ SUPABASE CLOUD
 *
 * Regra fundamental do ReformaPlus ROI v2:
 * "O usuário NUNCA perde dados, com ou sem internet."
 *
 * ARQUITETURA:
 * 1. App salva sempre PRIMEIRO no StorageManager (localStorage)
 * 2. Essa camada, em background (timeout 50ms), enfileira a operação em `pendingQueue`
 * 3. Se o Supabase estiver habilitado E temos sessão, envia as operações
 * 4. Se falhar (offline, 5xx, timeout), permanece na fila até sucesso (retry exponencial)
 * 5. Ao abrir o app de novo + internet voltar, a fila pendente é processada automaticamente.
 *
 * Tabelas sincronizadas (ordem correta de FK):
 *   1. properties     -> public.properties
 *   2. project_stages -> public.project_stages
 *   3. transactions   -> public.transactions
 *   4. transaction_receipts -> public.transaction_receipts
 */
(function globalSupabaseSync() {
  'use strict';

  const LS_QUEUE = 'reformaplus_sync_queue_v2';
  const LS_LAST_SYNC = 'reformaplus_sync_last_at_v2';
  const LS_CLOUD_SNAPSHOT = 'reformaplus_cloud_snapshot_v2';
  const MAX_RETRIES = 8;

  let queue = _safeRead(LS_QUEUE, []);
  let processing = false;

  function _safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) { return fallback; }
  }

  function _safeWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (_) { /* storage cheio: avisar no console */ console.warn('Storage cheio ao salvar', key); }
  }

  function _guid() {
    try { return crypto.randomUUID(); } catch (_) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
      });
    }
  }

  function _persistQueue() {
    queue = queue.filter(op => !(op.synced && op.retries >= MAX_RETRIES));
    _safeWrite(LS_QUEUE, queue);
  }

  function cloudSnapshotRead() {
    return _safeRead(LS_CLOUD_SNAPSHOT, null);
  }

  function cloudSnapshotWrite(snap) {
    _safeWrite(LS_CLOUD_SNAPSHOT, snap);
    _safeWrite(LS_LAST_SYNC, new Date().toISOString());
  }

  /**
   * Enfileira operação de sync. Chamado SEMPRE pelo StorageManager após salvar local.
   * @param {string} entity - properties | project_stages | transactions | transaction_receipts
   * @param {"insert"|"update"|"delete"} op
   * @param {object} payload - objeto completo (inclui `id` da linha)
   */
  function enqueue(entity, op, payload) {
    if (!payload || !payload.id) {
      console.warn('[Sync] payload.id obrigatório, ignorando:', entity, op);
      return;
    }
    const item = {
      id: _guid(),
      entity, op,
      payload: JSON.parse(JSON.stringify(payload)),
      synced: false,
      errored: false,
      error_message: null,
      retries: 0,
      created_at: new Date().toISOString(),
    };
    queue.push(item);
    _persistQueue();
    console.info(`[Sync] Enfileirado ${entity}.${op} (payload.id=${payload.id} | queue_item=${item.id}). Pendentes: ${pendingCount()}`);
    scheduleProcess();
  }

  let _scheduleTimer = null;
  function scheduleProcess(delayMs = 250) {
    if (_scheduleTimer) clearTimeout(_scheduleTimer);
    _scheduleTimer = setTimeout(processQueue, delayMs);
  }

  async function processQueue() {
    if (processing) {
      console.debug('[Sync] processQueue ignorado: já está processando.');
      return;
    }
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) {
      console.info('[Sync] processQueue PARADO: cliente Supabase NÃO inicializado/habilitado.');
      return;
    }
    if (queue.length === 0) {
      console.debug('[Sync] processQueue PARADO: fila vazia (nada a sincronizar).');
      return;
    }
    const user = await window.SupabaseClient.auth.getUser();
    if (!user) {
      console.warn('[Sync] processQueue PARADO: sem sessão válida de usuário na nuvem (auth.getUser() retornou null).');
      return;
    }
    const toProcess = queue.filter(o => !o.synced);
    if (toProcess.length === 0) {
      console.debug('[Sync] processQueue PARADO: todas as operações já foram sincronizadas.');
      return;
    }
    processing = true;
    console.info(`[Sync] ▶️ Iniciando sincronia: ${toProcess.length} operação(ões) pendente(s) | user_id=${user.id}`);
    try {
      const client = window.SupabaseClient.getClient();
      let okCount = 0;
      let failCount = 0;

      for (const op of toProcess) {
        try {
          await _dispatchOne(client, user, op);
          op.synced = true;
          op.errored = false;
          op.error_message = null;
          op.synced_at = new Date().toISOString();
          okCount++;
        } catch (err) {
          op.retries = (op.retries || 0) + 1;
          op.errored = true;
          op.error_message = String(err?.message || err).slice(0, 400);
          failCount++;
          console.warn(`[Sync] ❌ Falha em ${op.entity}.${op.op} (tentativa ${op.retries}/${MAX_RETRIES}) — msg: ${err?.message || err}`);
        }
      }
      console.info(`[Sync] ✅ Sincronia finalizada. Sucesso: ${okCount} | Falhas: ${failCount} | Restantes (erro + retry): ${pendingCount()}`);
      _persistQueue();
    } catch (topErr) {
      console.error('[Sync] ⛔ Erro CRÍTICO em processQueue:', topErr);
    } finally {
      processing = false;
    }
  }

  function _normalizePropertiesPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = {};
    if (payload.id !== undefined) out.id = payload.id;
    if (payload.user_id !== undefined) out.user_id = payload.user_id;
    if (payload.title !== undefined) out.title = payload.title == null ? null : String(payload.title).slice(0, 255);
    if (payload.cep !== undefined) out.cep = payload.cep == null ? null : String(payload.cep).replace(/\D/g, '').slice(0, 9);
    if (payload.street !== undefined) out.street = payload.street == null ? null : String(payload.street).slice(0, 255);
    if (payload.number !== undefined) out.number = payload.number == null ? null : String(payload.number).slice(0, 32);
    if (payload.complement !== undefined) out.complement = payload.complement == null ? null : String(payload.complement).slice(0, 255);
    if (payload.neighborhood !== undefined) out.neighborhood = payload.neighborhood == null ? null : String(payload.neighborhood).slice(0, 255);
    if (payload.city !== undefined) out.city = payload.city == null ? null : String(payload.city).slice(0, 255);
    if (payload.state !== undefined) {
      let raw = String(payload.state == null ? '' : payload.state).trim().toUpperCase();
      if (raw.length > 2) {
        const MAP_UF = {
          'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAPÁ': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'CEARÁ': 'CE',
          'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES', 'GOIAS': 'GO', 'GOIÁS': 'GO', 'MARANHAO': 'MA', 'MARANHÃO': 'MA',
          'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARÁ': 'PA', 'PARAIBA': 'PB', 'PARAÍBA': 'PB',
          'PARANA': 'PR', 'PARANÁ': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'PIAUÍ': 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN',
          'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RONDÔNIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP',
          'SERGIPE': 'SE', 'TOCANTINS': 'TO',
        };
        const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').trim();
        raw = MAP_UF[key] || MAP_UF[raw] || raw.replace(/[^A-Z]/g, '').slice(0, 2);
      }
      if (raw.length > 2) raw = raw.slice(0, 2);
      if (raw.length === 1) raw = raw + ' ';
      out.state = raw || null;
    }
    if (payload.purchasePrice !== undefined || payload.purchase_price !== undefined) {
      const raw = payload.purchasePrice !== undefined ? payload.purchasePrice : payload.purchase_price;
      const n = raw == null || raw === '' ? null : Number(raw);
      out.purchase_price = Number.isFinite(n) ? n : null;
    }
    if (payload.estimatedResalePrice !== undefined || payload.estimated_resale_price !== undefined) {
      const raw = payload.estimatedResalePrice !== undefined ? payload.estimatedResalePrice : payload.estimated_resale_price;
      const n = raw == null || raw === '' ? null : Number(raw);
      out.estimated_resale_price = Number.isFinite(n) ? n : null;
    }
    if (payload.arvNote !== undefined || payload.arv_note !== undefined) {
      const raw = payload.arvNote !== undefined ? payload.arvNote : payload.arv_note;
      if (raw != null && String(raw).trim() !== '') out.arv_note = String(raw);
    }
    if (payload.holdingCosts !== undefined || payload.holding_costs !== undefined) {
      const raw = payload.holdingCosts !== undefined ? payload.holdingCosts : payload.holding_costs;
      const n = raw == null || raw === '' ? null : Number(raw);
      out.holding_costs = Number.isFinite(n) ? n : null;
    }
    if (payload.targetDurationMonths !== undefined || payload.target_duration_months !== undefined) {
      const raw = payload.targetDurationMonths !== undefined ? payload.targetDurationMonths : payload.target_duration_months;
      const n = raw == null || raw === '' ? NaN : Number(raw);
      if (Number.isFinite(n)) out.target_duration_months = Math.max(1, Math.round(n));
      else out.target_duration_months = 4;
    }
    if (payload.notes !== undefined) out.notes = payload.notes == null ? null : String(payload.notes);
    if (payload.created_at !== undefined) out.created_at = payload.created_at;
    if (payload.updated_at !== undefined) out.updated_at = payload.updated_at;
    return out;
  }

  function _normalizeProjectStagesPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = {};
    if (payload.id !== undefined) out.id = payload.id;
    if (payload.property_id !== undefined) out.property_id = payload.property_id;
    if (payload.user_id !== undefined) out.user_id = payload.user_id;
    if (payload.name !== undefined) out.name = payload.name;
    if (payload.order !== undefined) out.stage_order = payload.order;
    else if (payload.stage_order !== undefined) out.stage_order = payload.stage_order;
    if (payload.status !== undefined) out.status = payload.status;
    if (payload.physicalPct !== undefined) out.physical_pct = payload.physicalPct;
    else if (payload.physical_pct !== undefined) out.physical_pct = payload.physical_pct;
    if (payload.financialPct !== undefined) out.financial_pct = payload.financialPct;
    else if (payload.financial_pct !== undefined) out.financial_pct = payload.financial_pct;
    if (payload.budgetAmount !== undefined) out.budget_amount = payload.budgetAmount;
    else if (payload.budget_amount !== undefined) out.budget_amount = payload.budget_amount;
    if (payload.spentAmount !== undefined) out.spent_amount = payload.spentAmount;
    else if (payload.spent_amount !== undefined) out.spent_amount = payload.spent_amount;
    if (payload.startDate !== undefined) out.start_date = payload.startDate;
    else if (payload.start_date !== undefined) out.start_date = payload.start_date;
    if (payload.endDate !== undefined) out.end_date = payload.endDate;
    else if (payload.end_date !== undefined) out.end_date = payload.end_date;
    if (payload.notes !== undefined) out.notes = payload.notes;
    if (payload.created_at !== undefined) out.created_at = payload.created_at;
    if (payload.updated_at !== undefined) out.updated_at = payload.updated_at;
    return out;
  }

  function _normalizeTransactionsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = {};
    if (payload.id !== undefined) out.id = payload.id;
    if (payload.property_id !== undefined) out.property_id = payload.property_id;
    if (payload.user_id !== undefined) out.user_id = payload.user_id;
    if (payload.type !== undefined) out.tx_type = payload.type;
    else if (payload.tx_type !== undefined) out.tx_type = payload.tx_type;
    if (payload.category !== undefined) out.category = payload.category;
    if (payload.subcategory !== undefined) out.subcategory = payload.subcategory;
    if (payload.environment !== undefined) out.environment = payload.environment;
    if (payload.description !== undefined) out.description = payload.description;
    if (payload.amount !== undefined) out.amount = Number(payload.amount);
    if (payload.quantity !== undefined) out.quantity = Number(payload.quantity);
    if (payload.unitPrice !== undefined) out.unit_price = payload.unitPrice;
    else if (payload.unit_price !== undefined) out.unit_price = payload.unit_price;
    if (payload.supplier !== undefined) out.supplier = payload.supplier;
    if (payload.documentNumber !== undefined) out.document_number = payload.documentNumber;
    else if (payload.document_number !== undefined) out.document_number = payload.document_number;
    if (payload.paymentMethod !== undefined) out.payment_method = payload.paymentMethod;
    else if (payload.payment_method !== undefined) out.payment_method = payload.payment_method;
    if (payload.paymentStatus !== undefined) out.payment_status = payload.paymentStatus;
    else if (payload.payment_status !== undefined) out.payment_status = payload.payment_status;
    if (payload.date !== undefined) out.tx_date = payload.date;
    else if (payload.tx_date !== undefined) out.tx_date = payload.tx_date;
    if (payload.dueDate !== undefined) out.due_date = payload.dueDate;
    else if (payload.due_date !== undefined) out.due_date = payload.due_date;
    if (payload.stageId !== undefined) out.stage_id = payload.stageId;
    else if (payload.stage_id !== undefined) out.stage_id = payload.stage_id;
    if (payload.notes !== undefined) out.notes = payload.notes;
    if (payload.created_at !== undefined) out.created_at = payload.created_at;
    if (payload.updated_at !== undefined) out.updated_at = payload.updated_at;
    return out;
  }

  function _normalizeTransactionReceiptsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = {};
    if (payload.id !== undefined) out.id = payload.id;
    if (payload.property_id !== undefined) out.property_id = payload.property_id;
    if (payload.transaction_id !== undefined) out.transaction_id = payload.transaction_id;
    if (payload.txId !== undefined && !out.transaction_id) out.transaction_id = payload.txId;
    if (payload.user_id !== undefined) out.user_id = payload.user_id;
    if (payload.storage_path !== undefined) out.storage_path = payload.storage_path;
    else if (payload.path !== undefined) out.storage_path = payload.path;
    if (payload.original_filename !== undefined) out.original_filename = payload.original_filename;
    else if (payload.originalFilename !== undefined) out.original_filename = payload.originalFilename;
    if (payload.mime_type !== undefined) out.mime_type = payload.mime_type;
    else if (payload.mimeType !== undefined) out.mime_type = payload.mimeType;
    if (payload.size_bytes !== undefined) out.size_bytes = Number(payload.size_bytes);
    else if (payload.sizeBytes !== undefined) out.size_bytes = Number(payload.sizeBytes);
    if (payload.is_primary !== undefined) out.is_primary = !!payload.is_primary;
    else if (payload.isPrimary !== undefined) out.is_primary = !!payload.isPrimary;
    if (payload.signed_url !== undefined) out.signed_url = payload.signed_url;
    if (payload.full_path !== undefined) out.full_path = payload.full_path;
    if (payload.created_at !== undefined) out.created_at = payload.created_at;
    if (payload.updated_at !== undefined) out.updated_at = payload.updated_at;
    return out;
  }

  function _ensureActivePropertyIdOnPayload(entity, payload) {
    if (!payload) return payload;
    if (payload.property_id) return payload;
    let activeId = null;
    try {
      if (window.StorageManager?.getActivePropertyId) activeId = window.StorageManager.getActivePropertyId();
    } catch (_) { }
    if (entity === 'transaction_receipts' || entity === 'transactions' || entity === 'project_stages' || entity === 'properties') {
      if (activeId && !payload.property_id) return { ...payload, property_id: activeId };
    }
    return payload;
  }

  function _normalizePayloadForEntity(entity, payload) {
    const enriched = _ensureActivePropertyIdOnPayload(entity, payload);
    switch (entity) {
      case 'properties': return _normalizePropertiesPayload(enriched);
      case 'project_stages': return _normalizeProjectStagesPayload(enriched);
      case 'transactions': return _normalizeTransactionsPayload(enriched);
      case 'transaction_receipts': return _normalizeTransactionReceiptsPayload(enriched);
      default: return enriched;
    }
  }

  async function _dispatchOne(client, user, op) {
    const { entity, op: verb, payload } = op;
    console.debug(`[Sync]   ↪️ Executando ${entity}.${verb} (id=${payload.id})`);
    const withProp = _ensureActivePropertyIdOnPayload(entity, payload || {});
    let withUser = { ...withProp, user_id: withProp.user_id || user.id };

    if (verb !== 'delete') {
      withUser = _normalizePayloadForEntity(entity, withUser);
    }

    switch (entity) {
      case 'properties': return _runCrud(client, 'properties', verb, withUser, payload.id);
      case 'project_stages': return _runCrud(client, 'project_stages', verb, withUser, payload.id);
      case 'transactions': return _runCrud(client, 'transactions', verb, withUser, payload.id);
      case 'transaction_receipts': return _runCrud(client, 'transaction_receipts', verb, withUser, payload.id);
      default: throw new Error('Entidade desconhecida: ' + entity);
    }
  }

  async function _runCrud(client, table, verb, payload, id) {
    let resp;
    let rowsAffected = null;
    if (verb === 'insert') {
      resp = await client.from(table).insert(payload).select('id').maybeSingle();
      rowsAffected = resp?.data ? 1 : 0;
      if (!resp?.error && rowsAffected < 1) {
        console.warn(`[Sync]   ⚠️ ${table}.insert não retornou id (talvez RLS/policy bloqueou write?) id=${payload.id}`);
      } else if (!resp?.error) {
        console.info(`[Sync]   ✅ ${table}.insert OK (novo id=${resp?.data?.id || payload.id}).`);
      }
    } else if (verb === 'update') {
      resp = await client.from(table).update(payload).eq('id', id).select('id').maybeSingle();
      rowsAffected = resp?.data ? 1 : 0;
      if (!resp?.error && rowsAffected < 1) {
        console.warn(`[Sync]   ⚠️ ${table}.update afetou 0 linhas (registro ainda não existe no cloud). Executando INSERT AUTOMÁTICO (upsert). id=${id}`);
        const insertPayload = _normalizePayloadForEntity(table, payload);
        const insResp = await client.from(table).insert(insertPayload).select('id').maybeSingle();
        if (insResp?.error) {
          if (insResp.error.code === '23505') {
            const okResp = await client.from(table).update(insertPayload).eq('id', insertPayload.id).select('id').maybeSingle();
            if (okResp?.error) throw new Error(okResp.error.message || `Erro fallback ${table}/update-pos-23505`);
            console.info(`[Sync]   ✅ ${table}.upsert OK (23505 → update) id=${insertPayload.id}.`);
            return okResp?.data || { id: insertPayload.id };
          }
          console.warn(`[Sync]   ❌ ${table}.insert (fallback do update 0 linhas) falhou. code=${insResp.error?.code} msg=${insResp.error?.message}`);
          throw new Error(insResp.error.message || `Erro ${table}/upsert-via-update`);
        }
        console.info(`[Sync]   ✅ ${table}.upsert OK (via update→insert) id=${insResp?.data?.id || insertPayload.id}.`);
        return insResp?.data || { id: insertPayload.id };
      } else if (!resp?.error) {
        console.info(`[Sync]   ✅ ${table}.update OK (id=${resp?.data?.id || id}).`);
      }
    } else if (verb === 'delete') {
      resp = await client.from(table).delete().eq('id', id);
      if (!resp?.error) {
        console.info(`[Sync]   ✅ ${table}.delete OK (id=${id}).`);
      }
    } else {
      throw new Error('op desconhecida: ' + verb);
    }
    if (resp?.error) {
      if (verb === 'insert' && resp.error?.code === '23505') {
        const fallbackPayload = _normalizePayloadForEntity(table, payload);
        const fbResp = await client.from(table).update(fallbackPayload).eq('id', payload.id).select('id').maybeSingle();
        if (fbResp?.error) throw new Error(fbResp.error.message || `Erro fallback 23505 ${table}/update`);
        console.info(`[Sync]   ✅ ${table}.23505 → update OK (id=${fbResp?.data?.id || payload.id}).`);
        return fbResp?.data || { id: payload.id };
      }
      console.warn(
        `[Sync]   ❌ ${table}.${verb} (id=${id || payload.id || 'n/a'}): ${resp.error?.message || 'sem detalhe'}`,
        '\n     code:', resp.error?.code,
        '\n     hint:', resp.error?.hint,
        '\n     details:', resp.error?.details,
        '\n     payload keys:', Object.keys(payload || {}),
      );
      throw new Error(resp.error.message || `Erro ${table}/${verb}`);
    }
    return resp?.data || null;
  }

  /**
   * Pull from cloud: baixar dados do Supabase (quando usuário loga em novo dispositivo)
   * Mescla inteligente: se dado local é mais novo (via updated_at), mantém local.
   * Senão, substitui pelo cloud.
   */
  async function pullFromCloud() {
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) {
      return { ok: false, status: 'Supabase desabilitado' };
    }
    const user = await window.SupabaseClient.auth.getUser();
    if (!user) return { ok: false, status: 'Deslogado' };

    const client = window.SupabaseClient.getClient();
    const snap = {};

    const [
      propertiesResp, stagesResp, txResp, receiptsResp,
    ] = await Promise.all([
      client.from('properties').select('*').order('updated_at', { ascending: false }),
      client.from('project_stages').select('*').order('stage_order'),
      client.from('transactions').select('*').order('tx_date', { ascending: false }),
      client.from('transaction_receipts').select('*').order('created_at'),
    ]);

    snap.properties = propertiesResp.error ? [] : (propertiesResp.data || []);
    snap.stages = stagesResp.error ? [] : (stagesResp.data || []);
    snap.transactions = txResp.error ? [] : (txResp.data || []);
    snap.receipts = receiptsResp.error ? [] : (receiptsResp.data || []);
    snap.pulled_at = new Date().toISOString();
    snap.user_id = user.id;

    cloudSnapshotWrite(snap);
    const localOnly = await mergeCloudIntoLocal(snap, user.id);

    return {
      ok: true, status: 'Pulled', counts: {
        properties: snap.properties.length,
        stages: snap.stages.length,
        transactions: snap.transactions.length,
        receipts: snap.receipts.length,
      }, merged: localOnly
    };
  }

  async function mergeCloudIntoLocal(snap, user_id) {
    if (!window.StorageManager || !StorageManager.savePropertyInfo) return {};
    const merged = { properties: 0, stages: 0, transactions: 0 };
    if (snap.properties && snap.properties.length > 0) {
      const listLocal = StorageManager.listProperties() || [];
      const localById = Object.fromEntries(listLocal.map(p => [p.id, p]));
      let activeId = StorageManager.getActivePropertyId();
      snap.properties.forEach(p => {
        const local = localById[p.id];
        const cloudTs = new Date(p.updated_at || 0).getTime();
        const localTs = new Date(local?.updated_at || 0).getTime();
        const newer = cloudTs >= localTs ? p : local;
        const model = {
          id: newer?.id || p.id, user_id: newer?.user_id || user_id,
          title: newer?.title || 'Imóvel sem nome',
          cep: newer?.cep || '', street: newer?.street || '', number: newer?.number || '',
          complement: newer?.complement || '', neighborhood: newer?.neighborhood || '',
          city: newer?.city || '', state: newer?.state || '',
          purchasePrice: newer?.purchase_price ?? newer?.purchasePrice ?? 0,
          estimatedResalePrice: newer?.estimated_resale_price ?? newer?.estimatedResalePrice ?? 0,
          holdingCosts: newer?.holding_costs ?? newer?.holdingCosts ?? 0,
          targetDurationMonths: newer?.target_duration_months ?? newer?.targetDurationMonths ?? 4,
          notes: newer?.notes || '',
          created_at: newer?.created_at || p.created_at,
          updated_at: newer?.updated_at || p.updated_at,
        };
        const exists = listLocal.findIndex(x => x.id === model.id);
        if (exists === -1) listLocal.push(model); else listLocal[exists] = model;
        if (!activeId) activeId = model.id;
        merged.properties++;
      });
      localStorage.setItem('reformaplus_properties_v1', JSON.stringify(listLocal));
      if (activeId) localStorage.setItem('reformaplus_active_property_id_v1', String(activeId));
    }

    if (snap.stages && snap.stages.length > 0 && window.StorageManager) {
      const all = StorageManager._readAll ? StorageManager._readAll('reformaplus_stages_v2') : (StorageManager.getStages ? StorageManager.getStages() : []);
      const stagesFromCloud = snap.stages.map(s => ({
        id: s.id,
        property_id: s.property_id || StorageManager.getActivePropertyId(),
        name: s.name, order: s.stage_order ?? 0,
        status: s.status,
        physicalPct: s.physical_pct ?? 0,
        financialPct: s.financial_pct ?? 0,
        budgetAmount: s.budget_amount ?? 0,
        spentAmount: s.spent_amount ?? 0,
        startDate: s.start_date, endDate: s.end_date,
        notes: s.notes || '',
        created_at: s.created_at, updated_at: s.updated_at, user_id: s.user_id || user_id,
      }));
      const map = new Map();
      all.forEach(it => map.set(it.id, it));
      stagesFromCloud.forEach(it => {
        const cur = map.get(it.id);
        const curTs = new Date(cur?.updated_at || 0).getTime();
        const newTs = new Date(it.updated_at || 0).getTime();
        if (!cur || newTs >= curTs) map.set(it.id, it);
      });
      const final = Array.from(map.values());
      localStorage.setItem('reformaplus_stages_v2', JSON.stringify(final));
      merged.stages = stagesFromCloud.length;
    }

    if (snap.transactions && snap.transactions.length > 0 && window.StorageManager) {
      const all = StorageManager._readAll ? StorageManager._readAll('reformaplus_transactions_v2') : (StorageManager.getTransactions ? StorageManager.getTransactions() : []);
      const txFromCloud = snap.transactions.map(t => ({
        id: t.id,
        property_id: t.property_id || StorageManager.getActivePropertyId(),
        type: t.tx_type,
        category: t.category, subcategory: t.subcategory || '',
        environment: t.environment || '',
        description: t.description,
        amount: t.amount || 0,
        quantity: t.quantity || 1,
        unitPrice: t.unit_price || null,
        supplier: t.supplier || '',
        documentNumber: t.document_number || '',
        paymentMethod: t.payment_method || 'Pix',
        paymentStatus: t.payment_status || 'paid',
        date: t.tx_date,
        dueDate: t.due_date || null,
        stageId: t.stage_id || null,
        notes: t.notes || '',
        user_id: t.user_id || user_id,
        created_at: t.created_at, updated_at: t.updated_at,
      }));
      const map = new Map();
      all.forEach(it => map.set(it.id, it));
      txFromCloud.forEach(it => {
        const cur = map.get(it.id);
        const curTs = new Date(cur?.updated_at || 0).getTime();
        const newTs = new Date(it.updated_at || 0).getTime();
        if (!cur || newTs >= curTs) map.set(it.id, it);
      });
      const final = Array.from(map.values());
      localStorage.setItem('reformaplus_transactions_v2', JSON.stringify(final));
      merged.transactions = txFromCloud.length;
    }
    StorageManager._ensureLegacySingletonsFromActive && StorageManager._ensureLegacySingletonsFromActive();
    return merged;
  }

  function pendingCount() { return queue.filter(o => !o.synced).length; }
  function erroredCount() { return queue.filter(o => o.errored).length; }
  function clearSynced() {
    queue = queue.filter(o => !o.synced);
    _persistQueue();
  }

  const SupabaseSync = {
    // ENFILEIRAR (StorageManager chama)
    enqueueProperty(op, payload) { enqueue('properties', op, payload); },
    enqueueStage(op, payload) { enqueue('project_stages', op, payload); },
    enqueueTransaction(op, payload) { enqueue('transactions', op, payload); },
    enqueueReceipt(op, payload) { enqueue('transaction_receipts', op, payload); },

    // PROCESSAR
    scheduleProcess,
    processQueue,
    pendingCount,
    erroredCount,
    clearSynced,

    // CLOUD OPERATIONS
    pullFromCloud,
    mergeCloudIntoLocal,
    cloudSnapshotRead,
    cloudSnapshotWrite,
  };

  window.SupabaseSync = SupabaseSync;

  // Boot: se está logado + internet, roda processQueue após 1.5s
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => scheduleProcess(500));
    window.addEventListener('DOMContentLoaded', () => scheduleProcess(1500));
    window.addEventListener('supabase:ready', () => scheduleProcess(1500));
  }
})();
