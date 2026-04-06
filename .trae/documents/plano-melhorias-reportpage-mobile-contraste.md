## Plano — Melhorias de Contraste (Mobile) na ReportPage

### Resumo
Melhorar o contraste e a hierarquia visual da [ReportPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/ReportPage.jsx) na versão mobile, com direção “brand forte” (vermelho Trombone guiando o olhar), mantendo legibilidade e consistência com o design system (tokens `bg-background`, `text-foreground`, `border-border`).

### Estado Atual (Análise)
- A página mistura muitas cores hardcoded (`bg-[#F4F6F9]`, `text-gray-400/500`, `bg-gray-50`) o que reduz contraste e cria sensação “lavada” no mobile.
- Várias seções usam o mesmo “tom” (cinza claro + borda cinza clara), reduzindo separação entre cards e dificultando leitura rápida (principalmente cabeçalhos de seção em `text-gray-400`).
- Categoria/Status no hero estão escondidos no mobile (`hidden sm:inline-flex`), ficando “sem cara” no topo e jogando contexto para a seção “Detalhes”.
- Existe um problema estrutural no começo do arquivo: a primeira linha está como `/planimport React...`, o que pode quebrar build/runtime (precisa ser removido).

### Objetivo e Critérios de Sucesso
- A página no mobile deve ter:
  - Separação clara entre seções (cards) e hierarquia (títulos > subtítulos > meta).
  - Cabeçalhos de seção com contraste alto (título legível) e “acento” visual consistente.
  - Categoria e Status visíveis já no topo (chips).
  - Sem regressão de layout em desktop.
- Critérios práticos:
  - Texto secundário não deve cair em `text-gray-400` como padrão; priorizar `text-muted-foreground` e `text-gray-600/700` quando necessário.
  - CTAs principais (Apoiar/Compartilhar) continuam óbvios e com bom contraste.

### Mudanças Propostas (por área)

#### 1) Correção de quebra no arquivo (obrigatório)
- **Arquivo**: [ReportPage.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/ReportPage.jsx)
- **Ação**: remover o prefixo `/plan` antes do `import React`.
- **Por quê**: evita falha de parse/build e elimina um “erro fantasma” que pode estar afetando o ambiente.

#### 2) Padronização de superfície e tokens (contraste consistente)
- **Arquivo**: ReportPage.jsx
- **Ações**
  - Substituir hardcodes principais por tokens:
    - `bg-[#F4F6F9]` → `bg-background` (ou `bg-muted` se precisar de fundo levemente cinza).
    - `border-gray-100/200` → `border-border`.
    - `text-gray-400/500` → `text-muted-foreground` (ou `text-gray-600` para meta importante).
  - Manter hardcodes apenas quando forem “brand accents” (vermelho Trombone) e estiverem alinhados ao tema.
- **Como**: fazer uma passada sistemática por blocos mobile (`lg:hidden`) priorizando:
  - headers de seção
  - textos de meta (data, contagens)
  - contêineres `bg-gray-50` aninhados

#### 3) “Header mobile” com chips de Categoria/Status (brand forte)
- **Arquivo**: ReportPage.jsx
- **Local**: bloco do título mobile (ex.: por volta do `lg:hidden` do título).
- **Ações**
  - Adicionar abaixo do título uma linha de chips usando [Badge](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ui/badge.jsx):
    - Categoria (ex.: `variant="outline"` + borda/ícone vermelho sutil)
    - Status (badge colorida a partir de `getStatusInfo(report.status).colorClasses`, mas garantindo contraste no texto)
  - Exibir protocolo no mobile de forma legível (monospace) com contraste (ex.: `text-foreground/80` + `bg-muted`).
- **Por quê**: dá contexto imediato e “cara” ao topo sem depender da seção Detalhes.

#### 4) Cabeçalhos de seção mais legíveis e consistentes
- **Arquivo**: ReportPage.jsx
- **Seções**: Descrição, Localização, Detalhes, Linha do Tempo, Comentários, Apoios (mobile).
- **Ações**
  - Substituir headers “cinza muito claro” (`text-gray-400`) por:
    - título `text-foreground`/`text-gray-900`
    - subtítulo/meta `text-muted-foreground`
  - Padronizar um “padrão de header”:
    - ícone em container `bg-primary/10` + `text-primary`
    - título `font-bold`
    - borda inferior `border-border`
