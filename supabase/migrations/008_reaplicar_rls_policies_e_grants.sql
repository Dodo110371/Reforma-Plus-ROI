-- ============================================================================
-- Migration 008 — Reaplica TODAS as RLS Policies e Grants para authenticated
--                (Compatibilidade total com FREE tier, garante sync cloud)
--
-- Problema: Em FREE tier ou após restore, as policies podem perder
-- owner/permissões silenciosamente. Isso BLOQUEIA INSERT/UPDATE/DELETE
-- em todas as tabelas do usuário, fazendo parecer que "dados não salvam
-- na nuvem" (ficam apenas no localStorage do navegador).
--
-- Solução: (1) DROP IF EXISTS + recria policies idempotentes,
--          (2) GRANT ALL PRIVILEGES explícitos para authenticated em
--              TODAS tabelas/sequences do schema public.
-- ============================================================================

SET ROLE postgres;
SET search_path = public;

-- ============================================================================
-- BLOCO 1: user_profiles
-- ============================================================================
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário vê e edita SEU próprio perfil" ON public.user_profiles;
CREATE POLICY "Usuário vê e edita SEU próprio perfil"
  ON public.user_profiles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 2: properties (imóveis)
-- ============================================================================
ALTER TABLE IF EXISTS public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário GERENCIA apenas SEU imóvel" ON public.properties;
CREATE POLICY "Usuário GERENCIA apenas SEU imóvel"
  ON public.properties
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 3: project_stages (etapas legado)
-- ============================================================================
ALTER TABLE IF EXISTS public.project_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário GERENCIA apenas SUAS etapas" ON public.project_stages;
CREATE POLICY "Usuário GERENCIA apenas SUAS etapas"
  ON public.project_stages
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 4: transactions (lançamentos)
-- ============================================================================
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário GERENCIA apenas SEUS lançamentos" ON public.transactions;
CREATE POLICY "Usuário GERENCIA apenas SEUS lançamentos"
  ON public.transactions
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 5: transaction_receipts (recibos)
-- ============================================================================
ALTER TABLE IF EXISTS public.transaction_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário GERENCIA apenas SEUS recibos" ON public.transaction_receipts;
CREATE POLICY "Usuário GERENCIA apenas SEUS recibos"
  ON public.transaction_receipts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 6: sync_operations (fila)
-- ============================================================================
ALTER TABLE IF EXISTS public.sync_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário GERENCIA apenas SUA fila de sync" ON public.sync_operations;
CREATE POLICY "Usuário GERENCIA apenas SUA fila de sync"
  ON public.sync_operations
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BLOCO 7: app_config (roles admin global) — authenticated só lê
-- (escritas feitas via SECURITY DEFINER OWNER postgres apenas)
-- ============================================================================
ALTER TABLE IF EXISTS public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_owner_bypass ON public.app_config;
DROP POLICY IF EXISTS app_config_authenticated_read ON public.app_config;

CREATE POLICY app_config_owner_bypass ON public.app_config
  AS PERMISSIVE
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

CREATE POLICY app_config_authenticated_read ON public.app_config
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- BLOCO 8: GRANTS EXPLÍCITOS (não depende de DEFAULT PRIVILEGES)
-- ============================================================================
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- ============================================================================
-- BLOCO 9: Seed super_admin_emails (mantém dsdodo18@yahoo.com.br)
-- ============================================================================
INSERT INTO public.app_config (key, value_json, updated_at)
VALUES (
  'super_admin_emails',
  '["dsdodo18@yahoo.com.br"]'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- BLOCO 10: DIAGNÓSTICO (copie o resultado na tela Data Output)
-- ============================================================================
RESET ROLE;
SET search_path = public;

SELECT
  '✅ 1. Policies em public.* (esperado = 8 policies 8 tabelas user_profiles/properties/project_stages/transactions/transaction_receipts/sync_operations/app_config x2)' AS check_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
