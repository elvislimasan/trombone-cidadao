# Plano: Header Nativo com Ações + Ajuste do Step de Mapa

## Resumo
1) Adaptar páginas de **Detalhes da Bronca**, **Detalhes de Obra**, **Detalhes de Notícia** e **Configurações de Notificações** para o app nativo (Capacitor) usando o **MobileHeader** como topo único, colocando **Voltar/Compartilhar/Favoritar** no header quando aplicável, e removendo/ocultando os “top navs” internos que hoje simulam a versão web.
2) Ajustar o wizard do “Nova Bronca” para que, no step **Local**, o mapa fique um pouco menor e o input de endereço apareça mais facilmente.

## Estado Atual (Análise)

### MobileHeader
Arquivo: [MobileHeader.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/MobileHeader.jsx)
- Já fornece botão de voltar e alguns elementos (notificações, busca, compartilhar em rotas específicas).
- Não possui um mecanismo “página → ações no header” (ex.: favoritar/compartilhar/editar) com lógica específica por página.

### Detalhes da Bronca
Arquivo: [ReportPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/ReportPage.jsx)
- Possui “TOP NAV” próprio sticky com **Voltar + Favoritar + Compartilhar**.
- No app nativo isso vira redundância/“cara de web dentro do app”.

### Detalhes da Obra
Arquivo: [WorkDetailsPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/WorkDetailsPage.jsx)
- Possui header sticky próprio com **Voltar + Compartilhar + Favoritar** (e botão admin “Gerenciar”).

### Configurações de Notificação
Arquivo: [NotificationPreferences.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NotificationPreferences.jsx)
- Possui header interno com **ArrowLeft + Título**.

### Detalhes de Notícia
Arquivo: [NewsDetailsPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NewsDetailsPage.jsx)
- Possui link de “Voltar para todas as notícias” dentro do header da página.
- Possui ações de salvar/compartilhar no corpo (não no topo).

### Nova Bronca (Wizard)
Arquivo: [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)
- Step **Local** usa mapa alto (classe `h-[60vh]`) e input aparece abaixo; no nativo o usuário pediu diminuir um pouco o mapa para o input ficar mais visível.

## Proposta (Mudanças Planejadas)

### 1) Criar um “canal” de ações do header (contexto) para o nativo
**Objetivo:** permitir que cada página registre título e ações (botões) no MobileHeader enquanto estiver ativa.

**Arquivo novo (necessário):**
- `src/contexts/MobileHeaderContext.jsx`

**Conteúdo:**
- `MobileHeaderProvider` com state:
  - `title` (string)
  - `actions` (array de ações: `{ key, icon: ReactComponent, onPress, isActive?, ariaLabel? }`)
  - `showBack` (boolean) e `onBack` opcional
- `useMobileHeader()` hook para páginas chamarem:
  - `setTitle(...)`
  - `setActions([...])`
  - `setShowBack(true/false)`
  - `setOnBack(fn|undefined)`
- Reset automático em troca de rota (ou cleanup no `useEffect` das páginas) para evitar ações “vazarem” de uma página para outra.

### 2) Integrar Provider no App
**Arquivo:**
- [App.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/App.jsx)

**Como:**
- Envolver a árvore do app com `MobileHeaderProvider` (sem alterar web).

### 3) Atualizar MobileHeader para renderizar ações registradas
**Arquivo:**
- [MobileHeader.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/MobileHeader.jsx)

**Como:**
- Consumir `useMobileHeader()` e:
  - Se `title` estiver definido no contexto, usar como título do header (com `truncate`).
  - Renderizar `actions` como ícones à direita, com estilo consistente com o header atual.
  - Respeitar `showBack` e `onBack` quando configurados pela página.
- Manter fallback atual (mapeamento por pathname) quando nenhuma página registrar configurações.

### 4) Adaptar páginas para nativo: esconder “header web” e registrar ações no MobileHeader

#### 4.1) Detalhes da Bronca
**Arquivo:** [ReportPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/ReportPage.jsx)
- No nativo:
  - Ocultar o “TOP NAV” sticky (o bloco que tem Voltar + botões).
  - Registrar no header:
    - `title`: `report.title` (ou “Detalhes da Bronca” enquanto carrega)
    - Ações:
      - Favoritar (ícone Star; estado ativo conforme `report.is_favorited`)
      - Compartilhar (reutiliza `handleShare`)
    - `onBack`: `navigate(-1)` com fallback para `/` se não houver histórico.

#### 4.2) Detalhes da Obra
**Arquivo:** [WorkDetailsPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/WorkDetailsPage.jsx)
- No nativo:
  - Ocultar o header sticky próprio.
  - Registrar no header:
    - `title`: `work.title` (ou “Detalhes da Obra” enquanto carrega)
    - Ações:
      - Favoritar (ícone Heart; estado ativo `isFavorited`)
      - Compartilhar (reutiliza `handleShareWork`)
      - Se admin: “Gerenciar” como ação (ícone Edit), abrindo `setShowAdminEditModal(true)`.
    - `onBack`: voltar para `/obras-publicas` (para evitar voltar para um histórico inconsistente quando veio do menu).

#### 4.3) Configurações de Notificação
**Arquivo:** [NotificationPreferences.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NotificationPreferences.jsx)
- No nativo:
  - Remover/ocultar o header interno com ArrowLeft.
  - Registrar no header:
    - `title`: “Notificações”
    - Sem ações.
    - `onBack`: `navigate(-1)` com fallback para `/perfil`.

#### 4.4) Detalhes de Notícia
**Arquivo:** [NewsDetailsPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NewsDetailsPage.jsx)
- No nativo:
  - Ocultar link “Voltar para todas as notícias”.
  - Registrar no header:
    - `title`: `newsItem.title` (truncate)
    - Ações:
      - Salvar/Remover (ícone Star; estado `isSaved`; reusa `toggleSaved`)
      - Compartilhar (ícone Share2; reusa lógica de compartilhar já existente ou adiciona uma função de share usando `navigator.share` quando disponível)
    - `onBack`: voltar para `/noticias`.

### 5) Ajuste do mapa no step “Local” do wizard (Nova Bronca)
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- No step `wizardStep === 1`:
  - Reduzir a altura do mapa de `h-[60vh]` para algo como `h-[48vh]`.
  - Manter o input de endereço logo abaixo, para ficar visível sem precisar rolar tanto.

## Critérios de Aceite / Verificação
1) No app nativo:
- ReportPage: não exibe “top nav” interno; o MobileHeader mostra título + favoritar + compartilhar e funcionam.
- WorkDetailsPage: não exibe header interno; o MobileHeader mostra título + favoritar + compartilhar; admin vê “Gerenciar”.
- NewsDetailsPage: não exibe link de voltar; o MobileHeader mostra salvar + compartilhar.
- NotificationPreferences: não exibe header interno; MobileHeader mostra título e voltar.
2) Wizard Nova Bronca:
- No step de mapa, o input de endereço fica visível com menos scroll.
3) Web:
- Páginas continuam com os headers internos atuais (sem regressões).
4) Build:
- `npm run build` passa.

## Decisões
- O “menu principal” continua apenas no nativo (já definido anteriormente); este plano foca somente no topo (MobileHeader) e nos detalhes/config.
- Para evitar dependência de “detectar pathname e fazer lógica específica no MobileHeader”, a fonte de verdade para ações será o contexto (páginas registram ações).

