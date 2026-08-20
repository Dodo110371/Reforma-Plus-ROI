# 🚀 GUIA DE PRODUÇÃO COMPLETO - ReformaPlus ROI v2.0

> **Versão atual:** 2.0.0 (Arquitetura Multi-Imóveis + PWA Local-First)  
> **Stack Produção:** GitHub · Supabase (Postgres 15/Auth/Storage) · Vercel (Edge CDN + SSL Automático) · PWA instalável  
> **Tempo total estimado:** 30–45 minutos (se já tem repo/deploy)

---

## 📋 SUMÁRIO DAS ETAPAS (ORDEM OBRIGATÓRIA)

| Nº | Etapa | Prazo | Onde faz? |
|---|---|---|---|
| 0 | ✅ **Pré-requisitos já prontos? (Checklist)** | 5 min | - |
| 1 | 🗄️ **Rodar Migração v2.0 Multi-Imóveis no Supabase** (SQL Editor) | 3 min | Supabase Dashboard → SQL Editor |
| 2 | 🧪 **Validar Build LOCAL antes de subir** (gera env.js + testa) | 2 min | PowerShell local |
| 3 | ⚙️ **Verificar/Configurar Vercel Project + Envs** | 3 min | Vercel Dashboard |
| 4 | 🚀 **Commit + Push → Deploy Automático Vercel** | 1 min | PowerShell + Vercel CI/CD |
| 5 | 🧐 **Checklist PÓS-DEPLOY (valida TUDO)** | 10 min | Navegador no domínio novo |
| 6 | 🔐 **Domínio Custom + SSL Automático + Supabase Auth Redirect** | 5 min | Vercel → Domains + Supabase Auth |
| 7 | 📱 **Validar Instalação PWA (Instalar App no Celular/Desktop)** | 3 min | Chrome/Safari |
| 8 | 📈 **Ativar Monitoramento + Logs (grátis)** | 2 min | Vercel Analytics + Supabase Logs |
| 9 | 💾 **Backup Inicial do DB (export CSV/backup)** | 1 min | Supabase → Scheduled backups |
| 10 | 🎉 **Entregue!** 🟢 | - | - |

---

---

# 🅿️ PASSO 0 — PRÉ-REQUISITOS (TUDO DEVE ESTAR OK ANTES)

Marque no checklist:

