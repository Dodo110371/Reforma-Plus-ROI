/**
 * Lógica Principal da Aplicação & Eventos
 * ReformaPlus ROI - PWA
 */

const SUPER_ADMIN_EMAILS = [
  'rosanacas1975@gmail.com',
];

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa a aplicação
  AppController.init();
});

class AppController {
  static currentExpenseIdToEdit = null;
  static currentReceiptPreviewUrl = null;

  static init() {
    try {
      this._setupMobileProauthViewport();
    } catch (err) { console.warn('[App] setup mobile viewport falhou:', err); }

    try {
      StorageManager.initStorage();
    } catch (err) {
      console.error('[App] Erro em StorageManager.initStorage (continuando mesmo assim):', err);
    }
    try {
      AuthManager.initAuth();
    } catch (err) {
      console.error('[App] Erro em AuthManager.initAuth (continuando mesmo assim):', err);
    }

    try { AppController.applySavedTheme(); } catch (err) { console.warn(err); }

    try {
      if (window.SupabaseClient?.auth?.onChange) {
        window.SupabaseClient.auth.onChange((evt, session) => {
          try {
            if (evt === 'SIGNED_IN' && session?.user) {
              try { sessionStorage.setItem('reformaplus_is_authenticated', 'true'); } catch (_) { }
              const userId = session.user.id;
              const existingProp = StorageManager.getPropertyInfo();
              if (existingProp && (!existingProp.user_id || existingProp.user_id === 'local-user-admin')) {
                StorageManager.savePropertyInfo({ user_id: userId }, true);
              }
            } else if (evt === 'SIGNED_OUT') {
              try { sessionStorage.setItem('reformaplus_is_authenticated', 'false'); } catch (_) { }
            }
          } catch (err) { console.warn('[App] onChange auth handler error:', err); }
          try { AppController.updateAuthUI(); } catch (_) { }
          if (evt === 'SIGNED_IN') {
            setTimeout(() => { try { SupabaseSync.processQueue(); } catch (_) { } }, 800);
          }
        });
      }
    } catch (err) { console.warn('[App] auth onChange listener não acoplado:', err); }

    try { this.registerServiceWorker(); } catch (err) { console.warn(err); }
    try { this.bindEvents(); } catch (err) { console.error('[App] ERRO CRÍTICO em bindEvents:', err); }
    try { this.renderAllViews(); } catch (err) { console.error('[App] ERRO em renderAllViews (bindEvents já rodou):', err); }

    try { this.handleDeepLink(); } catch (err) { console.warn('[App] handleDeepLink falhou:', err); }

    setTimeout(() => {
      try { if (AuthManager.isAuthenticated()) SupabaseSync.processQueue(); } catch (_) { }
    }, 1500);

    try { this._adminCheckPendingSelfDelete(); } catch (err) { console.warn('[Admin] init check self delete falhou:', err); }
  }

