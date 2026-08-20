# 🏗️ BACKEND SETUP - ReformaPlus ROI (Supabase + GitHub + Vercel)

> **Aviso:** Este é o guia de SETUP INICIAL (criar projeto do zero).  
> 🚀 Se você **já tem o projeto criado** (repo GitHub + Supabase + Vercel já existem) e quer apenas **colocar em produção** ou **atualizar para a versão v2.0 (Multi-Imóveis)**, use o guia **atualizado e mais completo**:
> 
> # 👉 [DEPLOY_PRODUCAO.md](file:///c:/Projetos/Reforma_Plus_ROI/DEPLOY_PRODUCAO.md)
> 
> **Documentações separadas por objetivo:**
> | Guia | Quando usar? |
> |---|---|
> | `BACKEND_SETUP.md` (este arquivo) | Primeira vez na vida, **criar TUDO do zero** (projeto Supabase, migrations, repo GitHub, Vercel inicial vazio) |
> | `DEPLOY_PRODUCAO.md` | **Tudo já existe** → aplicar v2.0 Multi-Imóveis, validar build, deploy final, domínio custom, SSL, PWA, monitoramento |

> **Versão:** 2.0.0 | **Stack:** GitHub (Git) · Supabase (Postgres/Auth/Storage/Edge) · Vercel (Hosting PWA)

---

## ⏱️ Ordem Recomendada (você faz em ~40 minutos)

```
1. Supabase Project (criar)
   ├─ Rodar as 3 migrações SQL (pasta supabase/migrations/)
   ├─ Configurar Auth
   └─ Criar bucket Storage p/ recibos

2. GitHub Repo (criar + commit inicial)

3. Vercel (importar repo GitHub + configurar 2 envs)
   └─ Configurar BUILD COMMAND = `npm run build` (IMPORTANTE v2.0 — gera env.js)
   └─ Acessar URL de produção - PRONTO 🎉
   └─ Continuar em [DEPLOY_PRODUCAO.md](file:///c:/Projetos/Reforma_Plus_ROI/DEPLOY_PRODUCAO.md) para deploy final (domínio, SSL, PWA, monitoramento)
```

---

# 1️⃣ CRIAR PROJETO NO SUPABASE

1. Acesse: **https://supabase.com/dashboard** e faça login com GitHub
2. Clique em **+ New Project**
3. Preencha:
   - **Name:** `ReformaPlus ROI`
   - **Database Password:** Clique em ✨ **Generate a password** e **GUARDE ESTA SENHA** (você precisa dela para conectar via SQL Editor / DBeaver etc.)
   - **Region:** Escolha a mais perto de você → **Southeast Asia (Singapore)** ou **US East (N. Virginia)** ou **EU West (Ireland)** (qualquer um funciona)
   - **Pricing:** Free tier (até 500MB DB + 1GB Storage) é suficiente para começar
4. Clique em **Create new project** → aguarde ~2 minutos (ele está provisionando o Postgres, Auth, Storage e API Gateway)
5. Quando abrir o dashboard do projeto, copie **imediatamente** esses 4 valores e cole no seu `.env`:

```
VITE_SUPABASE_URL             → Project Settings → API → Project URL      (ex: https://a1b2c3d4.supabase.co)
VITE_SUPABASE_ANON_KEY        → Project Settings → API → Project API keys → anon public
SUPABASE_SERVICE_ROLE_KEY     → Project Settings → API → Project API keys → service_role (GUARDE BEM, NÃO COMPARTILHE!)
PROJECT_REF                   → 8 caracteres da URL /project/REF/...     (ex: a1b2c3d4)
```

---

# 2️⃣ RODAR AS 3 MIGRAÇÕES SQL (ESSENCIAL)

No menu esquerdo do Supabase → clique em **SQL Editor** → **+ New query**.

Para CADA um dos 3 arquivos abaixo, **abra o arquivo**, **copie TODO o conteúdo**, **cole no SQL Editor** e clique em **▶ Run (Ctrl+Enter)**:

| Ordem | Arquivo em `supabase/migrations/` | O que cria? |
|---|---|---|
| 1 | `20260813_001_init_schemas_rls.sql` | Extensões (pgcrypto, uuid-ossp), schema `private`, RLS padrão habilitado, função `now_utc()` utilitária |
| 2 | `20260813_002_domain_tables.sql` | TODAS as tabelas do domínio: `user_profiles`, `properties`, `project_stages`, `transactions`, `transaction_receipts`, `sync_operations`. Chaves estrangeiras, índices, triggers de `updated_at`, **e POLÍTICAS RLS** (usuário só vê/edita os SEUS dados) |
| 3 | `20260813_003_seed_admin.sql` | Seed de 5 `project_stages` padrão (Alvenaria/Hidráulica/Elétrica/Acabamento/Pintura) — você edita depois pela tela |

