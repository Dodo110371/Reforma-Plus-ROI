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

// Dados Iniciais de Exemplo (Seed Data para teste rápido de Flip Imobiliário)
const DEFAULT_PROPERTY = {
  id: 'default-property-id-' + Math.random().toString(36).slice(2, 10),
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
  // Inicialização e carregamento padrão
  static initStorage() {
    if (!localStorage.getItem(STORAGE_KEY_PROPERTY)) {
      localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(DEFAULT_PROPERTY));
    }
    if (!localStorage.getItem(STORAGE_KEY_EXPENSES)) {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(DEFAULT_EXPENSES));
    }
    if (!localStorage.getItem(STORAGE_KEY_PHASES)) {
      localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(DEFAULT_PHASES));
    }
    if (!localStorage.getItem(STORAGE_KEY_TRANSACTIONS)) {
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(DEFAULT_EXPENSES.map(StorageManager._migrateExpenseToTx)));
    }
    if (!localStorage.getItem(STORAGE_KEY_STAGES)) {
      localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(DEFAULT_PHASES.map(StorageManager._migratePhaseToStage)));
    }
    if (!localStorage.getItem(STORAGE_KEY_RECEIPTS)) {
      localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify([]));
    }
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

  static _withMeta(obj, entityId) {
    const now = new Date().toISOString();
    let userId = null;
    try { if (window.SupabaseClient?.auth?.getUserIdSync) userId = window.SupabaseClient.auth.getUserIdSync(); } catch (_) { }
    return {
      ...obj,
      id: obj.id || entityId || StorageManager._guid(),
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
  // Métodos do Imóvel (v1 - compat) + nova semântica v2 com sync
  // --------------------------------------------------------------
  static getPropertyInfo() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_PROPERTY));
  }

  static savePropertyInfo(propertyData, skipSync = false) {
    const existing = this.getPropertyInfo();
    const merged = this._withMeta({ ...(existing || {}), ...propertyData }, propertyData?.id || existing?.id);
    localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify(merged));
    if (!skipSync) this._queueSync('properties', existing?.id ? 'update' : 'insert', merged);
    return merged;
  }

  // --------------------------------------------------------------
  // Métodos de Despesas (v1 - legado). DEPRECATED: use Transactions
  // --------------------------------------------------------------
  static getExpenses() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_EXPENSES)) || [];
  }

  static saveExpense(expenseData) {
    const expenses = this.getExpenses();
    if (expenseData.id) {
      const index = expenses.findIndex(e => e.id === expenseData.id);
      if (index !== -1) expenses[index] = expenseData;
      else expenses.push(expenseData);
    } else {
      expenseData.id = 'exp-' + Date.now();
      expenses.push(expenseData);
    }
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    // Sync via transactions v2 (mantemos ambos espelhados no MVP)
    const tx = this._migrateExpenseToTx(expenseData);
    this.saveTransaction(tx, true);
    return expenseData;
  }

  static deleteExpense(expenseId) {
    let expenses = this.getExpenses();
    expenses = expenses.filter(e => e.id !== expenseId);
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    this.deleteTransaction(expenseId, true);
  }

  // --------------------------------------------------------------
  // Métodos de Etapas (v1 - legado). DEPRECATED: use Stages v2
  // --------------------------------------------------------------
  static getPhases() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_PHASES)) || [];
  }

  static savePhases(phasesData) {
    localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(phasesData));
    const arr = phasesData.map((p, i) => this._migratePhaseToStage(p, i));
    this.replaceAllStages(arr, true);
  }

  // --------------------------------------------------------------
  // v2 - TRANSACTIONS (substituem Expenses)
  // --------------------------------------------------------------
  static getTransactions() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_TRANSACTIONS)) || [];
  }

  static saveTransaction(txData, skipSync = false) {
    const arr = this.getTransactions();
    const enriched = this._withMeta(txData, txData.id);
    const idx = arr.findIndex(t => t.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(arr));
    if (!skipSync) this._queueSync('transactions', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteTransaction(txId, skipSync = false) {
    let arr = this.getTransactions();
    const target = arr.find(t => t.id === txId);
    arr = arr.filter(t => t.id !== txId);
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('transactions', 'delete', target);
  }

  static replaceAllTransactions(newList, skipSync = false) {
    const enriched = newList.map((t, i) => this._withMeta(t, t.id || `tx-replace-${Date.now()}-${i}`));
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(enriched));
    if (!skipSync) enriched.forEach(t => this._queueSync('transactions', 'update', t));
    return enriched;
  }

  // --------------------------------------------------------------
  // v2 - STAGES (substituem Phases)
  // --------------------------------------------------------------
  static getStages() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_STAGES)) || [];
  }

  static saveStage(stageData, skipSync = false) {
    const arr = this.getStages();
    const enriched = this._withMeta(stageData, stageData.id);
    const idx = arr.findIndex(s => s.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(arr));
    if (!skipSync) this._queueSync('project_stages', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteStage(stageId, skipSync = false) {
    let arr = this.getStages();
    const target = arr.find(s => s.id === stageId);
    arr = arr.filter(s => s.id !== stageId);
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('project_stages', 'delete', target);
  }

  static replaceAllStages(newList, skipSync = false) {
    const enriched = newList.map((p, i) => this._withMeta(p, p.id || `stage-${Date.now()}-${i}`));
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(enriched));
    if (!skipSync) enriched.forEach(s => this._queueSync('project_stages', 'update', s));
    return enriched;
  }

  // --------------------------------------------------------------
  // v2 - RECEIPTS (anexos de transações via storage)
  // --------------------------------------------------------------
  static getReceipts() {
    this.initStorage();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_RECEIPTS)) || [];
  }

  static getReceiptsByTransaction(txId) {
    return this.getReceipts().filter(r => r.transaction_id === txId || r.txId === txId);
  }

  static saveReceipt(receiptData, skipSync = false) {
    const arr = this.getReceipts();
    const enriched = this._withMeta({
      ...receiptData,
      transaction_id: receiptData.transaction_id || receiptData.txId,
      storage_path: receiptData.storage_path || receiptData.path,
      original_filename: receiptData.original_filename || receiptData.originalFilename,
      mime_type: receiptData.mime_type || receiptData.mimeType,
      size_bytes: receiptData.size_bytes || receiptData.sizeBytes || 0,
      is_primary: !!receiptData.is_primary || !!receiptData.isPrimary,
    }, receiptData.id);
    const idx = arr.findIndex(r => r.id === enriched.id);
    const isUpdate = idx !== -1;
    if (isUpdate) arr[idx] = enriched;
    else arr.push(enriched);
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(arr));
    if (!skipSync) this._queueSync('transaction_receipts', isUpdate ? 'update' : 'insert', enriched);
    return enriched;
  }

  static deleteReceipt(rId, skipSync = false) {
    let arr = this.getReceipts();
    const target = arr.find(r => r.id === rId);
    arr = arr.filter(r => r.id !== rId);
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(arr));
    if (target && !skipSync) this._queueSync('transaction_receipts', 'delete', target);
  }

  // Backup e Restauração de Dados (v2 - inclui transactions/stages/receipts)
  static exportAllDataJSON() {
    const backupObj = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      property: this.getPropertyInfo(),
      expenses: this.getExpenses(),
      phases: this.getPhases(),
      transactions: this.getTransactions(),
      stages: this.getStages(),
      receipts: this.getReceipts(),
    };
    return JSON.stringify(backupObj, null, 2);
  }

  static importAllDataJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
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
    localStorage.setItem(STORAGE_KEY_PROPERTY, JSON.stringify({ ...DEFAULT_PROPERTY, id: StorageManager._guid() }));
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(DEFAULT_EXPENSES));
    localStorage.setItem(STORAGE_KEY_PHASES, JSON.stringify(DEFAULT_PHASES));
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(DEFAULT_EXPENSES.map(StorageManager._migrateExpenseToTx)));
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(DEFAULT_PHASES.map(StorageManager._migratePhaseToStage)));
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
      return !!window.SupabaseClient.auth.getUserIdSync();
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
      const raw = localStorage.getItem('sb-' + new URL(window.SupabaseClient?.debug?.().url || 'http://x').hostname.replace(/\./g, '-') + '-auth-token');
      if (raw) return JSON.parse(raw)?.user?.email || null;
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
    return window.SupabaseClient.auth.signIn({ email, password });
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
