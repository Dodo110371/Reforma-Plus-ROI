-- ============================================================
-- MIGRATION 003 — SEED DADOS PADRÃO + RLS PARA RECIBOS STORAGE
-- ReformaPlus ROI v2.0
-- ============================================================

-- A. STORAGE BUCKET POLICIES (via SQL - preferível ao painel por ser versionável)
-- Obs: se o bucket "receipts" ainda NÃO existir no Storage, ignore este bloco
--      e crie o bucket primeiro pela UI do Supabase (passo 4 do guia).
-- O nome do objeto no Storage deve ser: {user_id}/{yyyymm}/{filename.ext}

-- Insere o bucket em storage.buckets se não existir (SQL atômico, seguro)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'receipts') THEN
    INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
    VALUES (
      'receipts',
      'receipts',
      false,
      false,
      2621440,
      ARRAY['image/png','image/jpeg','image/jpg','image/webp','application/pdf']::text[]
    );
  END IF;
END $$;

-- POLÍTICA 1 - SELECT (leitura de arquivos do usuário logado)
DROP POLICY IF EXISTS "Users see their own receipts" ON storage.objects;
CREATE POLICY "Users see their own receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1]::uuid = auth.uid()
  );

-- POLÍTICA 2 - INSERT (upload para a pasta do próprio usuário)
DROP POLICY IF EXISTS "Users upload their own receipts" ON storage.objects;
CREATE POLICY "Users upload their own receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1]::uuid = auth.uid()
  );

-- POLÍTICA 3 - UPDATE (substituir arquivo)
DROP POLICY IF EXISTS "Users update their own receipts" ON storage.objects;
CREATE POLICY "Users update their own receipts"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1]::uuid = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1]::uuid = auth.uid()
  );

-- POLÍTICA 4 - DELETE
DROP POLICY IF EXISTS "Users delete their own receipts" ON storage.objects;
CREATE POLICY "Users delete their own receipts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts' AND
    (storage.foldername(name))[1]::uuid = auth.uid()
  );

-- ============================================================
-- B. CRIAÇÃO DO ADMIN DEFAULT (usuário admin seed)
--    Esta etapa é OPCIONAL. Se você preferir criar o usuário
--    direto pela tela de signup, ela roda automaticamente
--    graças ao trigger tg_auth_users_create_profile (MIG 002).
--
--    O bloco abaixo serve apenas se você quiser garantir um
--    usuário admin padrão antes do primeiro login.
--    Para rodar, substitua OS DOIS placeholders abaixo.
-- ============================================================
DO $$
DECLARE
  -- TODO: substitua pelos valores REAIS antes de rodar (opcional)
  v_admin_email text := 'voce@seudominio.com.br';
  v_admin_pass  text := 'MudeSuaSenha@12345';
  v_user_id uuid;
BEGIN
  -- Se já existe algum usuário em auth.users, NÃO faça nada
  -- (evita duplicação)
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
    RAISE NOTICE 'Usuário admin já existe, pulando seed.';
    RETURN;
  END IF;

  -- Caso queira usar o seed, descomente as 2 linhas abaixo e rode:
  -- v_user_id := extensions.uuid_generate_v4();
  -- INSERT INTO auth.users(id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  -- VALUES (v_user_id, '00000000-0000-0000-0000-000000000000'::uuid, v_admin_email, crypt(v_admin_pass, gen_salt('bf')), public.now_utc(), public.now_utc(), public.now_utc());

  RAISE NOTICE 'Pulando seed admin. Crie seu usuário via tela de Login/Signup do app.';
END $$;