  /**
   * Router Deep Link: disparado por atalhos PWA (shortcuts),
   * Web Share Target, File Handler, Protocol Handler (web+reformaplus://)
   * e URLs diretas tipo reforma-plus-roi.vercel.app/#/imovels.
   *
   * Parâmetros reconhecidos (?query ou #hash ou /pathname):
   *  - ?deeplink=<aba>   (ex: ?deeplink=imovels)
   *  - ?launch=<aba>     (compatibilidade com apps antigos)
   *  - #/<aba>           (ex: #/dashboard)
   *  - pathname direto: /dashboard /imovels /despesas_new /lancamentos/novo etc
   *
   * Valores <aba> válidos:
   *  home inicio | dashboard | imovels properties | despesas lancamentos despesas_new lancamentos_new lancamentos/novo |
   *  etapas stages | relatorios reports | configuracoes ajustes | sobre termos privacidade |
   *  receipts recibos | share_target share
   */
  static handleDeepLink() {
    const url = new URL(window.location.href);
    const hashes = (url.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    const queryDeeplink = url.searchParams.get('deeplink') || url.searchParams.get('launch');

    let match = null;

    if (queryDeeplink) {
      match = String(queryDeeplink).trim().toLowerCase();
    } else if (hashes.length) {
      match = hashes.join('_').toLowerCase();
    } else {
      const pathname = url.pathname || '/';
      const clean = pathname.replace(/\/index\.html?$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
      if (clean) match = clean.replace(/\//g, '_');
    }

    if (!match) return;

    const router = new Map([
      [/^(home|inicio|)$/, () => { AppController.goHome(); }],
      [/^dashboard$/, () => { AppController.switchTab('dashboard'); AppController.scrollToTop(); }],
      [/^(imovels|properties|imoveis|property)$/, () => { AppController.switchTab('imovels'); AppController.scrollToTop(); }],
      [/^(despesas|lancamentos|transactions|expenses)$/, () => { AppController.switchTab('despesas'); AppController.scrollToTop(); }],
      [/^(despesas_new|lancamentos_new|lancamentos_novo|novo_lancamento|transactions_new)$/, () => {
        AppController.switchTab('despesas');
        setTimeout(() => {
          AppController.scrollToTop();
          const f = document.getElementById('newExpenseForm');
          if (f) {
            const desc = document.getElementById('expenseDescription');
            if (desc) setTimeout(() => desc.focus(), 250);
            f.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }],
      [/^(etapas|stages|fases|phases)$/, () => { AppController.switchTab('etapas'); AppController.scrollToTop(); }],
      [/^(relatorios|reports|relatorio)$/, () => { AppController.switchTab('relatorios'); AppController.scrollToTop(); }],
      [/^(configuracoes|ajustes|settings|preferencias|config|property|property_info|info)$/, () => { AppController.switchTab('configuracoes'); AppController.scrollToTop(); }],
      [/^sobre$/, () => { AppController.switchTabAndScrollTo('sobre', 'footer-info'); }],
      [/^(termos|terms|termos_uso)$/, () => { AppController.switchTabAndScrollTo('termos', 'footer-info'); }],
      [/^(privacidade|privacy|privacidade_dados)$/, () => { AppController.switchTabAndScrollTo('privacidade', 'footer-info'); }],
      [/^(recibos|receipts|anexos)$/, () => { AppController.switchTab('despesas'); AppController.scrollToTop(); }],
      [/^(share_target|share|compartilhar|compartilha)$/, () => {
        AppController.switchTab('despesas');
        AppController.showToast('📤 Arquivo(s) recebidos via Compartilhar (Web Share Target). Preencha os dados do lançamento e salve.', 'success', 5000);
        setTimeout(() => {
          AppController.scrollToTop();
          document.getElementById('newExpenseForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 180);
      }]
    ]);

    for (const [pattern, handler] of router) {
      if (pattern.test(match)) {
        handler();
        // limpa a URL para não reexecutar em refresh
        try {
          const clean = window.location.pathname + (window.location.search && !queryDeeplink ? window.location.search : '');
          window.history.replaceState({}, document.title, clean);
        } catch (_) { }
        return;
      }
    }
  }

  static applySavedTheme() {
    const saved = localStorage.getItem('reformaplus_theme_v1');
    const theme = saved === 'dark' || saved === 'light' ? saved : 'light';
    document.body.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  }

  static requireAuth(actionCallback) {
    if (AuthManager.isAuthenticated()) {
      actionCallback();
    } else {
      this.openModalAuth();
      this.showToast('🔒 Faça login como Administrador para realizar esta ação.');
    }
  }

  static registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      try { AppController._refreshInstallButton(); } catch (_) { }
      return;
    }
    try {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado, escopo:', reg.scope);
          try {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            if (reg.installing) {
              reg.installing.addEventListener('statechange', () => {
                try { if (reg.active) reg.active.postMessage({ type: 'SKIP_WAITING' }); } catch (_) { }
              });
            }
            if (reg.active) reg.active.postMessage({ type: 'SKIP_WAITING' });
          } catch (_) { }
          try { AppController._refreshInstallButton(); } catch (_) { }
        })
        .catch((err) => console.warn('[PWA] Erro registrar Service Worker:', err));
    } catch (err) {
      console.warn('[PWA] register() exceção:', err);
    }
    try { AppController._refreshInstallButton(); } catch (_) { }
  }

  static _refreshInstallButton() {
    const btn = document.getElementById('btnInstallPWA');
    if (!btn) return;

    if (AppController._isStandaloneMode()) {
      btn.style.display = 'none';
      return;
    }

    if (!btn.dataset.pwaInstallHandler) {
      btn.dataset.pwaInstallHandler = '1';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        AppController._handleInstallClick();
      });
    }

    if (deferredInstallPrompt && typeof deferredInstallPrompt.prompt === 'function') {
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.innerHTML = '📲 Instalar App';
      btn.title = 'Instalar ReformaPlus como aplicativo.';
      return;
    }

    btn.style.display = 'inline-flex';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = '⚠️ Instalação indisponível';
    btn.title = 'Instalação PWA não disponível no navegador atual ou ainda não liberada.';
  }

  static async _handleInstallClick() {
    if (!deferredInstallPrompt || typeof deferredInstallPrompt.prompt !== 'function') {
      try { AppController._refreshInstallButton(); } catch (_) { }
      return;
    }

    const p = deferredInstallPrompt;
    deferredInstallPrompt = null;

    try {
      await p.prompt();
      const choice = await p.userChoice;
      try { AppController._refreshInstallButton(); } catch (_) { }
      if (choice && choice.outcome === 'accepted') {
        try { AppController.showToast('⚙️ Instalação aceita. Preparando o ReformaPlus...', 'info', 12000); } catch (_) { }
      } else {
        try { AppController.showToast('Instalação cancelada.', 'info', 3000); } catch (_) { }
      }
    } catch (err) {
      console.warn('[PWA] prompt() falhou:', err);
      try { AppController._refreshInstallButton(); } catch (_) { }
    }
  }

  // Detecta aparelhos Motorola / Moto Launcher (têm limitação de não mostrar ícone automaticamente)
  static _isMotorola() {
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    const vendor = (navigator && navigator.vendor) ? navigator.vendor : '';
    return /motorola|moto g|moto g\d|myux| XT| moto |lenovo moto/i.test(ua + ' ' + vendor);
  }

  // Retorna true se o app está rodando como PWA instalado (sem barra do navegador)
  static _isStandaloneMode() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (window.navigator && 'standalone' in window.navigator && window.navigator.standalone === true) return true;
      if (document.referrer && document.referrer.includes('android-app://')) return true;
      const proto = (window.location && window.location.protocol) ? window.location.protocol : '';
      if (proto.startsWith('file') || proto.startsWith('chrome-extension')) return false;
    } catch (_) { }
    return false;
  }

  static bindEvents() {
    // Roteamento por Abas (Desktop + Mobile Drawer)
    const tabSelectors = '.nav-tab, .drawer-nav-item';
    const tabs = document.querySelectorAll(tabSelectors);
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // Barra Inferior de Acesso Rápido (quick-nav)
    const quickBtns = document.querySelectorAll('.quick-nav-btn');
    quickBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-quicknav-action');
        const target = e.currentTarget.getAttribute('data-quicknav-tab');
        if (action === 'goHome' && typeof AppController.goHome === 'function') {
          AppController.goHome();
        } else if (target) {
          this.switchTab(target);
        }
      });
    });
    try {
      if (quickBtns.length > 0) {
        document.body.classList.add('quick-nav-enabled');
      }
    } catch (_) { }

    // Formulário de Cadastro/Edição de Despesa
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) {
      expenseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.requireAuth(() => this.handleExpenseSubmit());
      });
    }

    // Leitor de Comprovantes/Recibos (Imagens ou PDF)
    const receiptInput = document.getElementById('expenseReceiptInput');
    if (receiptInput) {
      receiptInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            this.currentReceiptPreviewUrl = event.target.result;
            const previewContainer = document.getElementById('receiptPreviewContainer');
            if (previewContainer) {
              previewContainer.innerHTML = `<img src="${this.currentReceiptPreviewUrl}" style="max-height: 120px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-top: 0.5rem;" alt="Recibo Comprovante">`;
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Formulário de Configuração do Imóvel
    const propertyForm = document.getElementById('propertyForm');
    if (propertyForm) {
      propertyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.requireAuth(() => this.handlePropertyInfoSubmit());
      });
    }

    // Campo CEP: máscara automática e busca ao digitar/perder foco
    const cepInput = document.getElementById('propCep');
    if (cepInput) {
      cepInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length >= 5) v = v.slice(0, 5) + '-' + v.slice(5, 8);
        e.target.value = v;
      });
      cepInput.addEventListener('blur', () => {
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length === 8) this.buscarEnderecoPorCep();
      });
      cepInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.buscarEnderecoPorCep();
        }
      });
    }

    // Filtros de Tabela
    const searchInput = document.getElementById('filterSearch');
    const filterType = document.getElementById('filterType');
    const filterCategory = document.getElementById('filterCategory');

    if (searchInput) searchInput.addEventListener('input', () => this.renderExpensesTable());
    if (filterType) filterType.addEventListener('change', () => this.renderExpensesTable());
    if (filterCategory) filterCategory.addEventListener('change', () => this.renderExpensesTable());

    // Botões de Ação
    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        const expenses = StorageManager.getExpenses();
        const propertyInfo = StorageManager.getPropertyInfo();
        ReportsManager.exportExpensesToCSV(expenses, propertyInfo);
      });
    }

    const btnPrintReport = document.getElementById('btnPrintReport');
    if (btnPrintReport) {
      btnPrintReport.addEventListener('click', () => window.print());
    }

    const btnResetData = document.getElementById('btnResetData');
    if (btnResetData) {
      btnResetData.addEventListener('click', () => {
        this.requireAuth(() => {
          if (confirm('Tem certeza que deseja restaurar os dados de demonstração originais? Isso substituirá as despesas atuais.')) {
            StorageManager.resetToDefaultData();
            this.renderAllViews();
            this.showToast('Dados de demonstração restaurados com sucesso!');
          }
        });
      });
    }

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('reformaplus_theme_v1', newTheme);
        themeToggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
      });
    }

    // Máscaras de Moeda em Inputs Monetários (formato pt-BR: 1.234,56)
    const currencyInputIds = ['propPurchasePrice', 'propEstimatedResalePrice', 'propHoldingCosts', 'expenseAmount'];
    currencyInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('blur', () => {
        if (el.value === '' || el.value == null) return;
        const numeric = MetricsManager.parseCurrencyFromInput(el.value);
        el.value = MetricsManager.formatCurrencyForInput(numeric);
      });
      el.addEventListener('focus', () => {
        if (el.value === '' || el.value == null) return;
        const numeric = MetricsManager.parseCurrencyFromInput(el.value);
        el.value = numeric === 0 ? '' : numeric.toFixed(2).replace('.', ',');
      });
    });

    // Eventos de Autenticação / Login
    const btnAuthToggle = document.getElementById('btnAuthToggle');
    const btnDrawerAuthToggle = document.getElementById('btnDrawerAuthToggle');
    const authLoginForm = document.getElementById('authLoginForm');
    const changePinForm = document.getElementById('changePinForm');

    if (btnAuthToggle) {
      btnAuthToggle.addEventListener('click', () => this.handleAuthToggle());
    }
    if (btnDrawerAuthToggle) {
      btnDrawerAuthToggle.addEventListener('click', () => {
        this.closeMobileDrawer();
        this.handleAuthToggle();
      });
    }
    if (authLoginForm) {
      authLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAuthLoginSubmit();
      });
    }
    if (changePinForm) {
      changePinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleChangePinSubmit();
      });
    }

    // Eventos da Gaveta Lateral Mobile (Mobile Drawer)
    const btnMobileMenu = document.getElementById('btnMobileMenu');
    const btnCloseDrawer = document.getElementById('btnCloseDrawer');
    const drawerBackdrop = document.getElementById('drawerBackdrop');

    if (btnMobileMenu) {
      btnMobileMenu.addEventListener('click', () => this.openMobileDrawer());
    }
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => this.closeMobileDrawer());
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', (e) => {
        if (e.target === drawerBackdrop) {
          this.closeMobileDrawer();
        }
      });
    }

    // Botões de Ação dentro do Drawer
    const btnDrawerExportCSV = document.getElementById('btnDrawerExportCSV');
    if (btnDrawerExportCSV) {
      btnDrawerExportCSV.addEventListener('click', () => {
        const expenses = StorageManager.getExpenses();
        const propertyInfo = StorageManager.getPropertyInfo();
        ReportsManager.exportExpensesToCSV(expenses, propertyInfo);
        this.closeMobileDrawer();
      });
    }

    const btnDrawerPrintReport = document.getElementById('btnDrawerPrintReport');
    if (btnDrawerPrintReport) {
      btnDrawerPrintReport.addEventListener('click', () => {
        this.closeMobileDrawer();
        setTimeout(() => window.print(), 300);
      });
    }

    // Gerenciamento Multi-Imóvel
    const propertySelector = document.getElementById('propertySelector');
    if (propertySelector) {
      propertySelector.addEventListener('change', (e) => {
        const newId = e.target.value;
        if (!newId) return;
        const ok = StorageManager.setActivePropertyId(newId);
        if (!ok) {
          this.showToast('Erro ao trocar de imóvel ativo.', 'error');
          return;
        }
        this.refreshPropertySelectorOptions();
        this.renderAllViews();
        setTimeout(() => SupabaseSync.processQueue(), 400);
        this.showToast('Imóvel alterado com sucesso!');
      });
    }
    const btnNewPropertyHeader = document.getElementById('btnNewPropertyHeader');
    if (btnNewPropertyHeader) {
      btnNewPropertyHeader.addEventListener('click', () => this.handleCreateNewProperty());
    }
    const btnNewPropertyPage = document.getElementById('btnNewPropertyPage');
    if (btnNewPropertyPage) {
      btnNewPropertyPage.addEventListener('click', () => this.handleCreateNewProperty());
    }
  }

  static refreshPropertySelectorOptions() {
    const selector = document.getElementById('propertySelector');
    if (!selector) return;
    const list = StorageManager.listProperties() || [];
    const activeId = StorageManager.getActivePropertyId();
    selector.innerHTML = '';
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.title ? p.title.trim() : 'Imóvel sem nome') + (p.city && p.state ? ` · ${p.city}/${p.state}` : '');
      if (p.id === activeId) opt.selected = true;
      selector.appendChild(opt);
    });
  }

  static handleCreateNewProperty() {
    const n = (StorageManager.listProperties()?.length || 0) + 1;
    const newProp = StorageManager.createProperty({
      title: `Novo Imóvel ${n}`,
      notes: 'Cadastre aqui os dados do novo imóvel, lançamentos e etapas.',
    });
    this.refreshPropertySelectorOptions();
    this.renderAllViews();
    this.switchTab('configuracoes');
    setTimeout(() => {
      const titleInput = document.getElementById('propTitle');
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    }, 250);
    setTimeout(() => SupabaseSync.processQueue(), 600);
    this.showToast('Novo imóvel cadastrado! Preencha os dados abaixo.');
  }

  static renderPropertiesView() {
    const container = document.getElementById('propertiesList');
    if (!container) return;
    const list = StorageManager.listProperties() || [];
    const activeId = StorageManager.getActivePropertyId();
    if (list.length === 0) {
      container.innerHTML = `<div class="property-empty"><h3 style="margin: 0 0 0.5rem 0;">Nenhum imóvel cadastrado</h3><p style="margin: 0;">Clique em <strong>Cadastrar Novo Imóvel</strong> para começar.</p></div>`;
      return;
    }
    container.innerHTML = list.map(p => {
      const isActive = p.id === activeId;
      const addr = [
        (p.street ? (p.number ? `${p.street}, ${p.number}` : p.street) : ''),
        p.neighborhood || '',
        p.city ? (p.state ? `${p.city}/${p.state}` : p.city) : (p.state || ''),
        p.cep ? `CEP ${p.cep}` : '',
      ].filter(Boolean).join(' · ') || 'Endereço não cadastrado';
      const totalTx = StorageManager._readAll && typeof StorageManager._readAll === 'function'
        ? (StorageManager._readAll('reformaplus_transactions_v2') || []).filter(t => t.property_id === p.id).length
        : 0;
      const pp = typeof MetricsManager?.formatCurrency === 'function' ? MetricsManager.formatCurrency(p.purchasePrice || 0) : `R$ ${(p.purchasePrice || 0).toFixed(2)}`;
      const arv = typeof MetricsManager?.formatCurrency === 'function' ? MetricsManager.formatCurrency(p.estimatedResalePrice || 0) : `R$ ${(p.estimatedResalePrice || 0).toFixed(2)}`;
      let roi = 0;
      try {
        const price = Number(p.purchasePrice || 0);
        const costs = Number(p.holdingCosts || 0);
        const spent = (StorageManager._readAll && typeof StorageManager._readAll === 'function')
          ? (StorageManager._readAll('reformaplus_transactions_v2') || []).filter(t => t.property_id === p.id && (t.tx_type || t.type) === 'expense').reduce((acc, t) => acc + Number(t.amount || 0), 0)
          : 0;
        const totalInvest = price + costs + spent;
        const arvNum = Number(p.estimatedResalePrice || 0);
        roi = totalInvest > 0 ? ((arvNum - totalInvest) / totalInvest) * 100 : 0;
      } catch (_) { roi = 0; }
      const roiStr = `${roi >= 0 ? '+' : ''}${roi.toFixed(1).replace('.', ',')}%`;
      return `
        <div class="property-card ${isActive ? 'is-active' : ''}" data-property-id="${p.id}">
          <div class="property-card-header">
            <div>
              <h4 class="property-card-title">${String(p.title || 'Imóvel sem nome').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h4>
              <p class="property-card-addr">📍 ${String(addr).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            ${isActive ? '<span class="badge-active">✅ ATIVO</span>' : ''}
          </div>
          <div class="property-card-stats">
            <div class="property-stat">
              <div class="property-stat-label">Aquisição</div>
              <div class="property-stat-value">${pp}</div>
            </div>
            <div class="property-stat">
              <div class="property-stat-label">ARV (Venda)</div>
              <div class="property-stat-value">${arv}</div>
            </div>
            <div class="property-stat">
              <div class="property-stat-label">Lançamentos</div>
              <div class="property-stat-value">${totalTx}</div>
            </div>
            <div class="property-stat">
              <div class="property-stat-label">ROI Estimado</div>
              <div class="property-stat-value ${roi >= 0 ? 'success' : ''}" style="${roi < 0 ? 'color: var(--status-danger);' : ''}">${roiStr}</div>
            </div>
          </div>
          <div class="property-card-actions">
            <button class="btn btn-primary btn-sm" onclick="AppController.handleActivateProperty('${p.id}')">
              ${isActive ? '✅ Imóvel Ativo' : '🎯 Usar Este'}
            </button>
            <button class="btn btn-outline btn-sm" onclick="AppController.handleEditProperty('${p.id}')">✏️ Editar Dados</button>
            ${list.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="AppController.handleDeleteProperty('${p.id}')">🗑️ Excluir</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  static handleActivateProperty(id) {
    const ok = StorageManager.setActivePropertyId(id);
    if (!ok) return this.showToast('Erro ao ativar imóvel.', 'error');
    this.refreshPropertySelectorOptions();
    this.renderAllViews();
    setTimeout(() => SupabaseSync.processQueue(), 400);
    this.showToast('Imóvel ativado com sucesso!');
  }

  static handleEditProperty(id) {
    StorageManager.setActivePropertyId(id);
    this.refreshPropertySelectorOptions();
    this.renderAllViews();
    this.switchTab('configuracoes');
    setTimeout(() => document.getElementById('propTitle')?.focus(), 250);
  }

  static handleDeleteProperty(id) {
    const list = StorageManager.listProperties() || [];
    const target = list.find(p => p.id === id);
    if (!target) return;
    if (list.length < 2) {
      return this.showToast('Não é possível excluir: você precisa manter pelo menos 1 imóvel.', 'error');
    }
    const name = target.title || 'este imóvel';
    const ok = confirm(`Tem CERTEZA que deseja EXCLUIR "${name}"?\n\nTodos os lançamentos, etapas e recibos relacionados a ELE serão apagados do app (local).\n\nEssa ação NÃO PODE ser desfeita.`);
    if (!ok) return;
    StorageManager.deleteProperty(id);
    this.refreshPropertySelectorOptions();
    this.renderAllViews();
    setTimeout(() => SupabaseSync.processQueue(), 500);
    this.showToast('Imóvel e seus dados foram excluídos.');
  }

  /**
   * Ajusta dinamicamente a viewport do modal de autenticação no mobile:
   *  1. Usa visualViewport.height (se existir) → reflete a área REAL visível quando teclado virtual abre.
   *  2. Rola automaticamente o input focado para não ficar encoberto pelo teclado.
   *  3. Reage a resize, orientationchange e resize do visualViewport.
   */
  static _setupMobileProauthViewport() {
    const updateVh = () => {
      try {
        const vv = (typeof window !== 'undefined' && window.visualViewport) ? window.visualViewport : null;
        let h = vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight);
        if (h && h > 0) {
          document.documentElement.style.setProperty('--proauth-visible-vh', h + 'px');
        }
      } catch (_) { /* ignore */ }
    };

    updateVh();
    try { window.addEventListener('resize', updateVh, { passive: true }); } catch (_) { }
    try { window.addEventListener('orientationchange', updateVh, { passive: true }); } catch (_) { }
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateVh, { passive: true });
        window.visualViewport.addEventListener('scroll', updateVh, { passive: true });
      }
    } catch (_) { }

    const ensureInputVisible = (el) => {
      if (!el) return;
      const formsContainer = el.closest('.proauth-forms');
      if (!formsContainer) return;
      const scrollTarget = el.closest('.form-group, .proauth-submit, .proauth-error-inline') || el;
      try {
        if (typeof scrollTarget.scrollIntoViewIfNeeded === 'function') {
          scrollTarget.scrollIntoViewIfNeeded(true);
        } else if (typeof scrollTarget.scrollIntoView === 'function') {
          try {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch (_) {
            scrollTarget.scrollIntoView(false);
          }
        }
      } catch (_) {
        try {
          const vvRect = window.visualViewport
            ? { top: window.visualViewport.offsetTop || 0, height: window.visualViewport.height || window.innerHeight }
            : { top: 0, height: window.innerHeight };
          const r = scrollTarget.getBoundingClientRect();
          const bottomView = vvRect.top + vvRect.height;
          if (r.bottom > bottomView - 16 || r.top < vvRect.top + 16) {
            formsContainer.scrollTop += (r.bottom - bottomView + 24);
          }
        } catch (_) { /* ignore */ }
      }
    };

    try {
      document.addEventListener('focusin', (e) => {
        const t = e && e.target;
        if (!t) return;
        if (t.matches && t.matches('#modalAuthBackdrop input, #modalAuthBackdrop textarea, #modalAuthBackdrop select')) {
          // Primeiro ajuste rápido; espera um pouco mais para o teclado aparecer de fato no Android
          setTimeout(() => updateVh(), 50);
          setTimeout(() => ensureInputVisible(t), 250);
          setTimeout(() => ensureInputVisible(t), 550);
        }
      }, { passive: true });
    } catch (_) { /* ignore */ }
  }

  static _authMode = 'local';

  static handleAuthToggle() {
    if (AuthManager.isAuthenticated()) {
      const hadCloud = AuthManager._hasSupabaseSessionSync();
      if (hadCloud) {
        AuthManager.signOutCloud().then(() => {
          AuthManager.logout();
          this.updateAuthUI();
          this.showToast('Você saiu do modo administrador.');
        });
      } else {
        AuthManager.logout();
        this.updateAuthUI();
        this.showToast('Você saiu do modo administrador.');
      }
    } else {
      this.openModalAuth();
    }
  }

  static switchAuthMode(mode) {
    this._authMode = (mode === 'cloud') ? 'cloud' : 'local';
    const cloudBtn = document.getElementById('authModeCloudBtn');
    const localBtn = document.getElementById('authModeLocalBtn');
    const cloudFields = document.getElementById('authCloudFields');
    const localFields = document.getElementById('authLocalFields');
    const cloudNotice = document.getElementById('authCloudNotice');
    const localNotice = document.getElementById('authLocalNotice');
    const errorMsg = document.getElementById('authErrorMsg');

    const isCloud = this._authMode === 'cloud';
    if (cloudBtn) cloudBtn.className = 'btn btn-sm ' + (isCloud ? 'btn-primary' : 'btn-outline');
    if (localBtn) localBtn.className = 'btn btn-sm ' + (isCloud ? 'btn-outline' : 'btn-primary');
    if (cloudFields) cloudFields.style.display = isCloud ? 'block' : 'none';
    if (localFields) localFields.style.display = isCloud ? 'none' : 'block';
    if (cloudNotice) cloudNotice.style.display = isCloud ? 'block' : 'none';
    if (localNotice) localNotice.style.display = isCloud ? 'none' : 'block';
    if (errorMsg) errorMsg.style.display = 'none';

    setTimeout(() => {
      if (isCloud) {
        document.getElementById('authEmailInput')?.focus();
      } else {
        document.getElementById('authPinInput')?.focus();
      }
    }, 100);
  }

  static openModalAuth() {
    const modalBackdrop = document.getElementById('modalAuthBackdrop');
    this._proAuthReset();
    this._proAuthSwitchView('login');
    if (modalBackdrop) modalBackdrop.classList.add('active');
  }

  static _proAuthReset() {
    document.querySelectorAll('.proauth-error-inline').forEach(el => {
      el.style.display = 'none';
      el.textContent = '';
    });

    const idsToClear = [
      'proauth-login-email', 'proauth-login-password',
      'proauth-signup-name', 'proauth-signup-email',
      'proauth-signup-password', 'proauth-signup-password2',
      'proauth-reset-email', 'proauth-local-pin'
    ];
    idsToClear.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const remember = document.getElementById('proauth-login-remember');
    if (remember) remember.checked = true;
    const terms = document.getElementById('proauth-signup-terms');
    if (terms) terms.checked = false;

    const signupSubmit = document.getElementById('proauth-signup-submit');
    if (signupSubmit) signupSubmit.disabled = true;

    ['proauth-login-submit', 'proauth-signup-submit', 'proauth-reset-submit', 'proauth-local-submit'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = false;
    });

    this._proSignupValidate();
  }

  static _proAuthSwitchView(viewName) {
    const views = document.querySelectorAll('.proauth-view');
    views.forEach(v => v.classList.remove('is-visible'));

    const targetView = document.querySelector(`.proauth-view[data-proauth-view="${viewName}"]`);
    if (targetView) targetView.classList.add('is-visible');

    const tabsContainer = document.querySelector('.proauth-tabs');
    const tabBtns = document.querySelectorAll('.proauth-tab-btn');

    if (viewName === 'login' || viewName === 'signup') {
      if (tabsContainer) tabsContainer.style.display = '';
      tabBtns.forEach(btn => {
        const tab = btn.getAttribute('data-proauth-tab');
        const isActive = tab === viewName;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    } else {
      if (tabsContainer) tabsContainer.style.display = 'none';
      tabBtns.forEach(btn => btn.classList.remove('is-active'));
    }

    const errorEl = document.getElementById(`proauth-${viewName}-error`);
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    setTimeout(() => {
      const focusMap = {
        login: 'proauth-login-email',
        signup: 'proauth-signup-name',
        reset: 'proauth-reset-email',
        local: 'proauth-local-pin'
      };
      const focusId = focusMap[viewName];
      if (focusId) document.getElementById(focusId)?.focus();
    }, 100);

    return false;
  }

  static _proAuthTogglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return false;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '🙈';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '👁';
    }
    return false;
  }

  static _proSignupValidate() {
    const nameInput = document.getElementById('proauth-signup-name');
    const emailInput = document.getElementById('proauth-signup-email');
    const pwdInput = document.getElementById('proauth-signup-password');
    const pwd2Input = document.getElementById('proauth-signup-password2');
    const termsInput = document.getElementById('proauth-signup-terms');
    const submitBtn = document.getElementById('proauth-signup-submit');
    const errorEl = document.getElementById('proauth-signup-error');

    const name = (nameInput?.value || '').trim();
    const email = (emailInput?.value || '').trim();
    const pwd = pwdInput?.value || '';
    const pwd2 = pwd2Input?.value || '';
    const terms = !!termsInput?.checked;

    const checks = {
      len: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      num: /[0-9]/.test(pwd),
      sym: /[^A-Za-z0-9]/.test(pwd)
    };

    const reqList = document.getElementById('proauth-pwd-req-list');
    if (reqList) {
      reqList.querySelectorAll('li[data-req]').forEach(li => {
        const key = li.getAttribute('data-req');
        const ok = !!checks[key];
        li.classList.toggle('is-ok', ok);
        const dot = li.querySelector('.proauth-pwd-req-dot');
        if (dot) dot.textContent = ok ? '✓' : '·';
      });
    }

    const pwdAllOk = checks.len && checks.upper && checks.lower && checks.num && checks.sym;
    const pwdMatch = pwd.length > 0 && pwd === pwd2;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const nameValid = name.length >= 2;
    const allValid = nameValid && emailValid && pwdAllOk && pwdMatch && terms;

    if (submitBtn) submitBtn.disabled = !allValid;

    if (errorEl) {
      if (pwd.length > 0 && pwd2.length > 0 && !pwdMatch) {
        errorEl.textContent = '⚠️ As senhas digitadas não são iguais.';
        errorEl.style.display = 'block';
      } else {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }
    }

    return allValid;
  }

  static _proClassifyNetworkError(rawMsg, err) {
    const raw = String(rawMsg || '').toLowerCase();
    const stack = String((err && err.stack) || '').toLowerCase();
    const combined = raw + ' ' + stack;

    // PRIORIDADE 0: Offline REAL do navegador (somente termos claros, NÃO "NetworkError:" — Chrome prefixa todos os erros fetch com NetworkError)
    const isTrulyOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (
      isTrulyOffline
      || /(^|\s|,|\.)offline($|\s|,|\.)/i.test(combined)
      || /\bno\s+internet\b/i.test(combined)
      || /\bECONNREFUSED\b|\bENETUNREACH\b|\bENETDOWN\b/i.test(combined)
      || /\bnetwork\s+error\b/i.test(combined)
    ) {
      return {
        kind: 'offline',
        label: 'Sem conexão com a internet. Verifique sua rede e tente novamente.',
      };
    }

    // PRIORIDADE 1: CORS (antes do fetch genérico, pois erros CORS vem como "Failed to fetch" no Chrome)
    if (/CORS|cross-origin|Access-Control-Allow-Origin|blocked by CORS|CORS policy/i.test(combined)) {
      return {
        kind: 'cors',
        label: 'Bloqueio de CORS detectado. O domínio atual precisa estar autorizado no painel Supabase → Authentication → URL Configuration (Site URL e Redirect URLs). Detalhe técnico: ' + String(rawMsg || ''),
      };
    }

    // PRIORIDADE 2: DNS / Host inacessível (pausado FREE tier / ref errada)
    if (/ERR_NAME_NOT_RESOLVED|DNS|ENOTFOUND|not resolved|could not resolve host|host not found|dns_error|NS_ERROR_|address not available|ERR_CONNECTION_CLOSED|ERR_TUNNEL_CONNECTION_FAILED/i.test(combined)) {
      return {
        kind: 'dns',
        label: 'Não foi possível conectar ao servidor do Supabase (DNS não resolvido). O projeto provavelmente está PAUSADO no FREE tier (mais de 7 dias sem uso), ou a Project URL na Vercel está incorreta. Abra o Painel Supabase e clique em "Resume Project" se necessário. Detalhe técnico: ' + String(rawMsg || ''),
      };
    }

    // PRIORIDADE 3: Timeout
    if (/timeout|timed out|ETIMEDOUT|request to .+ timed out|deadline exceeded/i.test(combined)) {
      return {
        kind: 'timeout',
        label: 'O servidor do Supabase demorou a responder (timeout). Tente novamente em alguns segundos. Detalhe técnico: ' + String(rawMsg || ''),
      };
    }

    // PRIORIDADE 4: Fetch genérico (não caiu nas anteriores)
    if (/Failed to fetch|load failed|networkerror when attempting to fetch resource|fetch error|abort error|aborted|network request failed/i.test(combined)) {
      const urlHint = (window.SupabaseClient && typeof window.SupabaseClient.debug === 'function')
        ? window.SupabaseClient.debug().url
        : '';
      let extra = 'Detalhe técnico: ' + String(rawMsg || '');
      if (urlHint) extra = extra + ' (URL Supabase detectada: ' + urlHint + ').';
      return {
        kind: 'fetch',
        label: 'Não foi possível contatar o servidor do Supabase. Verifique: (1) o projeto Supabase está ativo e não pausado, (2) as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão preenchidas corretamente no Vercel, (3) não há extensão (VPN, adblocker) bloqueando a conexão, (4) navegador não está bloqueando domínios de terceiros. ' + extra,
      };
    }

    // Sem match
    return { kind: 'other', label: null };
  }

  static async _proHandleSubmit(e, mode) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const submitId = `proauth-${mode}-submit`;
    const errorId = `proauth-${mode}-error`;
    const submitBtn = document.getElementById(submitId);
    const errorEl = document.getElementById(errorId);

    if (submitBtn) {
      if (submitBtn.dataset.origText === undefined) {
        submitBtn.dataset.origText = submitBtn.textContent || '';
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ ' + (submitBtn.dataset.origText || 'Enviando...');
    }
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    try {
      if (mode === 'login') {
        const rawEmail = (document.getElementById('proauth-login-email')?.value || '');
        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        const password = document.getElementById('proauth-login-password')?.value || '';
        if (!email || !password) {
          if (errorEl) { errorEl.textContent = '❌ Informe e-mail e senha.'; errorEl.style.display = 'block'; }
          return false;
        }
        const resp = await AuthManager.signInCloud({ email, password });
        if (resp?.error) {
          const raw = String((resp.error && resp.error.message) ? resp.error.message : (resp.error.msg || resp.error.code || resp.error.error_description || ''));
          const status = String((resp.error && resp.error.status) || (resp.error && resp.error.code) || '');
          console.warn('[Auth][Login] Erro Supabase (ORIGINAL):', { err: resp.error, email, status, raw });

          let msg = '';
          const net = this._proClassifyNetworkError(raw, resp.error);
          if (net.label) {
            msg = net.label;
          } else {
            const r = (raw + ' ' + status).toLowerCase();
            if (/invalid.*credentials|invalid.*password|invalid.*login|wrong.*password|bad.*password/i.test(r)) {
              msg = 'E-mail ou senha incorretos. Verifique e tente novamente.';
            } else if (/email.*not.*confirmed|confirm.*email|verify.*email|email_confirmation/i.test(r)) {
              msg = 'E-mail ainda não confirmado. Clique no link que enviamos para sua caixa de entrada (verifique também a caixa SPAM).';
            } else if (/user.*not.*found|no.*user|could not find user/i.test(r)) {
              msg = 'Nenhuma conta encontrada com este e-mail. Verifique ou crie uma conta nova.';
            } else if (/too many|rate limit|exceeded|over quota/i.test(r)) {
              msg = 'Muitas tentativas seguidas. Aguarde uns minutos e tente novamente.';
            } else if (raw) {
              msg = 'Não foi possível entrar. Detalhe: ' + raw;
            } else {
              msg = 'Não foi possível entrar. Verifique os dados e tente novamente.';
            }
          }
          if (errorEl) { errorEl.textContent = '❌ ' + msg; errorEl.style.display = 'block'; }
          this.showToast('Falha no login: ' + msg, 'error', 9000);
          return false;
        }
        const userId = AuthManager.getCurrentUserId();
        const existingProp = StorageManager.getPropertyInfo();
        if (existingProp && (!existingProp.user_id || existingProp.user_id === 'local-user-admin')) {
          StorageManager.savePropertyInfo({ user_id: userId }, true);
        }
        this.closeModalAuth();
        this.updateAuthUI();
        this.showToast('🔓 Autenticado com sucesso!');
        setTimeout(() => SupabaseSync.processQueue(), 500);
        return true;
      }

      if (mode === 'signup') {
        if (!this._proSignupValidate()) {
          if (errorEl) { errorEl.textContent = '⚠️ Verifique os dados e aceite os Termos de Uso e Política de Privacidade.'; errorEl.style.display = 'block'; }
          return false;
        }
        const name = (document.getElementById('proauth-signup-name')?.value || '').trim();
        const rawEmail = (document.getElementById('proauth-signup-email')?.value || '');
        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        const password = document.getElementById('proauth-signup-password')?.value || '';

        let resp = null;
        try {
          resp = await AuthManager.signUpCloud({ email, password, fullName: name });
        } catch (err) {
          console.warn('[Auth][SignUp] Exceção (ORIGINAL):', err);
          resp = { error: err };
        }

        if (resp?.error) {
          const raw = String((resp.error && resp.error.message) ? resp.error.message : (resp.error.msg || resp.error.code || resp.error.error_description || 'Erro ao criar conta.'));
          const status = String((resp.error && resp.error.status) || (resp.error && resp.error.code) || '');
          console.warn('[Auth][SignUp] Erro Supabase (ORIGINAL):', { err: resp.error, email, status, raw });

          let msg = raw;
          const net = this._proClassifyNetworkError(raw, resp.error);
          if (net.label) {
            msg = net.label;
          } else {
            const r = (raw + ' ' + status).toLowerCase();
            if (/already registered|already\s+in\s+use|email.*exists|duplicate|23505|unique_violation/i.test(r)) {
              msg = 'Este e-mail já possui uma conta. Use "Entrar" ou recupere a senha.';
            } else if (/password.*too short|password.*weak|senha muito|at least.*character|weak_password|min.*length/i.test(r)) {
              msg = 'A senha não atende aos requisitos de segurança do Supabase (mínimo 6 caracteres).';
            } else if (/disabled|signup|not allowed|signups disabled/i.test(r)) {
              msg = 'Cadastros temporariamente indisponíveis. Tente novamente mais tarde.';
            } else if (/invalid email|email.*invalid/i.test(r)) {
              msg = 'Formato de e-mail inválido.';
            }
          }
          if (errorEl) { errorEl.textContent = '❌ ' + msg; errorEl.style.display = 'block'; }
          this.showToast('Falha no cadastro: ' + msg, 'error', 12000);
          return false;
        }

        const data = resp?.data || resp || {};
        let session = data.session || null;
        const user = data.user || resp?.user || null;

        // CASO 1: session já retornada pelo Supabase (confirm email OFF — configuração obrigatória do produto)
        let sessionOk = !!session && typeof session === 'object' && !!session.access_token && !!user;

        // CASO 2: session=null (Supabase ainda tinha confirm email ON, user criado mas não logado)
        // → tenta signInWithPassword com a senha originalmente digitada (garante entrada imediata)
        if (!sessionOk && user && password) {
          try {
            console.warn('[Auth][SignUp] Session vazia. Tentando login implícito após cadastro...');
            const loginResp = await AuthManager.signInCloud({ email, password });
            if (!loginResp?.error) {
              session = loginResp?.data?.session || loginResp?.session || null;
              if (session || AuthManager.isAuthenticated()) sessionOk = true;
            } else {
              console.warn('[Auth][SignUp] Login implícito falhou:', loginResp?.error);
            }
          } catch (e2) {
            console.warn('[Auth][SignUp] Login implícito exception:', e2);
          }
        }

        // APLICA RESULTADO — NUNCA MAIS MANDA PARA TELA ENTRAR APÓS CADASTRO
        if (sessionOk) {
          const userId = (user && user.id) ? user.id : AuthManager.getCurrentUserId();
          const existingProp = StorageManager.getPropertyInfo();
          if (existingProp && (!existingProp.user_id || existingProp.user_id === 'local-user-admin') && userId) {
            StorageManager.savePropertyInfo({ user_id: userId }, true);
          }
          this.showToast('✅ Conta criada e autenticada com sucesso!');
          this.closeModalAuth();
          this.updateAuthUI();
          setTimeout(() => SupabaseSync.processQueue(), 500);
          return true;
        }

        // Chegando aqui = erro interno. Informar e PARAR.
        if (errorEl) {
          errorEl.textContent = '❌ Conta criada, mas não foi possível autenticar automaticamente. Tente "Entrar" com o e-mail e senha cadastrados.';
          errorEl.style.display = 'block';
        }
        this.showToast('⚠️ Conta criada! Entre usando e-mail e senha.', 'warning', 8000);
        return false;
      }

      if (mode === 'reset') {
        const email = (document.getElementById('proauth-reset-email')?.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (errorEl) { errorEl.textContent = '❌ Informe um e-mail válido.'; errorEl.style.display = 'block'; }
          return false;
        }
        const resp = await SupabaseClient.auth.resetPasswordForEmail(email);
        if (resp?.error) {
          const raw = String((resp.error && resp.error.message) ? resp.error.message : (resp.error.msg || resp.error.code || resp.error.error_description || 'Erro ao enviar link.'));
          const status = String((resp.error && resp.error.status) || (resp.error && resp.error.code) || '');
          console.warn('[Auth][Reset] Erro Supabase (ORIGINAL):', { err: resp.error, email, status, raw });
          let msg;
          const net = this._proClassifyNetworkError(raw, resp.error);
          if (net.label) {
            msg = net.label;
          } else {
            const r = (raw + ' ' + status).toLowerCase();
            if (/email.*not.*found|user.*not.*found|no.*user|could not find user/i.test(r)) {
              msg = 'Não foi possível enviar. Se o e-mail existir, o link foi enviado (verifique também a caixa SPAM).';
            } else if (/too many|rate limit|exceeded/i.test(r)) {
              msg = 'Muitas solicitações. Aguarde uns minutos antes de tentar novamente.';
            } else if (raw) {
              msg = 'Não foi possível enviar o link. Detalhe técnico: ' + raw;
            } else {
              msg = 'Não foi possível enviar o link. Tente novamente.';
            }
          }
          if (errorEl) { errorEl.textContent = '❌ ' + msg; errorEl.style.display = 'block'; }
          this.showToast('Falha: ' + msg, 'error', 12000);
          return false;
        }
        this.showToast('📧 Link de recuperação enviado! Verifique sua caixa de entrada. Se não chegar, cheque a caixa de SPAM.', 'success', 9000);
        this._proAuthSwitchView('login');
        const emailField = document.getElementById('proauth-login-email');
        if (emailField) emailField.value = email;
        return true;
      }

      if (mode === 'local') {
        const pin = document.getElementById('proauth-local-pin')?.value || '';
        if (AuthManager.login(pin)) {
          this.closeModalAuth();
          this.updateAuthUI();
          this.showToast('🔓 Autenticado como Administrador com sucesso!');
          setTimeout(() => SupabaseSync.processQueue(), 500);
          return true;
        } else {
          if (errorEl) { errorEl.textContent = '❌ Senha incorreta! Tente novamente.'; errorEl.style.display = 'block'; }
          return false;
        }
      }

      return false;
    } catch (err) {
      if (errorEl) { errorEl.textContent = '❌ ' + (err.message || 'Erro interno.'); errorEl.style.display = 'block'; }
      console.warn('[ProAuth] Erro:', err);
      return false;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtn.dataset.origText) submitBtn.textContent = submitBtn.dataset.origText;
      }
    }
  }

  static async _proGoogle(mode) {
    try {
      const resp = await SupabaseClient.auth.signInWithGoogle();
      if (resp?.error) {
        const err = resp.error;
        const code = String(err.code || '').toLowerCase();
        const errorCode = String(err.error_code || '').toLowerCase();
        const msg = String(err.message || err.msg || '').toLowerCase();
        const isProviderDisabled = /not enabled|unsupported provider|provider.*not.*enabled|400.*validation.*failed/i.test(code + ' ' + errorCode + ' ' + msg);
        if (isProviderDisabled) {
          const origin = (window.location && window.location.origin) || '';
          this.showToast(
            '⚠️ Google OAuth desativado no Supabase. Habilite: Authentication → Providers → Google. Redirect URLs: ' + origin + ' e ' + origin + '/',
            'error',
            15000
          );
        } else {
          this.showToast('⚠️ Login Google temporariamente indisponível: ' + (err.message || err.msg || ''));
        }
      }
    } catch (err) {
      this.showToast('⚠️ Login Google temporariamente indisponível.');
    }
    return false;
  }

  static closeModalAuth() {
    const modalBackdrop = document.getElementById('modalAuthBackdrop');
    if (modalBackdrop) modalBackdrop.classList.remove('active');
  }

  static async handleAuthLoginSubmit() {
    const errorMsg = document.getElementById('authErrorMsg');
    const loadingHint = document.getElementById('authLoadingHint');
    const submitBtn = document.getElementById('authSubmitBtn');
    if (errorMsg) errorMsg.style.display = 'none';
    if (loadingHint) loadingHint.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (this._authMode === 'cloud') {
        const email = (document.getElementById('authEmailInput')?.value || '').trim();
        const password = document.getElementById('authPasswordInput')?.value || '';
        if (!email || !password) {
          if (errorMsg) { errorMsg.textContent = '❌ Informe email e senha.'; errorMsg.style.display = 'block'; }
          return;
        }
        const resp = await AuthManager.signInCloud({ email, password });
        if (resp?.error) {
          const msg = resp.error.message || 'Credenciais inválidas.';
          if (errorMsg) { errorMsg.textContent = '❌ ' + msg; errorMsg.style.display = 'block'; }
          this.showToast('Falha no login: ' + msg);
          return;
        }
        const userId = AuthManager.getCurrentUserId();
        const existingProp = StorageManager.getPropertyInfo();
        if (existingProp && (!existingProp.user_id || existingProp.user_id === 'local-user-admin')) {
          StorageManager.savePropertyInfo({ user_id: userId }, true);
        }
        this.closeModalAuth();
        this.updateAuthUI();
        this.showToast('🔓 Autenticado na nuvem com sucesso!');
        setTimeout(() => SupabaseSync.processQueue(), 500);
      } else {
        const pinInput = document.getElementById('authPinInput');
        const pinValue = pinInput?.value || '';
        if (AuthManager.login(pinValue)) {
          this.closeModalAuth();
          this.updateAuthUI();
          this.showToast('🔓 Autenticado como Administrador com sucesso!');
          setTimeout(() => SupabaseSync.processQueue(), 500);
        } else {
          if (errorMsg) { errorMsg.textContent = '❌ Senha incorreta! Tente novamente.'; errorMsg.style.display = 'block'; }
        }
      }
    } catch (err) {
      if (errorMsg) { errorMsg.textContent = '❌ ' + (err.message || 'Erro interno.'); errorMsg.style.display = 'block'; }
      console.warn('[Auth] Erro no login:', err);
    } finally {
      if (loadingHint) loadingHint.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  static updateAuthUI() {
    const isAuth = AuthManager.isAuthenticated();
    const isCloud = AuthManager._hasSupabaseSessionSync();
    const userEmail = isCloud ? (AuthManager.getCurrentUserEmail() || '') : '';

    const btnAuthToggle = document.getElementById('btnAuthToggle');
    const btnDrawerAuthToggle = document.getElementById('btnDrawerAuthToggle');
    const headerBadge = document.getElementById('headerSessionBadge');
    const drawerBadge = document.getElementById('drawerSessionBadge');

    const btnLabel = isAuth
      ? (isCloud && userEmail ? '🔓 ' + userEmail.split('@')[0] + ' (Sair)' : '🔓 Admin (Sair)')
      : '🔑 Entrar';
    if (btnAuthToggle) {
      btnAuthToggle.className = isAuth ? 'btn btn-primary btn-sm no-print' : 'btn btn-outline btn-sm no-print';
      btnAuthToggle.innerHTML = '';
      const iEl = document.createElement('span');
      const tEl = document.createElement('span');
      tEl.className = 'btn-header-text';
      if (isAuth) {
        iEl.textContent = '🔓';
        tEl.textContent = (isCloud && userEmail ? (userEmail.split('@')[0] || userEmail) + ' (Sair)' : 'Admin (Sair)');
      } else {
        iEl.textContent = '🔑';
        tEl.textContent = 'Entrar';
      }
      btnAuthToggle.appendChild(iEl);
      btnAuthToggle.appendChild(document.createTextNode(' '));
      btnAuthToggle.appendChild(tEl);
      try {
        const title = isAuth
          ? (isCloud && userEmail ? 'Sair da conta ' + userEmail : 'Encerrar sessão administrativa')
          : 'Acesso Administrador';
        btnAuthToggle.setAttribute('title', title);
      } catch (_) { }
    }
    if (btnDrawerAuthToggle) {
      const iconEl = btnDrawerAuthToggle.querySelector('.drawer-action-icon');
      const textEls = btnDrawerAuthToggle.querySelectorAll('span:not(.drawer-action-icon)');
      textEls.forEach(el => el.remove());
      if (iconEl) iconEl.textContent = isAuth ? '🔓' : '🔑';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = isAuth
        ? (isCloud && userEmail ? userEmail.split('@')[0] + ' (Sair)' : 'Admin (Sair)')
        : 'Entrar como Admin';
      btnDrawerAuthToggle.appendChild(labelSpan);
      btnDrawerAuthToggle.classList.toggle('drawer-action-auth', !isAuth);
      btnDrawerAuthToggle.style.borderColor = isAuth ? (isCloud ? 'rgba(59,130,246,0.4)' : 'rgba(16,185,129,0.3)') : '';
      btnDrawerAuthToggle.style.background = isAuth ? (isCloud ? 'rgba(59,130,246,0.08)' : 'rgba(16,185,129,0.08)') : '';
    }

    const badgeClass = isAuth ? 'badge badge-pago' : 'badge badge-pendente';
    let badgeText = isAuth ? '🔓 Administrador' : '🔒 Visitante';
    if (isAuth && isCloud) badgeText = '☁️ Admin (Nuvem)';
    if (isAuth && isCloud && userEmail) badgeText = '☁️ ' + userEmail;

    if (headerBadge) {
      headerBadge.className = `badge ${badgeClass}`;
      headerBadge.style.fontSize = '0.7rem';
      headerBadge.style.marginTop = '2px';
      headerBadge.textContent = badgeText;
    }
    if (drawerBadge) {
      drawerBadge.className = `badge ${badgeClass}`;
      drawerBadge.style.fontSize = '0.7rem';
      drawerBadge.style.marginTop = '0.25rem';
      drawerBadge.textContent = badgeText;
    }

    if (!isAuth) {
      document.body.classList.add('guest-mode');
    } else {
      document.body.classList.remove('guest-mode');
    }

    (async () => {
      try { AppController._adminSyncIsSuperAdminCache = await AppController.isCurrentUserSuperAdmin(); }
      catch (_) { AppController._adminSyncIsSuperAdminCache = false; }
      try { AppController._adminInjectButtonInHeader(); } catch (_) { }
    })();
  }

  static handleChangePinSubmit() {
    if (!AuthManager.isAuthenticated()) {
      this.openModalAuth();
      return;
    }

    const currentPin = document.getElementById('currentPinInput')?.value;
    const newPin = document.getElementById('newPinInput')?.value;

    const result = AuthManager.changePin(currentPin, newPin);
    if (result.success) {
      document.getElementById('changePinForm')?.reset();
      this.showToast(result.message);
    } else {
      alert(result.message);
    }
  }

  static openMobileDrawer() {
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.add('active');
  }

  static closeMobileDrawer() {
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  static goHome() {
    this.switchTab('home');
    this.scrollToTop();
  }

  static scrollToTop() {
    window.requestAnimationFrame(() => {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 40);
    });
  }

  static switchTabAndScrollTo(tabName, anchorId) {
    this.switchTab(tabName);
    const target = anchorId ? document.getElementById(anchorId) : null;
    if (!target) return;
    window.requestAnimationFrame(() => {
      setTimeout(() => {
        const header = document.querySelector('.app-header');
        const headerH = header ? header.getBoundingClientRect().height : 80;
        const extraOffset = 20;
        const rect = target.getBoundingClientRect();
        const absoluteTop = window.scrollY + rect.top - headerH - extraOffset;
        window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
      }, 80);
    });
  }

  static switchTab(tabName) {
    const tabs = document.querySelectorAll('.nav-tab, .drawer-nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    const quickBtns = document.querySelectorAll('.quick-nav-btn');
    quickBtns.forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-quicknav-tab') === tabName);
    });

    try {
      const bar = document.querySelector('.quick-nav');
      if (bar) document.body.classList.add('quick-nav-enabled');
    } catch (_) { }

    this.closeMobileDrawer();

    if (tabName === 'relatorios') {
      this.renderReportTab();
    }
  }

  static renderAllViews() {
    this.refreshPropertySelectorOptions();
    this.renderPropertiesView();
    this.updateAuthUI();
    this.renderDashboard();
    this.renderExpensesTable();
    this.renderPropertyFormValues();
    this.renderPhasesView();
    this.renderReportTab();
  }

  static renderDashboard() {
    const propertyInfo = StorageManager.getPropertyInfo();
    const expenses = StorageManager.getExpenses();
    const metrics = MetricsManager.calculatePropertyMetrics(propertyInfo, expenses);

    // Atualiza Cards Superiores
    document.getElementById('metricPurchase').textContent = MetricsManager.formatCurrency(metrics.purchasePrice);
    document.getElementById('metricRenovationCost').textContent = MetricsManager.formatCurrency(metrics.totalRenovationCost);
    document.getElementById('metricTotalInvestment').textContent = MetricsManager.formatCurrency(metrics.totalInvestment);
    document.getElementById('metricEstimatedResale').textContent = MetricsManager.formatCurrency(metrics.estimatedResalePrice);
    document.getElementById('metricNetProfit').textContent = MetricsManager.formatCurrency(metrics.expectedNetProfit);
    document.getElementById('metricROI').textContent = MetricsManager.formatPercent(metrics.roiPercentage);

    // Detalhamento por Insumos
    document.getElementById('valMaterials').textContent = MetricsManager.formatCurrency(metrics.totalMaterials);
    document.getElementById('valServices').textContent = MetricsManager.formatCurrency(metrics.totalServices);
    document.getElementById('valTaxes').textContent = MetricsManager.formatCurrency(metrics.totalTaxesFees);

    // Renderiza Gráfico por Categoria (Pizza / Donut) + Ambiente (Barras)
    MetricsManager.renderPieDonutChart('chartCategory', metrics.categoryBreakdown, { centerLabelTop: 'Reforma' });
    MetricsManager.renderCustomBarChart('chartRoom', metrics.roomBreakdown, metrics.totalRenovationCost);
  }

  static renderExpensesTable() {
    const expenses = StorageManager.getExpenses();
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    const searchValue = (document.getElementById('filterSearch')?.value || '').toLowerCase();
    const typeValue = document.getElementById('filterType')?.value || '';
    const categoryValue = document.getElementById('filterCategory')?.value || '';

    const filtered = expenses.filter(exp => {
      const matchSearch = (exp.supplier || '').toLowerCase().includes(searchValue) ||
        (exp.description || '').toLowerCase().includes(searchValue) ||
        (exp.category || '').toLowerCase().includes(searchValue);
      const matchType = typeValue === '' || exp.type === typeValue;
      const matchCategory = categoryValue === '' || exp.category === categoryValue;
      return matchSearch && matchType && matchCategory;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }

    let html = '';
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(exp => {
      const typeBadge = exp.type === 'material' ? 'badge-material' : exp.type === 'servico' ? 'badge-servico' : 'badge-taxa';
      const typeText = exp.type === 'material' ? 'Material' : exp.type === 'servico' ? 'Mão de Obra' : 'Taxa';
      const statusBadge = exp.status === 'pago' ? 'badge-pago' : 'badge-pendente';
      const formattedDate = exp.date ? exp.date.split('-').reverse().join('/') : '-';
      const hasReceipt = exp.receipt ? `<button class="btn btn-outline btn-sm" onclick="AppController.showReceiptModal('${exp.id}')">📎 Ver</button>` : '<span style="color: var(--text-dim);">-</span>';

      html += `
        <tr>
          <td>${formattedDate}</td>
          <td><span class="badge ${typeBadge}">${typeText}</span></td>
          <td>${exp.category}</td>
          <td>${exp.room}</td>
          <td><strong>${exp.supplier}</strong><br><small style="color: var(--text-muted);">${exp.description || ''}</small></td>
          <td><strong>${MetricsManager.formatCurrency(exp.amount)}</strong></td>
          <td><span class="badge ${statusBadge}">${exp.status}</span></td>
          <td style="white-space: nowrap;">
            ${hasReceipt}
            <button class="btn btn-outline btn-sm" onclick="AppController.editExpense('${exp.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="AppController.deleteExpense('${exp.id}')">🗑️</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  static handleExpenseSubmit() {
    const expenseData = {
      id: this.currentExpenseIdToEdit || null,
      date: document.getElementById('expenseDate').value,
      type: document.getElementById('expenseType').value,
      category: document.getElementById('expenseCategory').value,
      room: document.getElementById('expenseRoom').value,
      supplier: document.getElementById('expenseSupplier').value,
      amount: MetricsManager.parseCurrencyFromInput(document.getElementById('expenseAmount').value),
      status: document.getElementById('expenseStatus').value,
      description: document.getElementById('expenseDescription').value,
      receipt: this.currentReceiptPreviewUrl || null
    };

    StorageManager.saveExpense(expenseData);
    this.resetExpenseForm();
    this.renderAllViews();
    this.showToast(expenseData.id ? 'Lançamento atualizado com sucesso!' : 'Novo lançamento adicionado!');
  }

  static editExpense(id) {
    if (!AuthManager.isAuthenticated()) {
      this.requireAuth(() => this.editExpense(id));
      return;
    }
    const expenses = StorageManager.getExpenses();
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    this.currentExpenseIdToEdit = exp.id;
    document.getElementById('expenseDate').value = exp.date || '';
    document.getElementById('expenseType').value = exp.type || 'material';
    document.getElementById('expenseCategory').value = exp.category || 'Alvenaria';
    document.getElementById('expenseRoom').value = exp.room || 'Geral';
    document.getElementById('expenseSupplier').value = exp.supplier || '';
    document.getElementById('expenseAmount').value = (exp.amount || 0) === 0 ? '' : MetricsManager.formatCurrencyForInput(exp.amount);
    document.getElementById('expenseStatus').value = exp.status || 'pago';
    document.getElementById('expenseDescription').value = exp.description || '';

    this.currentReceiptPreviewUrl = exp.receipt || null;
    const previewContainer = document.getElementById('receiptPreviewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = exp.receipt ? `<img src="${exp.receipt}" style="max-height: 120px; border-radius: var(--radius-sm); margin-top: 0.5rem;">` : '';
    }

    const btnSubmit = document.getElementById('btnSubmitExpense');
    if (btnSubmit) btnSubmit.textContent = 'Salvar Alterações';

    // Rola até o formulário
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
  }

  static deleteExpense(id) {
    if (!AuthManager.isAuthenticated()) {
      this.requireAuth(() => this.deleteExpense(id));
      return;
    }
    if (confirm('Deseja realmente remover este lançamento?')) {
      StorageManager.deleteExpense(id);
      this.renderAllViews();
      this.showToast('Lançamento removido.');
    }
  }

  static resetExpenseForm() {
    this.currentExpenseIdToEdit = null;
    this.currentReceiptPreviewUrl = null;
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    const previewContainer = document.getElementById('receiptPreviewContainer');
    if (previewContainer) previewContainer.innerHTML = '';
    const btnSubmit = document.getElementById('btnSubmitExpense');
    if (btnSubmit) btnSubmit.textContent = 'Adicionar Lançamento';
  }

  static renderPropertyFormValues() {
    const property = StorageManager.getPropertyInfo();
    if (!property) return;

    document.getElementById('propTitle').value = property.title || '';
    document.getElementById('propCep').value = property.cep || '';
    document.getElementById('propStreet').value = property.street || '';
    document.getElementById('propNumber').value = property.number || '';
    document.getElementById('propComplement').value = property.complement || '';
    document.getElementById('propNeighborhood').value = property.neighborhood || '';
    document.getElementById('propCity').value = property.city || '';
    document.getElementById('propState').value = property.state || '';
    document.getElementById('propPurchasePrice').value = (property.purchasePrice || 0) === 0 ? '' : MetricsManager.formatCurrencyForInput(property.purchasePrice);
    document.getElementById('propEstimatedResalePrice').value = (property.estimatedResalePrice || 0) === 0 ? '' : MetricsManager.formatCurrencyForInput(property.estimatedResalePrice);
    document.getElementById('propHoldingCosts').value = (property.holdingCosts || 0) === 0 ? '' : MetricsManager.formatCurrencyForInput(property.holdingCosts);
    document.getElementById('propNotes').value = property.notes || '';
  }

  static handlePropertyInfoSubmit() {
    const propertyData = {
      title: document.getElementById('propTitle').value,
      cep: document.getElementById('propCep').value,
      street: document.getElementById('propStreet').value,
      number: document.getElementById('propNumber').value,
      complement: document.getElementById('propComplement').value,
      neighborhood: document.getElementById('propNeighborhood').value,
      city: document.getElementById('propCity').value,
      state: document.getElementById('propState').value,
      purchasePrice: MetricsManager.parseCurrencyFromInput(document.getElementById('propPurchasePrice').value),
      estimatedResalePrice: MetricsManager.parseCurrencyFromInput(document.getElementById('propEstimatedResalePrice').value),
      holdingCosts: MetricsManager.parseCurrencyFromInput(document.getElementById('propHoldingCosts').value),
      notes: document.getElementById('propNotes').value
    };

    StorageManager.savePropertyInfo(propertyData);
    this.renderAllViews();
    this.showToast('Dados do imóvel atualizados com sucesso!');
  }

  static async buscarEnderecoPorCep() {
    const cepInput = document.getElementById('propCep');
    const statusMsg = document.getElementById('cepStatusMsg');
    if (!cepInput || !statusMsg) return;

    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) {
      statusMsg.textContent = '⚠️ Digite um CEP válido com 8 dígitos.';
      statusMsg.style.color = 'var(--toast-warn-color, #f59e0b)';
      return;
    }

    statusMsg.textContent = '🔍 Buscando endereço...';
    statusMsg.style.color = 'var(--toast-info-color, #38bdf8)';

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Erro na resposta da API ViaCEP.');
      const data = await response.json();

      if (data.erro) {
        statusMsg.textContent = '❌ CEP não encontrado. Verifique e tente novamente.';
        statusMsg.style.color = 'var(--toast-error-color, #ef4444)';
        return;
      }

      document.getElementById('propStreet').value = data.logradouro || '';
      document.getElementById('propNeighborhood').value = data.bairro || '';
      document.getElementById('propCity').value = data.localidade || '';
      document.getElementById('propState').value = data.uf || '';
      if (data.complemento) document.getElementById('propComplement').value = data.complemento;

      if (data.logradouro && data.localidade) {
        statusMsg.textContent = `✅ Endereço carregado: ${data.localidade}/${data.uf}. Complete o número!`;
        statusMsg.style.color = 'var(--toast-success-color, #10b981)';
        setTimeout(() => { statusMsg.innerHTML = '&nbsp;'; }, 6000);
      } else {
        statusMsg.textContent = '✅ Dados carregados. Complemente os campos faltantes.';
        statusMsg.style.color = 'var(--toast-success-color, #10b981)';
      }
    } catch (err) {
      console.warn('Falha ao buscar CEP (pode ser modo offline):', err);
      statusMsg.textContent = '⚠️ Não foi possível buscar online. Digite o endereço manualmente.';
      statusMsg.style.color = 'var(--toast-warn-color, #f59e0b)';
    }
  }

  static renderPhasesView() {
    const phases = StorageManager.getPhases();
    const container = document.getElementById('phasesContainer');
    if (!container) return;

    let html = '';
    phases.forEach((phase, index) => {
      const statusBadge = phase.status === 'concluido' ? 'badge-pago' : phase.status === 'em_andamento' ? 'badge-servico' : 'badge-pendente';
      const statusLabel = phase.status === 'concluido' ? 'Concluído' : phase.status === 'em_andamento' ? 'Em Andamento' : 'Pendente';

      html += `
        <div class="content-panel" style="padding: 1.25rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h4 style="font-size: 1rem; font-weight: 700;">Etapa ${index + 1}: ${phase.name}</h4>
              <p style="font-size: 0.85rem; color: var(--text-muted);">Orçamento Previsto: ${MetricsManager.formatCurrency(phase.budget)}</p>
            </div>
            <select class="form-select" style="width: auto;" onchange="AppController.updatePhaseStatus('${phase.id}', this.value)">
              <option value="pendente" ${phase.status === 'pendente' ? 'selected' : ''}>Pendente</option>
              <option value="em_andamento" ${phase.status === 'em_andamento' ? 'selected' : ''}>Em Andamento</option>
              <option value="concluido" ${phase.status === 'concluido' ? 'selected' : ''}>Concluído</option>
            </select>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  static updatePhaseStatus(phaseId, newStatus) {
    if (!AuthManager.isAuthenticated()) {
      this.requireAuth(() => this.updatePhaseStatus(phaseId, newStatus));
      return;
    }
    const phases = StorageManager.getPhases();
    const p = phases.find(item => item.id === phaseId);
    if (p) {
      p.status = newStatus;
      StorageManager.savePhases(phases);
      this.showToast('Status da etapa atualizado!');
    }
  }

  static renderReportTab() {
    const propertyInfo = StorageManager.getPropertyInfo();
    const expenses = StorageManager.getExpenses();
    const metrics = MetricsManager.calculatePropertyMetrics(propertyInfo, expenses);
    ReportsManager.renderReportView('reportContentContainer', propertyInfo, expenses, metrics);
  }

  static showReceiptModal(expenseId) {
    const expenses = StorageManager.getExpenses();
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp || !exp.receipt) return;

    const modalBackdrop = document.getElementById('modalReceiptBackdrop');
    const modalBody = document.getElementById('modalReceiptBody');
    if (modalBackdrop && modalBody) {
      modalBody.innerHTML = `<img src="${exp.receipt}" style="width: 100%; border-radius: var(--radius-sm);" alt="Recibo">`;
      modalBackdrop.classList.add('active');
    }
  }

  static closeModalReceipt() {
    const modalBackdrop = document.getElementById('modalReceiptBackdrop');
    if (modalBackdrop) modalBackdrop.classList.remove('active');
  }

  // ============================================================
  // ADMIN: Gestão de Acessos (v2.1.8)
  // - Submenu DROPDOWN visível em "🔓 Entrar como Admin"
  // - Tabela completa com TODOS auth.users
  // - Promover / Rebaixar / Excluir individual (Admin direto)
  // - Roles dinâmicos via app_config (migration 007)
  // ============================================================
  static _ADMIN_DELETE_KEY = 'reformaplus_admin_delete_queue_v1';
  static _ADMIN_ROLE_CACHE_KEY = 'reformaplus_admin_role_cache_v1';
  static _ADMIN_ROLE_CACHE_TTL_MS = 60 * 1000;
  static _adminSyncIsSuperAdminCache = false;

  static async isCurrentUserSuperAdmin() {
    try {
      const email = AuthManager.getCurrentUserEmail() || '';
      const norm = email.trim().toLowerCase();
      // Caso 1: autenticação local (PIN) SEM email = Admin (compatibilidade legacy)
      if (AuthManager.isAuthenticated() && !AuthManager._hasSupabaseSessionSync() && !norm) {
        return true;
      }
      if (!norm) return false;
      // Caso 2: Fallback hardcoded (rosanacas1975@gmail.com etc)
      if (SUPER_ADMIN_EMAILS.some(e => e.trim().toLowerCase() === norm)) return true;

      try {
        const c = window.SupabaseClient?.getClient?.();
        if (c) {
          let cache = null;
          try { cache = JSON.parse(localStorage.getItem(this._ADMIN_ROLE_CACHE_KEY) || 'null'); } catch (_) { cache = null; }
          let list = null;
          if (cache && Array.isArray(cache.list) && (cache.ts || 0) > (Date.now() - this._ADMIN_ROLE_CACHE_TTL_MS)) {
            list = cache.list;
          } else {
            const { data, error } = await c.rpc('admin_get_super_admin_emails', {});
            if (!error && Array.isArray(data)) {
              list = data.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
              localStorage.setItem(this._ADMIN_ROLE_CACHE_KEY, JSON.stringify({ ts: Date.now(), list }));
            }
          }
          if (list && Array.isArray(list) && list.includes(norm)) return true;
        }
      } catch (_) { }
      return false;
    } catch (_) { return false; }
  }

  static _adminInvalidateRoleCache() {
    try { localStorage.removeItem(this._ADMIN_ROLE_CACHE_KEY); } catch (_) { }
  }

  static _adminGetDeleteQueue() {
    try {
      const raw = localStorage.getItem(this._ADMIN_DELETE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  static _adminSaveDeleteQueue(queue) {
    localStorage.setItem(this._ADMIN_DELETE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
  }

  static adminQueueDeletionFor(email, reason) {
    const norm = (email || '').toString().trim().toLowerCase();
    if (!norm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
      return { success: false, error: 'Email inválido.' };
    }
    if (SUPER_ADMIN_EMAILS.some(e => e.trim().toLowerCase() === norm)) {
      return { success: false, error: 'Não é possível excluir uma conta de Super Administrador.' };
    }
    const currentEmail = AuthManager.getCurrentUserEmail();
    const queue = this._adminGetDeleteQueue();
    let item = queue.find(q => q.email === norm);
    if (!item) {
      item = { email: norm, created_at: new Date().toISOString() };
      queue.push(item);
    }
    item.requested_by = currentEmail || 'admin-local';
    item.requested_at = new Date().toISOString();
    item.reason = (reason || '').toString().substring(0, 500) || null;
    try {
      item.share_token = btoa(unescape(encodeURIComponent(norm + '|' + Date.now())));
    } catch (_) {
      item.share_token = Buffer.from(norm + '|' + Date.now()).toString('base64');
    }
    this._adminSaveDeleteQueue(queue);
    const url = (window.location.origin + window.location.pathname) + '?admin_delete_account=' + encodeURIComponent(norm) + '&t=' + encodeURIComponent(item.share_token || '');
    return { success: true, item, share_link: url };
  }

  static adminCancelDeletionFor(email) {
    const norm = (email || '').toString().trim().toLowerCase();
    const queue = this._adminGetDeleteQueue().filter(q => q.email !== norm);
    this._adminSaveDeleteQueue(queue);
  }

  static _adminInjectButtonInHeader() {
    let ddWrap = document.getElementById('adminDropdownWrap');
    const shouldShow = AppController._adminSyncIsSuperAdminCache;

    const authBtn = document.getElementById('btnAuthToggle');
    if (!shouldShow || !authBtn) {
      if (ddWrap) ddWrap.remove();
      return;
    }

    let old = document.getElementById('btnAdminPanelToggle');
    if (old) old.remove();

    const parent = authBtn.parentElement;
    if (!ddWrap) {
      ddWrap = document.createElement('div');
      ddWrap.id = 'adminDropdownWrap';
      ddWrap.style.cssText = 'position:relative;display:inline-block;margin-left:4px;z-index:10000;';
      ddWrap.innerHTML = `
        <button type="button" id="adminDropdownBtn" class="btn btn-sm no-print" style="background:rgba(234,88,12,0.15);border:1px solid rgba(234,88,12,0.45);color:#c2410c;font-weight:700;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;">
          <span>⚙️</span><span class="btn-header-text">Admin</span><span style="font-size:0.7rem;">▾</span>
        </button>
        <div id="adminDropdownMenu" style="position:absolute;right:0;top:calc(100% + 7px);min-width:240px;max-width:320px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:0 14px 40px rgba(0,0,0,0.22);z-index:100001;padding:6px;display:none;flex-direction:column;gap:3px;">
          <button type="button" id="admMenuGestao" style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:6px;border:0;background:transparent;color:var(--text);cursor:pointer;font-size:0.9rem;text-align:left;font-weight:600;">
            👥 <span>Gestão de Acessos</span>
          </button>
          <button type="button" id="admMenuPin" style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:6px;border:0;background:transparent;color:var(--text);cursor:pointer;font-size:0.9rem;text-align:left;">
            🔑 <span>Alterar PIN Administrador</span>
          </button>
          <div style="height:1px;background:var(--border);margin:5px 3px;opacity:0.7;"></div>
          <button type="button" id="admMenuSair" style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:6px;border:0;background:transparent;color:#991b1b;cursor:pointer;font-size:0.9rem;text-align:left;font-weight:700;">
            🚪 <span>Sair (logout)</span>
          </button>
        </div>
      `;
    }
    if (parent && !parent.contains(ddWrap)) {
      try {
        if (authBtn.nextSibling) {
          parent.insertBefore(ddWrap, authBtn.nextSibling);
        } else {
          parent.appendChild(ddWrap);
        }
      } catch (_) {
        parent.appendChild(ddWrap);
      }
    }

    const btn = ddWrap.querySelector('#adminDropdownBtn');
    const menu = ddWrap.querySelector('#adminDropdownMenu');
    const adjustMenu = () => {
      try {
        const docW = (window.innerWidth || document.documentElement.clientWidth || 1280);
        const wrapRect = ddWrap.getBoundingClientRect();
        // Alinhar menu à direita do botão admin por padrão
        menu.style.left = 'auto';
        menu.style.right = '0';
        // Se sair pela direita, inverter para alinhar à esquerda do wrap
        const estRight = wrapRect.right;  // lado direito do menu (right:0)
        if (estRight + 8 > docW) {
          menu.style.right = '0';
          menu.style.left = 'auto';
        }
        // Se sair pela esquerda, fixar pelo lado esquerdo disponível
        const estLeft = wrapRect.right - 260;
        if (estLeft < 8) {
          menu.style.right = 'auto';
          menu.style.left = '0';
        }
      } catch (_) {}
    };
    const toggleMenu = (force) => {
      const newDisplay = typeof force === 'boolean' ? force : (menu.style.display !== 'flex');
      menu.style.display = newDisplay ? 'flex' : 'none';
      if (newDisplay) setTimeout(adjustMenu, 0);
    };
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(); };
    document.addEventListener('click', (e) => {
      if (!ddWrap.contains(e.target)) toggleMenu(false);
    }, true);

    const closeAll = () => toggleMenu(false);
    ddWrap.querySelector('#admMenuGestao').onclick = () => { closeAll(); AppController.openAdminGestaoAcessos(); };
    ddWrap.querySelector('#admMenuPin').onclick = () => {
      closeAll();
      AppController.handleChangePinSubmit();
    };
    ddWrap.querySelector('#admMenuSair').onclick = () => {
      closeAll();
      if (!confirm('Sair e encerrar sessão?')) return;
      (async () => {
        try { await AuthManager.signOutCloud(); } catch (_) { }
        AuthManager.logout();
        AppController._adminSyncIsSuperAdminCache = false;
        try { localStorage.removeItem(AppController._ADMIN_ROLE_CACHE_KEY); } catch (_) { }
        AppController.updateAuthUI();
        AppController.renderAllViews();
        AppController.showToast('Sessão encerrada.');
      })();
    };
  }

  static openAdminPanel() { this.openAdminGestaoAcessos(); }

  static async openAdminGestaoAcessos() {
    const isAdm = await AppController.isCurrentUserSuperAdmin();
    if (!isAdm) {
      AppController.showToast('🔒 Apenas Super Administradores podem acessar este painel.');
      return;
    }
    let backdrop = document.getElementById('modalAdminGestaoBackdrop');
    if (backdrop) { document.body.removeChild(backdrop); }
    backdrop = document.createElement('div');
    backdrop.id = 'modalAdminGestaoBackdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.78);z-index:999999;display:flex;align-items:flex-start;justify-content:center;padding:1.2rem;overflow-y:auto;';
    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.cssText = 'background:var(--bg);color:var(--text);border-radius:var(--radius);box-shadow:0 30px 80px rgba(0,0,0,0.35);width:100%;max-width:1080px;margin:auto;overflow:hidden;';
    card.innerHTML = `
      <div style="padding:1.1rem 1.4rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(90deg,rgba(234,88,12,0.1),rgba(59,130,246,0.08));">
        <div>
          <h3 style="margin:0;font-size:1.15rem;font-weight:800;">👥 Gestão de Acessos</h3>
          <div style="font-size:0.82rem;color:var(--text-dim);margin-top:2px;">
            Lista de todos os usuários cadastrados · Promova para Administrador · Exclua contas permanentemente
          </div>
        </div>
        <button type="button" id="admGestaoClose" class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:0.8rem;">✕ Fechar</button>
      </div>
      <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="search" id="admSearchInput" placeholder="🔎 Buscar por email..." style="flex:1 1 320px;min-width:220px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-soft);color:var(--text);font-size:0.92rem;" />
          <button type="button" id="admBtnRefresh" class="btn btn-outline btn-sm" style="padding:9px 14px;">🔄 Atualizar lista</button>
          <div style="flex:1 1 220px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
            <span id="admSummaryBadge" class="badge" style="font-size:0.78rem;padding:5px 10px;">--</span>
            <span id="admSummaryAdmins" class="badge badge-pago" style="font-size:0.78rem;padding:5px 10px;">-- Admins</span>
          </div>
        </div>
        <div id="admStatusMsg" style="display:none;"></div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);">
          <table id="admUsersTable" style="width:100%;border-collapse:collapse;font-size:0.86rem;">
            <thead>
              <tr style="background:var(--bg-soft);color:var(--text-dim);">
                <th style="padding:10px 12px;text-align:left;font-weight:700;">Email</th>
                <th style="padding:10px 12px;text-align:left;font-weight:700;">Criado em</th>
                <th style="padding:10px 12px;text-align:left;font-weight:700;">Último Login</th>
                <th style="padding:10px 12px;text-align:center;font-weight:700;">Role</th>
                <th style="padding:10px 12px;text-align:right;font-weight:700;">Ações</th>
              </tr>
            </thead>
            <tbody id="admUsersTbody">
              <tr><td colspan="5" style="padding:1rem 1.2rem;color:var(--text-dim);text-align:center;">Carregando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) document.body.removeChild(backdrop); });
    card.querySelector('#admGestaoClose').addEventListener('click', () => document.body.removeChild(backdrop));
    card.querySelector('#admBtnRefresh').addEventListener('click', () => AppController._adminLoadUsersIntoTable(card));
    card.querySelector('#admSearchInput').addEventListener('input', () => AppController._adminFilterUsers(card));

    const warnBox = card.querySelector('#admStatusMsg');
    warnBox.style.display = 'block';
    warnBox.style.cssText = 'padding:10px 14px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.06);color:#1d4ed8;border-radius:var(--radius-sm);font-size:0.86rem;line-height:1.55;';
    warnBox.innerHTML = '<strong>ℹ️ Primeira configuração:</strong> Se esta tela aparecer com um erro vermelho abaixo, abra o SQL Editor do Supabase e cole/execute a Migration 007 (5 funções + tabela app_config). Sem isso as funcionalidades não funcionam (RPC admin_list_users inexistente).';
    setTimeout(() => { if (warnBox.dataset.persist !== 'true') warnBox.style.display = 'none'; }, 9000);

    const myEmail = (AuthManager.getCurrentUserEmail() || '').trim().toLowerCase();
    card._gestaoContext = { allUsers: [], myEmail: myEmail };
    AppController._adminLoadUsersIntoTable(card);
  }

  static _adminFilterUsers(card) {
    const ctx = card._gestaoContext || {};
    const list = Array.isArray(ctx.allUsers) ? ctx.allUsers : [];
    const q = (card.querySelector('#admSearchInput').value || '').trim().toLowerCase();
    const filtered = !q ? list : list.filter(u => String(u.email || '').toLowerCase().includes(q));
    const tbody = card.querySelector('#admUsersTbody');
    this._adminRenderUserRows(tbody, filtered, ctx);
    this._adminUpdateSummary(card, list);
  }

  static _adminUpdateSummary(card, list) {
    try {
      const total = list.length;
      const admins = list.filter(u => !!u.is_super_admin).length;
      card.querySelector('#admSummaryBadge').textContent = '👥 ' + total + ' usuários';
      card.querySelector('#admSummaryAdmins').textContent = '🔑 ' + admins + ' Admin(s) do sistema';
    } catch (_) {}
  }

  static _adminRenderUserRows(tbody, list, ctx) {
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:1rem 1.2rem;color:var(--text-dim);text-align:center;">Nenhum usuário encontrado.</td></tr>`;
      return;
    }
    const me = (ctx.myEmail || '').trim().toLowerCase();
    list.forEach(u => {
      const email = String(u.email || '');
      const isAdm = !!u.is_super_admin;
      const isMe = email.trim().toLowerCase() === me;
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-top:1px solid var(--border);';
      const tdE = document.createElement('td');
      tdE.style.cssText = 'padding:10px 12px;vertical-align:middle;word-break:break-all;font-weight:500;';
      tdE.innerHTML = (isMe ? '<span style="color:#0369a1;font-weight:700;">👤 EU</span> · ' : '') + email;
      const tdC = document.createElement('td');
      tdC.style.cssText = 'padding:10px 12px;vertical-align:middle;white-space:nowrap;font-size:0.82rem;color:var(--text-dim);';
      tdC.textContent = u.created_at ? new Date(u.created_at).toLocaleString('pt-BR') : '—';
      const tdL = document.createElement('td');
      tdL.style.cssText = 'padding:10px 12px;vertical-align:middle;white-space:nowrap;font-size:0.82rem;color:var(--text-dim);';
      tdL.textContent = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca';
      const tdR = document.createElement('td');
      tdR.style.cssText = 'padding:10px 12px;vertical-align:middle;text-align:center;';
      const rBadge = document.createElement('span');
      rBadge.className = isAdm ? 'badge badge-pago' : 'badge badge-pendente';
      rBadge.style.cssText = 'font-size:0.8rem;padding:4px 10px;';
      rBadge.textContent = isAdm ? '🔑 Administrador Sistema' : '👤 Usuário Comum';
      tdR.appendChild(rBadge);

      const tdA = document.createElement('td');
      tdA.style.cssText = 'padding:10px 12px;vertical-align:middle;text-align:right;white-space:nowrap;display:flex;gap:6px;justify-content:flex-end;';
      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'btn btn-outline btn-sm';
      btnToggle.style.cssText = 'font-size:0.8rem;padding:5px 9px;';
      btnToggle.disabled = isMe;
      btnToggle.title = isMe ? 'Não é possível alterar o seu próprio role.' : (isAdm ? 'Rebaixar para Usuário Comum' : 'Promover para Administrador do Sistema');
      btnToggle.textContent = isAdm ? '👤 Rebaixar' : '🔑 Promover';
      btnToggle.addEventListener('click', () => AppController._adminToggleRole(card, u, !isAdm));

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-sm';
      btnDel.style.cssText = 'font-size:0.8rem;padding:5px 9px;background:rgba(185,28,28,0.1);border:1px solid rgba(185,28,28,0.3);color:#991b1b;font-weight:600;';
      btnDel.disabled = isMe || isAdm;
      btnDel.title = isMe ? 'Não é possível excluir a si mesmo.' : (isAdm ? 'Primeiro rebaixe esta conta para Usuário Comum.' : 'Excluir permanentemente esta conta.');
      btnDel.textContent = '🛑 Excluir';
      btnDel.addEventListener('click', () => AppController._adminExcluirConta(card, u));

      tdA.appendChild(btnToggle);
      tdA.appendChild(btnDel);
      tr.appendChild(tdE); tr.appendChild(tdC); tr.appendChild(tdL); tr.appendChild(tdR); tr.appendChild(tdA);
      tbody.appendChild(tr);
    });
  }

  static async _adminLoadUsersIntoTable(card) {
    const ctx = card._gestaoContext || {};
    const tbody = card.querySelector('#admUsersTbody');
    const status = card.querySelector('#admStatusMsg');
    tbody.innerHTML = `<tr><td colspan="5" style="padding:1rem 1.2rem;color:var(--text-dim);text-align:center;">Carregando usuários do Supabase...</td></tr>`;
    status.style.display = 'none';
    try {
      const c = window.SupabaseClient?.getClient?.();
      if (!c) throw new Error('Supabase Client não inicializado.');
      const { data, error } = await c.rpc('admin_list_users', {});
      if (error) throw new Error(error.message || String(error));
      let list = [];
      if (Array.isArray(data)) list = data;
      else if (data) {
        try {
          list = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
          if (!Array.isArray(list)) list = [];
        } catch (_) { list = []; }
      }
      list = list.filter(u => u && typeof u === 'object').map(u => ({
        id: String(u.id || ''),
        email: String(u.email || ''),
        created_at: u.created_at || '',
        last_sign_in_at: u.last_sign_in_at || '',
        is_super_admin: !!u.is_super_admin,
      }));
      ctx.allUsers = list;
      card._gestaoContext = ctx;
      this._adminUpdateSummary(card, list);
      this._adminFilterUsers(card);
    } catch (e) {
      status.style.display = 'block';
      status.style.cssText = 'padding:12px 14px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#991b1b;border-radius:var(--radius-sm);font-size:0.88rem;';
      status.innerHTML = '<strong>❌ Falha ao carregar usuários.</strong> Provavelmente a Migration 007 ainda não foi aplicada no SQL Editor Supabase. Erro: ' + (e.message || String(e));
      tbody.innerHTML = `<tr><td colspan="5" style="padding:1rem 1.2rem;color:#991b1b;text-align:center;">Erro: ${e.message || String(e)}</td></tr>`;
    }
  }

  static async _adminToggleRole(card, user, makeAdmin) {
    const status = card.querySelector('#admStatusMsg');
    status.style.display = 'none';
    const action = makeAdmin ? 'Promover a Administrador do Sistema' : 'Rebaixar para Usuário Comum';
    if (!confirm(`${action}?\n\nEmail: ${user.email}\n\nTem certeza?`)) return;
    try {
      const c = window.SupabaseClient?.getClient?.();
      if (!c) throw new Error('Supabase Client não inicializado.');
      const { data, error } = await c.rpc('admin_toggle_super_admin', { target_email_in: user.email, make_admin: !!makeAdmin });
      if (error) throw new Error(error.message || String(error));
      if (typeof data !== 'string' || !data.startsWith('ok|')) throw new Error(String(data || 'Resposta inválida do servidor.'));
      this._adminInvalidateRoleCache();
      AppController._adminSyncIsSuperAdminCache = await AppController.isCurrentUserSuperAdmin();
      AppController.showToast('✅ Role atualizada com sucesso: ' + user.email + ' → ' + (makeAdmin ? 'Administrador' : 'Usuário Comum'));
      await this._adminLoadUsersIntoTable(card);
    } catch (e) {
      status.style.display = 'block';
      status.style.cssText = 'padding:12px 14px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#991b1b;border-radius:var(--radius-sm);font-size:0.88rem;';
      status.innerHTML = '<strong>❌ Falha ao alterar role:</strong> ' + (e.message || String(e));
    }
  }

  static async _adminExcluirConta(card, user) {
    if (!user || !user.email || !user.id) return;
    const status = card.querySelector('#admStatusMsg');
    status.style.display = 'none';

    let backdrop = document.getElementById('modalAdminDelConfirmBackdrop');
    if (backdrop) backdrop.remove();
    backdrop = document.createElement('div');
    backdrop.id = 'modalAdminDelConfirmBackdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(127,29,29,0.9);z-index:1000001;display:flex;align-items:flex-start;justify-content:center;padding:1.2rem;overflow-y:auto;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg);color:var(--text);border-radius:var(--radius);box-shadow:0 30px 90px rgba(0,0,0,0.5);width:100%;max-width:620px;margin:auto;border:2px solid #dc2626;';
    modal.innerHTML = `
      <div style="padding:1.25rem;border-bottom:1px solid #fecaca;background:rgba(220,38,38,0.06);">
        <h3 style="margin:0;color:#b91c1c;font-size:1.1rem;">🛑 Excluir permanentemente esta conta?</h3>
      </div>
      <div style="padding:1.2rem 1.3rem;display:flex;flex-direction:column;gap:0.9rem;">
        <div style="font-size:0.92rem;line-height:1.6;">
          Conta alvo: <strong style="font-size:1rem;">${user.email}</strong><br/>
          ID: <code style="background:rgba(0,0,0,0.06);padding:1px 6px;border-radius:4px;font-size:0.8rem;">${user.id}</code>
        </div>
        <div style="background:rgba(220,38,38,0.06);border:1px solid #fecaca;padding:1rem;border-radius:var(--radius-sm);font-size:0.85rem;line-height:1.65;">
          <strong style="color:#991b1b;">Ao confirmar, as ações abaixo são executadas e são 100% IRREVERSÍVEIS:</strong>
          <ul style="margin:8px 0 0 1.2rem;padding:0;display:flex;flex-direction:column;gap:3px;">
            <li>❌ Apagar TODOS os dados nas tabelas (imóveis, fases, lançamentos, etc)</li>
            <li>❌ Apagar TODOS os recibos anexados no Storage bucket receipts</li>
            <li>❌ Remover cadastro de email/senha/sessões em auth.users</li>
          </ul>
        </div>
        <label style="font-size:0.88rem;font-weight:700;color:#991b1b;">Digite <u>EXCLUIR ESTA CONTA</u> abaixo para confirmar:</label>
        <input type="text" id="admDelPhrase" placeholder="Digite exatamente: EXCLUIR ESTA CONTA" maxlength="30" autocomplete="off" style="padding:10px 12px;border:1px solid #dc2626;border-radius:var(--radius-sm);font-size:1rem;font-weight:600;"/>
        <label style="font-size:0.88rem;font-weight:700;color:#991b1b;">Digite novamente o <u>email da conta</u> ${user.email} para confirmar:</label>
        <input type="email" id="admDelEmail" autocomplete="off" placeholder="Digite novamente o email da conta alvo" style="padding:10px 12px;border:1px solid #dc2626;border-radius:var(--radius-sm);font-size:0.95rem;"/>
        <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:0.88rem;"><input type="checkbox" id="admDelCheck" style="margin-top:3px;"/> <span>Confirmo que LI e ENTENDI que esta ação é IRREVERSÍVEL e que não há recuperação.</span></label>
        <div id="admDelStatus" style="display:none;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" id="admDelRun" class="btn" style="flex:1 1 240px;padding:12px 1rem;background:#b91c1c;border-color:#991b1b;color:#fff;font-weight:700;" disabled>🛑 SIM, EXCLUIR ESTA CONTA PERMANENTEMENTE</button>
          <button type="button" id="admDelCancel" class="btn btn-outline" style="flex:1 1 180px;padding:12px 1rem;font-weight:600;">Cancelar</button>
        </div>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const ph = modal.querySelector('#admDelPhrase');
    const em = modal.querySelector('#admDelEmail');
    const ck = modal.querySelector('#admDelCheck');
    const run = modal.querySelector('#admDelRun');
    modal.querySelector('#admDelCancel').onclick = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    const validate = () => {
      const okP = ph.value.trim() === 'EXCLUIR ESTA CONTA';
      const okE = em.value.trim().toLowerCase() === user.email.trim().toLowerCase();
      run.disabled = !(okP && okE && ck.checked);
    };
    [ph, em, ck].forEach(el => { el.addEventListener('change', validate); el.addEventListener('input', validate); });
    run.onclick = async () => {
      if (!confirm('⚠️ ÚLTIMA CHANCE: DESEJA REALMENTE EXCLUIR ' + user.email + ' E TODOS OS SEUS DADOS?')) return;
      run.disabled = true;
      const s = modal.querySelector('#admDelStatus');
      s.style.display = 'block';
      s.style.cssText = 'padding:10px 12px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.08);border-radius:var(--radius-sm);font-size:0.88rem;';
      s.textContent = 'Processando exclusão...';
      try {
        const c = window.SupabaseClient?.getClient?.();
        if (!c) throw new Error('Cliente Supabase não inicializado.');
        const { data, error } = await c.rpc('admin_delete_user_outro', { target_uid: user.id, confirm_email_in: user.email });
        if (error) throw new Error(error.message || String(error));
        if (typeof data !== 'string' || !data.startsWith('ok|')) throw new Error(String(data || 'Resposta RPC inválida.'));
        AppController._adminInvalidateRoleCache();
        AppController.showToast('✅ Conta excluída permanentemente: ' + user.email);
        backdrop.remove();
        await this._adminLoadUsersIntoTable(card);
      } catch (e) {
        s.style.cssText = 'padding:10px 12px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);border-radius:var(--radius-sm);font-size:0.88rem;color:#991b1b;';
        s.innerHTML = '<strong>❌ Falha:</strong> ' + (e.message || String(e));
        run.disabled = false;
      }
    };
  }

  static _adminRenderQueueList(panel) {
    const list = panel.querySelector('#adminQueueList');
    if (!list) return;
    const queue = this._adminGetDeleteQueue();
    if (queue.length === 0) {
      list.innerHTML = `<div style="color:var(--text-dim);padding:0.6rem 0;">Nenhuma solicitação de exclusão pendente.</div>`;
      return;
    }
    list.innerHTML = '';
    queue.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0.55rem 0.7rem;background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-sm);';
      const left = document.createElement('div');
      left.style.cssText = 'flex:1;min-width:0;';
      left.innerHTML = `
        <div style="font-weight:600;font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📌 ${item.email}</div>
        <div style="font-size:0.78rem;color:var(--text-dim);">Solicitado por <strong>${item.requested_by || 'admin'}</strong> em ${new Date(item.requested_at || item.created_at).toLocaleString('pt-BR')}${item.reason ? ` · Motivo: "${item.reason.substring(0, 70)}${item.reason.length > 70 ? '...' : ''}"` : ''}</div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm';
      btn.style.cssText = 'flex-shrink:0;font-size:0.75rem;';
      btn.textContent = 'Cancelar';
      btn.title = 'Cancelar solicitação de exclusão para este email.';
      btn.addEventListener('click', () => {
        if (!confirm(`Cancelar exclusão de ${item.email}?`)) return;
        AppController.adminCancelDeletionFor(item.email);
        AppController._adminRenderQueueList(panel);
        AppController.showToast('Solicitação de exclusão cancelada.');
      });
      row.appendChild(left);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  static _adminCheckPendingSelfDelete() {
    if (!AuthManager.isAuthenticated()) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const pendingFromLink = params.get('admin_delete_account')?.toString().trim().toLowerCase();
      const queue = this._adminGetDeleteQueue();
      const myEmail = (AuthManager.getCurrentUserEmail() || '').trim().toLowerCase();
      let matchItem = null;
      if (myEmail) matchItem = queue.find(q => q.email === myEmail);
      if (!matchItem && pendingFromLink && myEmail && pendingFromLink === myEmail) {
        matchItem = queue.find(q => q.email === pendingFromLink) || { email: pendingFromLink, from_link: true, requested_at: new Date().toISOString() };
      }
      if (matchItem) {
        setTimeout(() => AppController._adminOpenSelfDestructModal(matchItem), 600);
      }
    } catch (e) { console.warn('[Admin] check self delete failed:', e); }
  }

  static _adminOpenSelfDestructModal(item) {
    let backdrop = document.getElementById('modalSelfDestructBackdrop');
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.id = 'modalSelfDestructBackdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(127,29,29,0.88);z-index:1000000;display:flex;align-items:flex-start;justify-content:center;padding:1.2rem;overflow-y:auto;';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg);color:var(--text);border-radius:var(--radius);box-shadow:0 30px 90px rgba(0,0,0,0.5);width:100%;max-width:640px;margin:auto;border:2px solid #dc2626;';
    card.innerHTML = `
      <div style="padding:1.5rem;border-bottom:1px solid #fecaca;background:linear-gradient(180deg,rgba(220,38,38,0.08),transparent);">
        <h2 style="margin:0;color:#b91c1c;font-size:1.2rem;">🛑 Exclusão de Conta Solicitada pelo Administrador</h2>
      </div>
      <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem;">
        <div style="font-size:0.95rem;line-height:1.65;">
          Prezado(a) <strong style="font-size:1rem;">${item.email || 'Usuário'}</strong>, o Administrador do sistema solicitou a <strong style="color:#b91c1c;">EXCLUSÃO PERMANENTE</strong> da sua conta e de todos os seus dados.
        </div>
        <div style="background:rgba(220,38,38,0.06);border:1px solid #fecaca;padding:1rem;border-radius:var(--radius-sm);font-size:0.88rem;line-height:1.65;">
          <strong style="color:#991b1b;">Ao confirmar, as ações abaixo serão executadas <u>imediatamente</u> e são IRREVERSÍVEIS:</strong>
          <ul style="margin:8px 0 0 1.2rem;padding:0;display:flex;flex-direction:column;gap:4px;">
            <li>❌ Apagar todos os seus dados locais (localStorage, sessões).</li>
            <li>❌ Apagar todos os seus dados no banco de dados do Supabase (imóveis, lançamentos, etapas, recibos).</li>
            <li>❌ Apagar todos os seus arquivos anexados (recibos no storage do Supabase).</li>
            <li>❌ Remover permanentemente seu email e senha cadastrados no Authentication (logout automático).</li>
          </ul>
        </div>
        <label style="font-size:0.88rem;font-weight:700;color:#991b1b;">Digite <u>EXCLUIR MINHA CONTA</u> abaixo e depois seu email para confirmar:</label>
        <input type="text" id="sdConfirmMagic" placeholder="Digite EXCLUIR MINHA CONTA" maxlength="40" autocomplete="off" style="padding:10px 12px;border:1px solid #dc2626;border-radius:var(--radius-sm);font-size:1rem;font-weight:600;letter-spacing:0.2px;" />
        <input type="email" id="sdConfirmEmail" placeholder="Digite seu email: ${item.email || ''}" autocomplete="off" style="padding:10px 12px;border:1px solid #dc2626;border-radius:var(--radius-sm);font-size:0.95rem;" />
        <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:0.88rem;"><input type="checkbox" id="sdCheckFinal" style="margin-top:3px;" /> <span>Confirmo que LI e ENTENDI que esta ação é IRREVERSÍVEL e perco TODO o acesso.</span></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="sdBtnRun" type="button" class="btn" style="flex:1 1 240px;padding:12px 1rem;background:#b91c1c;border-color:#991b1b;color:white;font-weight:700;" disabled>🛑 SIM, EXCLUIR MINHA CONTA DEFINITIVAMENTE</button>
          <button id="sdBtnWait" type="button" class="btn btn-outline" style="flex:1 1 180px;padding:12px 1rem;font-weight:600;">⏸️ Cancelar e Manter Conta</button>
        </div>
        <div id="sdStatusBox" style="display:none;"></div>
      </div>
    `;
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    const magic = card.querySelector('#sdConfirmMagic');
    const email = card.querySelector('#sdConfirmEmail');
    const check = card.querySelector('#sdCheckFinal');
    const btnRun = card.querySelector('#sdBtnRun');
    const btnWait = card.querySelector('#sdBtnWait');
    const status = card.querySelector('#sdStatusBox');
    const validate = () => {
      const okMagic = magic.value.trim() === 'EXCLUIR MINHA CONTA';
      const okEmail = email.value.trim().toLowerCase() === (item.email || '').trim().toLowerCase() && email.value.trim().length > 0;
      btnRun.disabled = !(okMagic && okEmail && check.checked);
    };
    [magic, email, check].forEach(el => el.addEventListener('change', validate));
    magic.addEventListener('input', validate);
    email.addEventListener('input', validate);
    btnWait.addEventListener('click', () => {
      if (!confirm('Manter sua conta e cancelar a exclusão solicitada? O Administrador pode solicitar novamente depois.')) return;
      AppController.adminCancelDeletionFor(item.email);
      try { const u = new URL(window.location.href); u.searchParams.delete('admin_delete_account'); u.searchParams.delete('t'); window.history.replaceState({}, document.title, u.pathname + u.search); } catch (_) { }
      document.body.removeChild(backdrop);
      AppController.showToast('Conta mantida.');
    });
    btnRun.addEventListener('click', () => AppController._adminExecuteSelfDestruct(item, status, () => document.body.removeChild(backdrop)));
  }

  static async _adminExecuteSelfDestruct(item, statusBoxEl, onDone) {
    if (!confirm('ÚLTIMA CHANCE: DESEJA REALMENTE EXCLUIR TODOS OS DADOS DA SUA CONTA E PERDER ACESSO PARA SEMPRE?')) return;
    try {
      statusBoxEl.style.display = 'block';
      statusBoxEl.style.cssText = 'background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-sm);padding:0.85rem 1rem;font-size:0.88rem;display:flex;flex-direction:column;gap:4px;';
      const append = (text) => {
        const line = document.createElement('div');
        line.textContent = '• ' + text;
        statusBoxEl.appendChild(line);
      };
      append('Iniciando auto-destruição segura da conta...');
      const userId = AuthManager.getCurrentUserId();
      const userEmail = (AuthManager.getCurrentUserEmail() || '').trim().toLowerCase();

      append('(1/5) Apagando dados locais (localStorage)...');
      try {
        StorageManager.resetToDefaultData();
        sessionStorage.clear();
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (/^reformaplus_/i.test(k)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      } catch (_) { }

      const c = window.SupabaseClient?.getClient?.();
      if (c && userId && userId !== 'local-user-admin') {
        let rpcOk = false;
        try {
          append('(2/5) Chamando função segura no banco (deleta tabelas, storage e auth.users)...');
          const { data: rpcData, error: rpcErr } = await c.rpc('delete_current_user_and_all_data', {});
          if (!rpcErr && rpcData && String(rpcData).startsWith('ok|')) {
            append('✅ Função segura executou: ' + String(rpcData));
            rpcOk = true;
          } else if (rpcErr) {
            append('⚠️ RPC não disponível (ainda não aplicou migration?): ' + (rpcErr.message || rpcErr.code || String(rpcErr)));
          }
        } catch (e) {
          append('⚠️ Exceção na RPC (provável que migration ainda não foi rodada no SQL Editor, seguindo fallback): ' + (e.message || String(e)));
        }

        if (!rpcOk) {
          append('(2/5) Fallback: Apagando dados no banco (tabelas com user_id)...');
          const tables = ['properties', 'expenses', 'phases', 'transactions_v2', 'stages_v2', 'project_stages'];
          for (const t of tables) {
            try {
              const { error } = await c.from(t).delete().eq('user_id', userId);
              if (error) console.warn('[Admin] Erro ao apagar tabela ' + t + ':', error);
            } catch (e) { console.warn('[Admin] Exceção em tabela ' + t + ':', e); }
          }

          append('(3/5) Fallback: Apagando recibos anexados do Storage Bucket...');
          try {
            const bucket = window.SupabaseClient?.getReceiptsBucket?.() || 'receipts';
            const { data: list, error: listErr } = await c.storage.from(bucket).list(userId || '', { limit: 1000 });
            if (list && list.length > 0) {
              const paths = list.filter(f => !f.name.startsWith('.')).map(f => (userId || '') + '/' + f.name);
              if (paths.length > 0) {
                const { error: rmErr } = await c.storage.from(bucket).remove(paths);
                if (rmErr) console.warn('[Admin] Erro ao apagar storage paths:', rmErr);
              }
            }
          } catch (e) { console.warn('[Admin] Storage delete falhou:', e); }
        } else {
          append('(3/5) Storage e auth.users já apagados via RPC — pulando fallback.');
        }
      } else {
        append('(2/5) Modo local: sem Supabase cliente. Banco pulado.');
        append('(3/5) Modo local: Storage Bucket pulado.');
      }

      append('(4/5) Removendo da fila de exclusões pendentes...');
      if (userEmail) AppController.adminCancelDeletionFor(userEmail);

      append('(5/5) Encerrando sessão (logout)...');
      try { await AuthManager.signOutCloud(); } catch (_) { }
      AuthManager.logout();

      try { const u = new URL(window.location.href); u.searchParams.delete('admin_delete_account'); u.searchParams.delete('t'); window.history.replaceState({}, document.title, u.pathname + u.search); } catch (_) { }

      const doneBox = document.createElement('div');
      doneBox.style.cssText = 'margin-top:0.8rem;padding:1rem;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.08);border-radius:var(--radius-sm);font-size:0.92rem;line-height:1.6;';
      doneBox.innerHTML = `<strong style="color:#065f46;">✅ Conta, email, senha, sessões, dados e recibos — TUDO foi apagado permanentemente com sucesso!</strong><br/>O sistema será recarregado e você voltará para a tela de login.`;
      statusBoxEl.appendChild(doneBox);

      setTimeout(() => {
        try { onDone && onDone(); } catch (_) { }
        AppController.updateAuthUI();
        AppController.renderAllViews();
        AppController.showToast('Conta e todos os dados foram excluídos permanentemente.');
        setTimeout(() => window.location.reload(), 1200);
      }, 2200);
    } catch (e) {
      statusBoxEl.style.background = 'rgba(239,68,68,0.08)';
      statusBoxEl.style.border = '1px solid rgba(239,68,68,0.3)';
      statusBoxEl.innerHTML += `<div style="margin-top:0.5rem;"><strong style="color:#991b1b;">Erro durante exclusão:</strong> ${e.message || e}</div>`;
    }
  }

  static showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `✨ <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }
}

// Exporta para escopo global
window.AppController = AppController;
