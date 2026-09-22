-- ================================================================
-- 007_admin_gestao_acessos.sql
-- Gestão de Acessos: listar usuários, promover/rebaixar admin,
-- excluir contas de outros usuários DIRETAMENTE (sem usuário logar).
-- Tudo SECURITY DEFINER rodando como OWNER postgres.
-- Só quem já é Super Admin consegue chamar.
-- =================================================================

-- ===== (1) Tabela de configurações dinâmicas =====
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS public.app_config ENABLE ROW LEVEL SECURITY;

-- Seed inicial (caso não exista): Super Admin padrão = rosanacas1975@gmail.com
INSERT INTO public.app_config (key, value_json)
VALUES ('super_admin_emails', '["rosanacas1975@gmail.com"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Helper interno: valida se quem está chamando a função é Super Admin
-- Regra: email do JWT auth.uid() existe na lista app_config['super_admin_emails']
-- OU (fallback compat): é o admin local pin sem cloud auth (uid null mas caller é super)
CREATE OR REPLACE FUNCTION public._is_caller_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_email TEXT;
  v_list JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  SELECT email INTO STRICT v_email FROM auth.users WHERE id = v_uid;
  v_email := lower(trim(v_email));

  -- Lista dinâmica persistida no banco
  SELECT value_json INTO v_list
  FROM public.app_config
  WHERE key = 'super_admin_emails';
  IF NOT FOUND OR v_list IS NULL THEN
    -- Fallback para whitelist hardcoded (caso tabela não tenha a chave)
    v_list := '["rosanacas1975@gmail.com"]'::jsonb;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_list) AS t(email)
      WHERE lower(trim(t.email)) = v_email
    )
  );
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN FALSE;
WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- ================================================================
-- (A) admin_get_super_admin_emails
-- Retorna a lista completa de emails classificados como Administrador
-- ================================================================
DROP FUNCTION IF EXISTS public.admin_get_super_admin_emails() CASCADE;
CREATE OR REPLACE FUNCTION public.admin_get_super_admin_emails()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public._is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Administradores podem acessar.';
  END IF;

  RETURN COALESCE(
    (SELECT value_json FROM public.app_config WHERE key = 'super_admin_emails'),
    '[]'::jsonb
  );
END;
$$;

-- ================================================================
-- (B) admin_toggle_super_admin
-- Promove (make_admin=true) ou rebaixa (make_admin=false) um email.
-- Não é possível remover o email do último Super Admin restante.
-- ================================================================
DROP FUNCTION IF EXISTS public.admin_toggle_super_admin(TEXT, BOOLEAN) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_toggle_super_admin(target_email_in TEXT, make_admin BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target TEXT;
  v_list JSONB;
  v_new_list JSONB;
  v_count INTEGER;
BEGIN
  IF NOT public._is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Administradores podem alterar roles.';
  END IF;

  v_target := lower(trim(target_email_in));
  IF v_target = '' OR v_target !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email inválido: %', target_email_in;
  END IF;

  -- Carrega lista atual
  SELECT value_json INTO v_list
  FROM public.app_config
  WHERE key = 'super_admin_emails';
  IF NOT FOUND OR v_list IS NULL THEN v_list := '[]'::jsonb; END IF;

  IF make_admin THEN
    -- Adiciona (se já não estiver)
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_list) AS t(e) WHERE lower(trim(t.e)) = v_target) THEN
      v_new_list := v_list || to_jsonb(v_target);
    ELSE
      v_new_list := v_list;
    END IF;
  ELSE
    -- Verifica se NÃO é o ÚLTIMO Super Admin
    SELECT count(*) INTO v_count
    FROM jsonb_array_elements_text(v_list) AS t(e)
    WHERE lower(trim(t.e)) <> v_target;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Não é possível remover o ÚLTIMO Super Administrador do sistema (pelo menos 1 deve existir).';
    END IF;
    -- Remove
    SELECT jsonb_agg(e)::jsonb INTO v_new_list
    FROM (
      SELECT lower(trim(t.e)) AS e
      FROM jsonb_array_elements_text(v_list) AS t(e)
      WHERE lower(trim(t.e)) <> v_target
    ) s;
    IF v_new_list IS NULL THEN v_new_list := '[]'::jsonb; END IF;
  END IF;

  -- Persiste
  UPDATE public.app_config
  SET value_json = v_new_list, updated_at = now()
  WHERE key = 'super_admin_emails';
  IF NOT FOUND THEN
    INSERT INTO public.app_config (key, value_json, updated_at)
    VALUES ('super_admin_emails', v_new_list, now());
  END IF;

  RETURN 'ok|role=' || CASE WHEN make_admin THEN 'admin' ELSE 'user' END || '|email=' || v_target;