- [ ] Repositório **GitHub já existe** e está com o código commitado no branch `main` (URL do seu repo privado)
- [ ] Projeto **Supabase já criado** (você tem `Project URL` e `anon key`)
- [ ] Migrações `001`, `002`, `003` da pasta `supabase/migrations` já foram rodadas? **Se NÃO, leia primeiro o [BACKEND_SETUP.md antigo](file:///c:/Projetos/Reforma_Plus_ROI/BACKEND_SETUP.md#L44-L56)** e rode as 3 — passo 1 abaixo é um patch ALÉM delas
- [ ] Projeto **Vercel já criado** e linkado ao GitHub (URL `vercel.app` já existe)
- [ ] A sua máquina local tem Node 18+ (`node -v` mostra >= 18)

Se algo acima estiver faltando → **pare imediatamente e complete o setup antes de continuar**.

---

# 1️⃣ PASSO 1 — SUPABASE: RODAR MIGRAÇÃO v2.0 PROPERTY_ID (SQL Editor) 🔥 OBRIGATÓRIO 🔥

## ⚠️ POR QUE ISSO É NECESSÁRIO?

No frontend v2.0 nós implantamos a **arquitetura Multi-Imóveis**, onde TODAS as entidades filhas (lançamentos, etapas, recibos, etc.) recebem uma coluna `property_id uuid` FK para `properties(id)`.

**Sem rodar esse SQL abaixo, a sincronia Supabase NÃO FUNCIONA** — toda tentativa de `INSERT` em `transactions/project_stages/transaction_receipts` vai falhar com erro `column "property_id" of relation "xxx" does not exist`.

## 🔧 Como aplicar (3 cliques)

1. Abra **https://supabase.com/dashboard/project/_SEU_PROJECT_REF_/sql/new** (SQL Editor → New Query)
2. Copie todo o conteúdo BLOCO ABAIXO e cole
3. Clique **▶ RUN (Ctrl+Enter)**
4. Deve aparecer **Success. No rows returned.** ✅

```sql
-- ============================================================
-- PATCH MIGRATION v2.0 — Multi-Imóveis property_id FK
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

-- 4. RLS Policies: Se a migration 002 original NÃO criou policies para essas tabelas
--    (algumas versões antigas não criavam), CRIA agora garantindo auth.uid() = user_id.
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
--    (antes da v2.0, só existia 1 imóvel por usuário — o primeiro do user)
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

-- 6. (Opcional recomendado) Garante RLS ligado em TUDO (caso alguém tivesse desligado)
ALTER TABLE public.transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;

-- ⏱️ Performance: Vacuum Analyze após alterações estruturais
ANALYZE public.properties;
ANALYZE public.transactions;
ANALYZE public.project_stages;
ANALYZE public.transaction_receipts;
```

### ✅ VALIDAÇÃO RÁPIDA DO PASSO 1 (não precisa de código, só olhar):

Abra Supabase → **Table Editor**:

- [ ] Clique em **project_stages** → apareceu coluna nova `property_id (uuid, nullable)`?
- [ ] Clique em **transactions** → apareceu coluna nova `property_id`?
- [ ] Clique em **transaction_receipts** → apareceu coluna nova `property_id`?

Se as 3 respostas forem SIM → **passo 1 concluído**. 🎉

---

# 2️⃣ PASSO 2 — VALIDAR BUILD LOCAL (antes de fazer commit/deploy)

Aqui garantimos que o `build.js` gera corretamente o `env.js` **sem erros**.

Abra PowerShell na pasta do projeto e execute:

```powershell
cd c:\Projetos\Reforma_Plus_ROI

# 1. Cria um .env local com suas chaves (copie do template)
Copy-Item .env.example .env -ErrorAction SilentlyContinue

# 2. Edite o arquivo .env com VS Code (ou bloco de notas) e cole suas 3 variáveis:
code .env

# Conteúdo do .env (exemplo — COLOQUE OS VALORES DO SEU SUPABASE):
# VITE_SUPABASE_URL=https://abcdefgh.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGciOi...<sua_chave_anon_PUBLICA>...
# VITE_SUPABASE_BUCKET_RECEIPTS=receipts

# 3. Rode o build — ele gera env.js a partir das env vars
npm run build

# 🟢 Deve imprimir: "env.js gerado com sucesso."
# Verifica se o arquivo foi criado:
Get-Item env.js   # <-- Deve existir, com ~150 bytes
```

**O que `build.js` faz?** (arquivo [build.js](file:///c:/Projetos/Reforma_Plus_ROI/build.js)):
- Lê `process.env.VITE_SUPABASE_URL / ANON_KEY / BUCKET_RECEIPTS / LOCAL_ONLY`
- Escreve em disco um arquivo `env.js` com:
  ```js
  window.__APP_ENV__ = { "VITE_SUPABASE_URL":"...", "VITE_SUPABASE_ANON_KEY":"...", ... };
  ```
- Esse `env.js` é carregado no `<head>` do `index.html` ANTES de qualquer outro JS → Supabase Client já tem as envs certas.

**Validação local extra (opcional mas recomendada):**

```powershell
npm run serve     # sobe servidor em http://localhost:8080 (sem cache SW)
# Abra o navegador, login e navegue pelas abas. Console F12 DEVE ter 0 erros vermelhos.
```

---

# 3️⃣ PASSO 3 — CONFIGURAR VERCEL PROJECT (Build Command + Envs)

Se você já fez isso no deploy inicial, confira se está exatamente igual, porque é **muito fácil esquecer um detalhe** e o env.js não ser gerado.

1. Acesse **https://vercel.com/_SEU_/_PROJETO_/settings** (Settings do projeto Vercel)

## 3.1 → Aba General → Build & Development Settings (CONFIRA!)

| Campo | VALOR EXATO | Observação |
|---|---|---|
| **Framework Preset** | ⚠️ **`Other`** | NÃO escolha Vite/Next (nós usamos vanilla HTML estático) |
| **Build Command** | ✏️ Clique **Override** e digite: `npm run build` | **DEVE SER EXATAMENTE ISSO** — se deixar vazio, o `env.js` não é criado no deploy e Supabase tenta acessar URL `undefined` (tela branca!) |
| **Install Command** | `npm install` (padrão, override opcional) | Instala o package.json (só tem `supabase` CLI, o resto é vanilla) |
| **Output Directory** | `.` (ponto) | Correto — deploy tudo que está na raiz |
| **Root Directory** | `./` (padrão) | - |

## 3.2 → Aba Environment Variables (CONFIRA!)

**Cada variável TEM QUE EXISTIR e estar marcada para Production, Preview e Development:**

| NAME (case-sensitive) | Exemplo de valor | Onde peguei o valor? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://a1b2c3d4.supabase.co` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...<chave ANON PUBLICA longa>...` | Supabase → Project Settings → API → anon public |
| `VITE_SUPABASE_BUCKET_RECEIPTS` | `receipts` | Nome literal do bucket (passo 4 do setup antigo) |
| `VITE_LOCAL_ONLY` | `false` | **Obrigatória** (se `true`, o app desliga a sincronia e usa só localStorage) |

⚠️ **Atenção:** Se faltar **qualquer uma** das 4, Supabase Sync não liga ou API retorna 401/404 em todas calls.

---

# 4️⃣ PASSO 4 — COMMIT + PUSH → DEPLOY AUTOMÁTICO VERCEL

Você provavelmente já tem commits locais. Resumo do que deve fazer SEMPRE para subir nova versão:

```powershell
cd c:\Projetos\Reforma_Plus_ROI

# 1. Verifica status (o que foi alterado)
git status

# 2. Stage das alterações
git add -A

# 3. Commit (mensagem em pt-BR como temos feito)
git commit -m "deploy: v2.0 producao final - multi-imoveis + barra de atalhos + bug botoes corrigido"

# 4. Push para origin/main
git push origin main
```

### 🖥️ Acompanhar Deploy em tempo real:

Vai em **Vercel Dashboard → seu projeto → aba Deployments**.  
Aparece um deploy novo colorido 🟡 (building) → quando ficar 🟢 **Ready** está no ar.

Tempo médio do build: **35–60 segundos** (é vanilla estático, rápido demais).

---

# 5️⃣ PASSO 5 — CHECKLIST PÓS-DEPLOY OBRIGATÓRIO (TODOS OS ITENS)

Abra o app **no domínio do Vercel (não no localhost)**. Rode cada item:

## 5.1 🏗️ Estrutura + Cabeçalho

- [ ] Página carrega sem tela branca? Se der tela branca → F12 Console (99% das vezes = env.js não foi gerado, Build Command no Vercel está vazio. Corrige e re-deploy).
- [ ] **Tema Claro carrega por padrão** (`body data-theme="light"`) e botão 🌙 no canto alterna para escuro e SALVA (atualiza a página e lembra do tema)?
- [ ] **Botões do topo** (Dashboard / Imóveis / Lançamentos / Etapas / Relatórios / Configurações / Entrar / Tema / Instalar App) → todos funcionam ao clicar? (se não, era o bug de ontem que já corrigimos no commit 8555588)
- [ ] **Seletor de Imóveis no header** (dropdown 🔽) está preenchido e troca o dashboard ao selecionar outro imóvel?
- [ ] **Barra inferior de atalhos** (mobile / tablet <1200px) aparece e os 7 botões (🏠 Início, 📊 Dashboard, 🏘️ Imóveis, 📝 Lançamentos, 🏗️ Etapas, 📋 Relatórios, ⚙️ Ajustes) todos trocam de aba?
- [ ] Botão 🏠 **Início** da barra inferior não deixa tela em branco → abre Hero Início + rola pro topo? (bug corrigido commit c9f21ec)

## 5.2 🔐 Autenticação

- [ ] Clica em **🔑 Entrar** → abre modal login Supabase?
- [ ] Loga com email + senha → volta pro app e header mostra **✅ (seu email)**?
- [ ] Logout → desloga, volta a Visitante, botões de escrita bloqueiam corretamente?
- [ ] (Importante p/ segurança) Ao deslogar, TENTA via Supabase JS Console dar um `.from('properties').select('*')` → **Deve retornar array vazio**. Se retornar dados, RLS policy está faltando → refaça o SQL do passo 1 (o bloco 4 cria as policies).

## 5.3 💾 Dados + Multi-Imóveis

- [ ] Na aba **⚙️ Ajustes**, preencha o formulário com um imóvel fake → clique em **💾 Salvar Dados do Imóvel** → toast verde aparece?
- [ ] Clica em **➕ Novo Imóvel** (header ou aba Imóveis) → cria card novo imóvel?
- [ ] Aba **🏘️ Imóveis** mostra os cards com métricas (Aquisição / ARV / Qtd Lançamentos / ROI)?
- [ ] Clica em **🎯 Usar Este** em um card diferente → Dashboard recalcula p/ esse imóvel?
- [ ] Clica em **🗑️ Excluir** — o app BLOQUEIA se for o último imóvel? Mostra confirmação dupla?
- [ ] Volta ao Supabase → Table Editor → `properties`: as 2 linhas apareceram lá com `user_id` certo?
- [ ] Table Editor → `project_stages` → para cada imóvel, existem 8 linhas (stages padrão) com `property_id` preenchido FK correto?

## 5.4 📝 Lançamentos + Recibos

- [ ] **📝 Lançamentos → Novo Lançamento**: preencha valor (teste a máscara moeda pt-BR 12.345,67) + data + categoria + anexe **uma foto (JPG <2,5MB)** como recibo → clique em **Salvar** → aparece na tabela?
- [ ] Volta Supabase → Storage → bucket `receipts` → aparece pasta `/SEU_USER_ID/nome-do-arquivo.jpg`? ✅
- [ ] Clica em **CSV** (exportar) → baixou o arquivo? Abra no Excel, os dados estão lá?
- [ ] Clica em **PDF / Imprimir** → abre print preview sem barra de atalhos (ela tem `.no-print`)?

## 5.5 📊 Dashboard ROI + Fórmulas

- [ ] 📊 Dashboard mostra os 4 cards superiores: Aquisição, Reforma Total, Total Investido, ARV?
- [ ] Cards: Custo Reforma, ROI Bruto, % Ganho, Prazo — todos com valores monetários formatados `R$ 1.234,56` (moeda pt-BR)?
- [ ] Cartão de ROI: investimento vs receita estimada, barra preenchimento?
- [ ] Gráfico pizza 🥧 (Distribuição de gastos por categoria)?
- [ ] Gráfico de barras 📊 (Gastos por etapa)?

## 5.6 🛜 Offline (Teste Modo Avião — Local-First)

- [ ] **DevTools → Network → Offline ✅** (liga modo offline)
- [ ] Atualiza a página → PWA CARREGA (service worker entrega os arquivos do cache)?
- [ ] Adiciona um novo lançamento no modo offline → toast "armazenado na fila offline"?
- [ ] Desliga o modo Offline (Network → Online) → espere 5s → o dado foi enviado p/ Supabase automaticamente e deu toast verde sincronizado?

Se passou tudo acima → app está 100% funcional em produção. 🎯

---

# 6️⃣ PASSO 6 — DOMÍNIO CUSTOM + SSL (app.seusite.com.br) ✨ Recomendado ✨

O URL do Vercel (reform-plus-roi.vercel.app) funciona 100%, mas para profissionalizar e enviar para clientes, use domínio próprio.

## 6.1 Vercel → Settings → Domains

1. Clique em **➕ Add**
2. Digite o domínio desejado, ex: `app.reformaplus.com.br`
3. Clique **Add**. Vercel gera 2 nameservers OU um registro A / CNAME:

Se já tem domínio na **GoDaddy / Registro.br / Cloudflare**:
- Se usou **Root Domain** (`reformaplus.com.br` sem www): crie Registro A apontando para `76.76.21.21` (IP anycast Vercel)
- Se usou **Subdomínio** (recomendado): `app.reformaplus.com.br` → Registro CNAME → `cname.vercel-dns.com`

4. Aguarde DNS propagar (geral 2–10 min, pode demorar até 24h em raros casos)
5. Quando ficar **✅ Valid Configuration** — Vercel já configura **SSL Automaticamente (Let's Encrypt)** e força HTTPS (✅ HSTS ligado por padrão no Vercel).

## 6.2 NÃO ESQUEÇA — Supabase Auth Redirect URLs

Sem essa etapa, **login quebra no domínio novo**:

Vá em Supabase → Authentication → URL Configuration → Redirect URLs → ➕ Add URL e adicione:
```
https://app.reformaplus.com.br              (seu domínio novo com HTTPS)
```

No campo **Site URL** (primeiro acima de Redirect URLs) — substitua pelo seu domínio novo.

## 6.3 Supabase Storage CORS Origins

Storage → Settings → CORS → Add origin:
```
Origin: https://app.reformaplus.com.br
Methods: marque TODOS GET HEAD POST PUT DELETE PATCH OPTIONS
Max Age: 3600
```

Pronto. Upload de recibos vai funcionar 100% no domínio novo também.

---

# 7️⃣ PASSO 7 — PWA INSTALÁVEL (ícone na tela inicial 📱)

Nós já configuramos tudo no código. Verifica só:

| Arquivo | O que |
|---|---|
| [manifest.json](file:///c:/Projetos/Reforma_Plus_ROI/manifest.json) | PWA manifest (display standalone, tema esmeralda, ícones 192/512) |
| [sw.js](file:///c:/Projetos/Reforma_Plus_ROI/sw.js) | Service Worker — cache dos assets, funciona offline. |
| `index.html` | Link `<link rel="manifest" href="/manifest.json">` + Register SW em [app.js #60](file:///c:/Projetos/Reforma_Plus_ROI/assets/js/app.js#L60) `registerServiceWorker()` |
| [assets/icons](file:///c:/Projetos/Reforma_Plus_ROI/assets/icons) | PNGs existentes: icon-192.png, icon-512.png (ambos maskable-ready) |
| [vercel.json #L18-L30](file:///c:/Projetos/Reforma_Plus_ROI/vercel.json#L18-L30) | Headers especiais: sw.js `Cache-Control: no-cache` + `Service-Worker-Allowed: /` (obrigatório para atualizar SW em novas versões) + manifest `Content-Type: application/manifest+json` |

## Testar instalação:

**Desktop Chrome/Edge:**  
Clique no botão **📲 Instalar App** que já existe no header (ao lado do tema). Vai aparecer o banner do Chrome: "Instalar ReformaPlus ROI?" → Sim. Icone aparece na área de trabalho e no menu Iniciar. Abre em janela separada, sem barra de URL — parece app nativo.

**Celular Chrome Android:**  
Acesse o domínio → 3 pontinhos → **➕ Instalar app** → confirma. Ícone aparece na tela inicial.

**iPhone Safari:**  
Acesse → botão compartilhar ⬆️ → **Adicionar à Tela de Início** → confirma.

---

# 8️⃣ PASSO 8 — MONITORAMENTO + LOGS (O QUE USAR, TUDO GRÁTIS)

## 8.1 Vercel Runtime Logs (Erros de app em produção)

Vercel → seu projeto → aba **Logs**. Mostra console.log/error, requests com status, tempo, país.  
Caso algum usuário reporte "não consigo logar", **primeiro lugar para olhar é aqui**.

## 8.2 Vercel Analytics (visitantes, páginas, performance — 2500 eventos/mês grátis)

Settings → Analytics → **Enable** (grátis até 2,5k eventos por mês). Depois de 24h você tem:
- Total visitantes únicos / pageviews
- Performance Core Web Vitals (LCP, FID, CLS)
- Páginas mais acessadas (se o Dashboard é o mais usado ou Lançamentos)

## 8.3 Supabase Logs

- **Auth Logs**: tentativas de login, erros de senha, redirecionamentos (Auth → Logs)
- **API Logs**: requests GET/POST/PATCH/DELETE (todos nossos inserts de imóveis, lançamentos etc.)
- **Postgres Logs**: queries lentas, RLS violados, deadlocks
- **Storage Logs**: upload/download de recibos

Todos são "real-time search" no dashboard do Supabase. Use bastante quando for debugar sincronia.

## 8.4 (Opcional fácil) Web Vitals Console Dev

Nosso app já envia dados para Vercel Analytics. Nenhuma configuração extra — fica só ligado.

---

# 9️⃣ PASSO 9 — BACKUP AUTOMÁTICO + SEGURANÇA

## 9.1 Postgres (Backup diário grátis)

Supabase → Settings → Database → **Backups**

- **Free tier:** backups automáticos a cada **24h**, retenção **7 dias**.
- **Pro tier:** Point-in-time Recovery (PITR) até 30 dias.
- Export manual para CSV/Excel a qualquer momento: Table Editor → cada tabela → botão Export → CSV.

**Faça hoje mesmo um export manual inicial para segurança** (guarde em Google Drive/OneDrive).

## 9.2 Service Role Key — NÃO COMMITE NUNCA!

⚠️ **REGRAS DE SEGURANÇA ABSOLUTAS:**

| ✅ Pode fazer | ❌ NUNCA faça |
|---|---|
| Colocar `VITE_SUPABASE_ANON_KEY` em env do Vercel (ela é PÚBLICA, mesmo que alguém descubra, RLS bloqueia acesso a dados alheios) | **NÃO coloque `SUPABASE_SERVICE_ROLE_KEY` em lugar NENHUM do frontend.** Ela bypassa RLS e se vazar → QUALQUER UM pode apagar TODO banco de dados |
| `.env` no `.gitignore` (já está lá) | Commitar `.env` com senhas reais no GitHub público |
| Compartilhar apenas o anon key no suporte técnico | Passar login do Supabase dashboard para terceiros |

## 9.3 (1 minuto) Gire a senha do Postgres (padrão de segurança)

Supabase → Settings → Database → **Database password** → **Reset database password** (guarde no 1Password / LastPass).

---

# 🔟 PASSO 10 — ENTREGOU! 🟢🎉 PARABÉNS!

Seu app está 100% em produção:

| Feature | Status |
|---|---|
| PWA instalável, funciona 100% Offline (local-first) | ✅ |
| Multi-Imóveis CRUD (add/editar/excluir/trocar ativo) + seletor header | ✅ |
| Formatação moeda pt-BR (R$ X.XXX,XX) + Máscaras input | ✅ |
| Tema Claro padrão + persistência | ✅ |
| Bottom bar de atalhos mobile/tablet transparente | ✅ |
| Autenticação Email/Senha + Supabase RLS (usuário só vê SEUS dados) | ✅ |
| Upload recibos + Storage privado | ✅ |
| Dashboard ROI + gráficos + CSV + PDF | ✅ |
| Domínio custom + SSL automático | ✅ |
| Monitoramento logs/analytics gratuitos | ✅ |
| Backup diário automático Postgres | ✅ |

---

## 🆘 EM CASO DE PROBLEMAS EM PRODUÇÃO (FAÇA NA ORDEM)

### 1. Tela Branca no deploy novo
- Vercel → Deployments → Clica no deploy quebrado → **Build Logs** → verifique se apareceu `env.js gerado com sucesso.` → se NÃO apareceu → Build Command no Vercel Settings está errado. Corrija para `npm run build` e clique em **Redeploy**.

### 2. Login não redireciona de volta
- Volta passo 6.2 → esqueceu de adicionar o domínio no Redirect URLs do Supabase Auth.

### 3. Upload de recibo retorna 400 / CORS
- Passo 6.3 → adicionou domínio no Storage → CORS Origins?

### 4. Dados que eu salvo local não vão para a nuvem
- F12 → Console → procure erro `SupabaseSync`. Geralmente falta `property_id` na coluna da tabela → rode o SQL do passo 1 de novo.

### 5. Quero voltar para a versão anterior (rollback rápido)
Vercel → Deployments → clique no último deploy 🟢 de antes do problema → **⋯** → **Promote to Production**. Em 5 segundos voltou.

---

> **Última atualização:** 2026-08-20 · v2.0 Produção Final.  
> Autor: Time ReformaPlus ROI
