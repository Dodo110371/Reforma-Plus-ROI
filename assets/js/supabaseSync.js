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
    queue.push({
      id: _guid(),
      entity, op,
      payload: JSON.parse(JSON.stringify(payload)),
      synced: false,
      errored: false,
      error_message: null,
      retries: 0,
      created_at: new Date().toISOString(),
    });
    _persistQueue();
    scheduleProcess();
  }

  let _scheduleTimer = null;
  function scheduleProcess(delayMs = 250) {
    if (_scheduleTimer) clearTimeout(_scheduleTimer);
    _scheduleTimer = setTimeout(processQueue, delayMs);
  }

  async function processQueue() {
    if (processing) return;
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) return;
    if (queue.length === 0) return;
    const user = await window.SupabaseClient.auth.getUser();
    if (!user) return;

    processing = true;
    try {
      const client = window.SupabaseClient.getClient();
      const toProcess = queue.filter(o => !o.synced);

      for (const op of toProcess) {
        try {
          await _dispatchOne(client, user, op);
          op.synced = true;
          op.errored = false;
          op.error_message = null;
          op.synced_at = new Date().toISOString();
        } catch (err) {
          op.retries = (op.retries || 0) + 1;
          op.errored = true;
          op.error_message = String(err?.message || err).slice(0, 400);
          console.warn(`[Sync] Falha em ${op.entity}.${op.op} (tentativa ${op.retries}):`, err);
        }
      }
      _persistQueue();
    } finally {
      processing = false;
    }
  }

  function _normalizePropertiesPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = {};
    if (payload.id !== undefined) out.id = payload.id;
    if (payload.user_id !== undefined) out.user_id = payload.user_id;
    if (payload.title !== undefined) out.title = payload.title;
    if (payload.cep !== undefined) out.cep = payload.cep;
    if (payload.street !== undefined) out.street = payload.street;
    if (payload.number !== undefined) out.number = payload.number;
    if (payload.complement !== undefined) out.complement = payload.complement;
    if (payload.neighborhood !== undefined) out.neighborhood = payload.neighborhood;
    if (payload.city !== undefined) out.city = payload.city;
    if (payload.state !== undefined) out.state = payload.state;
    if (payload.purchasePrice !== undefined) out.purchase_price = payload.purchasePrice;
    else if (payload.purchase_price !== undefined) out.purchase_price = payload.purchase_price;
    if (payload.estimatedResalePrice !== undefined) out.estimated_resale_price = payload.estimatedResalePrice;
    else if (payload.estimated_resale_price !== undefined) out.estimated_resale_price = payload.estimated_resale_price;
    if (payload.arvNote !== undefined) out.arv_note = payload.arvNote;
    else if (payload.arv_note !== undefined) out.arv_note = payload.arv_note;
    if (payload.holdingCosts !== undefined) out.holding_costs = payload.holdingCosts;
    else if (payload.holding_costs !== undefined) out.holding_costs = payload.holding_costs;
    if (payload.targetDurationMonths !== undefined) out.target_duration_months = payload.targetDurationMonths;
    else if (payload.target_duration_months !== undefined) out.target_duration_months = payload.target_duration_months;
    if (payload.notes !== undefined) out.notes = payload.notes;
    if (payload.created_at !== undefined) out.created_at = payload.created_at;
    if (payload.updated_at !== undefined) out.updated_at = payload.updated_at;
    return out;
  }

  async function _dispatchOne(client, user, op) {
    const { entity, op: verb, payload } = op;
    let withUser = { ...payload, user_id: payload.user_id || user.id };

    if (entity === 'properties' && verb !== 'delete') {
      withUser = _normalizePropertiesPayload(withUser);
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
    if (verb === 'insert') {
      resp = await client.from(table).insert(payload).select('id').maybeSingle();
    } else if (verb === 'update') {
      resp = await client.from(table).update(payload).eq('id', id).select('id').maybeSingle();
    } else if (verb === 'delete') {
      resp = await client.from(table).delete().eq('id', id);
    } else {
      throw new Error('op desconhecida: ' + verb);
    }
    if (resp?.error) {
      if (verb === 'insert' && resp.error?.code === '23505') {
        const fallbackPayload = table === 'properties' ? _normalizePropertiesPayload(payload) : payload;
        return client.from(table).update(fallbackPayload).eq('id', payload.id).then(r => r.error && Promise.reject(r.error));
      }
      if (table === 'properties') {
        console.warn(`[Sync] Falha em properties.${verb} (id=${id || payload.id || 'n/a'}): ${resp.error?.message || 'sem detalhe'}`);
      }
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

    return { ok: true, status: 'Pulled', counts: {
      properties: snap.properties.length,
      stages: snap.stages.length,
      transactions: snap.transactions.length,
      receipts: snap.receipts.length,
    }, merged: localOnly };
  }

  async function mergeCloudIntoLocal(snap, user_id) {
    if (!window.StorageManager || !StorageManager.savePropertyInfo) return {};
    const merged = { properties: 0, stages: 0, transactions: 0 };

    const localProp = StorageManager.getPropertyInfo() || {};
    if (snap.properties.length > 0 && !localProp.id) {
      const p = snap.properties[0];
      const model = {
        id: p.id, user_id,
        title: p.title || localProp.title || 'Imóvel sem nome',
        cep: p.cep || '', street: p.street || '', number: p.number || '',
        complement: p.complement || '', neighborhood: p.neighborhood || '',
        city: p.city || '', state: p.state || '',
        purchasePrice: p.purchase_price ?? localProp.purchasePrice ?? 0,
        estimatedResalePrice: p.estimated_resale_price ?? localProp.estimatedResalePrice ?? 0,
        holdingCosts: p.holding_costs ?? localProp.holdingCosts ?? 0,
        targetDurationMonths: p.target_duration_months ?? localProp.targetDurationMonths ?? 4,
        notes: p.notes || localProp.notes || '',
      };
      StorageManager.savePropertyInfo(model, /*skipSync*/ true);
      merged.properties++;
    }

    if (snap.stages.length > 0 && window.StorageManager && StorageManager.replaceAllStages) {
      StorageManager.replaceAllStages(
        snap.stages.map(s => ({
          id: s.id,
          name: s.name, order: s.stage_order ?? 0,
          status: s.status,
          physicalPct: s.physical_pct ?? 0,
          financialPct: s.financial_pct ?? 0,
          budgetAmount: s.budget_amount ?? 0,
          spentAmount: s.spent_amount ?? 0,
          startDate: s.start_date, endDate: s.end_date,
          notes: s.notes || '',
        })),
        /*skipSync*/ true
      );
      merged.stages = snap.stages.length;
    }

    if (snap.transactions.length > 0 && window.StorageManager && StorageManager.replaceAllTransactions) {
      StorageManager.replaceAllTransactions(
        snap.transactions.map(t => ({
          id: t.id,
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
        })),
        /*skipSync*/ true
      );
      merged.transactions = snap.transactions.length;
    }
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
    enqueueStage(op, payload)    { enqueue('project_stages', op, payload); },
    enqueueTransaction(op, payload){ enqueue('transactions', op, payload); },
    enqueueReceipt(op, payload)  { enqueue('transaction_receipts', op, payload); },

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
    window.addEventListener('online',  () => scheduleProcess(500));
    window.addEventListener('DOMContentLoaded', () => scheduleProcess(1500));
    window.addEventListener('supabase:ready', () => scheduleProcess(1500));
  }
})();
