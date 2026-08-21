-- ============================================================
-- PATCH MIGRATION v2.0.1 — Completa 8 Etapas padrão em Projetos Antigos
--   Usuários que tinham criado projeto ANTES deste patch só tinham 6 etapas.
--   Adiciona automaticamente:
--     (p0) Planejamento e Projeto (no começo, antes da demolição)
--     (p7) Limpeza Final e Entrega das Chaves (no final, após marcenaria)
--   ...para TODO imóvel (property_id) que só tiver 6 stages (padrão v1/v1.5).
--
--   Schema correto de project_stages:
--     id (uuid PK DEFAULT uuid_generate_v4())
--     user_id, property_id (FKs obrigatórios - user_id NOT NULL)
--     name (text)
--     stage_order (int, DEFAULT 0)  ← não existe "position"
--     status (text ENUM CHECK: 'pending' | 'in_progress' | 'completed' | 'delayed')
--     budget_amount numeric(15,2)    ← não existe "budget" (era nome frontend)
--     spent_amount numeric, physical_pct, financial_pct, start_date, end_date, notes
--     created_at / updated_at DEFAULT now_utc() (trigger, não precisamos passar)
-- ============================================================

DO $$
DECLARE
  r RECORD;
  _now timestamptz;
BEGIN
  _now := public.now_utc();

  -- Itera cada property_id distinto (e seu dono user_id) que só tem 6 stages
  FOR r IN
      SELECT ps.property_id AS pid,
             ps.user_id     AS uid,
             COUNT(*)       AS qtd
        FROM public.project_stages ps
       WHERE ps.property_id IS NOT NULL
       GROUP BY ps.property_id, ps.user_id
      HAVING COUNT(*) = 6
  LOOP
    -- Etapa 0: Planejamento e Projeto (concluído na maioria dos flip - já está pronto antes de demolir)
    INSERT INTO public.project_stages (
      id, user_id, property_id, name, stage_order, status, budget_amount, spent_amount,
      physical_pct, financial_pct, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(),
      r.uid,
      r.pid,
      'Planejamento e Projeto',
      0,
      'completed',
      6500.00,
      0.00,
      100.00,
      0.00,
      _now,
      _now
    ) ON CONFLICT DO NOTHING;

    -- Etapa 7: Limpeza Final + Entrega (pendente - última)
    INSERT INTO public.project_stages (
      id, user_id, property_id, name, stage_order, status, budget_amount, spent_amount,
      physical_pct, financial_pct, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(),
      r.uid,
      r.pid,
      'Limpeza Final e Entrega das Chaves',
      7,
      'pending',
      3500.00,
      0.00,
      0.00,
      0.00,
      _now,
      _now
    ) ON CONFLICT DO NOTHING;

    -- Reordena os stages ANTIGOS de 1..6 (eles eram 0..5, agora 0 virou planejamento)
    UPDATE public.project_stages ps
       SET stage_order = ps.stage_order + 1
     WHERE ps.property_id = r.pid
       AND ps.name NOT IN ('Planejamento e Projeto', 'Limpeza Final e Entrega das Chaves');
  END LOOP;
END $$;

ANALYZE public.project_stages;
