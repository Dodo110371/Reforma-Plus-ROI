-- ============================================================
-- MIGRATION 001 — INIT: EXTENSÕES, SCHEMAS, RLS PADRÃO, FUNÇÕES ÚTEIS
-- ReformaPlus ROI v2.0
-- ============================================================

-- 1. Habilitar extensões essenciais no schema public
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Criar schema private (para hashes de PIN legado, tabelas internas, nunca expor via API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT ALL ON SCHEMA private TO postgres;
GRANT USAGE ON SCHEMA private TO service_role;

-- 3. Garantir que TABELAS NOVAS no public tenham RLS ativado POR PADRÃO
ALTER DATABASE postgres SET "app.enable_rls_by_default" TO 'on';

-- 4. Função utilitária: current_timestamp em UTC (sem timezone do servidor Supabase)
CREATE OR REPLACE FUNCTION public.now_utc()
RETURNS timestamptz AS $$
BEGIN
  RETURN NOW() AT TIME ZONE 'UTC';
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

-- 5. Trigger genérico: atualiza coluna updated_at automaticamente em qualquer tabela
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = public.now_utc();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 6. Função helper: pegar user_id logado OU fallback (modo anon / local-only PIN)
CREATE OR REPLACE FUNCTION public.auth_uid_or_null()
RETURNS uuid AS $$
BEGIN
  BEGIN
    RETURN auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.auth_uid_or_null() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.now_utc() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO anon, authenticated;
