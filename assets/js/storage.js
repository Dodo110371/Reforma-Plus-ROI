/**
 * Gerenciador de Armazenamento Local (LocalStorage & Persistence)
 * ReformaPlus ROI - PWA
 */

const STORAGE_KEY_PROPERTY = 'reformaplus_property_info';
const STORAGE_KEY_EXPENSES = 'reformaplus_expenses';
const STORAGE_KEY_PHASES = 'reformaplus_phases';

const STORAGE_KEY_TRANSACTIONS = 'reformaplus_transactions_v2';
const STORAGE_KEY_STAGES = 'reformaplus_stages_v2';
const STORAGE_KEY_RECEIPTS = 'reformaplus_receipts_v2';

const STORAGE_KEY_PROPERTIES = 'reformaplus_properties_v1';
const STORAGE_KEY_ACTIVE_PROPERTY_ID = 'reformaplus_active_property_id_v1';

// Dados Iniciais de Exemplo (Seed Data para teste rápido de Flip Imobiliário)
const DEFAULT_PROPERTY = {
  id: null,
  user_id: null,
  title: 'Casa Residencial Jardim das Flores',
  cep: '04538-133',
  street: 'Rua das Flores',
  number: '123',
  complement: 'Casa 2 - Fundos',
  neighborhood: 'Jardim Europa',
  city: 'São Paulo',
  state: 'SP',
  purchasePrice: 280000.00,
  estimatedResalePrice: 480000.00,
  holdingCosts: 12500.00,
  targetDurationMonths: 4,
  notes: 'Imóvel adquirido em leilão/oportunidade. Reforma focada em cozinha americana e acabamento suíte para valorização rápida.',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEFAULT_PHASES = [
  { id: 'p1', name: 'Demolição e Limpeza', status: 'concluido', budget: 4500.00 },
  { id: 'p2', name: 'Infraestrutura (Elétrica & Hidráulica)', status: 'concluido', budget: 18500.00 },
  { id: 'p3', name: 'Alvenaria e Gesso', status: 'em_andamento', budget: 12000.00 },
  { id: 'p4', name: 'Pisos e Revestimentos', status: 'em_andamento', budget: 25000.00 },
  { id: 'p5', name: 'Pintura e Fachada', status: 'pendente', budget: 14000.00 },
  { id: 'p6', name: 'Marcenaria e Iluminação Final', status: 'pendente', budget: 16000.00 }
];

const DEFAULT_EXPENSES = [
  {
    id: 'exp-101',
    date: '2026-06-10',
    type: 'taxa',
    category: 'Documentação & Impostos',
    room: 'Geral',
    supplier: 'Cartório de Registro & Prefeitura (ITBI + Escritura)',
    description: 'Pagamento de ITBI e taxas cartorárias da compra do imóvel',
    amount: 9800.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-102',
    date: '2026-06-15',
    type: 'servico',
    category: 'Demolição',
    room: 'Cozinha & Sala',
    supplier: 'Empreiteiro João & Equipe',
    description: 'Demolição de parede para cozinha americana e remoção de entulho com caçamba',
    amount: 3800.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-103',
    date: '2026-06-20',
    type: 'material',
    category: 'Hidráulica',
    room: 'Banheiro Suíte',
    supplier: 'Depósito de Materiais ConstruTudo',
    description: 'Tubos Tigre, conexões, caixa dágua 1000L e registros de gaveta Docol',
    amount: 2450.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-104',
    date: '2026-07-02',
    type: 'material',
    category: 'Elétrica',
    room: 'Toda a Casa',
    supplier: 'EletroComercial Brasil',
    description: 'Fiação silnambres, disjuntores DIN Schneider, quadro de distribuição e tomadas Piamonte',
    amount: 4120.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-105',
    date: '2026-07-10',
    type: 'servico',
    category: 'Elétrica & Hidráulica',
    room: 'Toda a Casa',
    supplier: 'Eletricista Reinaldo Silva',
    description: 'Mão de obra para substituição completa da fiação e instalação dos pontos de água quente',
    amount: 6500.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-106',
    date: '2026-07-18',
    type: 'material',
    category: 'Revestimento',
    room: 'Cozinha & Banheiro',
    supplier: 'Leroy Merlin',
    description: 'Porcelanato Polido 84x84cm Elizabeth e argamassa ACIII quartzolit (35 caixas)',
    amount: 8900.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-107',
    date: '2026-07-28',
    type: 'servico',
    category: 'Assentamento de Piso',
    room: 'Cozinha & Banheiro',
    supplier: 'Azulejista Marcos',
    description: 'Mão de obra de nivelamento de contra-piso e assentamento do porcelanato',
    amount: 5200.00,
    status: 'pago',
    receipt: null
  },
  {
    id: 'exp-108',
    date: '2026-08-05',
    type: 'material',
    category: 'Pintura',
    room: 'Fachada & Interiores',
    supplier: 'Casa das Tintas',
    description: 'Tintas Suvinil Toque de Luz Branco Neve, selador, massa corrida e textura grafiato fachada',
    amount: 3600.00,
    status: 'pendente',
    receipt: null
  }
];

class StorageManager {
  static initStorage() {
    StorageManager._ensurePropertiesMigrated();
    const props = StorageManager.listProperties();
    if (props.length === 0) {
      const seed = StorageManager._withMeta({ ...DEFAULT_PROPERTY }, null);
      localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify([seed]));
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, seed.id);
    }
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROPERTY_ID);
    const propsNow = StorageManager.listProperties();
    if (!activeId || !propsNow.find(p => p.id === activeId)) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, propsNow[0].id);
    }
    StorageManager._ensureLegacySingletonsFromActive();
    StorageManager._ensureChildrenScopedToActive();
    StorageManager._ensureChildrenSeeded();
  }

  static _ensurePropertiesMigrated() {
    const hasNew = !!localStorage.getItem(STORAGE_KEY_PROPERTIES);
    const singleton = localStorage.getItem(STORAGE_KEY_PROPERTY);
    if (hasNew) {
      if (singleton) localStorage.removeItem(STORAGE_KEY_PROPERTY);
      return;
    }
    let active = null;
    try { active = singleton ? JSON.parse(singleton) : null; } catch (_) { active = null; }
    if (active && typeof active === 'object') {
      const enriched = StorageManager._withMeta(active, active.id);
      localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify([enriched]));
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, enriched.id);
    }
    const expensesRaw = localStorage.getItem(STORAGE_KEY_EXPENSES);
    const phasesRaw = localStorage.getItem(STORAGE_KEY_PHASES);
    const txRaw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    const stagesRaw = localStorage.getItem(STORAGE_KEY_STAGES);
    const receiptsRaw = localStorage.getItem(STORAGE_KEY_RECEIPTS);
    const propId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROPERTY_ID);
    if (propId) {
      if (expensesRaw) {
        try {
          const arr = JSON.parse(expensesRaw) || [];
          const out = arr.map(r => ({ ...(r || {}), property_id: r?.property_id || propId }));
          localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(out));
        } catch (_) { }
      }
      if (phasesRaw) {
        try {
          const arr = JSON.parse(phasesRaw) || [];
          const out = arr.map(r => ({ ...(r || {}), property_id: r?.property_id || propId }));
          localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(out));
        } catch (_) { }
      }
      if (txRaw) {
        try {
          const arr = JSON.parse(txRaw) || [];
          const out = arr.map(r => ({ ...(r || {}), property_id: r?.property_id || propId }));
          localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(out));
        } catch (_) { }
      }
      if (stagesRaw) {
        try {
          const arr = JSON.parse(stagesRaw) || [];
          const out = arr.map(r => ({ ...(r || {}), property_id: r?.property_id || propId }));
          localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(out));
        } catch (_) { }
      }
      if (receiptsRaw) {
        try {
          const arr = JSON.parse(receiptsRaw) || [];
          const out = arr.map(r => ({ ...(r || {}), property_id: r?.property_id || propId }));
          localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(out));
        } catch (_) { }
      }
    }
    if (singleton) localStorage.removeItem(STORAGE_KEY_PROPERTY);
  }

  static _ensureLegacySingletonsFromActive() {
    const active = StorageManager.getPropertyInfo();
    if (active) localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(active));
  }

  static _ensureChildrenSeeded() {
    const propId = StorageManager.getActivePropertyId();
    if (!localStorage.getItem(STORAGE_KEY_TRANSACTIONS)) {
      const migrated = DEFAULT_EXPENSES.map(e => ({
        ...StorageManager._migrateExpenseToTx(e),
        property_id: propId,
      }));
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(migrated));
    }
    if (!localStorage.getItem(STORAGE_KEY_STAGES)) {
      const migrated = DEFAULT_PHASES.map((p, i) => ({
        ...StorageManager._migratePhaseToStage(p, i),
        property_id: propId,
      }));
      localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(migrated));
    }
    if (!localStorage.getItem(STORAGE_KEY_RECEIPTS)) {
      localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEY_EXPENSES)) {
      const withProp = DEFAULT_EXPENSES.map(e => ({ ...e, property_id: propId }));
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(withProp));
    }
    if (!localStorage.getItem(STORAGE_KEY_PHASES)) {
      const withProp = DEFAULT_PHASES.map((p, i) => ({ ...p, property_id: propId, order: i }));
      localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(withProp));
    }
  }

  static _ensureChildrenScopedToActive() {
  }

  static _guid() {
    try { return crypto.randomUUID(); } catch (_) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
      });
    }
  }

  static _isValidUuid(val) {
    if (!val || typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
  }

  static getActivePropertyId() {
    StorageManager.initStorage();
    return localStorage.getItem(STORAGE_KEY_ACTIVE_PROPERTY_ID);
  }

  static setActivePropertyId(propertyId) {
    if (!propertyId) return false;
    StorageManager.initStorage();
    const list = StorageManager.listProperties();
    const exists = list.find(p => p.id === propertyId);
    if (!exists) return false;
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, propertyId);
    StorageManager._ensureLegacySingletonsFromActive();
    return true;
  }

  static listProperties() {
    const raw = localStorage.getItem(STORAGE_KEY_PROPERTIES);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) || [];
      return arr.filter(p => p && p.id);
    } catch (_) { return []; }
  }

  static getPropertyById(id) {
    return StorageManager.listProperties().find(p => p.id === id) || null;
  }

  static createProperty(propertyData) {
    const enriched = StorageManager._withMeta({ ...DEFAULT_PROPERTY, ...(propertyData || {}) }, propertyData?.id);
    if (!enriched.property_id) enriched.property_id = enriched.id;
    const list = StorageManager.listProperties();
    list.push(enriched);
    localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify(list));
    StorageManager._seedEmptyChildrenForProperty(enriched.id);
    StorageManager.setActivePropertyId(enriched.id);
    StorageManager._ensureLegacySingletonsFromActive();
    StorageManager._queueSync('properties', 'insert', enriched);
    return enriched;
  }

  static _seedEmptyChildrenForProperty(propId) {
    const defaultPhases = DEFAULT_PHASES.map((p, i) => ({
      ...StorageManager._migratePhaseToStage(p, i),
      property_id: propId,
    }));
    const allStages = StorageManager._readAll(STORAGE_KEY_STAGES);
    defaultPhases.forEach(st => {
      const idx = allStages.findIndex(s => s.id === st.id);
      if (idx === -1) allStages.push(st);
      else allStages[idx] = { ...allStages[idx], ...st };
    });
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(allStages));

    const allPhases = StorageManager._readAll(STORAGE_KEY_PHASES);
    DEFAULT_PHASES.forEach((p, i) => {
      const entry = { ...p, id: p.id + '-' + (propId || '').slice(0, 6), order: i, property_id: propId };
      allPhases.push(entry);
    });
    localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(allPhases));

    StorageManager._queueSync('project_stages', 'update', { id: 'bulk-seed' });
  }

  static _readAll(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; }
  }

  static deleteProperty(propertyId) {
    if (!propertyId) return false;
    const list = StorageManager.listProperties();
    const target = list.find(p => p.id === propertyId);
    if (!target) return false;
    const kept = list.filter(p => p.id !== propertyId);
    localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify(kept));
    localStorage.setItem(
      STORAGE_KEY_EXPENSES,
      JSON.stringify(StorageManager._readAll(STORAGE_KEY_EXPENSES).filter(r => r.property_id !== propertyId))
    );
    localStorage.setItem(
      STORAGE_KEY_PHASES,
      JSON.stringify(StorageManager._readAll(STORAGE_KEY_PHASES).filter(r => r.property_id !== propertyId))
    );
    localStorage.setItem(
      STORAGE_KEY_TRANSACTIONS,
      JSON.stringify(StorageManager._readAll(STORAGE_KEY_TRANSACTIONS).filter(r => r.property_id !== propertyId))
    );
    localStorage.setItem(
      STORAGE_KEY_STAGES,
      JSON.stringify(StorageManager._readAll(STORAGE_KEY_STAGES).filter(r => r.property_id !== propertyId))
    );
    localStorage.setItem(
      STORAGE_KEY_RECEIPTS,
      JSON.stringify(StorageManager._readAll(STORAGE_KEY_RECEIPTS).filter(r => r.property_id !== propertyId))
    );
    if (StorageManager.getActivePropertyId() === propertyId) {
      if (kept.length > 0) localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, kept[0].id);
      else localStorage.removeItem(STORAGE_KEY_ACTIVE_PROPERTY_ID);
    }
    StorageManager._ensureLegacySingletonsFromActive();
    StorageManager._queueSync('properties', 'delete', target);
    return true;
  }

  static _withMeta(obj, entityId) {
    const now = new Date().toISOString();
    let userId = null;
    try { if (window.SupabaseClient?.auth?.getUserIdSync) userId = window.SupabaseClient.auth.getUserIdSync(); } catch (_) { }
    const currentIdIsValid = StorageManager._isValidUuid(obj?.id);
    const fallbackId = StorageManager._isValidUuid(entityId) ? entityId : null;
    return {
      ...obj,
      id: currentIdIsValid ? obj.id : (fallbackId || StorageManager._guid()),
      user_id: obj.user_id || userId || null,
      created_at: obj.created_at || now,
      updated_at: now,
    };
  }

  static _queueSync(entity, verb, payload) {
    try {
      if (!window.SupabaseSync) return;
      const map = {
        properties: 'enqueueProperty',
        project_stages: 'enqueueStage',
        stages: 'enqueueStage',
        transactions: 'enqueueTransaction',
        transaction_receipts: 'enqueueReceipt',
        receipts: 'enqueueReceipt',
      };
      const fn = window.SupabaseSync[map[entity]];
      if (typeof fn === 'function') fn(verb, payload);
    } catch (_) { /* sync é best-effort, silencioso */ }
  }

  static _migrateExpenseToTx(e) {
    const statusMap = { pago: 'paid', pendente: 'pending', vencido: 'overdue' };
    const typeMap = { material: 'expense', servico: 'expense', taxa: 'expense', receita: 'income', recebimento: 'income' };
    return StorageManager._withMeta({
      id: e.id,
      type: typeMap[e.type] || 'expense',
      tx_type: typeMap[e.type] || 'expense',
      category: e.category || 'Outros',
      subcategory: '',
      environment: e.room || '',
      description: e.description || 'Sem descrição',
      amount: Number(e.amount || 0),
      quantity: 1,
      unitPrice: null,
      supplier: e.supplier || '',
      documentNumber: '',
      document_number: '',
      paymentMethod: e.status ? 'Outros' : 'Pix',
      payment_method: 'Pix',
      paymentStatus: statusMap[e.status] || 'paid',
      payment_status: statusMap[e.status] || 'paid',
      date: e.date || new Date().toISOString().slice(0, 10),
      tx_date: e.date || new Date().toISOString().slice(0, 10),
      dueDate: null,
      due_date: null,
      stageId: null,
      stage_id: null,
      notes: '',
    }, e.id);
  }

  static _migratePhaseToStage(p, idx) {
    const statusMap = { pendente: 'pending', em_andamento: 'in_progress', concluido: 'completed', atrasado: 'delayed' };
    return StorageManager._withMeta({
      id: p.id,
      name: p.name || `Fase ${idx + 1}`,
      order: p.order ?? idx,
      stage_order: p.order ?? idx,
      status: statusMap[p.status] || 'pending',
      physicalPct: Number(p.physicalPct || p.physical_pct || 0),
      physical_pct: Number(p.physicalPct || p.physical_pct || 0),
      financialPct: Number(p.financialPct || p.financial_pct || 0),
      financial_pct: Number(p.financialPct || p.financial_pct || 0),
      budgetAmount: Number(p.budget || p.budget_amount || 0),
      budget_amount: Number(p.budget || p.budget_amount || 0),
      spentAmount: Number(p.spent || p.spent_amount || 0),
      spent_amount: Number(p.spent || p.spent_amount || 0),
      startDate: p.startDate || p.start_date || null,
      start_date: p.startDate || p.start_date || null,
      endDate: p.endDate || p.end_date || null,
      end_date: p.endDate || p.end_date || null,
      notes: p.notes || '',
    }, p.id);
  }

  // --------------------------------------------------------------
  // Métodos do Imóvel (v1 - compat) + nova semântica v2 com sync + multi-imóvel
  // --------------------------------------------------------------
  static getPropertyInfo() {
    this.initStorage();
    const id = StorageManager.getActivePropertyId();
    if (!id) {
      const raw = localStorage.getItem(STORAGE_KEY_PROPERTY);
      return raw ? JSON.parse(raw) : null;
    }
    return StorageManager.getPropertyById(id) || (JSON.parse(localStorage.getItem(STORAGE_KEY_PROPERTY) || 'null'));
  }

  static savePropertyInfo(propertyData, skipSync = false) {
    this.initStorage();
    const existing = this.getPropertyInfo() || {};
    const targetId = propertyData?.id || existing.id || StorageManager.getActivePropertyId();
    const merged = this._withMeta({ ...existing, ...propertyData, id: targetId }, targetId);
    merged.property_id = merged.property_id || merged.id;
    const list = StorageManager.listProperties();
    const idx = list.findIndex(p => p.id === merged.id);
    if (idx === -1) list.push(merged); else list[idx] = merged;
    localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify(list));
    localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(merged));
    const isNew = idx === -1;
    if (!skipSync) this._queueSync('properties', isNew ? 'insert' : 'update', merged);
    return merged;
  }

  // --------------------------------------------------------------
  // Métodos de Despesas (v1 - legado). DEPRECATED: use Transactions
  // --------------------------------------------------------------
  static getExpenses() {
    this.initStorage();
    const propId = StorageManager.getActivePropertyId();
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_EXPENSES)) || [];
    if (!propId) return arr;
    return arr.filter(r => r.property_id === propId || !r.property_id);
  }

  static saveExpense(expenseData) {
    const expenses = this._readAll(STORAGE_KEY_EXPENSES);
    const propId = StorageManager.getActivePropertyId();
    const record = { ...expenseData, property_id: expenseData?.property_id || propId };
    if (record.id) {
      const index = expenses.findIndex(e => e.id === record.id);
      if (index !== -1) expenses[index] = record;
      else expenses.push(record);
    } else {
      record.id = 'exp-' + Date.now();
      expenses.push(record);
    }
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    const tx = this._migrateExpenseToTx(record);
    tx.property_id = record.property_id;
    this.saveTransaction(tx, true);
    return record;
  }

  static deleteExpense(expenseId) {
    let expenses = this._readAll(STORAGE_KEY_EXPENSES);
    const target = expenses.find(e => e.id === expenseId);
    expenses = expenses.filter(e => e.id !== expenseId);
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    if (target) this.deleteTransaction(expenseId, true);
  }

  // --------------------------------------------------------------
  // Métodos de Etapas (v1 - legado). DEPRECATED: use Stages v2
  // --------------------------------------------------------------
  static getPhases() {
    this.initStorage();
    const propId = StorageManager.getActivePropertyId();
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_PHASES)) || [];
    if (!propId) return arr;
    return arr.filter(r => r.property_id === propId || !r.property_id);
  }

  static savePhases(phasesData) {
    const propId = StorageManager.getActivePropertyId();
    const oldAll = this._readAll(STORAGE_KEY_PHASES);
    const keptOthers = oldAll.filter(r => r.property_id && r.property_id !== propId);
    const withProp = phasesData.map((p, i) => ({
      ...(p || {}),
      id: p?.id || `p-${Date.now()}-${i}`,
      property_id: p?.property_id || propId,
      order: p?.order ?? i,
    }));
    const merged = [...keptOthers, ...withProp];
    localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(merged));
    const stages = withProp.map((p, i) => {
      const stage = this._migratePhaseToStage(p, p?.order ?? i);
      stage.property_id = propId;
      return stage;
    });
    this._replaceStagesForPropertyId(propId, stages, true);
  }

  static _replaceStagesForPropertyId(propId, newStagesForProp, skipSync = false) {
    const all = this._readAll(STORAGE_KEY_STAGES);
    const others = all.filter(s => s.property_id && s.property_id !== propId);
    const full = [...others, ...newStagesForProp];
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(full));
    if (!skipSync) newStagesForProp.forEach(s => this._queueSync('project_stages', 'update', s));
  }

  // --------------------------------------------------------------
  // v2 - TRANSACTIONS (substituem Expenses)
  // --------------------------------------------------------------
  static getTransactions() {
    this.initStorage();
    const propId = StorageManager.getActivePropertyId();
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_TRANSACTIONS)) || [];
    if (!propId) return arr;
    return arr.filter(r => r.property_id === propId || !r.property_id);
  }

  static saveTransaction(txData, skipSync = false) {
    const arr = this._readAll(STORAGE_KEY_TRANSACTIONS);
    const propId = StorageManager.getActivePropertyId();
    const base = { ...txData, property_id: txData?.property_id || propId };
    const enriched = this._withMeta(base, base.id);
    enriched.property_id = base.property_id;
    const idx = arr.findIndex(t => t.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(arr));
    if (!skipSync) this._queueSync('transactions', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteTransaction(txId, skipSync = false) {
    let arr = this._readAll(STORAGE_KEY_TRANSACTIONS);
    const target = arr.find(t => t.id === txId);
    arr = arr.filter(t => t.id !== txId);
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('transactions', 'delete', target);
  }

  static replaceAllTransactions(newList, skipSync = false) {
    const propId = StorageManager.getActivePropertyId();
    const oldAll = this._readAll(STORAGE_KEY_TRANSACTIONS);
    const otherProps = oldAll.filter(t => t.property_id && t.property_id !== propId);
    const forActive = newList.map((t, i) => {
      const enr = this._withMeta(t, t.id || `tx-replace-${Date.now()}-${i}`);
      enr.property_id = enr.property_id || propId;
      return enr;
    });
    const full = [...otherProps, ...forActive];
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(full));
    if (!skipSync) forActive.forEach(t => this._queueSync('transactions', 'update', t));
    return forActive;
  }

  // --------------------------------------------------------------
  // v2 - STAGES (substituem Phases)
  // --------------------------------------------------------------
  static getStages() {
    this.initStorage();
    const propId = StorageManager.getActivePropertyId();
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_STAGES)) || [];
    if (!propId) return arr;
    return arr.filter(r => r.property_id === propId || !r.property_id);
  }

  static saveStage(stageData, skipSync = false) {
    const arr = this._readAll(STORAGE_KEY_STAGES);
    const propId = StorageManager.getActivePropertyId();
    const base = { ...stageData, property_id: stageData?.property_id || propId };
    const enriched = this._withMeta(base, base.id);
    enriched.property_id = base.property_id;
    const idx = arr.findIndex(s => s.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(arr));
    if (!skipSync) this._queueSync('project_stages', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteStage(stageId, skipSync = false) {
    let arr = this._readAll(STORAGE_KEY_STAGES);
    const target = arr.find(s => s.id === stageId);
    arr = arr.filter(s => s.id !== stageId);
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('project_stages', 'delete', target);
  }

  static replaceAllStages(newList, skipSync = false) {
    const propId = StorageManager.getActivePropertyId();
    const oldAll = this._readAll(STORAGE_KEY_STAGES);
    const otherProps = oldAll.filter(s => s.property_id && s.property_id !== propId);
    const forActive = newList.map((p, i) => {
      const enr = this._withMeta(p, p.id || `stage-${Date.now()}-${i}`);
      enr.property_id = enr.property_id || propId;
      return enr;
    });
    const full = [...otherProps, ...forActive];
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(full));
    if (!skipSync) forActive.forEach(s => this._queueSync('project_stages', 'update', s));
    return forActive;
  }

  // --------------------------------------------------------------
  // v2 - RECEIPTS (anexos de transações via storage)
  // --------------------------------------------------------------
  static getReceipts() {
    this.initStorage();
    const propId = StorageManager.getActivePropertyId();
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_RECEIPTS)) || [];
    if (!propId) return arr;
    return arr.filter(r => r.property_id === propId || !r.property_id);
  }

  static getReceiptsByTransaction(txId) {
    return this.getReceipts().filter(r => r.transaction_id === txId || r.txId === txId);
  }

  static saveReceipt(receiptData, skipSync = false) {
    const arr = this._readAll(STORAGE_KEY_RECEIPTS);
    const propId = StorageManager.getActivePropertyId();
    const base = {
      ...receiptData,
      property_id: receiptData?.property_id || propId,
      transaction_id: receiptData.transaction_id || receiptData.txId,
      storage_path: receiptData.storage_path || receiptData.path,
      original_filename: receiptData.original_filename || receiptData.originalFilename,
      mime_type: receiptData.mime_type || receiptData.mimeType,
      size_bytes: receiptData.size_bytes || receiptData.sizeBytes || 0,
      is_primary: !!receiptData.is_primary || !!receiptData.isPrimary,
    };
    const enriched = this._withMeta(base, base.id);
    enriched.property_id = base.property_id;
    const idx = arr.findIndex(r => r.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(arr));
    if (!skipSync) this._queueSync('transaction_receipts', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteReceipt(rId, skipSync = false) {
    let arr = this._readAll(STORAGE_KEY_RECEIPTS);
    const target = arr.find(r => r.id === rId);
    arr = arr.filter(r => r.id !== rId);
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('transaction_receipts', 'delete', target);
  }

  // Backup e Restauração de Dados (v2 - inclui transactions/stages/receipts)
  static exportAllDataJSON() {
    const backupObj = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      properties: this.listProperties(),
      active_property_id: this.getActivePropertyId(),
      property: this.getPropertyInfo(),
      expenses: this._readAll(STORAGE_KEY_EXPENSES),
      phases: this._readAll(STORAGE_KEY_PHASES),
      transactions: this._readAll(STORAGE_KEY_TRANSACTIONS),
      stages: this._readAll(STORAGE_KEY_STAGES),
      receipts: this._readAll(STORAGE_KEY_RECEIPTS),
    };
    return JSON.stringify(backupObj, null, 2);
  }

  static importAllDataJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.properties) && data.properties.length > 0) {
        localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify(data.properties));
        if (data.active_property_id) localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, String(data.active_property_id));
      }
      if (data.property) localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(data.property));
      if (data.expenses) localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(data.expenses));
      if (data.phases) localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(data.phases));
      if (data.transactions) localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(data.transactions));
      if (data.stages) localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(data.stages));
      if (data.receipts) localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(data.receipts));
      return true;
    } catch (err) {
      console.error('Erro ao importar JSON:', err);
      return false;
    }
  }

  static resetToDefaultData() {
    const seed = StorageManager._withMeta({ ...DEFAULT_PROPERTY }, null);
    localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify([seed]));
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROPERTY_ID, seed.id);
    localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(seed));
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(DEFAULT_EXPENSES.map(e => ({ ...e, property_id: seed.id }))));
    localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(DEFAULT_PHASES.map((p, i) => ({ ...p, order: i, property_id: seed.id }))));
    localStorage.setItem(
      STORAGE_KEY_TRANSACTIONS,
      JSON.stringify(DEFAULT_EXPENSES.map(e => ({ ...StorageManager._migrateExpenseToTx(e), property_id: seed.id })))
    );
    localStorage.setItem(
      STORAGE_KEY_STAGES,
      JSON.stringify(DEFAULT_PHASES.map((p, i) => ({ ...StorageManager._migratePhaseToStage(p, i), property_id: seed.id })))
    );
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify([]));
  }
}

