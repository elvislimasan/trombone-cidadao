# Redesign — Fase 2: Detalhe da Bronca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de detalhe da bronca (`ReportPage.jsx`, 2921 linhas) seguindo a referência aprovada, quebrando-a em componentes e migrando-a para os tokens do design system, sem perder nenhuma das 25 ações nem as regras de permissão.

**Architecture:** Mesmo caminho que funcionou na Fase 1 — primeiro a refatoração pura (commit sem mudança visual), depois o redesign. A tela ganha uma seção por bloco da referência: cabeçalho, mídia, resumo, timeline de andamento, atualizações, mapa, comentários e ações. O que a referência não mostra (moderação, vincular, resolver, poste) vai para o menu de três pontos do cabeçalho.

**Tech Stack:** React 18, Vite, Tailwind CSS 3.3, Capacitor 7, Supabase JS 2.30, Leaflet.

**Referência visual:** aprovada pelo dono do produto — cabeçalho com voltar/título/ID/menu, botão Compartilhar, mídia com badge de status e contador de fotos, título, endereço, autor, "Sobre o problema", "Acompanhe o andamento" (4 etapas), "Atualizações", "Localização" com mapa, "Comentários" com curtidas, "Republicar esta denúncia" e barra fixa "Adicionar comentário".

## Global Constraints

