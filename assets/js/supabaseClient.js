/**
 * assets/js/supabaseClient.js
 *
 * Cliente de conexão com o SUPABASE (Postgres BaaS).
 *
 * MODO DE FUNCIONAMENTO:
 * - Leitura de variáveis: window.__APP_ENV__ (se setado pelo servidor),
 *   ou meta tags no <head> (data-vite-supabase-url / data-vite-supabase-anon-key),
 *   ou localStorage (config manual do usuário em tela Configurações → Avançado).
 *
 * - FALLBACK: se NENHUMA das três estiver preenchida, retorna `null`
 *   e o app continua rodando 100% local-first (localStorage), sem crash.
 *
 * Supabase JS SDK carregado via CDN no <head> do index.html.
 * Objeto global exposto como `window.supabase`.
 */
(function globalSupabaseBootstrap() {
  'use strict';

  function readVal(key) {
    try {
      if (window.__APP_ENV__ && window.__APP_ENV__[key] != null) {
        return String(window.__APP_ENV__[key]).trim();
      }
      const meta = document.querySelector(`meta[name="${key}"]`);
      if (meta && meta.content && String(meta.content).trim()) {
        return String(meta.content).trim();
      }
      const ls = localStorage.getItem(key);
      if (ls && ls.trim()) return ls.trim();
    } catch (_e) { /* sem localStorage = sem Supabase, modo local */ }
    return '';
  }

  const SUPABASE_URL = readVal('VITE_SUPABASE_URL');
  const SUPABASE_ANON_KEY = readVal('VITE_SUPABASE_ANON_KEY');
  const LOCAL_ONLY = readVal('VITE_LOCAL_ONLY') === 'true';
  const BUCKET = readVal('VITE_SUPABASE_BUCKET_RECEIPTS') || 'receipts';

  const state = {
    enabled: false,
    client: null,
    url: '',
    anonKey: '',
    bucket: BUCKET,
    lastSessionCheck: 0,
  };

  function _bootClient() {
    if (state.enabled) return state.client;
    if (LOCAL_ONLY) return null;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[Supabase] CDN não carregado. Verifique o <script> no head.');
      return null;
    }
    try {
      state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: localStorage,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
        global: {
          fetch: (...args) => fetch(...args),
        },
      });
      state.enabled = true;
      state.url = SUPABASE_URL;
      state.anonKey = SUPABASE_ANON_KEY.slice(0, 12) + '...[truncated]';
      console.info(`[Supabase] Cliente inicializado (${SUPABASE_URL.replace('https://','')}).`);
      return state.client;
    } catch (e) {
      console.error('[Supabase] Falha ao criar cliente:', e);
      state.enabled = false;
      state.client = null;
      return null;
    }
  }

  const SupabaseClient = {
    /** Retorna o client Supabase ou null se não estiver configurado. */
    getClient() {
      return _bootClient();
    },

    /** Retorna true se o Supabase está configurado e inicializado. */
    isEnabled() {
      _bootClient();
      return state.enabled;
    },

    /** Retorna nome do bucket de recibos configurado (default: "receipts"). */
    getReceiptsBucket() {
      return state.bucket;
    },

    /** Retorna info de debug (NÃO exponha a service_role key!). */
    debug() {
      _bootClient();
      return {
        enabled: state.enabled,
        url: state.url,
        anonKeyMasked: state.anonKey,
        bucket: state.bucket,
        localOnly: LOCAL_ONLY,
        hasCdn: !!(window.supabase && window.supabase.createClient),
      };
    },

    /**
     * Helpers Auth: sessão atual, user_id, login/logout/signup.
     * Todos tolerantes a `null` (caso Supabase não inicializado).
     */
    auth: {
      async getSession() {
        const c = _bootClient();
        if (!c) return { session: null, user: null };
        const { data, error } = await c.auth.getSession();
        if (error) return { session: null, user: null, error };
        return { session: data.session, user: data.session?.user || null };
      },

      async getUser() {
        const { user } = await this.getSession();
        return user;
      },

      getUserIdSync() {
        try {
          const raw = localStorage.getItem('sb-' + new URL(state.url || 'http://x').hostname.replace(/\./g,'-') + '-auth-token');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.user?.id || null;
        } catch (_) { return null; }
      },

      async signUp({ email, password, fullName }) {
        const c = _bootClient();
        if (!c) return { error: new Error('Supabase não inicializado') };
        return c.auth.signUp({
          email, password,
          options: { data: { full_name: fullName || email } },
        });
      },

      async signIn({ email, password }) {
        const c = _bootClient();
        if (!c) return { error: new Error('Supabase não inicializado') };
        return c.auth.signInWithPassword({ email, password });
      },

      async signInWithMagicLink({ email }) {
        const c = _bootClient();
        if (!c) return { error: new Error('Supabase não inicializado') };
        return c.auth.signInWithOtp({ email });
      },

      async signOut() {
        const c = _bootClient();
        if (!c) return null;
        return c.auth.signOut();
      },

      onChange(callback) {
        const c = _bootClient();
        if (!c || !callback) return () => {};
        const { data } = c.auth.onAuthStateChange((evt, sess) => callback(evt, sess));
        return data?.subscription?.unsubscribe ? () => data.subscription.unsubscribe() : () => {};
      },
    },

    /** Helpers Storage (receipts). */
    storage: {
      async uploadReceipt({ user_id, file, folder = '' }) {
        const c = _bootClient();
        if (!c) throw new Error('Supabase não inicializado');
        if (!user_id) throw new Error('user_id obrigatório');
        if (!(file instanceof Blob)) throw new Error('arquivo inválido');

        const safeFolder = folder
          ? String(folder).replace(/[^0-9a-zA-Z_\-]/g,'').slice(0, 16)
          : new Date().toISOString().slice(0,7); /* yyyy-mm */
        const ext = (file.name || 'bin').split('.').pop() || 'bin';
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${user_id}/${safeFolder}/${safeName}`;

        const { data, error } = await c.storage
          .from(state.bucket)
          .upload(path, file, {
            cacheControl: '31536000',
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });
        if (error) throw error;

        const { data: signedUrl, error: err2 } = await c.storage
          .from(state.bucket)
          .createSignedUrl(path, 60 * 60 * 24 * 7 /* 7 dias */);
        return {
          path,
          original_filename: file.name || safeName,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size || 0,
          signed_url: signedUrl?.signedUrl || '',
          full_path: data?.fullPath || path,
        };
      },

      getPublicUrl(path) {
        const c = _bootClient();
        if (!c) return '';
        return c.storage.from(state.bucket).getPublicUrl(path).data?.publicUrl || '';
      },

      async getSignedUrl(path, ttlSeconds = 3600) {
        const c = _bootClient();
        if (!c) return '';
        const { data } = await c.storage.from(state.bucket).createSignedUrl(path, ttlSeconds);
        return data?.signedUrl || '';
      },

      async remove(path) {
        const c = _bootClient();
        if (!c) return null;
        return c.storage.from(state.bucket).remove([path]);
      },
    },
  };

  window.SupabaseClient = SupabaseClient;
  window.dispatchEvent(new CustomEvent('supabase:ready', { detail: SupabaseClient.debug() }));
})();
