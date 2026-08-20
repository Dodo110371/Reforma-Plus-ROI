-- ============================================================
-- PATCH MIGRATION v2.0 — Multi-Imóveis property_id FK
-- Produção - 2026-08-20
-- Garante retrocompatibilidade (não apaga NENHUM dado existente)
-- Ordem: rodar APÓS as 3 migrações 001 / 002 / 003 originais
-- ============================================================

-- 1. transactions (lançamentos despesas/receitas)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_property_id
  ON public.transactions(property_id);

-- 2. project_stages (etapas da obra)
ALTER TABLE public.project_stages
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_project_stages_property_id
  ON public.project_stages(property_id);

-- 3. transaction_receipts (recibos anexados em lançamentos)
ALTER TABLE public.transaction_receipts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_receipts_property_id
  ON public.transaction_receipts(property_id);

-- 4. RLS Policies: idempotentes (só cria se não existir)
DO $$
DECLARE
  _r RECORD;
BEGIN
  FOR _r IN VALUES
    ('public.transactions',        'Usuário GERENCIA apenas SEUS lançamentos',        'user_id'),
    ('public.project_stages',      'Usuário GERENCIA apenas SUAS etapas',              'user_id'),
    ('public.transaction_receipts','Usuário GERENCIA apenas SEUS recibos',             'user_id')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = split_part(_r.column1, '.', 1)::name
         AND tablename  = split_part(_r.column1, '.', 2)::name
         AND policyname = _r.column2
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s FOR ALL USING (auth.uid() = %I) WITH CHECK (auth.uid() = %I)',
        _r.column2, _r.column1, _r.column3, _r.column3
      );
    END IF;
  END LOOP;
END $$;

-- 5. Migração RETROATIVA: liga as linhas SEM property_id existentes
DO $$
DECLARE
  _r RECORD;
BEGIN
  FOR _r IN VALUES
    ('public.transactions'),
    ('public.project_stages'),
    ('public.transaction_receipts')
  LOOP
    EXECUTE format($sql$
      UPDATE %s t
         SET property_id = (
           SELECT p.id
             FROM public.properties p
            WHERE p.user_id = t.user_id
            ORDER BY p.created_at ASC
            LIMIT 1
         )
       WHERE t.property_id IS NULL
         AND EXISTS (SELECT 1 FROM public.properties p2 WHERE p2.user_id = t.user_id)
    $sql$, _r.column1);
  END LOOP;
END $$;

-- 6. Garante RLS ligado em TUDO
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;

-- 7. Performance
ANALYZE public.properties;
ANALYZE public.transactions;
ANALYZE public.project_stages;
ANALYZE public.transaction_receipts;