- **Nenhuma das 25 ações removida.** Inventário obrigatório (todas verificadas por grep antes de commitar): `handleNavigateToReport`, `handleSubmitComment`, `handleReportError`, `handleWhatsAppShare`, `handleShare`, `handleCopyShareLink`, `handleDownloadStoryCard`, `handleAdminStatusChange`, `handleAdminCategoryChange`, `handleAdminWaterUtilityChange`, `handleUpvoteClick`, `handleEditClick`, `handleMarkResolvedClick`, `handleConfirmResolution`, `handleSubmitUpdate`, `handleConfirmUpdate`, `handleDeleteUpdate`, `handleModerate`, `fetchReport`, `handleUpdateReport`, `handleFavoriteToggle`, `handleUpvoteFromDetails`, `handleOpenLinkModal`, `handleLinkReport`, `getBaseUrl`.
- **Regras de permissão preservadas literalmente.** A tela distingue: `user.is_admin`, `user.is_master`, `user.user_type === 'public_official'`, `user.is_ambassador` (validado por RPC `is_ambassador_of`), autor (`user.id === report.author_id`), autor da atualização (`user.id === upd.author_id`), e uma janela de tempo para editar a própria atualização. Nenhuma dessas condições pode ser simplificada, invertida ou reordenada.
- **`moderation_status` intocado.** A tela decide entre `pending` e `pending_moderation` conforme `isAuthorOrAdmin`; inverter isso publicaria conteúdo sem revisão.
- **Modais preservados:** `MarkResolvedModal`, `LinkReportModal`, `ReportUpdateModal`, `MediaViewer`. O `openUpdateModal` via `location.state` (vindo do card do feed) precisa continuar abrindo o modal de atualização.
- **Campos de iluminação pública** (`pole`, `pole_number`, `reported_post_identifier`, `reported_plate`, `issue_type`) aparecem apenas para `category === 'iluminacao'` e continuam editáveis por quem tem permissão.
- **Vermelho só para ação** (botões, links, estados ativos). Fundos rosados são proibidos — usar `surface-subtle` neutro.
- **Zero cores hardcoded** ao fim: `#191c1e`, `bg-white`, `text-muted-foreground`, `bg-muted`, `border-border` devem sumir dos arquivos tocados.
- Comentários em português sem acentos; mensagens de commit sem acentos.
- **Sem testes automatizados.** Verificação: `npm run build`, `npx eslint <arquivos>`, `npm run check:contrast`, e revisão visual do usuário.
- Branch: `dev.redesign_trombone`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/components/report/ReportHeader.jsx` | Voltar, título, ID, menu de três pontos, Compartilhar |
| `src/components/report/ReportMedia.jsx` | Galeria com badge de status e contador de fotos |
| `src/components/report/ReportSummary.jsx` | Título, endereço, autor, tempo |
| `src/components/report/ReportProblem.jsx` | Bloco "Sobre o problema" + campos de iluminação |
| `src/components/report/ReportProgress.jsx` | "Acompanhe o andamento" — 4 etapas |
| `src/components/report/ReportUpdates.jsx` | "Atualizações" (timeline) |
| `src/components/report/ReportLocation.jsx` | Mapa + "Abrir no mapa" |
| `src/components/report/ReportComments.jsx` | Lista, curtida, ordenação, "Ver todos" |
| `src/components/report/ReportActionsMenu.jsx` | Menu "..." com as ações condicionais a permissão |
| `src/components/report/ReportCommentBar.jsx` | Barra fixa "Adicionar comentário" |
| `src/hooks/useReportPermissions.js` | Centraliza os gates de permissão |
| `src/pages/ReportPage.jsx` | Composição (~250 linhas) |

---

### Task 1: Extrair as permissões para `useReportPermissions`

**Files:**
- Create: `src/hooks/useReportPermissions.js`
- Modify: `src/pages/ReportPage.jsx`

**Interfaces:**
- Produces: `useReportPermissions(report): { isAdmin, isMaster, isPublicOfficial, isAuthor, isAuthorOrAdmin, canModerate, canEditCategory, canEditWaterUtility, canMarkResolved, canEditUpdate(upd), canDeleteUpdate(upd) }`

**Regra: refatoração pura — nenhuma mudança visual nem de comportamento.**

- [ ] **Step 1: Ler as regras atuais**

Antes de escrever o hook, leia e anote cada gate existente:

```bash
grep -nE "is_admin|is_master|is_ambassador|public_official|author_id|canModerate|canEditCategory|cutoff" src/pages/ReportPage.jsx
```

Preste atenção especial a:
- linha ~200: quem pode excluir uma atualização (admin OU autor da bronca OU autor da atualização)
- linha ~179: a janela de tempo (`cutoff`) para editar a própria atualização
- linha ~496: `canModerate` combina `is_admin` com `public_official`
- linha ~1083-1087: embaixador é validado por RPC `is_ambassador_of` com `report.city_id`, de forma assíncrona

- [ ] **Step 2: Criar o hook preservando cada condição**

O hook recebe `report` e devolve os booleanos. A verificação de embaixador é assíncrona (RPC), então mantém o padrão atual de estado + efeito. Copie as condições **literalmente** do arquivo original — não simplifique expressões booleanas, mesmo que pareçam redundantes.

- [ ] **Step 3: Consumir no ReportPage**

Substituir os cálculos inline pelas propriedades do hook. Nenhum JSX muda.

- [ ] **Step 4: Verificar**

```bash
npm run build && npx eslint src/pages/ReportPage.jsx src/hooks/useReportPermissions.js
```

Confirme que cada gate sobreviveu:
```bash
grep -c "is_admin\|is_master\|public_official\|is_ambassador_of" src/hooks/useReportPermissions.js
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useReportPermissions.js src/pages/ReportPage.jsx
git commit -m "refactor(bronca): extrai as permissoes para useReportPermissions"
```

---

### Task 2: Extrair os blocos de conteúdo

**Files:**
- Create: `src/components/report/ReportSummary.jsx`, `ReportProblem.jsx`, `ReportProgress.jsx`, `ReportUpdates.jsx`, `ReportLocation.jsx`
- Modify: `src/pages/ReportPage.jsx`

**Regra: refatoração pura — as classes CSS são copiadas literalmente, incluindo as cores fixas.**

- [ ] **Step 1: Extrair um bloco por vez**

Para cada bloco, mova o JSX e os handlers que só ele usa. Rode `npm run build` após cada extração — assim uma quebra é atribuível ao bloco que você acabou de mover.

Ordem sugerida (do mais isolado ao mais acoplado): `ReportLocation` → `ReportProblem` → `ReportSummary` → `ReportProgress` → `ReportUpdates`.

- [ ] **Step 2: Verificar que nada virou token cedo demais**

```bash
grep -nE "surface-|content-|edge-|text-2xs|font-display" src/components/report/*.jsx
```

Deve retornar **vazio**. Se retornar algo, você migrou visual nesta task; reverta para as classes originais.

- [ ] **Step 3: Verificar**

```bash
npm run build && npx eslint src/components/report/*.jsx src/pages/ReportPage.jsx
wc -l src/pages/ReportPage.jsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/report/ src/pages/ReportPage.jsx
git commit -m "refactor(bronca): extrai os blocos de conteudo do ReportPage"
```

---

### Task 3: Extrair comentários, mídia e ações

**Files:**
- Create: `src/components/report/ReportComments.jsx`, `ReportMedia.jsx`, `ReportActionsMenu.jsx`, `ReportCommentBar.jsx`
- Modify: `src/pages/ReportPage.jsx`

**Regra: refatoração pura.**

- [ ] **Step 1: Extrair**

`ReportActionsMenu` recebe os booleanos de `useReportPermissions` e os handlers como props — ele não decide permissão, só renderiza o que lhe for permitido.

- [ ] **Step 2: Verificar as ações**

```bash
for h in handleMarkResolvedClick handleOpenLinkModal handleModerate handleReportError handleEditClick handleAdminStatusChange; do
  printf "%-28s %s\n" "$h" "$(grep -rc "$h" src/pages/ReportPage.jsx src/components/report/*.jsx | paste -sd+ | bc)"
done
```

Cada uma deve aparecer ao menos uma vez.

- [ ] **Step 3: Verificar**

```bash
npm run build && npx eslint src/components/report/*.jsx src/pages/ReportPage.jsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/report/ src/pages/ReportPage.jsx
git commit -m "refactor(bronca): extrai comentarios, midia e menu de acoes"
```

---

### Task 4: Redesign — cabeçalho, mídia e resumo

**Files:**
- Create: `src/components/report/ReportHeader.jsx`
- Modify: `ReportMedia.jsx`, `ReportSummary.jsx`, `src/pages/ReportPage.jsx`

**Interfaces:**
- Consumes: tokens do design system, `Icon`, `StatusBadge`.

- [ ] **Step 1: Cabeçalho conforme a referência**

Voltar (chevron) · "Detalhes da denúncia" + "ID #14258" · menu "..." · botão "Compartilhar" em contorno.

O menu "..." abre o `ReportActionsMenu` com as ações condicionais: marcar resolvida, vincular a outra bronca, editar, moderar (aprovar/rejeitar), reportar erro, baixar card. Cada item só aparece se a permissão correspondente for verdadeira.

- [ ] **Step 2: Mídia**

Badge de status sobreposto no canto superior esquerdo (usar `StatusBadge`), contador de fotos no canto inferior direito (`bg-black/50`, aceitável por ser overlay sobre imagem). Abre o `MediaViewer` ao tocar.

- [ ] **Step 3: Resumo**

Título em `font-display`, endereço com ícone `location` em `text-brand`, autor com avatar e "Denunciado por X", tempo à direita.

- [ ] **Step 4: Verificar**

```bash
npm run build && npm run check:contrast
grep -nE "#[0-9a-fA-F]{3,6}|bg-white|text-muted-foreground|bg-muted|border-border" src/components/report/ReportHeader.jsx src/components/report/ReportMedia.jsx src/components/report/ReportSummary.jsx
```

O grep deve retornar vazio (exceto `bg-black/50` do overlay).

- [ ] **Step 5: Commit**

```bash
git add src/components/report/ src/pages/ReportPage.jsx
git commit -m "feat(bronca): redesign do cabecalho, midia e resumo"
```

---

### Task 5: Redesign — problema, andamento e atualizações

**Files:**
- Modify: `ReportProblem.jsx`, `ReportProgress.jsx`, `ReportUpdates.jsx`

- [ ] **Step 1: "Sobre o problema"**

Card `surface-raised` com borda `edge-subtle`. Os campos de iluminação (poste, placa, tipo de problema) entram como lista de pares rótulo/valor **dentro deste bloco**, visíveis só quando `category === 'iluminacao'`.

- [ ] **Step 2: "Acompanhe o andamento"**

Quatro etapas: Recebido · Em análise · Em execução · Resolvido. Etapa atual em `text-brand` com o ícone preenchido; as futuras em `content-tertiary`. Data sob a etapa concluída. Linha conectora em `edge-default`.

Use os ícones autorais de status: `received`, `analysis`, `execution`, `resolved`.

O mapeamento de `report.status` para etapa deve ser explícito e cobrir os quatro status do banco (`pending`, `in-progress`, `resolved`, `duplicate`), com fallback para a primeira etapa.

- [ ] **Step 3: "Atualizações"**

Ícone `trombone` em bloco `surface-subtle`, título, texto e tempo. Preserve o botão de confirmar atualização e o de excluir, cada um sob sua permissão (`canConfirmUpdate`, `canDeleteUpdate(upd)`).

- [ ] **Step 4: Verificar**

```bash
npm run build && npm run check:contrast && npx eslint src/components/report/*.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/report/
git commit -m "feat(bronca): redesign do problema, andamento e atualizacoes"
```

---

### Task 6: Redesign — mapa, comentários e barra de ação

**Files:**
- Modify: `ReportLocation.jsx`, `ReportComments.jsx`, `ReportCommentBar.jsx`, `src/pages/ReportPage.jsx`

- [ ] **Step 1: Localização**

Mapa com cantos arredondados dentro do card, e "Abrir no mapa" como link `text-brand` com ícone de link externo.

**Atenção:** o Leaflet tem CSS próprio com cores fixas. Se o mapa ficar com moldura clara no tema escuro, ajuste o container — não o CSS do Leaflet, que é compartilhado com as outras telas de mapa.

- [ ] **Step 2: Comentários**

Cabeçalho "Comentários (N)" com seletor de ordenação à direita. Cada comentário: avatar, nome, tempo, texto e contador de curtidas com ícone de coração à direita. "Ver todos os comentários" ao fim.

- [ ] **Step 3: Republicar e barra fixa**

Bloco "Republicar esta denúncia" com fundo `surface-subtle` (**não rosado**) e botão em contorno. Abaixo, a barra fixa "Adicionar comentário" — botão principal usando `bg-cta-bg`, que já se adapta ao tema.

A barra fixa precisa respeitar a safe area inferior (`pb-safe`) e não cobrir a bottom nav.

- [ ] **Step 4: Verificar**

```bash
npm run build && npm run check:contrast
grep -nE "#[0-9a-fA-F]{3,6}|bg-white|text-muted-foreground|bg-muted|border-border" src/components/report/*.jsx src/pages/ReportPage.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/report/ src/pages/ReportPage.jsx
git commit -m "feat(bronca): redesign do mapa, comentarios e barra de acao"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Build, lint e contraste**

```bash
npm run build:clean
npx eslint src/pages/ReportPage.jsx src/components/report/*.jsx src/hooks/useReportPermissions.js
npm run check:contrast
```

- [ ] **Step 2: Inventário das 25 ações**

```bash
for h in handleNavigateToReport handleSubmitComment handleReportError handleWhatsAppShare handleShare handleCopyShareLink handleDownloadStoryCard handleAdminStatusChange handleAdminCategoryChange handleAdminWaterUtilityChange handleUpvoteClick handleEditClick handleMarkResolvedClick handleConfirmResolution handleSubmitUpdate handleConfirmUpdate handleDeleteUpdate handleModerate fetchReport handleUpdateReport handleFavoriteToggle handleUpvoteFromDetails handleOpenLinkModal handleLinkReport getBaseUrl; do
  n=$(grep -rc "$h" src/pages/ReportPage.jsx src/components/report/*.jsx src/hooks/useReportPermissions.js 2>/dev/null | awk -F: '{s+=$2} END {print s}')
  printf "%-30s %s %s\n" "$h" "$n" "$([ "$n" -gt 0 ] && echo OK || echo FALTANDO)"
done
```

Todas devem marcar OK.

- [ ] **Step 3: Permissões e modais**

```bash
for t in is_admin is_master public_official is_ambassador_of author_id moderation_status MarkResolvedModal LinkReportModal ReportUpdateModal MediaViewer openUpdateModal pole_number; do
  n=$(grep -rc "$t" src/pages/ReportPage.jsx src/components/report/*.jsx src/hooks/useReportPermissions.js 2>/dev/null | awk -F: '{s+=$2} END {print s}')
  printf "%-24s %s %s\n" "$t" "$n" "$([ "$n" -gt 0 ] && echo OK || echo FALTANDO)"
done
```

- [ ] **Step 4: Contagem de linhas**

```bash
wc -l src/pages/ReportPage.jsx src/components/report/*.jsx
```

`ReportPage.jsx` deve ficar abaixo de 400 linhas (era 2921).

- [ ] **Step 5: Revisão visual pelo usuário**

Rodar `npm run dev` e conferir nos dois temas: cabeçalho e menu "...", galeria e visualizador, timeline de andamento, atualizações com confirmar/excluir, mapa, comentários com curtida, republicar, barra de comentário. Testar como visitante, autor e admin.

---

## Notas para o executor

**As tasks 1-3 são refatoração pura.** Se qualquer uma delas mudar um pixel, está errada. É essa separação que permite usar `git bisect` quando algo quebrar.

**A tela tem lógica delicada de permissão.** Ao mover código, copie as condições literalmente. Uma expressão "simplificada" pode inverter quem pode moderar ou publicar sem revisão.

**Se o arquivo for grande demais para uma leitura só**, leia por seções e mova um bloco por vez, rodando o build entre eles.

**O `pole` aparece 34 vezes no arquivo.** É a integração com iluminação pública — poste, placa, distância, tipo de problema. Preserve tudo, inclusive as ações de admin que editam esses campos.