- **Como**: criar pequenas funções de render (ou subcomponentes internos) para evitar repetição sem adicionar arquivos novos.

#### 5) Ajuste de cards e áreas “lavadas” (separação entre seções)
- **Arquivo**: ReportPage.jsx
- **Ações**
  - Evitar `bg-gray-50` em card inteiro quando o fundo da página já é claro; usar:
    - card `bg-white`/`bg-background` com borda `border-border` e sombra leve.
    - `bg-muted/40` apenas para “área interna” de conteúdo (ex.: descrição).
  - Comentários:
    - Trocar contêiner interno de cada comentário de `bg-gray-50 border-gray-100` para algo com contraste maior (ex.: `bg-white border-border`).
    - Timestamp: `text-gray-400` → `text-muted-foreground` (ou `text-gray-500`) para legibilidade.
  - “Detalhes” grid:
    - Hoje itens são `bg-white` sem borda, o que pode “sumir” no fundo branco: adicionar borda/sombra sutil no item (`border-border`, `rounded-xl`).

#### 6) CTAs mobile (Apoiar/Compartilhar) com mais presença
- **Arquivo**: ReportPage.jsx
- **Ações**
  - Garantir que o card “Apoios” (mobile) tenha contraste de texto e botões:
    - manter botão “Apoiar” como principal (gradiente vermelho) e elevar contraste do texto auxiliar.
  - Opcional (se fizer sentido): adicionar uma mini barra fixa (sticky) no rodapé do conteúdo mobile com “Apoiar” + “Compartilhar” quando o usuário rolar (sem cobrir BottomNav).
- **Por quê**: aumenta ação/engajamento e dá hierarquia clara.

#### 7) Organização do arquivo (manutenibilidade)
- **Arquivo**: ReportPage.jsx (muito extenso)
- **Ações**
  - Extrair em subcomponentes internos no mesmo arquivo (sem criar novos arquivos) para reduzir complexidade:
    - `MobileHeaderBlock`
    - `HeroMedia`
    - `MobileLocationCard`
    - `DetailsGrid`
    - `CommentsCard`
  - Separar funções utilitárias (formatters e mapeamentos) em blocos claros no topo.
- **Por quê**: facilita evoluções de UI e reduz risco de regressão ao mexer no layout.

### Assunções e Decisões (fechadas)
- Direção visual: **brand forte** (vermelho guiando hierarquia).
- Categoria/Status: **mostrar chips no topo do mobile**.
- Padronização: **migrar hardcodes para tokens do tema** sempre que possível.
- Escopo: foco em contraste/hierarquia no mobile, sem redesenhar fluxo de dados ou back-end.

### Riscos e Como Mitigar
- Risco: mudanças de classes podem afetar desktop.
  - Mitigação: aplicar mudanças principalmente dentro de blocos `lg:hidden`/mobile-first e testar em `lg:` também.
- Risco: inconsistência entre tokens e hardcodes existentes.
  - Mitigação: preferir tokens; manter hardcodes apenas para acentos de marca e gradientes já usados.

### Verificação (checklist)
- Conferir que ReportPage renderiza sem erro (principalmente removendo `/plan` do import).
- Verificar em largura mobile (≤ 390px) e tablet (≥ 768px):
  - chips de Categoria/Status visíveis e legíveis
  - contraste de headers e textos secundários
  - cards não “somem” no fundo
  - botões principais continuam evidentes
- Rodar: `npm run lint` e `npm run build` (sem introduzir warnings críticos).

### Reflexão / Sugestões (1–2 parágrafos)
O principal ganho de contraste virá de padronizar superfícies e textos com tokens do tema, evitando cinzas muito claros como padrão para headers e meta. Isso não só melhora legibilidade no mobile, como também reduz a chance de “desalinhamento visual” entre telas ao longo do tempo.

Como evolução, vale tratar a ReportPage como uma composição de blocos menores (mesmo que inicialmente dentro do mesmo arquivo) para tornar alterações de UI mais seguras. Separar “estrutura” (layout) de “conteúdo” (dados/formatadores) diminui regressões e acelera iterações de design.