✅ **Resultado esperado:** as 3 queries rodam com **"Success. No rows returned"** (ou 5 linhas inseridas no seed). Se qualquer uma der erro, pare e me avise com o erro exato.

---

# 3️⃣ CONFIGURAR AUTENTICAÇÃO (Auth)

## 3.1 Métodos de login

Supabase → **Authentication → Providers**:

| Provider | Status | Observação |
|---|---|---|
| **Email** | ✅ **Ligue** | Modo padrão. **Desmarque "Confirm email"** por enquanto (velocidade no MVP). Depois religa quando enviar emails transacionais. |
| Magic Link | ✅ Ligado (padrão) | Login só por link no email, sem senha. Excelente UX. |
| Phone | ❌ Desligado | Custo extra com SMS, não precisa no MVP. |
| GitHub / Google / Apple | ❌ Desligado | Habilite depois, se quiser login social. |

## 3.2 Redirect URLs (IMPORTANTE — senão login quebra em produção)

Vá em **Authentication → URL Configuration → Redirect URLs** → clique em **+ Add URL** e adicione estas 3 URLs:

```
http://localhost:8080                     (dev local)
https://SEU-PROJETO.vercel.app            (substitua pela URL do passo 5)
https://SEU-DOMINIO.COM.BR                (se tiver domínio próprio)
```

No campo **Site URL** (o campo primeiro de todos, acima de Redirect URLs), coloque a sua URL principal de produção
(ex: `https://reforma-plus-roi.vercel.app`).

## 3.3 Rate Limit (opcional MVP)

Deixe os valores padrão — já são seguros (30 req/min para login).

---

# 4️⃣ CRIAR BUCKET DE STORAGE PARA RECIBOS

1. Menu → **Storage**
2. Clique em **Get Started** se for a primeira vez (cria o storage publico)
3. Clique em **New bucket**
4. Preencha:
   - **Name:** `receipts` (MINÚSCULAS, exatamente isso. O app usa esse nome.)
   - **Public bucket:** ❌ **DESMARCADO** (os recibos são privados por usuário)
   - **File size limit:** `2621440` (2,5MB por foto de recibo)
   - **Allowed MIME Types:** ✅ marque a opção e cole abaixo:
     ```
     image/png,image/jpeg,image/jpg,image/webp,application/pdf
     ```
5. Clique em **Create bucket**

### 4.1 Política RLS do bucket (SEM ISSO NADA FUNCIONA)

Dentro do bucket `receipts` → aba **Policies (3)** → **+ New policy → Get started via Assistant** e crie **4 políticas de nome exato**:

| Nome | Ação | Condição USING | O que permite? |
|---|---|---|---|
| `Users see their own receipts` | SELECT | `auth.uid() = (storage.foldername(name))[1]::uuid` | Cada usuário SÓ vê os arquivos em sua pasta `user_id/arquivo.ext` |
| `Users upload their own receipts` | INSERT | `auth.uid() = (storage.foldername(name))[1]::uuid` | Só upload para a sua própria pasta |
| `Users update their own receipts` | UPDATE | `auth.uid() = (storage.foldername(name))[1]::uuid` | Substituir arquivo |
| `Users delete their own receipts` | DELETE | `auth.uid() = (storage.foldername(name))[1]::uuid` | Apagar recibo |

### 4.2 CORS (para dev local)

Storage → **Settings → CORS Origins → Add origin**:

```
Origin: http://localhost:8080
Methods: marque TODOS (GET HEAD POST PUT DELETE PATCH OPTIONS)
Max Age (seconds): 3600
```

Adicione também a URL do Vercel quando tiver (passo 5).

---

# 5️⃣ CRIAR REPOSITÓRIO NO GITHUB

1. Acesse https://github.com/new (logado com a sua conta)
2. Preencha:
   - **Repository name:** `Reforma-Plus-ROI`
   - **Description:** `PWA Local-First + Supabase para gestão de reformas e flip imobiliário`
   - **Public** ou **Private** (Particular é recomendado, você decide)
   - ❌ **NÃO marque** nada de README, .gitignore ou License NESTA TELA (nós já temos tudo pronto localmente)
3. Clique em **Create repository**
4. Na tela que aparece ("**…or push an existing repository from the command line**"), copie o bloco **segundo** (`git remote add origin ...`) e execute no PowerShell na pasta do projeto `c:\Projetos\Reforma_Plus_ROI`:

```powershell
cd c:\Projetos\Reforma_Plus_ROI
git init
git add -A
git commit -m "feat: commit inicial - frontend v1.9 + arquitetura backend Supabase + Vercel v2"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/Reforma-Plus-ROI.git        # <-- COLE AQUI A DO SEU GITHUB
git push -u origin main
```

✅ **Sucesso:** o dashboard do GitHub atualiza e mostra todos os seus arquivos.

---

# 6️⃣ CONECTAR VERCEL + DEPLOY INICIAL (5 min)

