-- ============================================================
-- MIGRATION 002 — TABELAS DO DOMÍNIO + FKs + ÍNDICES + RLS
-- ReformaPlus ROI v2.0
-- ============================================================

-- ============================================================
-- 1. user_profiles (dados extras do usuário auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  cpf_cnpj text,
  phone text,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer', 'owner')),
  pin_hash_legacy text,            -- sha256 do PIN legado (1234 por padrão no primeiro login)
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê e edita SEU próprio perfil"
  ON public.user_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_user_profiles_upd
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger auto-create profile quando usuário se cadastra via Auth
CREATE OR REPLACE FUNCTION public.tg_auth_users_create_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles(user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'admin'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_auth_users_create_profile();

-- ============================================================
-- 2. properties (dados do imóvel - 1 por usuário por enquanto)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title text NOT NULL,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state char(2),

  purchase_price numeric(15,2) DEFAULT 0,
  estimated_resale_price numeric(15,2) DEFAULT 0,
  arv_note text,
  holding_costs numeric(15,2) DEFAULT 0,
  target_duration_months int DEFAULT 4,
  notes text,

  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_properties_user_id ON public.properties(user_id);

CREATE POLICY "Usuário GERENCIA apenas SEU imóvel"
  ON public.properties
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_properties_upd
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 3. project_stages (fases / etapas da obra)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_stages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,

  name text NOT NULL,                  -- Alvenaria, Hidráulica, Elétrica...
  stage_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','delayed')),

  physical_pct numeric(5,2) DEFAULT 0,      -- % físico (progresso obra)
  financial_pct numeric(5,2) DEFAULT 0,     -- % financeiro (gasto / orçado)
  budget_amount numeric(15,2) DEFAULT 0,    -- orçamento da fase
  spent_amount numeric(15,2) DEFAULT 0,     -- gasto até agora
  start_date date,
  end_date date,

  notes text,
  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stages_user_property ON public.project_stages(user_id, property_id);

CREATE POLICY "Usuário GERENCIA apenas SUAS etapas"
  ON public.project_stages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_project_stages_upd
  BEFORE UPDATE ON public.project_stages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 4. transactions (lançamentos financeiros - custos, receitas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.project_stages(id) ON DELETE SET NULL,

  tx_type text NOT NULL CHECK (tx_type IN ('expense','income','transfer')),
  category text NOT NULL,              -- Materiais, Serviços, Equipamentos, ARV recebida...
  subcategory text,
  environment text,                    -- Sala, Cozinha, Banheiro, Externo...
  description text NOT NULL,
  amount numeric(15,2) NOT NULL,
  quantity numeric(12,3) DEFAULT 1,
  unit_price numeric(15,2),

  supplier text,                       -- Nome da loja / prestador
  document_number text,                -- NF, boleto n°, etc.
  payment_method text,                 -- Pix, Cartão, Boleto, Dinheiro
  payment_status text DEFAULT 'paid' CHECK (payment_status IN ('paid','pending','overdue','refunded')),
  tx_date date NOT NULL,
  due_date date,

  notes text,
  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tx_user_property ON public.transactions(user_id, property_id);
CREATE INDEX IF NOT EXISTS idx_tx_stage ON public.transactions(stage_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON public.transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON public.transactions(category);

CREATE POLICY "Usuário GERENCIA apenas SEUS lançamentos"
  ON public.transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_transactions_upd
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger: ao inserir/atualizar/deletar lançamento → atualiza project_stages.spent_amount
CREATE OR REPLACE FUNCTION public.tg_tx_refresh_stage_spent()
RETURNS trigger AS $$
DECLARE v_stage_id uuid;
BEGIN
  v_stage_id := COALESCE(NEW.stage_id, OLD.stage_id);
  IF v_stage_id IS NOT NULL THEN
    UPDATE public.project_stages s
    SET spent_amount = (SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE stage_id = v_stage_id AND tx_type='expense'),
        financial_pct = CASE WHEN budget_amount > 0
          THEN LEAST(ROUND(((SELECT COALESCE(SUM(amount),0) FROM public.transactions WHERE stage_id = v_stage_id AND tx_type='expense')::numeric / budget_amount)*100, 2), 100)
          ELSE 0 END
    WHERE id = v_stage_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql VOLATILE;

DROP TRIGGER IF EXISTS tg_tx_refresh_stage_spent_ins ON public.transactions;
DROP TRIGGER IF EXISTS tg_tx_refresh_stage_spent_upd ON public.transactions;
DROP TRIGGER IF EXISTS tg_tx_refresh_stage_spent_del ON public.transactions;

CREATE TRIGGER tg_tx_refresh_stage_spent_ins AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tg_tx_refresh_stage_spent();
CREATE TRIGGER tg_tx_refresh_stage_spent_upd AFTER UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tg_tx_refresh_stage_spent();
CREATE TRIGGER tg_tx_refresh_stage_spent_del AFTER DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tg_tx_refresh_stage_spent();

-- ============================================================
-- 5. transaction_receipts (anexos de recibos via Storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transaction_receipts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,

  storage_path text NOT NULL,          -- ex: 8d0d.../2026-08/recibo-nf123.jpg
  original_filename text,
  mime_type text,
  size_bytes bigint,
  is_primary boolean DEFAULT false,

  uploaded_at timestamptz NOT NULL DEFAULT public.now_utc(),
  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_receipts_tx ON public.transaction_receipts(transaction_id);

CREATE POLICY "Usuário GERENCIA apenas SEUS recibos"
  ON public.transaction_receipts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_receipts_upd
  BEFORE UPDATE ON public.transaction_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 6. sync_operations (fila offline-first de operações pendentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_operations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  entity text NOT NULL,                  -- properties | project_stages | transactions | transaction_receipts
  entity_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('insert','update','delete')),
  payload jsonb NOT NULL,                -- snapshot do objeto a enviar

  synced boolean DEFAULT false,
  errored boolean DEFAULT false,
  error_message text,
  retries int DEFAULT 0,
  synced_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT public.now_utc(),
  updated_at timestamptz NOT NULL DEFAULT public.now_utc()
);

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sync_user_synced ON public.sync_operations(user_id, synced);

CREATE POLICY "Usuário GERENCIA apenas SUA fila de sync"
  ON public.sync_operations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_sync_operations_upd
  BEFORE UPDATE ON public.sync_operations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Permissões padrão service_role (pode tudo)
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