END;
$$;

-- ================================================================
-- (C) admin_list_users
-- Lista TODOS os auth.users (até 5000). Retorna JSONB.
-- Campos: id, email, created_at, last_sign_in_at, is_super_admin
-- ================================================================
DROP FUNCTION IF EXISTS public.admin_list_users() CASCADE;
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_list JSONB;
BEGIN
  IF NOT public._is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Administradores podem listar usuários.';
  END IF;

  WITH admin_list AS (
    SELECT lower(trim(t.e)) AS email
    FROM (
      SELECT COALESCE(value_json, '[]'::jsonb) AS arr
      FROM public.app_config WHERE key = 'super_admin_emails'
    ) cfg, jsonb_array_elements_text(cfg.arr) AS t(e)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id::text,
      'email', COALESCE(u.email, ''),
      'created_at', u.created_at::text,
      'last_sign_in_at', COALESCE(u.last_sign_in_at::text, ''),
      'is_super_admin', EXISTS (SELECT 1 FROM admin_list al WHERE al.email = lower(trim(COALESCE(u.email,'')))),
      'is_anonymous', FALSE
    ) ORDER BY u.created_at DESC
  )::jsonb INTO v_list
  FROM auth.users u;

  IF v_list IS NULL THEN v_list := '[]'::jsonb; END IF;
  RETURN v_list;
END;
$$;

-- ================================================================
-- (D) admin_delete_user_outro
-- Exclui a conta de OUTRO usuário (target_uid).
-- Validação: caller é super admin + target_email bate.
-- Apaga: 6 tabelas user_id target + storage.objects pasta target/
--        + auth.users target (email/senha/sessões/refresh tokens)
-- ================================================================
DROP FUNCTION IF EXISTS public.admin_delete_user_outro(UUID, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_delete_user_outro(target_uid UUID, confirm_email_in TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_email TEXT;
  v_rows INTEGER;
  v_total INTEGER := 0;
  v_prefix TEXT;
BEGIN
  IF NOT public._is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Administradores podem excluir contas.';
  END IF;
  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'UID do usuário alvo não informado.';
  END IF;
  IF target_uid = auth.uid() THEN
    RAISE EXCEPTION 'Não use esta função para excluir a si mesmo. Use "Sair" e depois delete sua conta pelo Painel do usuário.';
  END IF;

  SELECT email INTO STRICT v_target_email FROM auth.users WHERE id = target_uid;
  IF lower(trim(COALESCE(v_target_email,''))) <> lower(trim(COALESCE(confirm_email_in,''))) THEN
    RAISE EXCEPTION 'Confirmação de email diverge do cadastro. Esperado: %.', COALESCE(v_target_email,'(email vazio)');
  END IF;

  v_prefix := target_uid::text || '/';

  -- ===== (1) Tabelas user_id (ordem FK) =====
  BEGIN
    DELETE FROM public.project_stages WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.stages_v2 WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.transactions_v2 WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.phases WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.expenses WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.properties WHERE user_id = target_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ===== (2) Storage bucket = receipts pasta do target =====
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'receipts'
      AND name LIKE (v_prefix || '%') ESCAPE '';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ===== (3) Auth.users target =====
  BEGIN
    DELETE FROM auth.users WHERE id = target_uid;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_delete_user_outro auth.users delete warning: %', SQLERRM;
  END;

  RETURN 'ok|deleted_user=' || target_uid::text || '|email=' || lower(trim(COALESCE(v_target_email,''))) || '|table_rows=' || v_total;
END;
$$;

-- ===== Permissões =====
REVOKE ALL ON FUNCTION public._is_caller_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_super_admin_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_toggle_super_admin(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_outro(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_get_super_admin_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_super_admin(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_outro(UUID, TEXT) TO authenticated;
-- Funcções já validam _is_caller_super_admin internamente.