1. Acesse https://vercel.com/new (login com GitHub, autorize acesso ao seu repositório `Reforma-Plus-ROI`)
2. Na tela **Import Project**, selecione **Reforma-Plus-ROI**
3. Na tela **Configure Project**:
   - **Project Name:** `reforma-plus-roi` (o Vercel já sugere, tá bom)
   - **Framework Preset:** ⚠️ ESCOLHA **`Other`** (não escolha nem Vite nem Next — nosso é HTML estático vanilla)
   - **Root Directory:** deixe `./`  (padrão)
   - **Build Command:** ✏️ **APAGUE TUDO, deixe VAZIO** (o botão ao lado "Override" marca)
   - **Install Command:** deixe como está (não precisa instalar nada)
   - **Output Directory:** deixe VAZIO (ou preencha `.`)
4. Agora, SEM CLIQUE em Deploy — **primeiro clique em "Environment Variables"** e adicione as 3 variáveis abaixo (clicando em **Add** a cada uma). Os valores você copiou no passo **1** (Supabase Project Settings → API):

| NAME (exatamente assim) | VALUE | Environment |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://a1b2c3d4.supabase.co` | ✅ Production, ✅ Preview, ✅ Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...(chave anon PUBLICA)...` | ✅ Production, ✅ Preview, ✅ Development |
| `VITE_SUPABASE_BUCKET_RECEIPTS` | `receipts` | ✅ Production, ✅ Preview, ✅ Development |

5. Agora sim, clique em **🚀 Deploy**

✅ Aguarde 1 a 3 minutos. Vai aparecer **"Congratulations!"** com uma miniatura do site e um botão **Continue to Dashboard**.

Sua URL de produção: `https://reforma-plus-roi-SEU-USER.vercel.app` — Copie ela e volte no passo **3.2** para adicionar como Redirect URL no Supabase Auth, senão o login não volta para o app!

---

# 7️⃣ PRIMEIRO USO — CRIAR CONTA DE ADMIN

1. Acesse a URL do Vercel (ou `http://localhost:8080` se estiver testando local)
2. Clique em **🔑 Entrar** → tela de Login Supabase
3. Use **Sign up → Email + Senha** (Magic Link também funciona)
4. Assim que logar:
   - O Supabase cria automaticamente um usuário em `auth.users`
   - Trigger na migration 002 cria automaticamente a linha em `public.user_profiles` vinculada com `role='admin'`
5. Volte no app → **⚙️ Imóvel & Dados** → preencha seu imóvel e clique em **💾 Salvar Dados do Imóvel**
6. O `SupabaseSync.js` detecta o usuário logado e envia os dados para a nuvem (tudo aparece no Supabase → Table Editor → public.properties)

---

# 8️⃣ VALIDAÇÃO MÍNIMA ANTES DE USAR COM CLIENTES

Checklist obrigatório (vá marcando):

- [ ] Login por Email funciona? (tente logout → login)
- [ ] Cadastrar imóvel e salvar → aparece em Table Editor → properties?
- [ ] Adicionar lançamento em **📝 Lançamentos** → linha aparece em `transactions`?
- [ ] Anexar recibo em um lançamento → arquivo aparece em Storage → `receipts/SEU_USER_ID/...`?
- [ ] Trocar senha do PIN legado em Configurações → funciona sem internet?
- [ ] Deslogar → aparece **"🔒 Visitante"** e botões de edição estão bloqueados?
- [ ] Abra **📊 Dashboard** → todos os gráficos aparecem?
- [ ] **📄 Relatório Completo** → botão **Exportar CSV** e **PDF / Imprimir** funcionam?
- [ ] F12 → Console → NENHUM erro em vermelho? (só 1 warning de SW é aceitável)
- [ ] Vercel Preview Deploy: em algum PR, se você criar um branch novo e commitar, Vercel dá um deploy automático? (sim, por padrão ele faz isso, tudo configurado)

---

## 🚩 ETAPAS FUTURAS (opcionais, quando crescer)

- **Edge Functions (relatórios avançados em PDF)** → `supabase functions new generate-pdf-report`
- **Envio de emails transacionais** (Boas-vindas, Reset senha) → Supabase Auth já faz, ou conecta Resend/Postmark
- **Multi-empresa / multi-imóvel por usuário** → nossa tabela `properties` já suporta (FK para user_id, RLS garante isolamento), basta atualizar UI para selector no header
- **Domínio custom + SSL no Vercel** (Settings → Domains → adicionar seu `app.reformaplus.com.br`)
- **Analytics**: Vercel Analytics OU PostHog auto-hospedado
- **Backups automáticos do Postgres**: Supabase já faz a cada 24h no plano Free (7 dias de retenção), no Pro é PITR (point-in-time recovery de até 30 dias)

Pronto. **Sua infra backend + deploy prod está 100% documentada.** Agora é só seguir os itens 1→8 na ordem. Qualquer erro no meio, me cola a mensagem do erro que a gente resolve rapidinho.
