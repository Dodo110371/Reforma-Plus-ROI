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

    try { this.handleDeepLink(); } catch (err) { console.warn('[App] handleDeepLink falhou:', err); }

    setTimeout(() => {
      try { if (AuthManager.isAuthenticated()) SupabaseSync.processQueue(); } catch (_) { }
    }, 1500);
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=205')
        .then((reg) => console.log('Service Worker registrado com sucesso:', reg.scope))
        .catch((err) => console.warn('Erro ao registrar Service Worker:', err));
    }

    // --- PWA INSTALL PIPELINE v2.0.5 (Compatibilidade 100% Chrome 151 Android 12 Motorola) ---
    // Estratégia 3 camadas: prompt nativo → fallback deferred install → fallback manual Motorola

    // Reset de segurança: se Chrome "lembrar" de um app instalado que foi removido,
    // permite disparar beforeinstallprompt de novo (reseta cache ChromeInstaller).
    try { localStorage.removeItem('reformaplus_pwa_installed_v2'); } catch (_) { }

    // 1) Prompt nativo Chrome (beforeinstallprompt): SEMPRE dispara o botão laranja
    window.addEventListener('beforeinstallprompt', (e) => {
      try { e.preventDefault(); } catch (_) { }
      AppController._installPromptEvent = e;
      AppController._refreshInstallButton(true);
      console.log('[PWA] beforeinstallprompt disparou — prompt nativo disponível.');
    });

    // 2) Confirmando instalação pós-user-choice: fecha botão + toast + helper Motorola
    window.addEventListener('appinstalled', () => {
      AppController._installPromptEvent = null;
      try { localStorage.setItem('reformaplus_pwa_installed_v2', '1'); } catch (_) { }
      AppController._refreshInstallButton(false);
      AppController.showToast('✅ ReformaPlus instalado! Ícone aparece na tela inicial.', 'success', 6000);

      if (AppController._isMotorola()) {
        setTimeout(() => {
          AppController.showToast('⚠️ Motorola/Moto Launcher pode não exibir o ícone automaticamente. Toque em 3 pontinhos ⋮ → 📲 "Adicionar à tela inicial" → Adicionar automaticamente.', 'warning', 12000);
        }, 2500);
      }
    });

    // 3) Fallback após load: se Chrome não disparou beforeinstallprompt
    //    (muito comum após re-instalações repetidas num mesmo aparelho),
    //    mostra botão com explicação do método manual.
    window.addEventListener('load', () => {
      setTimeout(() => { AppController._refreshInstallButton(false); }, 1500);
    });
  }

  /**
   * Sincroniza o estado do botão laranja "Instalar App" no header.
   * - Não mostra NUNCA se já estiver rodando em modo standalone
   * - Mostra SEMPRE se houver beforeinstallprompt disponível
   * - Se não houver prompt (Chrome já cacheou "instalado antes"), mostra botão FALLBACK:
   *   o toque abre o modal de instalação manual.
   */
  static _refreshInstallButton(fromPromptEvent) {
    const btn = document.getElementById('btnInstallPWA');
    if (!btn) return;

    if (AppController._isStandaloneMode()) {
      btn.style.display = 'none';
      return;
    }

    // Caso favorito: prompt nativo disponível.
    if (AppController._installPromptEvent) {
      btn.style.display = 'inline-flex';
      if (!btn.dataset.handlerInstalled) {
        btn.dataset.handlerInstalled = '1';
        btn.addEventListener('click', () => { AppController._handleInstallClick(); });
      }
      return;
    }

    // Fallback: se não temos prompt, mas navegador é PWA-compatível Android Chrome → mostra botão mesmo assim
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    const isChromeAndroid = /Chrome/i.test(ua) && /Android/i.test(ua) && !/Edg|SamsungBrowser/i.test(ua);

    // Só mostra fallback imediatamente se vier de load (não de beforeinstallprompt).
    if (!fromPromptEvent && isChromeAndroid) {
      btn.style.display = 'inline-flex';
      if (!btn.dataset.handlerInstalled) {
        btn.dataset.handlerInstalled = '1';
        btn.addEventListener('click', () => { AppController._handleInstallClick(); });
      }
      return;
    }

    // Desktop: mostra botão também, fallback com 3 pontinhos.
    if (!fromPromptEvent) {
      btn.style.display = 'inline-flex';
      if (!btn.dataset.handlerInstalled) {
        btn.dataset.handlerInstalled = '1';
        btn.addEventListener('click', () => { AppController._handleInstallClick(); });
      }
    }
  }

  /**
   * Clique no botão Instalar App:
   * 1) Se houver evento beforeinstallprompt salvo → abre prompt nativo Chrome
   * 2) Se não houver → toast + modal de instalação manual.
   */
  static _handleInstallClick() {
    const prompt = AppController._installPromptEvent;
    if (prompt) {
      try {
        prompt.prompt();
        prompt.userChoice.then((choice) => {
          if (choice.outcome === 'accepted') {
            AppController.showToast('📲 Instalando ReformaPlus...', 'info', 4000);
          }
          AppController._installPromptEvent = null;
        }).catch(() => { });
        return;
      } catch (_) { AppController._installPromptEvent = null; }
    }

    // Fallback: método manual (Chrome já marcou app como "já instalado" ou Motorola não mostra botão nativo)
    const isMobile = /Android|iPhone|iPad/i.test((navigator.userAgent || ''));
    const msgMotorola = AppController._isMotorola()
      ? '<br><br><span style="color:#f59e0b;font-weight:700">⚠️ Motorola Launcher detectado (Moto G22 / Android 12):<br>o ícone NÃO aparece automaticamente.<br>USE O MÉTODO 1 ABAIXO.</span>'
      : '';

    const stepsMobile = `
      <h3 style="margin-top:0;color:#10b981">📲 Instalar no Celular</h3>
      <h4 style="margin:1rem 0 .5rem 0">✅ Método 1 — SEMPRE FUNCIONA (Recomendado Motorola)</h4>
      <ol style="padding-left:1.3rem;line-height:1.8">
        <li>Toque em <b>3 pontinhos ⋮</b> no canto superior direito do Chrome.</li>
        <li>Role e toque em <b>📲 Adicionar à tela inicial</b> ou <b>Instalar app</b>.</li>
        <li>Toque em <b>Adicionar</b> (azul) → <b>Adicionar automaticamente</b>.</li>
        <li>Volte para a <b>Tela Inicial</b>. O ícone ReformaPlus aparece agora.</li>
      </ol>
      <h4 style="margin:1rem 0 .5rem 0">🔎 Método 2 — Se já instalou e não apareceu</h4>
      <ol style="padding-left:1.3rem;line-height:1.8">
        <li>Arraste a barra de status → Pesquisa 🔍 do sistema Android.</li>
        <li>Digite: <b>ReformaPlus</b>.</li>
        <li>Segure 2 segundos no resultado → <b>Adicionar à tela inicial</b> / arraste pro topo.</li>
      </ol>
      ${msgMotorola}
    `;

    const stepsDesktop = `
      <h3 style="margin-top:0;color:#10b981">💻 Instalar no Computador</h3>
      <ol style="padding-left:1.3rem;line-height:1.8">
        <li>Clique em <b>⋯ 3 pontinhos</b> (canto superior direito do Chrome/Edge).</li>
        <li>Clique em <b>Instalar aplicativo ReformaPlus ROI</b> → <b>Instalar</b>.</li>
        <li>Atalho aparece no Menu Iniciar / Dock automaticamente.</li>
      </ol>
    `;

    const html = `<div style="padding:8px 6px;max-width:520px;">${isMobile ? stepsMobile : stepsDesktop}<br><p style="text-align:right;margin:1rem 0 0 0"><button onclick="AppController._closeInstallModal();" style="padding:.65rem 1.2rem;border-radius:9999px;border:0;background:#10b981;color:#fff;font-weight:700;cursor:pointer">Entendido ✅</button></p></div>`;
    AppController._openModal('📲 Instalar ReformaPlus', html, true);
  }

  // Fecha o modal de instalação manual
  static _closeInstallModal() {
    try { document.getElementById('rp-install-modal-overlay')?.remove(); } catch (_) { }
    const backdrop = document.getElementById('modalBackdrop');
    const modal = document.getElementById('authModal');
    if (backdrop) backdrop.style.display = 'none';
    if (modal) { try { const closeBtn = modal.querySelector('.modal-close, [data-close-modal]'); if (closeBtn) closeBtn.click(); } catch (_) { } }
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

    const btnInstallPWA = document.getElementById('btnInstallPWA');
    if (btnInstallPWA) {
      btnInstallPWA.addEventListener('click', () => AppController._handleInstallClick());
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