/**
 * Gerenciador de Autenticação & Permissões (AuthManager)
 *
 * MODO HÍBRIDO (v2):
 *  1. SUPABASE AUTH (preferencial): se o cliente Supabase está inicializado
 *     e o usuário está logado via email/senha ou magic link, retornamos "admin"
 *     automaticamente (não precisa digitar o PIN local).
 *  2. PIN LOCAL LEGADO (fallback): se não tem Supabase ou usuário deslogou,
 *     continua funcionando o PIN em localStorage (padrão 1234, igual antes).
 */
const STORAGE_KEY_AUTH_PIN = 'reformaplus_auth_pin';
const SESSION_KEY_IS_AUTH = 'reformaplus_is_authenticated';
const DEFAULT_PIN = '1234';

class AuthManager {
  static initAuth() {
    if (!localStorage.getItem(STORAGE_KEY_AUTH_PIN)) {
      localStorage.setItem(STORAGE_KEY_AUTH_PIN, DEFAULT_PIN);
    }
  }

  static async _hasSupabaseSession() {
    try {
      if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) return false;
      const user = await window.SupabaseClient.auth.getUser();
      return !!user;
    } catch (_) { return false; }
  }

  static _hasSupabaseSessionSync() {
    try {
      if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) return false;
      const cachedId = window.SupabaseClient.auth.getUserIdSync();
      if (cachedId) return true;
      return false;
    } catch (_) { return false; }
  }

  static getCurrentUserId() {
    if (this._hasSupabaseSessionSync()) {
      return window.SupabaseClient.auth.getUserIdSync();
    }
    return 'local-user-admin';
  }

  static getCurrentUserEmail() {
    try {
      if (window.SupabaseClient?.isEnabled?.()) {
        const cached = window.SupabaseClient.auth.getUserEmailSync();
        if (cached) return cached;
      }
    } catch (_) { }
    return null;
  }

  static isAuthenticated() {
    if (this._hasSupabaseSessionSync()) return true;
    return sessionStorage.getItem(SESSION_KEY_IS_AUTH) === 'true';
  }

  static async isAuthenticatedAsync() {
    if (await this._hasSupabaseSession()) return true;
    return sessionStorage.getItem(SESSION_KEY_IS_AUTH) === 'true';
  }

  static login(inputPin) {
    this.initAuth();
    const storedPin = localStorage.getItem(STORAGE_KEY_AUTH_PIN) || DEFAULT_PIN;
    if (String(inputPin).trim() === storedPin) {
      sessionStorage.setItem(SESSION_KEY_IS_AUTH, 'true');
      return true;
    }
    return false;
  }

  static async signUpCloud({ email, password, fullName }) {
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) {
      return { error: new Error('Supabase não configurado.') };
    }
    return window.SupabaseClient.auth.signUp({ email, password, fullName });
  }

  static async signInCloud({ email, password }) {
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) {
      return { error: new Error('Supabase não configurado.') };
    }
    const resp = await window.SupabaseClient.auth.signIn({ email, password });
    if (!resp?.error && resp?.data?.user) {
      sessionStorage.setItem(SESSION_KEY_IS_AUTH, 'true');
    }
    return resp;
  }

  static async signInCloudMagic(email) {
    if (!window.SupabaseClient || !window.SupabaseClient.isEnabled()) {
      return { error: new Error('Supabase não configurado.') };
    }
    return window.SupabaseClient.auth.signInWithMagicLink({ email });
  }

  static async signOutCloud() {
    try {
      if (window.SupabaseClient?.isEnabled?.()) await window.SupabaseClient.auth.signOut();
    } catch (_) { }
    sessionStorage.setItem(SESSION_KEY_IS_AUTH, 'false');
    return true;
  }

  static logout() {
    sessionStorage.setItem(SESSION_KEY_IS_AUTH, 'false');
  }

  static changePin(currentPin, newPin) {
    this.initAuth();
    const storedPin = localStorage.getItem(STORAGE_KEY_AUTH_PIN) || DEFAULT_PIN;
    if (String(currentPin).trim() !== storedPin) {
      return { success: false, message: 'Senha atual incorreta.' };
    }
    if (!newPin || String(newPin).trim().length < 4) {
      return { success: false, message: 'A nova senha deve ter no mínimo 4 caracteres.' };
    }
    localStorage.setItem(STORAGE_KEY_AUTH_PIN, String(newPin).trim());
    return { success: true, message: 'Senha alterada com sucesso!' };
  }
}

// Exporta para escopo global no navegador
window.StorageManager = StorageManager;
window.AuthManager = AuthManager;
