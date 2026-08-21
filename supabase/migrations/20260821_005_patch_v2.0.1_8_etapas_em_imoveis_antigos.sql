-- ============================================================
-- PATCH MIGRATION v2.0.1 — Completa 8 Etapas padrão em Projetos Antigos
--   Usuários que tinham criado projeto ANTES deste patch só tinham 6 etapas.
--   Adiciona automaticamente p1 (Planejamento) e p8 (Entrega das Chaves)
--   para todo imóvel (property_id) que só tiver 6 stages.
-- ============================================================

DO $$
DECLARE
  prop_id uuid;
  uid uuid;
  _now timestamptz;
  _counter int;
BEGIN
  _now := now();

  FOR prop_id, uid IN SELECT DISTINCT ps.property_id, ps.user_id FROM public.project_stages ps WHERE ps.property_id IS NOT NULL LOOP
    SELECT COUNT(*) INTO _counter FROM public.project_stages s WHERE s.property_id = prop_id;

    -- Imóveis criados na v1.0/v1.5 tinham 6 stages. Acrescenta os 2 faltantes.
    IF _counter = 6 THEN
      -- p1 Planejamento e Projeto (no topo, antes da demolição)
      INSERT INTO public.project_stages (id, property_id, user_id, name, status, budget, position, created_at, updated_at)
      VALUES (
        'p1-' || substr(prop_id::text,1,8) || '-' || to_char(_now,'MMDDHH24MISS'),
        prop_id,
        uid,
        'Planejamento e Projeto',
        'concluido',
        6500.00,
        0,
        _now,
        _now
      )
      ON CONFLICT DO NOTHING;

      -- p8 Limpeza Final e Entrega (no final, após marcenaria)
      INSERT INTO public.project_stages (id, property_id, user_id, name, status, budget, position, created_at, updated_at)
      VALUES (
        'p8-' || substr(prop_id::text,1,8) || '-' || to_char(_now,'MMDDHH24MISS'),
        prop_id,
        uid,
        'Limpeza Final e Entrega das Chaves',
        'pendente',
        3500.00,
        7,
        _now,
        _now
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

ANALYZE public.project_stages;
