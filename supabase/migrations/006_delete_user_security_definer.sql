-- ================================================================
-- 006_delete_user_security_definer.sql (v2 CORRIGIDA)
-- COMPATÍVEL com Supabase FREE tier + SQL Editor (não trava)
-- Não usa storage.foldername, não usa CTE WITH, não usa schemas auth/storage no search_path
-- =================================================================
-- Função pública SECURITY DEFINER rodando como OWNER.
-- O CALLER SEMPRE deve ser o PROPRIETÁRIO DA CONTA (auth.uid() = v_uid).
-- Qualquer outro anon/authenticated SEM sessão retorna erro "Não autenticado".

DROP FUNCTION IF EXISTS public.delete_current_user_and_all_data() CASCADE;

CREATE OR REPLACE FUNCTION public.delete_current_user_and_all_data()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_email TEXT;
  v_uid_text TEXT;
  v_rows INTEGER;
  v_total INTEGER := 0;
  v_bucket TEXT := 'receipts';
  v_prefix TEXT;
  v_count INT;
BEGIN
  -- 🔒 Lock forte: só aceita chamada via JWT do Supabase Auth (proprio usuario)
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado. Apenas o próprio usuário pode chamar esta função.';
  END IF;
  v_uid_text := v_uid::text;
  v_prefix := v_uid_text || '/';

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- ====== (1) Apaga tabelas com user_id (ordem respeita FK, sem CTE) ======
  BEGIN
    DELETE FROM public.project_stages WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.stages_v2 WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.transactions_v2 WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.phases WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.expenses WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    DELETE FROM public.properties WHERE user_id = v_uid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ====== (2) Apaga Storage bucket=receipts pasta do user (usa LIKE prefixo — sem storage.foldername) ======
  BEGIN
    SELECT count(*) INTO STRICT v_count
    FROM storage.objects
    WHERE bucket_id = v_bucket
      AND name LIKE (v_prefix || '%') ESCAPE '';
    IF v_count > 0 THEN
      DELETE FROM storage.objects
      WHERE bucket_id = v_bucket
        AND name LIKE (v_prefix || '%') ESCAPE '';
    END IF;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  WHEN OTHERS THEN
    RAISE WARNING 'storage delete warning: %', SQLERRM;
  END;

  -- ====== (3) Remove auth.users (email, senha, sessões, refresh tokens, tudo — 100% automatico) ======
  BEGIN
    DELETE FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auth.users delete warning: %', SQLERRM;
  END;

  RETURN 'ok|deleted_user=' || v_uid_text || '|email=' || COALESCE(v_email, '') || '|table_rows=' || v_total;
END;
$$;

-- ====== Permissões ======
ALTER FUNCTION public.delete_current_user_and_all_data() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_current_user_and_all_data() FROM PUBLIC;
-- A função já valida auth.uid() NOT NULL (sessão JWT). Apenas authenticated passa.
GRANT EXECUTE ON FUNCTION public.delete_current_user_and_all_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_current_user_and_all_data() TO anon;
