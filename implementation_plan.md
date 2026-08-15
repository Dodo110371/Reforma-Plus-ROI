# Plano de Implementação - Sistema de Autenticação e Controle de Acesso

Adicionar autenticação e controle de privilégios no **ReformaPlus ROI** para garantir que apenas pessoas autorizadas (administradores com senha) possam cadastrar, editar ou excluir dados financeiros e alterar as configurações do imóvel, enquanto mantemos a visualização livre para consultas e relatórios.

---

## 🔒 Arquitetura do Sistema de Acesso

### 1. Níveis de Permissão
- **Modo Administrador (Autenticado)**:
  - Liberdade total para inserir novos lançamentos, anexar recibos, editar, excluir despesas, atualizar o status das etapas da obra e alterar os dados do imóvel.
  - Acesso ao botão de logout e alteração de senha de acesso.
- **Modo Visitante / Leitor (Não Autenticado)**:
  - Permite visualizar o **Dashboard ROI**, gráficos e relatórios sintéticos/analíticos sem restrição.
  - Bloqueia botões de alteração (*Adicionar, Editar, Excluir, Salvar Imóvel*). Ao tentar acionar qualquer ação restrita, o aplicativo abre suavemente o modal de autenticação solicitando a senha.

### 2. Autenticação Local-First (Segura e Offline)
- A senha/PIN do administrador é armazenada de forma criptografada/hash localmente (`localStorage`).
- **Senha Padrão Inicial**: `1234` (será recomendado alterar no primeiro acesso).
- Estado da sessão ativa mantido no navegador (`sessionStorage`), permitindo que a sessão permaneça logada durante o uso na obra.

---

## 🛠️ Alterações nos Componentes

### 1. Interface (HTML & CSS)
- **Cabeçalho & Gaveta Lateral**:
  - Adição do indicador de status da sessão (`🔒 Visitante` vs `🔓 Administrador`).
  - Botão de `🔑 Entrar / Sair` no topo e no menu sanduíche.
- **Modal de Autenticação (`#modalAuthBackdrop`)**:
  - Caixa de diálogo com campo de senha, botão de confirmação e mensagem de erro em caso de senha incorreta.
- **Painel de Troca de Senha**:
  - Aba de configurações com formulário para o Administrador alterar sua senha a qualquer momento.

### 2. Módulo de Segurança & Armazenamento (`storage.js` & `app.js`)
- **`AuthManager` (Novo Módulo)**:
  - Gerencia autenticação (`login(password)`, `logout()`, `isAuthenticated()`, `changePassword(oldPass, newPass)`).
- **Proteção de Formulários & Tabelas**:
  - Oculta ou desabilita botões de ação destrutiva/edição para visitantes.
  - Intercepta submissões de formulário se a sessão não estiver autenticada.

---

## 🧪 Plano de Verificação

1. **Teste de Login e Logout**:
   - Tentar acessar com a senha padrão `1234` e verificar a ativação do modo Administrador.
   - Efetuar logout e confirmar o retorno ao modo Visitante.
2. **Teste de Proteção de Ações Restritas**:
   - Estando deslogado, clicar em "Adicionar Lançamento" e verificar o disparo do modal de senha.
3. **Teste de Troca de Senha**:
   - Alterar a senha no painel e validar se a nova senha é exigida no próximo login.
4. **Teste de Persistência Offline**:
   - Garantir que o login funcione offline no Service Worker PWA.
