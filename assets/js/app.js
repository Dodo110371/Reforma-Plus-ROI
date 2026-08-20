/**
 * Lógica Principal da Aplicação & Eventos
 * ReformaPlus ROI - PWA
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa a aplicação
  AppController.init();
});

class AppController {
  static currentExpenseIdToEdit = null;
  static currentReceiptPreviewUrl = null;
  static deferredInstallPrompt = null;

  static init() {
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
              const userId = session.user.id;
              const existingProp = StorageManager.getPropertyInfo();
              if (existingProp && (!existingProp.user_id || existingProp.user_id === 'local-user-admin')) {
                StorageManager.savePropertyInfo({ user_id: userId }, true);
              }
            }
          } catch (err) { console.warn('[App] onChange auth SIGNED_IN handler error:', err); }
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

    setTimeout(() => {
      try { if (AuthManager.isAuthenticated()) SupabaseSync.processQueue(); } catch (_) { }
    }, 1500);
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('Service Worker registrado com sucesso:', reg.scope))
        .catch((err) => console.warn('Erro ao registrar Service Worker:', err));
    }

    // Evento de instalação do PWA
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('btnInstallPWA');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
      }
    });
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
        const target = e.currentTarget.getAttribute('data-quicknav-tab');
        if (target) this.switchTab(target);
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

    const btnInstallPWA = document.getElementById('btnInstallPWA');
    if (btnInstallPWA) {
      btnInstallPWA.addEventListener('click', () => {
        if (this.deferredInstallPrompt) {
          this.deferredInstallPrompt.prompt();
          this.deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              this.showToast('Aplicativo instalado no seu dispositivo!');
            }
            this.deferredInstallPrompt = null;
            installBtn.style.display = 'none';
          });
        }
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
    const errorMsg = document.getElementById('authErrorMsg');
    const loadingHint = document.getElementById('authLoadingHint');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (errorMsg) errorMsg.style.display = 'none';
    if (loadingHint) loadingHint.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
    const pinInput = document.getElementById('authPinInput');
    if (pinInput) pinInput.value = '';
    const emailInput = document.getElementById('authEmailInput');
    if (emailInput) emailInput.value = '';
    const passInput = document.getElementById('authPasswordInput');
    if (passInput) passInput.value = '';

    const supabaseEnabled = !!window.SupabaseClient?.isEnabled?.();
    this.switchAuthMode(supabaseEnabled ? 'cloud' : 'local');

    if (modalBackdrop) modalBackdrop.classList.add('active');
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
      btnAuthToggle.textContent = btnLabel;
      btnAuthToggle.className = isAuth ? 'btn btn-primary btn-sm no-print' : 'btn btn-outline btn-sm no-print';
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

    // Renderiza Gráfico por Categoria
    MetricsManager.renderCustomBarChart('chartCategory', metrics.categoryBreakdown, metrics.totalRenovationCost);
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
