# Redesign — Fase 0 (Design System) + Fase 1 (Feed) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o design system do Trombone Cidadão (tokens, tema claro/escuro, ícones autorais, loading próprio) e aplicá-lo à tela de Feed, sem remover nenhuma funcionalidade existente.

**Architecture:** Tokens CSS em duas camadas (primitiva → semântica), com os tokens shadcn existentes remapeados para os novos, garantindo que telas não migradas continuem funcionando. ThemeProvider aplica a classe `dark` no `<html>` e sincroniza a status bar nativa do Capacitor. O Feed é primeiro refatorado sem mudança visual (commit próprio), depois redesenhado com os tokens, depois otimizado.

**Tech Stack:** React 18, Vite, Tailwind CSS 3.3, Capacitor 7 (`@capacitor/preferences`, `@capacitor/status-bar`), Supabase JS 2.30.

**Spec:** `docs/superpowers/specs/2026-08-06-redesign-identidade-visual-design.md`

## Global Constraints

- **Nenhuma funcionalidade removida.** Painel do Embaixador, "Esteve no local?", republicar, favoritar, compartilhar, moderação (`moderation_status`), denúncia anônima (`is_anonymous`) e todas as demais regras permanecem operantes.
- **Sem testes automatizados.** `vitest` não está instalado e não será instalado. Verificação é por `npm run build`, `npm run lint`, o script de contraste, e revisão visual do usuário no fim das duas fases.
- **Refatoração e redesign em commits separados**, para que `git bisect` isole regressões.
- **Telas não migradas permanecem intactas.** Os tokens shadcn (`--background`, `--primary`, `--card`, `--border`, `--muted`, `--accent`, `--popover`, `--destructive`, `--input`, `--ring`, `--secondary`) continuam existindo e passam a apontar para os semânticos.
- **Regras de Capacitor do `CLAUDE.md` valem integralmente:** todo código nativo verifica `Capacitor.isPluginAvailable(...)` e trata Android, iOS e web.
- **Idioma:** toda a copy visível ao usuário em português do Brasil. Mensagens de commit sem acentos.
- **Cor:** `brand` e `danger` são cores distintas. Nunca reintroduzir `--primary` igual a `--destructive`.
- **Tokens em canal RGB** (`217 45 32`), não HSL, para permitir `rgb(var(--token) / alpha)`.
- **Branch:** `dev.redesign_trombone`.

---

## Estrutura de arquivos

**Fase 0 — criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/design-system/tokens/primitives.css` | Paleta bruta invariável entre temas |
| `src/design-system/tokens/semantic.css` | Papéis por tema + ponte para tokens shadcn |
| `src/design-system/tokens/typography.css` | Famílias e escala tipográfica |
| `src/design-system/tokens/motion.css` | Durações, easings, `prefers-reduced-motion` |
| `src/design-system/theme/applyTheme.js` | Efeitos colaterais: classe, meta, status bar |
| `src/design-system/theme/themeStorage.js` | Persistência Preferences/localStorage |
| `src/design-system/theme/ThemeProvider.jsx` | Contexto + `useTheme` |
| `src/design-system/icons/Icon.jsx` | Wrapper de tamanho/cor/acessibilidade |
| `src/design-system/icons/categories/*.jsx` | 7 SVGs de categoria |
| `src/design-system/icons/status/*.jsx` | 4 SVGs de status |
| `src/design-system/icons/nav/*.jsx` | 5 SVGs de navegação |
| `src/design-system/icons/system/*.jsx` | 8 SVGs de sistema |
| `src/design-system/icons/index.js` | Barrel + mapa categoria→ícone |
| `src/design-system/feedback/TromboneSpinner.jsx` | Spinner inline |
| `src/design-system/feedback/TromboneSplash.jsx` | Splash de carregamento |
| `src/design-system/feedback/Skeleton.jsx` | Skeleton com shimmer |
| `src/design-system/primitives/Surface.jsx` | Card/painel com elevação |
| `src/design-system/primitives/StatusBadge.jsx` | Badge de status (fonte única) |
| `src/design-system/primitives/SignalChip.jsx` | Chip de sinal do feed |
| `src/design-system/primitives/EmptyState.jsx` | Estado vazio padronizado |
| `src/design-system/index.js` | Barrel público do design system |
| `scripts/check-contrast.mjs` | Validação WCAG AA dos tokens |

**Fase 0 — modificados:** `src/index.css`, `tailwind.config.js`, `src/main.jsx`, `index.html`, `package.json`, `src/pages/ProfilePage.jsx`.

**Fase 1 — criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/hooks/useCreateReport.js` | Insert, upload, confetti, haptics, contador, toast |
| `src/hooks/useFeedRealtime.js` | Canal Supabase + contador de novas broncas |
| `src/hooks/useVideoThumbnail.js` | Fila de geração de thumbnail, concorrência 1 |
| `src/components/feed/FeedCitySelector.jsx` | Picker de cidade + busca + GPS |
| `src/components/feed/FeedTabs.jsx` | Tabs (preparado para a 4ª da Fase 4) |
| `src/components/feed/FeedStates.jsx` | Offline, lento, erro, erro de paginação |
| `src/components/feed/FeedWelcomeCard.jsx` | 3 atalhos incl. Painel do Embaixador |
| `src/components/feed/FeedNewReportsBanner.jsx` | Banner "X novas broncas" |
| `src/components/feed/FeedCardMedia.jsx` | Mídia do card: imagem, vídeo, placeholder |
| `src/components/feed/FeedCardSignals.jsx` | Cálculo e exibição dos sinais |
| `docs/mockups/feed.html` | Mockup claro+escuro para aprovação |

**Fase 1 — modificados:** `src/pages/FeedPage.jsx`, `src/components/FeedCard.jsx`, `src/components/FeedSkeleton.jsx`, `src/components/FeedEmptyState.jsx`, `src/components/EngagementBar.jsx`.

---

# FASE 0 — DESIGN SYSTEM

### Task 1: Tokens primitivos e semânticos

**Files:**
- Create: `src/design-system/tokens/primitives.css`
- Create: `src/design-system/tokens/semantic.css`
- Modify: `src/index.css`

**Interfaces:**
- Produces: variáveis CSS `--tc-*` (primitivas) e `--surface-*`, `--text-*`, `--brand`, `--danger`, `--status-*` (semânticas). Todas em canal RGB separado por espaço. Os tokens shadcn existentes passam a derivar destas.

- [ ] **Step 1: Criar a paleta primitiva**

Criar `src/design-system/tokens/primitives.css`:

```css
/* Paleta bruta do Trombone Cidadao.
   Valores em canal RGB separado por espaco, para permitir rgb(var(--x) / alpha).
   Esta camada NAO muda entre temas. */
:root {
  /* Vermelho da marca */
  --tc-red-50:  254 243 242;
  --tc-red-100: 254 228 226;
  --tc-red-200: 254 205 202;
  --tc-red-300: 253 162 155;
  --tc-red-400: 249 112 102;
  --tc-red-500: 240 72 62;
  --tc-red-600: 217 45 32;
  --tc-red-700: 180 35 24;
  --tc-red-800: 145 32 24;
  --tc-red-900: 122 32 26;
  --tc-red-950: 85 15 12;

  /* Neutros com leve tom quente */
  --tc-neutral-0:   255 255 255;
  --tc-neutral-50:  250 250 249;
  --tc-neutral-100: 245 245 244;
  --tc-neutral-200: 231 230 228;
  --tc-neutral-300: 214 212 209;
  --tc-neutral-400: 168 165 161;
  --tc-neutral-500: 120 117 113;
  --tc-neutral-600: 87 84 81;
  --tc-neutral-700: 68 65 63;
  --tc-neutral-800: 41 39 38;
  --tc-neutral-850: 32 31 30;
  --tc-neutral-900: 26 25 24;
  --tc-neutral-950: 15 15 17;

  /* Ambar - status pendente */
  --tc-amber-100: 254 243 199;
  --tc-amber-200: 253 230 138;
  --tc-amber-300: 252 211 77;
  --tc-amber-600: 217 119 6;
  --tc-amber-700: 180 83 9;
  --tc-amber-900: 120 53 15;
  --tc-amber-950: 69 26 3;

  /* Azul - status em andamento */
  --tc-blue-100: 219 234 254;
  --tc-blue-200: 191 219 254;
  --tc-blue-300: 147 197 253;
  --tc-blue-600: 37 99 235;
  --tc-blue-700: 29 78 216;
  --tc-blue-900: 30 58 138;
  --tc-blue-950: 23 37 84;

  /* Verde - status resolvido */
  --tc-green-100: 220 252 231;
  --tc-green-200: 187 247 208;
  --tc-green-300: 134 239 172;
  --tc-green-600: 22 163 74;
  --tc-green-700: 21 128 61;
  --tc-green-900: 20 83 45;
  --tc-green-950: 5 46 22;

  /* Violeta - sinal "agora" */
  --tc-violet-300: 196 181 253;
  --tc-violet-600: 124 58 237;
  --tc-violet-950: 46 16 101;

  /* Amarelo da marca - destaque secundario */
  --tc-yellow-400: 250 204 21;
  --tc-yellow-500: 234 179 8;
}
```

- [ ] **Step 2: Criar os tokens semânticos com a ponte shadcn**

Criar `src/design-system/tokens/semantic.css`.

Ponto crítico: os tokens shadcn legados são consumidos por `hsl(var(--x))` no `tailwind.config.js`. Como as novas variáveis são RGB, os legados **não podem** simplesmente apontar para as novas — a função `hsl()` interpretaria os números errado. Por isso os legados recebem valores HSL próprios, equivalentes aos semânticos, e são mantidos em sincronia manual. Isso preserva 100% da compatibilidade.

```css
/* Papeis semanticos. Componentes consomem SOMENTE esta camada.
   Bloco 1: tokens novos (RGB).
   Bloco 2: ponte para os tokens shadcn legados (HSL) - mantem telas nao
   migradas funcionando sem alteracao. */

:root {
  /* --- Superficies --- */
  --surface-base:     var(--tc-neutral-100);
  --surface-raised:   var(--tc-neutral-0);
  --surface-sunken:   var(--tc-neutral-200);
  --surface-overlay:  var(--tc-neutral-0);

  /* --- Texto --- */
  --text-primary:     var(--tc-neutral-900);
  --text-secondary:   var(--tc-neutral-600);
  --text-tertiary:    var(--tc-neutral-500);
  --text-on-brand:    var(--tc-neutral-0);

  /* --- Bordas --- */
  --border-subtle:    var(--tc-neutral-200);
  --border-default:   var(--tc-neutral-300);
  --border-strong:    var(--tc-neutral-400);

  /* --- Marca (CTA, tab ativa, links) --- */
  --brand:            var(--tc-red-600);
  --brand-hover:      var(--tc-red-700);
  --brand-subtle-bg:  var(--tc-red-50);
  --brand-subtle-fg:  var(--tc-red-700);

  /* --- Perigo (destrutivo/erro) - distinto de brand --- */
  --danger:           var(--tc-red-800);
  --danger-subtle-bg: var(--tc-red-50);
  --danger-subtle-fg: var(--tc-red-800);

  /* --- Status de bronca --- */
  --status-pending-bg:     var(--tc-amber-100);
  --status-pending-fg:     var(--tc-amber-700);
  --status-pending-border: var(--tc-amber-200);

  --status-progress-bg:     var(--tc-blue-100);
  --status-progress-fg:     var(--tc-blue-700);
  --status-progress-border: var(--tc-blue-200);

  --status-resolved-bg:     var(--tc-green-100);
  --status-resolved-fg:     var(--tc-green-700);
  --status-resolved-border: var(--tc-green-200);

  --status-duplicate-bg:     var(--tc-neutral-100);
  --status-duplicate-fg:     var(--tc-neutral-600);
  --status-duplicate-border: var(--tc-neutral-200);

  /* --- Sinais do feed --- */
  --signal-hot-bg:     var(--tc-red-600);
  --signal-hot-fg:     var(--tc-neutral-0);
  --signal-rising-bg:  var(--tc-amber-600);
  --signal-rising-fg:  var(--tc-neutral-0);
  --signal-fresh-bg:   var(--tc-violet-600);
  --signal-fresh-fg:   var(--tc-neutral-0);

  /* --- Destaque secundario --- */
  --accent-highlight: var(--tc-yellow-500);

  /* --- Skeleton (shimmer) ---
     Par proprio para garantir contraste da faixa de brilho. Nao derivar de
     --surface-sunken/--border-subtle: no claro os dois sao neutral-200. */
  --skeleton-base:  var(--tc-neutral-200);
  --skeleton-sheen: var(--tc-neutral-100);

  /* --- Elevacao --- */
  --elevation-1: 0 1px 2px rgb(var(--tc-neutral-950) / 0.06);
  --elevation-2: 0 2px 8px rgb(var(--tc-neutral-950) / 0.08);
  --elevation-3: 0 8px 24px rgb(var(--tc-neutral-950) / 0.12);
}

.dark {
  --surface-base:     var(--tc-neutral-950);
  --surface-raised:   var(--tc-neutral-900);
  --surface-sunken:   var(--tc-neutral-950);
  --surface-overlay:  var(--tc-neutral-850);

  --text-primary:     var(--tc-neutral-50);
  --text-secondary:   var(--tc-neutral-400);
  --text-tertiary:    var(--tc-neutral-500);
  /* No escuro a marca e vermelho claro, entao o texto sobre ela e ESCURO.
     Branco sobre red-400 daria 2.79:1; neutral-950 da 6.87:1. */
  --text-on-brand:    var(--tc-neutral-950);

  --border-subtle:    var(--tc-neutral-800);
  --border-default:   var(--tc-neutral-700);
  --border-strong:    var(--tc-neutral-600);

  /* No dark o vermelho sobe em luminosidade e desce em saturacao:
     vermelho saturado sobre preto puro vibra em OLED. */
  --brand:            var(--tc-red-400);
  --brand-hover:      var(--tc-red-300);
  --brand-subtle-bg:  var(--tc-red-950);
  --brand-subtle-fg:  var(--tc-red-300);

  --danger:           var(--tc-red-300);
  --danger-subtle-bg: var(--tc-red-950);
  --danger-subtle-fg: var(--tc-red-300);

  --status-pending-bg:     var(--tc-amber-950);
  --status-pending-fg:     var(--tc-amber-300);
  --status-pending-border: var(--tc-amber-900);

  --status-progress-bg:     var(--tc-blue-950);
  --status-progress-fg:     var(--tc-blue-300);
  --status-progress-border: var(--tc-blue-900);

  --status-resolved-bg:     var(--tc-green-950);
  --status-resolved-fg:     var(--tc-green-300);
  --status-resolved-border: var(--tc-green-900);

  --status-duplicate-bg:     var(--tc-neutral-850);
  --status-duplicate-fg:     var(--tc-neutral-400);
  --status-duplicate-border: var(--tc-neutral-800);

  --signal-hot-bg:     var(--tc-red-500);
  --signal-hot-fg:     var(--tc-neutral-0);
  --signal-rising-bg:  var(--tc-amber-600);
  --signal-rising-fg:  var(--tc-neutral-0);
  --signal-fresh-bg:   var(--tc-violet-600);
  --signal-fresh-fg:   var(--tc-neutral-0);

  --accent-highlight: var(--tc-yellow-400);

  /* No escuro a base e neutral-800: --surface-sunken e neutral-950, igual ao
     fundo da pagina, e o skeleton sumiria contra ele. */
  --skeleton-base:  var(--tc-neutral-800);
  --skeleton-sheen: var(--tc-neutral-700);

  --elevation-1: 0 1px 2px rgb(0 0 0 / 0.4);
  --elevation-2: 0 2px 8px rgb(0 0 0 / 0.5);
  --elevation-3: 0 8px 24px rgb(0 0 0 / 0.6);
}

/* ============================================================
   PONTE PARA OS TOKENS SHADCN LEGADOS (HSL)
   Consumidos por hsl(var(--x)) no tailwind.config.js.
   Equivalentes aos semanticos acima. Ao alterar um semantico,
   atualizar o par correspondente aqui.
   ============================================================ */
:root {
  --background: 60 4.8% 95.9%;    /* = --surface-base (neutral-100) */
  --foreground: 30 4% 9.8%;       /* = --text-primary (neutral-900) */
  --card: 0 0% 100%;              /* = --surface-raised */
  --card-foreground: 30 4% 9.8%;
  --popover: 0 0% 100%;
  --popover-foreground: 30 4% 9.8%;
  --primary: 4.2 74.3% 48.8%;     /* = --brand (red-600) */
  --primary-foreground: 0 0% 100%;
  --secondary: 45.4 93.4% 47.5%;  /* = amarelo da marca */
  --secondary-foreground: 30 4% 9.8%;
  --muted: 60 4.8% 95.9%;
  --muted-foreground: 30 3.6% 32.9%;  /* = --text-secondary (neutral-600) */
  --accent: 60 4.8% 95.9%;
  --accent-foreground: 30 4% 9.8%;
  --destructive: 4 71.6% 33.1%;   /* = --danger (red-800) - distinto de primary */
  --destructive-foreground: 0 0% 100%;
  --border: 40 5.9% 90%;          /* = --border-subtle */
  --input: 40 5.9% 90%;
  --ring: 4.2 74.3% 48.8%;
  --radius: 0.75rem;
}

.dark {
  --background: 240 6.3% 6.3%;    /* = --surface-base (neutral-950) */
  --foreground: 60 9.1% 97.8%;
  --card: 30 4% 9.8%;             /* = --surface-raised (neutral-900) */
  --card-foreground: 60 9.1% 97.8%;
  --popover: 20 3.8% 15.5%;
  --popover-foreground: 60 9.1% 97.8%;
  --primary: 4.1 92.5% 68.8%;     /* = --brand dark (red-400) */
  --primary-foreground: 240 6.3% 6.3%;  /* = --text-on-brand dark (neutral-950) */
  --secondary: 47.9 95.8% 53.1%;
  --secondary-foreground: 30 4% 9.8%;
  --muted: 20 3.8% 15.5%;
  --muted-foreground: 34.3 3.9% 64.5%;  /* = --text-secondary dark (neutral-400) */
  --accent: 20 3.8% 15.5%;
  --accent-foreground: 60 9.1% 97.8%;
  --destructive: 4.3 96.1% 80%;   /* = --danger dark (red-300) */
  --destructive-foreground: 30 4% 9.8%;
  --border: 20 3.8% 15.5%;
  --input: 20 3.8% 15.5%;
  --ring: 4.1 92.5% 68.8%;
}
```

Estes valores HSL foram derivados programaticamente dos primitivos RGB. **Nunca calcule um valor da ponte à mão** — uma divergência silenciosa faz telas migradas e não migradas exibirem cores diferentes lado a lado. Para recalcular após alterar um primitivo, converta o triplete RGB para HSL por script.

- [ ] **Step 3: Importar os tokens e remover os blocos antigos do index.css**

Em `src/index.css`, adicionar os imports imediatamente após as diretivas do Tailwind (linhas 1-3). Imports de CSS devem vir antes de qualquer regra:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import './design-system/tokens/primitives.css';
@import './design-system/tokens/semantic.css';
```

Em seguida **remover** o bloco `@layer base { :root { ... } .dark { ... } }` que hoje começa em `src/index.css:319` (o comentário `=== SEUS ESTILOS ORIGINAIS (MANTIDOS INTACTOS) ===`) e termina ao fechar o `.dark`. Esses tokens agora vivem em `semantic.css`.

Não remover: o bloco de safe areas, `.no-scrollbar`, as utilidades `line-clamp-*`, as regras do Leaflet, `.custom-scrollbar`, `.glass-effect`, `.gradient-text` e `.petition-theme`.

- [ ] **Step 4: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro. Se o Vite reclamar de `@import` após regras, mover os dois `@import` para a primeira linha do arquivo, antes das diretivas `@tailwind`.

- [ ] **Step 5: Commit**

```bash
git add src/design-system/tokens/ src/index.css
git commit -m "feat(ds): tokens primitivos e semanticos com ponte shadcn"
```

---

### Task 2: Tipografia, motion e configuração do Tailwind

**Files:**
- Create: `src/design-system/tokens/typography.css`
- Create: `src/design-system/tokens/motion.css`
- Modify: `tailwind.config.js`
- Modify: `src/index.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: variáveis de Task 1.
- Produces: classes Tailwind `bg-surface-*`, `text-primary`, `text-secondary`, `border-subtle`, `bg-brand`, `text-on-brand`, `bg-status-pending-bg`, `font-display`, `shadow-elevation-1..3`. Fonte de display disponível como `font-display`.

- [ ] **Step 1: Criar typography.css**

A fonte de display é **Bricolage Grotesque** (variável, peso 400-800) e o corpo segue em **Inter**. Auto-hospedadas — o app nativo não pode depender de CDN.

Baixar os arquivos para `public/fonts/`:

```bash
mkdir -p public/fonts
curl -L -o public/fonts/BricolageGrotesque.woff2 "https://cdn.jsdelivr.net/fontsource/fonts/bricolage-grotesque:vf@latest/latin-opsz,wdth,wght-normal.woff2"
curl -L -o public/fonts/Inter.woff2 "https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@latest/latin-wght-normal.woff2"
```

Se algum download falhar, verificar o arquivo com `ls -la public/fonts/` — um arquivo com menos de 10KB indica erro de download, não uma fonte válida. Nesse caso, prosseguir sem `font-display` e registrar a pendência; o fallback `system-ui` mantém a UI legível.

Criar `src/design-system/tokens/typography.css`:

```css
@font-face {
  font-family: 'Bricolage Grotesque';
  src: url('/fonts/BricolageGrotesque.woff2') format('woff2');
  font-weight: 400 800;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: 'InterVar';
  src: url('/fonts/Inter.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

:root {
  --font-display: 'Bricolage Grotesque', 'InterVar', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'InterVar', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  --text-2xs: 0.6875rem;  /* 11px - metadados */
  --text-xs:  0.75rem;    /* 12px */
  --text-sm:  0.875rem;   /* 14px - corpo padrao */
  --text-base:1rem;       /* 16px */
  --text-lg:  1.125rem;   /* 18px - titulo de card */
  --text-xl:  1.375rem;   /* 22px - titulo de tela */
  --text-2xl: 1.75rem;    /* 28px - display */
}

/* Numeros nao deslocam durante animacao de contador */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Criar motion.css**

```css
:root {
  --duration-instant: 100ms;
  --duration-fast:    160ms;
  --duration-normal:  240ms;
  --duration-slow:    400ms;

  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring:cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Entrada de card do feed - substitui o whileInView do framer-motion */
@keyframes tc-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}

.tc-animate-in {
  animation: tc-fade-up var(--duration-normal) var(--ease-out) both;
}

/* Shimmer do skeleton */
@keyframes tc-shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}

/* Ondas do loading do Trombone */
@keyframes tc-wave {
  0%   { opacity: 0; transform: scale(0.6); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: scale(1.4); }
}

@keyframes tc-draw {
  from { stroke-dashoffset: var(--tc-draw-length, 46); }
  to   { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .tc-animate-in,
  .tc-shimmer,
  .tc-wave,
  .tc-draw {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 3: Importar no index.css**

Em `src/index.css`, junto aos imports da Task 1:

```css
@import './design-system/tokens/primitives.css';
@import './design-system/tokens/semantic.css';
@import './design-system/tokens/typography.css';
@import './design-system/tokens/motion.css';
```

- [ ] **Step 4: Expor os tokens no Tailwind**

Em `tailwind.config.js`, dentro de `theme.extend`, substituir o bloco `fontFamily` e **adicionar** ao bloco `colors` existente (mantendo todas as entradas atuais — `border`, `input`, `ring`, `background`, `foreground`, `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, `card` e as `tc-*`):

```js
      fontFamily: {
        sans: ["InterVar", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "Noto Sans", "sans-serif"],
        display: ["Bricolage Grotesque", "InterVar", "ui-sans-serif", "system-ui", "sans-serif"],
      },
```

E dentro de `colors`, após as entradas `tc-*` existentes:

```js
        // === Design system (canal RGB) ===
        surface: {
          base:    "rgb(var(--surface-base) / <alpha-value>)",
          raised:  "rgb(var(--surface-raised) / <alpha-value>)",
          sunken:  "rgb(var(--surface-sunken) / <alpha-value>)",
          overlay: "rgb(var(--surface-overlay) / <alpha-value>)",
        },
        content: {
          primary:   "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          tertiary:  "rgb(var(--text-tertiary) / <alpha-value>)",
          onBrand:   "rgb(var(--text-on-brand) / <alpha-value>)",
        },
        edge: {
          subtle:  "rgb(var(--border-subtle) / <alpha-value>)",
          default: "rgb(var(--border-default) / <alpha-value>)",
          strong:  "rgb(var(--border-strong) / <alpha-value>)",
        },
        brand: {
          DEFAULT:   "rgb(var(--brand) / <alpha-value>)",
          hover:     "rgb(var(--brand-hover) / <alpha-value>)",
          subtleBg:  "rgb(var(--brand-subtle-bg) / <alpha-value>)",
          subtleFg:  "rgb(var(--brand-subtle-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT:  "rgb(var(--danger) / <alpha-value>)",
          subtleBg: "rgb(var(--danger-subtle-bg) / <alpha-value>)",
          subtleFg: "rgb(var(--danger-subtle-fg) / <alpha-value>)",
        },
        status: {
          pendingBg:      "rgb(var(--status-pending-bg) / <alpha-value>)",
          pendingFg:      "rgb(var(--status-pending-fg) / <alpha-value>)",
          pendingBorder:  "rgb(var(--status-pending-border) / <alpha-value>)",
          progressBg:     "rgb(var(--status-progress-bg) / <alpha-value>)",
          progressFg:     "rgb(var(--status-progress-fg) / <alpha-value>)",
          progressBorder: "rgb(var(--status-progress-border) / <alpha-value>)",
          resolvedBg:     "rgb(var(--status-resolved-bg) / <alpha-value>)",
          resolvedFg:     "rgb(var(--status-resolved-fg) / <alpha-value>)",
          resolvedBorder: "rgb(var(--status-resolved-border) / <alpha-value>)",
          duplicateBg:     "rgb(var(--status-duplicate-bg) / <alpha-value>)",
          duplicateFg:     "rgb(var(--status-duplicate-fg) / <alpha-value>)",
          duplicateBorder: "rgb(var(--status-duplicate-border) / <alpha-value>)",
        },
        signal: {
          hotBg:    "rgb(var(--signal-hot-bg) / <alpha-value>)",
          hotFg:    "rgb(var(--signal-hot-fg) / <alpha-value>)",
          risingBg: "rgb(var(--signal-rising-bg) / <alpha-value>)",
          risingFg: "rgb(var(--signal-rising-fg) / <alpha-value>)",
          freshBg:  "rgb(var(--signal-fresh-bg) / <alpha-value>)",
          freshFg:  "rgb(var(--signal-fresh-fg) / <alpha-value>)",
        },
```

Ainda em `theme.extend`, adicionar após `borderRadius`:

```js
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
      },
      fontSize: {
        '2xs': 'var(--text-2xs)',
      },
```

Atenção: `content` já é uma chave de topo no config do Tailwind (a lista de arquivos). Aqui `content` está dentro de `theme.extend.colors`, o que é válido e não conflita — gera classes como `text-content-primary`.

- [ ] **Step 5: Preload das fontes no index.html**

Em `index.html`, dentro do `<head>`:

```html
    <link rel="preload" href="/fonts/InterVar.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/BricolageGrotesque.woff2" as="font" type="font/woff2" crossorigin />
```

Corrigir o nome do arquivo se o download da Step 1 salvou com outro nome — os caminhos precisam bater exatamente com `public/fonts/`.

- [ ] **Step 6: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/design-system/tokens/ tailwind.config.js src/index.css index.html public/fonts/
git commit -m "feat(ds): tipografia, motion e exposicao dos tokens no tailwind"
```

---

### Task 3: ThemeProvider com integração nativa

**Files:**
- Create: `src/design-system/theme/themeStorage.js`
- Create: `src/design-system/theme/applyTheme.js`
- Create: `src/design-system/theme/ThemeProvider.jsx`
- Modify: `src/main.jsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces:
  - `loadThemePreference(): Promise<'light'|'dark'|'system'>`
  - `saveThemePreference(pref: 'light'|'dark'|'system'): Promise<void>`
  - `resolveTheme(pref): 'light'|'dark'`
  - `applyTheme(resolved: 'light'|'dark'): void`
  - `<ThemeProvider>` — componente
  - `useTheme(): { preference, resolved, setPreference }`

- [ ] **Step 1: Criar themeStorage.js**

```js
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'tc_theme_preference';
const VALID = new Set(['light', 'dark', 'system']);

const normalize = (value) => (VALID.has(value) ? value : 'system');

export async function loadThemePreference() {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Preferences')) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      return normalize(value);
    }
  } catch {}
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export async function saveThemePreference(preference) {
  const pref = normalize(preference);
  // Grava sempre no localStorage: o script inline do index.html le dele
  // para evitar flash antes do React montar.
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {}
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Preferences')) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: STORAGE_KEY, value: pref });
    }
  } catch {}
}

export { STORAGE_KEY };
```

- [ ] **Step 2: Criar applyTheme.js**

```js
import { Capacitor } from '@capacitor/core';

// Precisa bater com --surface-base de semantic.css em cada tema.
const THEME_COLOR = {
  light: '#f5f5f4',
  dark: '#0f0f11',
};

export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyMetaThemeColor(resolved) {
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', THEME_COLOR[resolved]);
  } catch {}
}

async function applyNativeStatusBar(resolved) {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('StatusBar')) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark = conteudo claro sobre fundo escuro.
    await StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light });
    // setBackgroundColor e Android-only; no iOS a chamada e ignorada/rejeitada.
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: THEME_COLOR[resolved] });
    }
  } catch {}
}

export function applyTheme(resolved) {
  const isDark = resolved === 'dark';
  try {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = resolved;
  } catch {}
  applyMetaThemeColor(resolved);
  applyNativeStatusBar(resolved);
}

export { THEME_COLOR };
```

- [ ] **Step 3: Criar ThemeProvider.jsx**

```jsx
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadThemePreference, saveThemePreference } from './themeStorage';
import { applyTheme, resolveTheme } from './applyTheme';

const ThemeContext = createContext({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
});

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('system');
  const [resolved, setResolved] = useState(() => resolveTheme('system'));

  // Carrega a preferencia persistida uma vez.
  useEffect(() => {
    let alive = true;
    loadThemePreference().then((pref) => {
      if (!alive) return;
      setPreferenceState(pref);
      const next = resolveTheme(pref);
      setResolved(next);
      applyTheme(next);
    });
    return () => { alive = false; };
  }, []);

  // Reage a mudanca do tema do sistema, somente quando a preferencia e 'system'.
  useEffect(() => {
    if (preference !== 'system') return;
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyTheme(next);
    };
    // Safari antigo usa addListener
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, [preference]);

  const setPreference = useCallback((pref) => {
    setPreferenceState(pref);
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
    saveThemePreference(pref);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 4: Criar useTheme.js como reexport**

Criar `src/design-system/theme/useTheme.js`:

```js
export { useTheme } from './ThemeProvider';
```

- [ ] **Step 5: Script anti-flash no index.html**

Em `index.html`, como **primeiro** elemento dentro de `<head>`, antes de qualquer `<link>` ou `<script>`:

```html
    <script>
      (function () {
        try {
          var p = localStorage.getItem('tc_theme_preference') || 'system';
          var isDark =
            p === 'dark' ||
            (p === 'system' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches);
          if (isDark) document.documentElement.classList.add('dark');
          document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
        } catch (e) {}
      })();
    </script>
```

- [ ] **Step 6: Montar o ThemeProvider no main.jsx**

Em `src/main.jsx`, adicionar o import junto aos demais:

```js
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
```

E envolver a árvore — `ThemeProvider` fica **acima** de `AuthProvider`, pois tema não depende de sessão:

```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CityProvider>
            <NotificationProvider>
              <MapModeProvider>
              <HelmetProvider>
                <App />
              </HelmetProvider>
              </MapModeProvider>
            </NotificationProvider>
          </CityProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </>
);
```

- [ ] **Step 7: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/design-system/theme/ src/main.jsx index.html
git commit -m "feat(ds): ThemeProvider com status bar nativa e anti-flash"
```

---

### Task 4: Ícones autorais (24 SVGs)

**Files:**
- Create: `src/design-system/icons/Icon.jsx`
- Create: `src/design-system/icons/categories/` (7 arquivos)
- Create: `src/design-system/icons/status/` (4 arquivos)
- Create: `src/design-system/icons/nav/` (5 arquivos)
- Create: `src/design-system/icons/system/` (8 arquivos)
- Create: `src/design-system/icons/index.js`

**Interfaces:**
- Produces:
  - `<Icon name={string} size={number} className={string} title={string} />`
  - `CATEGORY_ICON_MAP: Record<string, string>` — mapeia `category_id` do banco para nome de ícone
  - Nomes válidos: `pothole`, `sewage`, `lighting`, `cleaning`, `greenery`, `waterleak`, `other`, `received`, `analysis`, `execution`, `resolved`, `feed`, `map`, `stats`, `profile`, `newreport`, `trombone`, `support`, `comment`, `share`, `save`, `location`, `ambassador`, `bell`

**Especificação de desenho — obrigatória para todos os 24:**
- `viewBox="0 0 24 24"`, sem `width`/`height` fixos (o wrapper controla)
- `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- Motivo recorrente da marca: arcos concêntricos sugerindo propagação sonora, presentes em `trombone`, `support` e `ambassador`

- [ ] **Step 1: Criar o wrapper Icon.jsx**

```jsx
import React from 'react';

// Registry preenchido pelo index.js para evitar dependencia circular.
const registry = new Map();

export function registerIcons(entries) {
  for (const [name, Component] of Object.entries(entries)) {
    registry.set(name, Component);
  }
}

export function hasIcon(name) {
  return registry.has(name);
}

const Icon = ({ name, size = 24, className = '', title, strokeWidth = 1.75, ...rest }) => {
  const Component = registry.get(name);
  if (!Component) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] icone desconhecido: "${name}"`);
    }
    return null;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {/* Sem title o icone e decorativo (aria-hidden). Com title, o <title>
          nomeia o svg — sem aria-label junto, que duplicaria o texto acessivel. */}
      {title ? <title>{title}</title> : null}
      <Component />
    </svg>
  );
};

export default Icon;
```

- [ ] **Step 2: Criar os 7 ícones de categoria**

Cada arquivo exporta um componente que retorna **apenas os paths** (o `<svg>` vem do wrapper).

`src/design-system/icons/categories/Pothole.jsx` — buraco na via, com marcas de rachadura irradiando:

```jsx
import React from 'react';
export default function Pothole() {
  return (
    <>
      <path d="M3 17.5c0-1.2 1.6-2.2 3.2-2.6 1-.25 1.4-1 1.9-1.9.6-1.1 1.9-1.8 3.6-1.8 2 0 3.1.9 3.9 2 .6.85 1.2 1.4 2.2 1.6 1.9.4 3.2 1.4 3.2 2.7 0 1.9-3.9 3.5-9 3.5s-9-1.6-9-3.5Z" />
      <path d="M8.5 11 7 7.5" />
      <path d="M12 10.5V6" />
      <path d="M15.5 11.3 17.5 8" />
    </>
  );
}
```

`src/design-system/icons/categories/Sewage.jsx` — bueiro com tampa e fluxo:

```jsx
import React from 'react';
export default function Sewage() {
  return (
    <>
      <ellipse cx="12" cy="16.5" rx="8" ry="4.5" />
      <path d="M7 15.2h10" />
      <path d="M8.2 17.9h7.6" />
      <path d="M12 12V8.5" />
      <path d="M9.5 9.8c0-2 1-3.3 2.5-3.3s2.5 1 2.5 2.6" />
      <path d="M14.5 6.2c.9-.7 1.9-.9 2.8-.6" />
    </>
  );
}
```

`src/design-system/icons/categories/Lighting.jsx` — poste com feixe de luz:

```jsx
import React from 'react';
export default function Lighting() {
  return (
    <>
      <path d="M12 21V8" />
      <path d="M12 8c0-2.2 1.6-4 4-4s4 1.6 4 4" />
      <path d="M16.2 8.2h7.6" transform="translate(-3.9 0)" />
      <path d="M14 11.5 10 15" />
      <path d="M18 11.5 22 15" opacity=".55" />
      <path d="M9 21h6" />
    </>
  );
}
```

`src/design-system/icons/categories/Cleaning.jsx` — lixo acumulado com vassoura:

```jsx
import React from 'react';
export default function Cleaning() {
  return (
    <>
      <path d="M5 10h11l-1 10.5H6L5 10Z" />
      <path d="M3.5 10h14" />
      <path d="M9 10V7.5c0-.8.7-1.5 1.5-1.5h1c.8 0 1.5.7 1.5 1.5V10" />
      <path d="M19 4.5 21 13" />
      <path d="M17.6 12.4h4.8l-1 8.1h-2.8l-1-8.1Z" opacity=".55" />
    </>
  );
}
```

`src/design-system/icons/categories/Greenery.jsx` — árvore/poda:

```jsx
import React from 'react';
export default function Greenery() {
  return (
    <>
      <path d="M12 21v-6.5" />
      <path d="M12 14.5c-3.6 0-6.5-2.6-6.5-5.8C5.5 5.5 8.4 3 12 3s6.5 2.5 6.5 5.7c0 3.2-2.9 5.8-6.5 5.8Z" />
      <path d="M12 14.5 8.7 11" />
      <path d="M12 12.2 15.1 9" />
      <path d="M8.5 21h7" />
    </>
  );
}
```

`src/design-system/icons/categories/WaterLeak.jsx` — cano com vazamento:

```jsx
import React from 'react';
export default function WaterLeak() {
  return (
    <>
      <path d="M3 8h11a3 3 0 0 1 3 3v1" />
      <path d="M3 5.5v5" />
      <path d="M17 12h4" />
      <path d="M12 13.5c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.2 2-3.3 2-3.3s2 2.1 2 3.3Z" />
      <path d="M17.5 19.2c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6c0-1 1.6-2.7 1.6-2.7s1.6 1.7 1.6 2.7Z" opacity=".6" />
    </>
  );
}
```

`src/design-system/icons/categories/Other.jsx` — marcador genérico com reticências:

```jsx
import React from 'react';
export default function Other() {
  return (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="8.8" cy="10" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r=".9" fill="currentColor" stroke="none" />
      <circle cx="15.2" cy="10" r=".9" fill="currentColor" stroke="none" />
    </>
  );
}
```

- [ ] **Step 3: Criar os 4 ícones de status**

`src/design-system/icons/status/Received.jsx`:

```jsx
import React from 'react';
export default function Received() {
  return (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8.5 14h7" />
      <circle cx="6.4" cy="7.2" r=".8" fill="currentColor" stroke="none" />
    </>
  );
}
```

`src/design-system/icons/status/Analysis.jsx`:

```jsx
import React from 'react';
export default function Analysis() {
  return (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.2 15.2 21 21" />
      <path d="M8 10.5h5" />
      <path d="M10.5 8v5" opacity=".5" />
    </>
  );
}
```

`src/design-system/icons/status/Execution.jsx`:

```jsx
import React from 'react';
export default function Execution() {
  return (
    <>
      <path d="M4 20h16" />
      <path d="M9.5 20V9.2a1 1 0 0 1 .5-.87l3-1.73a1 1 0 0 1 1.5.87V20" />
      <path d="M14.5 12H19a1 1 0 0 1 1 1v7" />
      <path d="M12 4.5V7" />
    </>
  );
}
```

`src/design-system/icons/status/Resolved.jsx`:

```jsx
import React from 'react';
export default function Resolved() {
  return (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  );
}
```

- [ ] **Step 4: Criar os 5 ícones de navegação**

`src/design-system/icons/nav/Feed.jsx`:

```jsx
import React from 'react';
export default function Feed() {
  return (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M7 8.5h5" />
      <path d="M7 12h10" />
      <path d="M7 15.5h7" />
      <circle cx="16.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  );
}
```

`src/design-system/icons/nav/Map.jsx`:

```jsx
import React from 'react';
export default function Map() {
  return (
    <>
      <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5Z" />
      <path d="M9 4.5v12.7" />
      <path d="M15 6.8v12.7" />
    </>
  );
}
```

`src/design-system/icons/nav/Stats.jsx`:

```jsx
import React from 'react';
export default function Stats() {
  return (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6" />
      <path d="M12 20V6" />
      <path d="M17 20v-9" />
    </>
  );
}
```

`src/design-system/icons/nav/Profile.jsx`:

```jsx
import React from 'react';
export default function Profile() {
  return (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </>
  );
}
```

`src/design-system/icons/nav/NewReport.jsx`:

```jsx
import React from 'react';
export default function NewReport() {
  return (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </>
  );
}
```

- [ ] **Step 5: Criar os 8 ícones de sistema**

`src/design-system/icons/system/Trombone.jsx` — a marca; megafone com arcos de propagação:

```jsx
import React from 'react';
export default function Trombone() {
  return (
    <>
      <path d="M3 10.2v3.6a1.4 1.4 0 0 0 1.4 1.4h2.1l6.6 3.9a.9.9 0 0 0 1.4-.78V5.68a.9.9 0 0 0-1.4-.78L6.5 8.8H4.4A1.4 1.4 0 0 0 3 10.2Z" />
      <path d="M6.5 15.2v3.1a1.6 1.6 0 0 0 1.6 1.6h.6a1.6 1.6 0 0 0 1.6-1.6v-1.2" />
      <path d="M17.6 9.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M20.1 7.2a7 7 0 0 1 0 9.6" opacity=".55" />
    </>
  );
}
```

`src/design-system/icons/system/Support.jsx` — apoio; mão erguida com arcos:

```jsx
import React from 'react';
export default function Support() {
  return (
    <>
      <path d="M7.5 13.5V6.2a1.6 1.6 0 0 1 3.2 0v5.1" />
      <path d="M10.7 11.3V9.4a1.5 1.5 0 0 1 3 0v1.9" />
      <path d="M13.7 11.6v-1a1.5 1.5 0 0 1 3 0v5.3c0 2.7-2 4.9-4.8 4.9-2.4 0-3.7-1-4.7-2.6l-1.9-3a1.4 1.4 0 0 1 2.2-1.7l.7.9" />
    </>
  );
}
```

`src/design-system/icons/system/Comment.jsx`:

```jsx
import React from 'react';
export default function Comment() {
  return (
    <>
      <path d="M20 12.5c0 4-3.6 7.2-8 7.2-1 0-2-.17-2.9-.48L4 21l1.5-3.7A6.9 6.9 0 0 1 4 12.5c0-4 3.6-7.2 8-7.2s8 3.2 8 7.2Z" />
      <path d="M9 11.5h6" />
      <path d="M9 14.5h4" />
    </>
  );
}
```

`src/design-system/icons/system/Share.jsx`:

```jsx
import React from 'react';
export default function Share() {
  return (
    <>
      <circle cx="17.5" cy="6" r="2.6" />
      <circle cx="6.5" cy="12" r="2.6" />
      <circle cx="17.5" cy="18" r="2.6" />
      <path d="m8.9 10.8 6.3-3.5" />
      <path d="m8.9 13.2 6.3 3.5" />
    </>
  );
}
```

`src/design-system/icons/system/Save.jsx`:

```jsx
import React from 'react';
export default function Save() {
  return <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1Z" />;
}
```

`src/design-system/icons/system/Location.jsx`:

```jsx
import React from 'react';
export default function Location() {
  return (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  );
}
```

`src/design-system/icons/system/Ambassador.jsx` — escudo com arcos de propagação:

```jsx
import React from 'react';
export default function Ambassador() {
  return (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 3 8.3 7 9.5 4-1.2 7-5.2 7-9.5V6l-7-3Z" />
      <path d="M9.6 11.3a2.4 2.4 0 0 1 4.8 0" />
      <path d="M7.6 13.2a4.4 4.4 0 0 1 8.8 0" opacity=".55" />
    </>
  );
}
```

`src/design-system/icons/system/Bell.jsx`:

```jsx
import React from 'react';
export default function Bell() {
  return (
    <>
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  );
}
```

- [ ] **Step 6: Criar o barrel index.js**

```js
import Icon, { registerIcons, hasIcon } from './Icon';

import Pothole from './categories/Pothole';
import Sewage from './categories/Sewage';
import Lighting from './categories/Lighting';
import Cleaning from './categories/Cleaning';
import Greenery from './categories/Greenery';
import WaterLeak from './categories/WaterLeak';
import Other from './categories/Other';

import Received from './status/Received';
import Analysis from './status/Analysis';
import Execution from './status/Execution';
import Resolved from './status/Resolved';

import FeedIcon from './nav/Feed';
import MapIcon from './nav/Map';
import Stats from './nav/Stats';
import ProfileIcon from './nav/Profile';
import NewReport from './nav/NewReport';

import Trombone from './system/Trombone';
import Support from './system/Support';
import CommentIcon from './system/Comment';
import ShareIcon from './system/Share';
import SaveIcon from './system/Save';
import LocationIcon from './system/Location';
import Ambassador from './system/Ambassador';
import Bell from './system/Bell';

registerIcons({
  pothole: Pothole,
  sewage: Sewage,
  lighting: Lighting,
  cleaning: Cleaning,
  greenery: Greenery,
  waterleak: WaterLeak,
  other: Other,

  received: Received,
  analysis: Analysis,
  execution: Execution,
  resolved: Resolved,

  feed: FeedIcon,
  map: MapIcon,
  stats: Stats,
  profile: ProfileIcon,
  newreport: NewReport,

  trombone: Trombone,
  support: Support,
  comment: CommentIcon,
  share: ShareIcon,
  save: SaveIcon,
  location: LocationIcon,
  ambassador: Ambassador,
  bell: Bell,
});

// Mapeia category_id do banco para nome de icone.
// Os ids vem de CATEGORY_EMOJIS em src/hooks/useFeed.js.
export const CATEGORY_ICON_MAP = {
  buracos: 'pothole',
  esgoto: 'sewage',
  iluminacao: 'lighting',
  limpeza: 'cleaning',
  poda: 'greenery',
  'vazamento-de-agua': 'waterleak',
  outros: 'other',
};

export function categoryIconName(categoryId) {
  return CATEGORY_ICON_MAP[categoryId] || 'other';
}

// Mapeia status de bronca para nome de icone.
export const STATUS_ICON_MAP = {
  pending: 'received',
  'in-progress': 'execution',
  resolved: 'resolved',
  duplicate: 'other',
};

export { Icon, hasIcon };
export default Icon;
```

- [ ] **Step 7: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/design-system/icons/
git commit -m "feat(ds): 24 icones autorais com wrapper e mapa de categorias"
```

---

### Task 5: Loading autoral do Trombone e Skeleton

**Files:**
- Create: `src/design-system/feedback/TromboneSpinner.jsx`
- Create: `src/design-system/feedback/TromboneSplash.jsx`
- Create: `src/design-system/feedback/Skeleton.jsx`

**Interfaces:**
- Consumes: keyframes de `motion.css` (Task 2), tokens de Task 1.
- Produces:
  - `<TromboneSpinner size={number} className={string} label={string} />`
  - `<TromboneSplash message={string} />`
  - `<Skeleton className={string} rounded={string} />`
  - `<SkeletonText lines={number} />`

- [ ] **Step 1: Criar TromboneSpinner.jsx**

Três arcos concêntricos em cascata — o mesmo gesto de propagação sonora da marca.

```jsx
import React from 'react';

const TromboneSpinner = ({ size = 24, className = '', label = 'Carregando' }) => (
  <span
    role="status"
    aria-label={label}
    className={`inline-flex items-center justify-center ${className}`}
    style={{ width: size, height: size }}
  >
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="7" cy="12" r="1.6" fill="currentColor" className="tc-spin-dot" style={{ animationDelay: '0ms' }} />
      <path
        d="M11.5 8.6a4.6 4.6 0 0 1 0 6.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-spin-arc"
        style={{ animationDelay: '140ms' }}
      />
      <path
        d="M15.4 6a8.2 8.2 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-spin-arc"
        style={{ animationDelay: '280ms' }}
      />
    </svg>
  </span>
);

export default TromboneSpinner;
```

Adicionar ao final de `src/design-system/tokens/motion.css`:

```css
@keyframes tc-arc-pulse {
  0%, 100% { opacity: 0.15; }
  40%      { opacity: 1; }
}

.tc-spin-arc,
.tc-spin-dot {
  animation: tc-arc-pulse 1.1s var(--ease-in-out) infinite;
  transform-origin: 7px 12px;
}

@media (prefers-reduced-motion: reduce) {
  .tc-spin-arc,
  .tc-spin-dot {
    animation: none !important;
    opacity: 0.6 !important;
  }
}
```

- [ ] **Step 2: Criar TromboneSplash.jsx**

O trombone se desenha por `stroke-dashoffset` e as ondas pulsam.

```jsx
import React from 'react';

const TromboneSplash = ({ message = 'Carregando...' }) => (
  <div
    role="status"
    aria-label={message}
    className="flex flex-col items-center justify-center gap-4 py-16"
  >
    <svg viewBox="0 0 24 24" width={72} height={72} fill="none" aria-hidden="true" className="text-brand">
      <path
        d="M3 10.2v3.6a1.4 1.4 0 0 0 1.4 1.4h2.1l6.6 3.9a.9.9 0 0 0 1.4-.78V5.68a.9.9 0 0 0-1.4-.78L6.5 8.8H4.4A1.4 1.4 0 0 0 3 10.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="tc-splash-draw"
        style={{ '--tc-draw-length': 46 }}
      />
      <path
        d="M6.5 15.2v3.1a1.6 1.6 0 0 0 1.6 1.6h.6a1.6 1.6 0 0 0 1.6-1.6v-1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tc-splash-draw"
        style={{ '--tc-draw-length': 11, animationDelay: '260ms' }}
      />
      <path
        d="M17.6 9.4a3.6 3.6 0 0 1 0 5.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-splash-wave"
        style={{ animationDelay: '0ms' }}
      />
      <path
        d="M20.1 7.2a7 7 0 0 1 0 9.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-splash-wave"
        style={{ animationDelay: '220ms' }}
      />
    </svg>
    <p className="text-sm text-content-secondary">{message}</p>
  </div>
);

export default TromboneSplash;
```

Adicionar ao final de `motion.css`:

```css
.tc-splash-draw {
  stroke-dasharray: var(--tc-draw-length, 46);
  stroke-dashoffset: var(--tc-draw-length, 46);
  animation: tc-draw 900ms var(--ease-out) forwards;
}

.tc-splash-wave {
  transform-origin: 14px 12px;
  animation: tc-wave 1.6s var(--ease-out) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .tc-splash-draw {
    stroke-dashoffset: 0 !important;
    animation: none !important;
  }
  .tc-splash-wave {
    animation: none !important;
    opacity: 0.6 !important;
  }
}
```

- [ ] **Step 3: Criar Skeleton.jsx**

Shimmer diagonal usando os tokens de superfície — funciona em ambos os temas.

```jsx
import React from 'react';

export const Skeleton = ({ className = '', rounded = 'rounded-lg', style }) => (
  <div
    aria-hidden="true"
    className={`tc-shimmer ${rounded} ${className}`}
    style={style}
  />
);

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className="h-3.5"
        style={{ width: i === lines - 1 ? '65%' : '100%' }}
      />
    ))}
  </div>
);

export default Skeleton;
```

Adicionar ao final de `motion.css`:

```css
.tc-shimmer {
  background-image: linear-gradient(
    100deg,
    rgb(var(--skeleton-base)) 0%,
    rgb(var(--skeleton-base)) 40%,
    rgb(var(--skeleton-sheen)) 50%,
    rgb(var(--skeleton-base)) 60%,
    rgb(var(--skeleton-base)) 100%
  );
  background-size: 200% 100%;
  animation: tc-shimmer 1.5s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .tc-shimmer {
    animation: none !important;
    background-image: none;
    background-color: rgb(var(--skeleton-base));
  }
}
```

- [ ] **Step 4: Criar PullToRefreshIndicator.jsx**

Indicador visual do gesto de puxar-para-atualizar: as ondas se expandem conforme o progresso. É **apenas o indicador** — não captura o gesto. O feed atual não tem pull-to-refresh implementado; quem for ligar o gesto (fase futura) consome este componente passando `progress` de 0 a 1.

Criar `src/design-system/feedback/PullToRefreshIndicator.jsx`:

```jsx
import React from 'react';

// progress: 0..1 durante o arrasto. refreshing: true enquanto recarrega.
const PullToRefreshIndicator = ({ progress = 0, refreshing = false, size = 32 }) => {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: size, opacity: refreshing ? 1 : p }}
      role="status"
      aria-label={refreshing ? 'Atualizando' : 'Puxe para atualizar'}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className="text-brand">
        <circle cx="7" cy="12" r="1.6" fill="currentColor" />
        <path
          d="M11.5 8.6a4.6 4.6 0 0 1 0 6.8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className={refreshing ? 'tc-spin-arc' : ''}
          style={refreshing ? { animationDelay: '140ms' } : { opacity: p >= 0.5 ? 1 : 0.2 }}
        />
        <path
          d="M15.4 6a8.2 8.2 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className={refreshing ? 'tc-spin-arc' : ''}
          style={refreshing ? { animationDelay: '280ms' } : { opacity: p >= 0.9 ? 1 : 0.2 }}
        />
      </svg>
    </div>
  );
};

export default PullToRefreshIndicator;
```

Adicionar ao barrel `src/design-system/index.js` (criado na Task 6):

```js
export { default as PullToRefreshIndicator } from './feedback/PullToRefreshIndicator';
```

- [ ] **Step 5: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/design-system/feedback/ src/design-system/tokens/motion.css
git commit -m "feat(ds): loading autoral do trombone, skeleton e pull-to-refresh"
```

---

### Task 6: Primitivos e barrel do design system

**Files:**
- Create: `src/design-system/primitives/Surface.jsx`
- Create: `src/design-system/primitives/StatusBadge.jsx`
- Create: `src/design-system/primitives/SignalChip.jsx`
- Create: `src/design-system/primitives/EmptyState.jsx`
- Create: `src/design-system/index.js`

**Interfaces:**
- Consumes: tokens (Task 1-2), `Icon` (Task 4), `TromboneSpinner` (Task 5).
- Produces:
  - `<Surface as={string} elevation={0|1|2|3} className={string}>`
  - `<StatusBadge status={'pending'|'in-progress'|'resolved'|'duplicate'} size={'sm'|'md'} withIcon={boolean} />`
  - `STATUS_LABEL: Record<string, string>`
  - `<SignalChip variant={'hot'|'rising'|'fresh'|'urgent'} label={string} />`
  - `<EmptyState icon={string} title={string} description={string} action={ReactNode} />`

- [ ] **Step 1: Criar Surface.jsx**

```jsx
import React from 'react';

const ELEVATION = {
  0: '',
  1: 'shadow-elevation-1',
  2: 'shadow-elevation-2',
  3: 'shadow-elevation-3',
};

const Surface = React.forwardRef(function Surface(
  { as: Tag = 'div', elevation = 1, className = '', children, ...rest },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={`bg-surface-raised border border-edge-subtle rounded-2xl ${ELEVATION[elevation] ?? ELEVATION[1]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Surface;
```

- [ ] **Step 2: Criar StatusBadge.jsx**

Fonte única da verdade para status. Substitui o `STATUS_CONFIG` hoje em `src/components/FeedCard.jsx:144-161` e será reutilizado nas Fases 2 e 5.

```jsx
import React from 'react';
import Icon from '@/design-system/icons';

export const STATUS_LABEL = {
  pending: 'Pendente',
  'in-progress': 'Em andamento',
  resolved: 'Resolvida',
  duplicate: 'Duplicada',
};

const STATUS_STYLE = {
  pending: 'bg-status-pendingBg text-status-pendingFg border-status-pendingBorder',
  'in-progress': 'bg-status-progressBg text-status-progressFg border-status-progressBorder',
  resolved: 'bg-status-resolvedBg text-status-resolvedFg border-status-resolvedBorder',
  duplicate: 'bg-status-duplicateBg text-status-duplicateFg border-status-duplicateBorder',
};

const STATUS_ICON = {
  pending: 'received',
  'in-progress': 'execution',
  resolved: 'resolved',
  duplicate: 'other',
};

const SIZE = {
  sm: 'text-2xs px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
};

const StatusBadge = ({ status = 'pending', size = 'sm', withIcon = false, className = '' }) => {
  const key = STATUS_STYLE[status] ? status : 'pending';
  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded-full border whitespace-nowrap ${STATUS_STYLE[key]} ${SIZE[size] || SIZE.sm} ${className}`}
    >
      {withIcon && <Icon name={STATUS_ICON[key]} size={size === 'md' ? 14 : 12} />}
      {STATUS_LABEL[key]}
    </span>
  );
};

export default StatusBadge;
```

- [ ] **Step 3: Criar SignalChip.jsx**

```jsx
import React from 'react';

const VARIANT = {
  hot:    'bg-signal-hotBg text-signal-hotFg',
  rising: 'bg-signal-risingBg text-signal-risingFg',
  fresh:  'bg-signal-freshBg text-signal-freshFg',
  urgent: 'bg-status-pendingBg text-status-pendingFg border border-status-pendingBorder',
};

const SignalChip = ({ variant = 'hot', label, className = '' }) => (
  <span
    className={`inline-flex items-center text-2xs font-bold tracking-tight px-2 py-1 rounded-full shadow-elevation-1 ${VARIANT[variant] || VARIANT.hot} ${className}`}
  >
    {label}
  </span>
);

export default SignalChip;
```

- [ ] **Step 4: Criar EmptyState.jsx**

```jsx
import React from 'react';
import Icon from '@/design-system/icons';

const EmptyState = ({ icon = 'trombone', title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
    <div className="w-20 h-20 rounded-full bg-surface-sunken flex items-center justify-center mb-4 text-content-tertiary">
      <Icon name={icon} size={36} />
    </div>
    <h3 className="font-display font-bold text-lg text-content-primary mb-2">{title}</h3>
    {description && (
      <p className="text-sm text-content-secondary max-w-xs mb-6">{description}</p>
    )}
    {action}
  </div>
);

export default EmptyState;
```

- [ ] **Step 5: Criar o barrel público**

Criar `src/design-system/index.js`:

```js
export { default as Icon, CATEGORY_ICON_MAP, STATUS_ICON_MAP, categoryIconName } from './icons';
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export { resolveTheme, applyTheme } from './theme/applyTheme';
export { default as TromboneSpinner } from './feedback/TromboneSpinner';
export { default as TromboneSplash } from './feedback/TromboneSplash';
export { default as PullToRefreshIndicator } from './feedback/PullToRefreshIndicator';
export { Skeleton, SkeletonText } from './feedback/Skeleton';
export { default as Surface } from './primitives/Surface';
export { default as StatusBadge, STATUS_LABEL } from './primitives/StatusBadge';
export { default as SignalChip } from './primitives/SignalChip';
export { default as EmptyState } from './primitives/EmptyState';
```

- [ ] **Step 6: Verificar build**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/design-system/
git commit -m "feat(ds): primitivos Surface, StatusBadge, SignalChip e EmptyState"
```

---

### Task 7: Script de verificação de contraste

**Files:**
- Create: `scripts/check-contrast.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/design-system/tokens/semantic.css`, `src/design-system/tokens/primitives.css`.
- Produces: script `npm run check:contrast`. Sai com código 1 se algum par reprovar.

- [ ] **Step 1: Criar o script**

```js
#!/usr/bin/env node
// Valida os pares texto/fundo dos tokens semanticos contra WCAG AA,
// nos temas claro e escuro. Sem dependencias externas.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = resolve(__dirname, '../src/design-system/tokens');

const readCss = (name) => readFileSync(resolve(TOKENS_DIR, name), 'utf8');

// Extrai as declaracoes de um bloco de seletor especifico.
function extractBlock(css, selector) {
  const out = {};
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(css)) !== null) {
    for (const line of m[1].split(';')) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || rest.length === 0) continue;
      const key = rawKey.trim();
      if (!key.startsWith('--')) continue;
      out[key] = rest.join(':').trim();
    }
  }
  return out;
}

const primitives = extractBlock(readCss('primitives.css'), ':root');
const semanticCss = readCss('semantic.css');
const semanticLight = extractBlock(semanticCss, ':root');
const semanticDark = extractBlock(semanticCss, '.dark');

// Resolve var(--x) ate chegar num triplete RGB.
function resolveRgb(value, scope, depth = 0) {
  if (!value || depth > 10) return null;
  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (varMatch) {
    const key = varMatch[1];
    const next = scope[key] ?? primitives[key];
    return resolveRgb(next, scope, depth + 1);
  }
  const nums = value.trim().split(/\s+/).map(Number);
  if (nums.length === 3 && nums.every((n) => Number.isFinite(n))) return nums;
  return null;
}

function relativeLuminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// [nome, tokenTexto, tokenFundo, razaoMinima]
// 4.5 para corpo, 3.0 para texto grande / elementos nao textuais.
const PAIRS = [
  ['texto primario sobre base',        '--text-primary',      '--surface-base',      4.5],
  ['texto primario sobre elevado',     '--text-primary',      '--surface-raised',    4.5],
  ['texto secundario sobre base',      '--text-secondary',    '--surface-base',      4.5],
  ['texto secundario sobre elevado',   '--text-secondary',    '--surface-raised',    4.5],
  ['texto terciario sobre elevado',    '--text-tertiary',     '--surface-raised',    3.0],
  ['marca sobre elevado',              '--brand',             '--surface-raised',    3.0],
  ['texto sobre marca',                '--text-on-brand',     '--brand',             4.5],
  ['perigo sobre elevado',             '--danger',            '--surface-raised',    4.5],
  ['marca sutil',                      '--brand-subtle-fg',   '--brand-subtle-bg',   4.5],
  ['status pendente',                  '--status-pending-fg', '--status-pending-bg', 4.5],
  ['status em andamento',              '--status-progress-fg','--status-progress-bg',4.5],
  ['status resolvido',                 '--status-resolved-fg','--status-resolved-bg',4.5],
  ['status duplicado',                 '--status-duplicate-fg','--status-duplicate-bg',4.5],
  ['sinal quente',                     '--signal-hot-fg',     '--signal-hot-bg',     3.0],
  ['sinal subindo',                    '--signal-rising-fg',  '--signal-rising-bg',  3.0],
  ['sinal recente',                    '--signal-fresh-fg',   '--signal-fresh-bg',   3.0],
];

let failures = 0;
let checked = 0;

for (const [themeName, scope] of [['claro', semanticLight], ['escuro', semanticDark]]) {
  console.log(`\nTema ${themeName}`);
  for (const [label, fgToken, bgToken, min] of PAIRS) {
    const fg = resolveRgb(scope[fgToken] ?? semanticLight[fgToken], scope);
    const bg = resolveRgb(scope[bgToken] ?? semanticLight[bgToken], scope);
    if (!fg || !bg) {
      console.log(`  ?  ${label}: nao foi possivel resolver ${fgToken} / ${bgToken}`);
      failures += 1;
      continue;
    }
    checked += 1;
    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'OK ' : 'FAIL'} ${label}: ${ratio.toFixed(2)}:1 (minimo ${min}:1)`
    );
  }
}

console.log(`\n${checked} pares verificados, ${failures} reprovados.`);
process.exit(failures > 0 ? 1 : 0);
```

- [ ] **Step 2: Adicionar o script ao package.json**

Em `package.json`, dentro de `"scripts"`, após `"lint"`:

```json
    "check:contrast": "node scripts/check-contrast.mjs",
```

- [ ] **Step 3: Rodar e corrigir reprovações**

```bash
npm run check:contrast
```

Esperado: todos os pares aprovados, saída `0 reprovados`.

Se algum par reprovar, ajustar o token correspondente em `src/design-system/tokens/semantic.css` — escurecer o texto (tema claro) ou clarear (tema escuro) trocando o degrau da paleta. Após qualquer ajuste em um token semântico, atualizar o par HSL correspondente no bloco de ponte shadcn. Repetir até zerar.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-contrast.mjs package.json src/design-system/tokens/semantic.css
git commit -m "feat(ds): script de verificacao de contraste WCAG AA"
```

---

### Task 8: Seletor de tema no Perfil

**Files:**
- Modify: `src/pages/ProfilePage.jsx`

**Interfaces:**
- Consumes: `useTheme` (Task 3), `Icon` (Task 4).

- [ ] **Step 1: Localizar o ponto de inserção**

```bash
grep -n "Preferências\|preferencias\|Configurações\|Sair\|logout" src/pages/ProfilePage.jsx | head -20
```

Inserir a seção de aparência antes do bloco de logout/sair. Se a página usar cartões de seção, seguir o mesmo padrão visual dos vizinhos.

- [ ] **Step 2: Adicionar o seletor**

Adicionar aos imports de `src/pages/ProfilePage.jsx`:

```jsx
import { useTheme } from '@/design-system/theme/ThemeProvider';
import Icon from '@/design-system/icons';
```

E o bloco de UI, dentro do componente (antes do `return`, adicionar `const { preference, setPreference } = useTheme();`):

```jsx
        {/* Aparencia */}
        <div className="bg-surface-raised border border-edge-subtle rounded-2xl p-4">
          <h3 className="font-display font-bold text-base text-content-primary mb-1">
            Aparência
          </h3>
          <p className="text-xs text-content-secondary mb-3">
            Escolha como o app deve ser exibido.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'light', label: 'Claro' },
              { key: 'dark', label: 'Escuro' },
              { key: 'system', label: 'Automático' },
            ].map((opt) => {
              const active = preference === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPreference(opt.key)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-brand bg-brand-subtleBg text-brand-subtleFg'
                      : 'border-edge-subtle bg-surface-base text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
```

- [ ] **Step 3: Verificar build e lint**

```bash
npm run build && npm run lint
```

Esperado: build conclui; lint sem erro novo. O projeto usa `--max-warnings 0`; se o lint acusar avisos pré-existentes em outros arquivos, não corrigi-los aqui — apenas garantir que nenhum novo foi introduzido nos arquivos tocados.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProfilePage.jsx
git commit -m "feat(ds): seletor de tema claro/escuro/automatico no perfil"
```

---

# FASE 1 — FEED

### Task 9: Mockup HTML do feed

**Files:**
- Create: `docs/mockups/feed.html`

**Interfaces:**
- Consumes: valores de token de Task 1 (copiados como literais — o mockup é standalone).

- [ ] **Step 1: Criar o mockup**

Arquivo HTML único, sem dependências, com os dois temas lado a lado e as duas densidades de card para comparação. Copiar os valores dos tokens de `semantic.css` como literais.

O mockup deve conter, em cada tema:
- Header com marca (SVG do trombone) e seletor de cidade
- Título "Feed de denúncias" e botão "Nova denúncia"
- Barra de tabs com 3 tabs (Recentes / Em alta / Resolvidas), a primeira ativa
- Card de bronca na **densidade enxuta**: mídia, `StatusBadge`, no máximo 1 `SignalChip`, título, categoria+tempo, endereço, barra de engajamento, faixa "Esteve no local?"
- Card de bronca na **densidade completa** (a atual), para comparação lado a lado
- Um skeleton com shimmer
- O spinner do trombone

Estrutura mínima:

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mockup - Feed - Trombone Cidadao</title>
  <style>
    :root {
      --surface-base: 245 245 244;
      --surface-raised: 255 255 255;
      --surface-sunken: 231 230 228;
      --text-primary: 26 25 24;
      --text-secondary: 87 84 81;
      --border-subtle: 231 230 228;
      --brand: 217 45 32;
      --brand-subtle-bg: 254 243 242;
      --brand-subtle-fg: 180 35 24;
      --status-pending-bg: 254 243 199;
      --status-pending-fg: 180 83 9;
      --status-pending-border: 253 230 138;
      --signal-hot-bg: 217 45 32;
      --signal-hot-fg: 255 255 255;
      --elevation-1: 0 1px 2px rgb(15 15 17 / .06);
    }
    .dark {
      --surface-base: 15 15 17;
      --surface-raised: 26 25 24;
      --surface-sunken: 32 31 30;
      --text-primary: 250 250 249;
      --text-secondary: 168 165 161;
      --border-subtle: 41 39 38;
      --brand: 249 112 102;
      --brand-subtle-bg: 85 15 12;
      --brand-subtle-fg: 253 162 155;
      --status-pending-bg: 69 26 3;
      --status-pending-fg: 252 211 77;
      --status-pending-border: 120 53 15;
      --signal-hot-bg: 240 72 62;
      --signal-hot-fg: 255 255 255;
      --elevation-1: 0 1px 2px rgb(0 0 0 / .4);
    }
    /* Preencher com os estilos do mockup usando rgb(var(--token)). */
  </style>
</head>
<body>
  <!-- Dois paineis lado a lado: um com class="" e outro com class="dark" -->
</body>
</html>
```

Preencher com o layout completo. Regra: **todo valor de cor no mockup deve vir de `rgb(var(--token))`** — nenhuma cor literal fora do bloco `:root`/`.dark`. Isso garante que o mockup e o app usem a mesma paleta.

- [ ] **Step 2: Verificar visualmente**

Abrir `docs/mockups/feed.html` no navegador. Conferir que os dois painéis renderizam, que o painel escuro não tem texto ilegível e que as duas densidades são distinguíveis.

- [ ] **Step 3: Commit**

```bash
git add docs/mockups/feed.html
git commit -m "docs(redesign): mockup do feed em tema claro e escuro"
```

---

### Task 10: Extrair `useCreateReport`

**Files:**
- Create: `src/hooks/useCreateReport.js`
- Modify: `src/pages/FeedPage.jsx`

**Interfaces:**
- Produces: `useCreateReport({ onCreated }): { createReport, submittedCount }`
  - `createReport(newReportData, uploadMediaCallback): Promise<void>`
  - `submittedCount: number`

**Regra desta task: nenhuma mudança visual.** Só movimentação de código.

- [ ] **Step 1: Criar o hook**

Move a lógica de `src/pages/FeedPage.jsx:227-330` sem alterar comportamento. O componente `AnimatedNumber` (hoje em `FeedPage.jsx:54-81`) vem junto, pois só é usado aqui.

```js
import { useState, useCallback, useEffect, useRef } from 'react';
import React from 'react';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const STORAGE_KEY = 'tc_reports_submitted_count';

const readInt = (value, fallback = 0) => {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return fallback;
};

const AnimatedNumber = ({ value, durationMs = 650, className = '' }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, value]);

  return <span className={className}>{display}</span>;
};

const normPole = (raw) =>
  String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

export function useCreateReport({ onCreated } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submittedCount, setSubmittedCount] = useState(() => {
    try {
      return readInt(localStorage.getItem(STORAGE_KEY), 0);
    } catch {
      return 0;
    }
  });

  const createReport = useCallback(
    async (newReportData, uploadMediaCallback) => {
      if (!user) return;
      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
        city_id: geocodedCityId,
      } = newReportData;

      // city_id vem SEMPRE do marcador (resolvido no ReportModal). Nunca usar a
      // cidade do filtro ativo nem a do perfil do usuario — a bronca pertence ao
      // local marcado no mapa.
      const cityId = geocodedCityId ?? null;

      const { data, error } = await supabase
        .from('reports')
        .insert({
          title,
          description,
          category_id: category,
          address,
          location: `POINT(${location.lng} ${location.lat})`,
          author_id: user.id,
          protocol: `TROMB-${Date.now()}`,
          pole_number: category === 'iluminacao' ? pole_number : null,
          pole_id: category === 'iluminacao' ? pole_id : null,
          reported_post_identifier:
            category === 'iluminacao'
              ? normPole(reported_post_identifier) || normPole(pole_number) || null
              : null,
          reported_plate:
            category === 'iluminacao'
              ? normPole(reported_plate) || normPole(pole_number) || null
              : null,
          reported_pole_distance_m:
            category === 'iluminacao' ? reported_pole_distance_m : null,
          issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
          is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
          is_anonymous: !!is_anonymous,
          status: 'pending',
          moderation_status: user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
          city_id: cityId,
        })
        .select('id')
        .single();

      if (error) {
        toast({ title: 'Erro ao criar bronca', description: error.message, variant: 'destructive' });
        return;
      }

      if (uploadMediaCallback) {
        try {
          await uploadMediaCallback(data.id);
        } catch (uploadError) {
          await supabase.from('reports').delete().eq('id', data.id);
          throw uploadError;
        }
      }

      const nextSubmitted = submittedCount + 1;
      setSubmittedCount(nextSubmitted);
      try {
        localStorage.setItem(STORAGE_KEY, String(nextSubmitted));
      } catch {}

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {}
      }
      try {
        confetti({
          particleCount: 90,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'],
        });
      } catch {}

      const isPublishedDirectly = user?.is_admin || user?.is_master;
      toast({
        title: 'Você acabou de ajudar sua cidade 🔥',
        description: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{isPublishedDirectly ? 'Bronca publicada.' : 'Bronca enviada para moderação — após aprovada, estará disponível no feed.'}</span>
            <span className="text-muted-foreground">
              Total: <AnimatedNumber value={nextSubmitted} className="font-semibold text-foreground" />
            </span>
          </span>
        ),
        duration: 5500,
      });

      onCreated?.(data.id);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [submittedCount, user, toast, onCreated]
  );

  return { createReport, submittedCount };
}

export default useCreateReport;
```

Como o arquivo contém JSX, salvar como `src/hooks/useCreateReport.jsx` (não `.js`) — o Vite só transforma JSX em arquivos `.jsx`.

- [ ] **Step 2: Consumir no FeedPage**

Em `src/pages/FeedPage.jsx`:

Remover o componente `AnimatedNumber` (linhas 54-81), a constante `STORAGE_KEYS` (28-30), o helper `readInt` (32-36), o estado `submittedCount` (102-108) e a função `handleCreateReport` (227-330).

Remover os imports que ficaram sem uso: `confetti`, `Haptics`, `ImpactStyle`.
Manter `Capacitor` e `Share` — ainda são usados por `handleInvite`.

Adicionar o import:

```js
import { useCreateReport } from '@/hooks/useCreateReport';
```

E dentro do componente:

```js
  const { createReport } = useCreateReport({
    onCreated: () => setShowReportModal(false),
  });
```

Atualizar o uso no modal:

```jsx
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={createReport}
        />
      )}
```

- [ ] **Step 3: Verificar build e lint**

```bash
npm run build && npm run lint
```

Esperado: build conclui; nenhum erro novo de lint.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCreateReport.jsx src/pages/FeedPage.jsx
git commit -m "refactor(feed): extrai useCreateReport do FeedPage"
```

---

### Task 11: Extrair `FeedCitySelector`, `FeedTabs`, `FeedStates`, `FeedWelcomeCard`, `FeedNewReportsBanner` e `useFeedRealtime`

**Files:**
- Create: `src/components/feed/FeedCitySelector.jsx`
- Create: `src/components/feed/FeedTabs.jsx`
- Create: `src/components/feed/FeedStates.jsx`
- Create: `src/components/feed/FeedWelcomeCard.jsx`
- Create: `src/components/feed/FeedNewReportsBanner.jsx`
- Create: `src/hooks/useFeedRealtime.js`
- Modify: `src/pages/FeedPage.jsx`

**Interfaces:**
- Produces:
  - `<FeedCitySelector />` — sem props; usa `useCity` internamente
  - `<FeedTabs tabs={Array<{key,label}>} activeTab={string} onChange={(key)=>void} />`
  - `FEED_TABS: Array<{key: string, label: string}>`
  - `<FeedStates isOffline={boolean} isSlow={boolean} error={object|null} hasReports={boolean} onRetry={(opts)=>void} />`
  - `<FeedLoadMoreError error={object|null} onRetry={()=>void} />`
  - `<FeedWelcomeCard onCreateReport={()=>void} onInvite={()=>void} />`
  - `<FeedNewReportsBanner count={number} onRefresh={()=>void} />`
  - `useFeedRealtime(): { newCount, resetNewCount }`

**Regra desta task: nenhuma mudança visual.** As classes CSS são copiadas literalmente do `FeedPage.jsx` atual.

- [ ] **Step 1: Criar FeedCitySelector.jsx**

Move `src/pages/FeedPage.jsx:377-518` integralmente, junto com os estados `cityPickerOpen`, `citySearch`, `gpsLoading`, as refs `cityPickerRef`/`citiesRef` e o efeito de click-outside (206-219). Copiar as classes CSS sem alteração.

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, ChevronDown, LocateFixed, Globe, Check, X } from 'lucide-react';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';
import { useToast } from '@/components/ui/use-toast';

const FeedCitySelector = () => {
  const { activeCityId, activeCityName, setActiveCity, cities, loadingCities } = useCity();
  const { toast } = useToast();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const cityPickerRef = useRef(null);
  // Ref sempre atualizada para evitar closure stale quando cities ainda nao carregou
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  useEffect(() => {
    if (!cityPickerOpen) return;
    const handler = (e) => {
      if (cityPickerRef.current && !cityPickerRef.current.contains(e.target)) {
        setCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [cityPickerOpen]);

  const handleGps = () => {
    if (!navigator.geolocation || gpsLoading) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          if (found) {
            setActiveCity(found.id);
            setCityPickerOpen(false);
          } else {
            const listSize = citiesRef.current.length;
            toast({
              title: 'Cidade não encontrada',
              description: listSize === 0
                ? 'Lista de cidades ainda carregando. Aguarde e tente novamente.'
                : name ? `"${name}" não está no cadastro. Escolha manualmente.` : 'Escolha manualmente na lista.',
              duration: 4000,
            });
          }
        } catch {
          toast({ title: 'Erro ao obter localização', description: 'Verifique sua conexão e tente novamente.', duration: 4000 });
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        const denied = err?.code === 1;
        toast({
          title: denied ? 'Localização bloqueada' : 'Não foi possível obter localização',
          description: denied
            ? 'Permita o acesso à localização nas configurações do navegador.'
            : 'Verifique se a localização está ativada e tente novamente.',
          duration: 5000,
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const filteredCities = cities
    .filter(c => {
      if (!citySearch.trim()) return true;
      const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
      const term = norm(citySearch.trim());
      return norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term.toLowerCase());
    })
    .slice(0, citySearch.trim() ? undefined : 50);

  return (
    <div className="pt-2 pb-1 relative" ref={cityPickerRef}>
      <button
        type="button"
        onClick={() => { setCityPickerOpen(v => !v); setCitySearch(''); }}
        className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
      >
        <MapPin className="h-3 w-3 shrink-0 text-primary" />
        <span className="max-w-[180px] truncate">
          {activeCityName ?? 'Todas as cidades'}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${cityPickerOpen ? 'rotate-180' : ''}`} />
      </button>

      {cityPickerOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Buscar cidade..."
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {citySearch && (
              <button type="button" onClick={() => setCitySearch('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              disabled={gpsLoading}
              onClick={handleGps}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted transition-colors"
            >
              {gpsLoading
                ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                : <LocateFixed className="h-4 w-4 shrink-0" />
              }
              {gpsLoading ? 'Detectando...' : 'Usar minha localização'}
            </button>

            <button
              type="button"
              onClick={() => { setActiveCity(null); setCityPickerOpen(false); setCitySearch(''); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted border-t border-border/50 transition-colors"
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              Todas as cidades
              {!activeCityId && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>

            {loadingCities ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              filteredCities.map(city => {
                const isActive = String(activeCityId) === String(city.id);
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => { setActiveCity(city.id); setCityPickerOpen(false); setCitySearch(''); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted border-t border-border/50 transition-colors ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                  >
                    <span className="flex-1 truncate">
                      {city.name}
                      {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">{city.state.uf}</span>}
                    </span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedCitySelector;
```

Os `console.log` de debug do GPS (linhas 428 e 430 do original) foram removidos.

- [ ] **Step 2: Criar FeedTabs.jsx**

```jsx
import React from 'react';

export const FEED_TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'trending', label: 'Em alta' },
  { key: 'resolved', label: 'Resolvidas' },
];

const FeedTabs = ({ tabs = FEED_TABS, activeTab, onChange }) => (
  <div className="flex gap-1 py-2">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
          activeTab === tab.key
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default FeedTabs;
```

- [ ] **Step 3: Criar FeedStates.jsx**

Consolida os blocos de `FeedPage.jsx:631-684` (banners) e `749-764` (erro de paginação).

```jsx
import React from 'react';
import { Loader2, WifiOff, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Banners exibidos acima da lista quando ja existem broncas carregadas.
export const FeedStates = ({ isOffline, isSlow, error, hasReports, onRetry }) => (
  <>
    {isOffline && hasReports && (
      <Alert variant="destructive" className="mb-4">
        <WifiOff className="h-4 w-4" />
        <div>
          <AlertTitle>Sem conexão</AlertTitle>
          <AlertDescription>Conecte-se à internet para carregar o feed.</AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => onRetry({ preserve: true })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )}

    {isSlow && !isOffline && (
      <Alert className="mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <div>
          <AlertTitle>Conexão lenta</AlertTitle>
          <AlertDescription>
            Estamos tentando carregar as broncas. Se demorar, tente novamente.
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => onRetry({ preserve: hasReports })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )}

    {error && hasReports && !isOffline && (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <div>
          <AlertTitle>Falha ao atualizar o feed</AlertTitle>
          <AlertDescription>
            {error.message}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => onRetry({ preserve: true })}>
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </div>
      </Alert>
    )}
  </>
);

// Estado de falha total, quando nao ha nenhuma bronca carregada.
export const FeedFatalState = ({ isOffline, error, onRetry }) => {
  if (!isOffline && !error) return null;
  return (
    <div className="py-10">
      <Alert variant="destructive">
        <WifiOff className="h-4 w-4" />
        <div>
          <AlertTitle>{isOffline ? 'Sem conexão' : 'Não foi possível carregar'}</AlertTitle>
          <AlertDescription>
            {isOffline ? 'Conecte-se à internet para carregar o feed.' : error?.message}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => onRetry({ preserve: false })}>
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </div>
      </Alert>
    </div>
  );
};

export const FeedLoadMoreError = ({ error, onRetry }) => {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <div>
        <AlertTitle>Falha ao carregar mais broncas</AlertTitle>
        <AlertDescription>
          {error.message}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export default FeedStates;
```

- [ ] **Step 4: Criar FeedWelcomeCard.jsx**

Move `FeedPage.jsx:520-582`. **O atalho do Painel do Embaixador é obrigatório** — não removê-lo.

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, UserPlus, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, onInvite }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="mb-4 p-3">
      <div className="rounded-2xl border border-red-100 bg-[#FEF2F2] px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-primary uppercase">
                Bem-vindo
              </p>
            </div>
            <p className="mt-1 text-base font-extrabold tracking-tight text-foreground">
              Ajude a melhorar a cidade
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cadastre broncas, seja embaixador e convide alguém para contribuir.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onCreateReport}
            className="rounded-2xl border-2 border-primary/30 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-primary/50 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              Cadastre sua bronca
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')}
            className="rounded-2xl border-2 border-orange-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-orange-300 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              {user?.is_ambassador ? 'Painel do Embaixador' : 'Se torne embaixador'}
            </p>
          </button>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-2xl border-2 border-blue-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-blue-300 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              Convide alguém
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedWelcomeCard;
```

- [ ] **Step 5: Criar FeedNewReportsBanner.jsx**

Move `FeedPage.jsx:607-627`.

```jsx
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FeedNewReportsBanner = ({ count, onRefresh }) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.div
        key="new-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="sticky top-[52px] z-10 flex justify-center pt-2 px-3"
      >
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg"
        >
          <RefreshCw size={13} />
          {count === 1
            ? '1 nova bronca — atualizar'
            : `${count} novas broncas — atualizar`}
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

export default FeedNewReportsBanner;
```

- [ ] **Step 6: Criar useFeedRealtime.js**

Move `FeedPage.jsx:130-154`.

```js
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useFeedRealtime() {
  const [newCount, setNewCount] = useState(0);
  const loadedAtRef = useRef(new Date().toISOString());

  useEffect(() => {
    const channel = supabase
      .channel('feed-new-reports')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
          filter: `moderation_status=eq.approved`,
        },
        (payload) => {
          if (payload.new?.created_at >= loadedAtRef.current) {
            setNewCount((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resetNewCount = useCallback(() => {
    setNewCount(0);
    loadedAtRef.current = new Date().toISOString();
  }, []);

  return { newCount, resetNewCount };
}

export default useFeedRealtime;
```

- [ ] **Step 7: Reescrever FeedPage.jsx como composição**

Substituir o conteúdo inteiro de `src/pages/FeedPage.jsx` por:

```jsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCity } from '@/contexts/CityContext';
import { useCreateReport } from '@/hooks/useCreateReport';
import { useFeedRealtime } from '@/hooks/useFeedRealtime';
import FeedCard from '@/components/FeedCard';
import FeedSkeleton from '@/components/FeedSkeleton';
import FeedEmptyState from '@/components/FeedEmptyState';
import ReportModal from '@/components/ReportModal';
import FeedCitySelector from '@/components/feed/FeedCitySelector';
import FeedTabs, { FEED_TABS } from '@/components/feed/FeedTabs';
import FeedStates, { FeedFatalState, FeedLoadMoreError } from '@/components/feed/FeedStates';
import FeedWelcomeCard from '@/components/feed/FeedWelcomeCard';
import FeedNewReportsBanner from '@/components/feed/FeedNewReportsBanner';
import { useToast } from '@/components/ui/use-toast';

const getInviteUrl = () => {
  const envUrl = import.meta.env.VITE_APP_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');

  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (origin && origin.includes('localhost')) return origin;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  return supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : 'https://trombonecidadao.com.br';
};

export default function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { activeCityId } = useCity();

  const [activeTab, setActiveTab] = useState('recent');
  const [showReportModal, setShowReportModal] = useState(false);
  const [recentCreatedId, setRecentCreatedId] = useState(null);
  const recentCreatedTimerRef = useRef(null);
  const preloadedImagesRef = useRef(new Set());

  const {
    reports, loading, loadingMore, hasMore, loadMore, refresh,
    toggleUpvote, error, isSlow, loadMoreError, isSlowMore,
  } = useFeed(activeTab, activeCityId);

  const { newCount, resetNewCount } = useFeedRealtime();
  const { createReport } = useCreateReport({ onCreated: () => setShowReportModal(false) });

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const sentinelRef = useInfiniteScroll(loadMore, {
    enabled: !loading && !loadingMore && hasMore && !loadMoreError,
  });

  const handleRefresh = useCallback(() => {
    resetNewCount();
    refresh({ preserve: true });
  }, [refresh, resetNewCount]);

  useEffect(() => {
    const onReportsUpdated = (e) => {
      const createdId = e?.detail?.id || null;
      setActiveTab('recent');
      resetNewCount();
      refresh({ preserve: true });
      if (createdId) {
        setRecentCreatedId(createdId);
        if (recentCreatedTimerRef.current) clearTimeout(recentCreatedTimerRef.current);
        recentCreatedTimerRef.current = setTimeout(() => setRecentCreatedId(null), 8000);
      }
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {}
    };

    window.addEventListener('reports-updated', onReportsUpdated);
    return () => {
      window.removeEventListener('reports-updated', onReportsUpdated);
      if (recentCreatedTimerRef.current) clearTimeout(recentCreatedTimerRef.current);
    };
  }, [refresh, resetNewCount]);

  // Pre-carrega as primeiras capas para reduzir o tempo ate a imagem aparecer.
  useEffect(() => {
    const urls = (reports || []).map((r) => r?.coverImage).filter(Boolean).slice(0, 6);
    for (const url of urls) {
      if (preloadedImagesRef.current.has(url)) continue;
      preloadedImagesRef.current.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [reports]);

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
    resetNewCount();
    setRecentCreatedId(null);
  }, [resetNewCount]);

  const handleOpenCreate = useCallback(() => setShowReportModal(true), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const shouldOpen = params.get('criar_bronca') === '1' || params.get('criar_bronca') === 'true';
    if (!shouldOpen) return;
    setShowReportModal(true);
    try {
      params.delete('criar_bronca');
      const next = params.toString();
      navigate(`${location.pathname || '/'}${next ? `?${next}` : ''}`, { replace: true });
    } catch {}
  }, [location.pathname, location.search, navigate]);

  const handleInvite = useCallback(async () => {
    const url = getInviteUrl();
    const title = 'Trombone Cidadão';
    const text = 'Vem ajudar a melhorar a cidade: cadastre uma bronca e apoie as causas.';
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title, text, url, dialogTitle: 'Convidar' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado!', description: 'Cole e envie para alguém contribuir.' });
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole e envie para alguém contribuir.' });
      } catch {
        toast({ title: 'Não foi possível compartilhar', variant: 'destructive' });
      }
    }
  }, [toast]);

  const hasReports = reports.length > 0;

  return (
    <div className="min-h-full bg-[#F3F4F6]">
      <div className="container mx-auto max-w-2xl px-3">
        <FeedCitySelector />
      </div>

      {activeTab !== 'resolved' && (
        <FeedWelcomeCard onCreateReport={handleOpenCreate} onInvite={handleInvite} />
      )}

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto max-w-2xl px-3">
          <FeedTabs tabs={FEED_TABS} activeTab={activeTab} onChange={handleTabChange} />
        </div>
      </div>

      <FeedNewReportsBanner count={newCount} onRefresh={handleRefresh} />

      <div className="container mx-auto max-w-2xl px-3 py-4">
        <FeedStates
          isOffline={isOffline}
          isSlow={isSlow}
          error={error}
          hasReports={hasReports}
          onRetry={refresh}
        />

        {loading && !hasReports ? (
          <FeedSkeleton count={3} />
        ) : (isOffline || error) && !hasReports ? (
          <FeedFatalState isOffline={isOffline} error={error} onRetry={refresh} />
        ) : !hasReports ? (
          <FeedEmptyState
            tab={activeTab}
            onCreateReport={handleOpenCreate}
            onChangeTab={handleTabChange}
          />
        ) : (
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Atualizando…
              </div>
            )}

            {reports.map((report, index) => (
              <FeedCard
                key={report.id}
                report={report}
                onToggleUpvote={toggleUpvote}
                isNew={report.id === recentCreatedId}
                index={index}
              />
            ))}

            <div ref={sentinelRef} className="h-4" />

            {!isOffline && <FeedLoadMoreError error={loadMoreError} onRetry={loadMore} />}

            {isSlowMore && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 size={14} className="animate-spin" />
                Carregando mais… (conexão lenta)
              </div>
            )}

            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasMore && hasReports && (
              <p className="text-center text-xs text-muted-foreground py-4">
                Você viu todas as broncas desta categoria.
              </p>
            )}
          </div>
        )}
      </div>

      {showReportModal && (
        <ReportModal onClose={() => setShowReportModal(false)} onSubmit={createReport} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Verificar build e lint**

```bash
npm run build && npm run lint
```

Esperado: build conclui; nenhum erro novo de lint.

- [ ] **Step 9: Confirmar a redução**

```bash
wc -l src/pages/FeedPage.jsx
```

Esperado: abaixo de 250 linhas (era 797).

- [ ] **Step 10: Commit**

```bash
git add src/components/feed/ src/hooks/useFeedRealtime.js src/pages/FeedPage.jsx
git commit -m "refactor(feed): extrai city selector, tabs, estados, welcome card e realtime"
```

---

### Task 12: Fila de thumbnail de vídeo

**Files:**
- Create: `src/hooks/useVideoThumbnail.js`
- Modify: `src/components/FeedCard.jsx`

**Interfaces:**
- Produces: `useVideoThumbnail(videoUrl, { enabled: boolean }): { thumbnailUrl: string|null, failed: boolean }`

**Problema resolvido:** hoje cada `FeedCard` sem `coverImage` cria um `<video>`, faz seek e `canvas.drawImage` no main thread. Vários cards fazem isso em paralelo ao rolar, travando a interface. A fila serializa em concorrência 1.

- [ ] **Step 1: Criar o hook com fila**

```js
import { useState, useEffect } from 'react';

const cache = new Map();
const pending = new Map();
const queue = [];
let active = 0;
const MAX_CONCURRENT = 1;
const MAX_CACHE = 40;

const trimCache = () => {
  while (cache.size > MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    const url = cache.get(firstKey);
    cache.delete(firstKey);
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }
};

const waitForEvent = (el, event, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error(`timeout:${event}`)); }, timeoutMs);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error(`error:${event}`)); };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });

async function grabFrame(videoUrl) {
  const video = document.createElement('video');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden';
  host.appendChild(video);
  document.body.appendChild(host);

  try {
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.src = videoUrl;
    try { video.load?.(); } catch {}

    await waitForEvent(video, 'loadedmetadata', 8000);
    try { await waitForEvent(video, 'loadeddata', 8000); } catch {}

    const seekTo = Math.min(
      0.2,
      Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : 0.2
    );
    try { video.currentTime = seekTo; } catch {}
    await Promise.race([
      waitForEvent(video, 'seeked', 8000),
      waitForEvent(video, 'timeupdate', 8000),
    ]);

    const w = Math.max(1, video.videoWidth || 0);
    const h = Math.max(1, video.videoHeight || 0);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('thumbnail:empty')); return; }
          resolve(URL.createObjectURL(blob));
        },
        'image/jpeg',
        0.82
      );
    });
  } finally {
    try { video.removeAttribute('src'); video.load?.(); } catch {}
    try { host.remove(); } catch {}
  }
}

function pump() {
  if (active >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  active += 1;
  grabFrame(job.url)
    .then((blobUrl) => {
      cache.set(job.url, blobUrl);
      trimCache();
      job.resolve(blobUrl);
    })
    .catch(job.reject)
    .finally(() => {
      active -= 1;
      pending.delete(job.url);
      pump();
    });
}

function enqueue(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (pending.has(url)) return pending.get(url);

  const p = new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject });
    pump();
  });
  pending.set(url, p);
  return p;
}

export function useVideoThumbnail(videoUrl, { enabled = true } = {}) {
  const [thumbnailUrl, setThumbnailUrl] = useState(() =>
    videoUrl && cache.has(videoUrl) ? cache.get(videoUrl) : null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !videoUrl) return;
    if (cache.has(videoUrl)) {
      setThumbnailUrl(cache.get(videoUrl));
      return;
    }

    let canceled = false;
    enqueue(videoUrl)
      .then((url) => { if (!canceled) setThumbnailUrl(url); })
      .catch(() => { if (!canceled) setFailed(true); });

    return () => { canceled = true; };
  }, [videoUrl, enabled]);

  return { thumbnailUrl, failed };
}

export default useVideoThumbnail;
```

- [ ] **Step 2: Remover a implementação antiga do FeedCard**

Em `src/components/FeedCard.jsx`, remover o código de geração de thumbnail que agora vive no hook:
- `videoThumbCache` e `videoThumbPending` (linhas 14-15)
- `trimVideoThumbCache` (17-28)
- `waitForEvent` (30-51)
- `getVideoThumbnailUrl` (53-142)
- o `useEffect` de geração de thumbnail (224-255)
- o estado `useVideoCover` (linha 190) e as referências a `setUseVideoCover`

O `FeedCard` **não** passa a consumir o hook nesta task. O consumo acontece na Task 13, dentro de `FeedCardMedia` — o componente que efetivamente renderiza a mídia. Para manter o arquivo funcional entre as duas tasks, substituir o bloco removido por:

```js
  // Thumbnail de video passa a ser responsabilidade de FeedCardMedia (Task 13).
  // Ate la, broncas sem imagem de capa caem no placeholder de categoria.
  const useVideoCover = !imgSrc && !!report.coverVideo;
```

Isso mantém o build verde e o comportamento visualmente equivalente (vídeo renderizado diretamente no lugar do frame extraído) até a Task 13 reintroduzir a geração de thumbnail via fila.

- [ ] **Step 3: Verificar build e lint**

```bash
npm run build && npm run lint
```

Esperado: build conclui; nenhum erro novo de lint.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useVideoThumbnail.js src/components/FeedCard.jsx
git commit -m "perf(feed): serializa geracao de thumbnail de video em fila"
```

---

### Task 13: Redesign do FeedCard com tokens e ícones

**Files:**
- Create: `src/components/feed/FeedCardMedia.jsx`
- Create: `src/components/feed/FeedCardSignals.jsx`
- Modify: `src/components/FeedCard.jsx`
- Modify: `src/components/EngagementBar.jsx`

**Interfaces:**
- Consumes: `Surface`, `StatusBadge`, `SignalChip`, `Icon`, `categoryIconName` do design system; `useVideoThumbnail` (Task 12).
- Produces:
  - `<FeedCardMedia report={object} index={number} chips={Array} onClick={()=>void} />`
  - `computeSignals(report): { chips, story, community, score }`

**Densidade enxuta:** no máximo 1 chip de sinal. `story` e `community` saem do card e migram para a tela de detalhe (Fase 2). Nada é removido do sistema.

- [ ] **Step 1: Criar FeedCardSignals.jsx**

Extrai o `useMemo` de `FeedCard.jsx:271-340`, mudando `chips` para no máximo 1 e adicionando variantes tokenizadas.

```jsx
// Calcula os sinais de urgencia/engajamento de uma bronca.
// story e community sao consumidos pela tela de detalhe (Fase 2);
// o card exibe apenas o chip de maior prioridade.
export function computeSignals(report, { ageDays, ageHours }) {
  const isResolved = report.status === 'resolved';
  const support = Number(report.upvotes || 0);
  const comments = Number(report.comments_count || 0);
  const score = support * 2 + comments;
  const isFresh = ageHours <= 6;
  const isLighting = report.category_id === 'iluminacao';
  const isOld = ageDays >= 7;
  const isVeryOld = ageDays >= 14;

  const chips = [];

  if (!isResolved && (support >= 30 || score >= 70)) {
    chips.push({ key: 'exploding', variant: 'hot', label: 'Explodindo agora' });
  } else if (!isResolved && (support >= 12 || score >= 28)) {
    chips.push({ key: 'rising', variant: 'rising', label: 'Subindo' });
  } else if (!isResolved && isFresh) {
    chips.push({ key: 'fresh', variant: 'fresh', label: 'Agora' });
  }

  if (!isResolved && (report.is_recurrent || isVeryOld || support >= 20)) {
    chips.push({ key: 'urgent', variant: 'urgent', label: 'Urgente' });
  }

  if (isResolved && ageHours <= 24) {
    chips.push({ key: 'resolvedToday', variant: 'hot', label: 'Resolvido hoje' });
  }

  let story = null;
  if (!isResolved && isOld) {
    story = isLighting
      ? `Essa rua está há ${ageDays} dias no escuro.`
      : `Esse problema está há ${ageDays} dias sem solução.`;
  } else if (!isResolved && support >= 30) {
    story = `Mais de ${support} pessoas já apoiaram.`;
  } else if (!isResolved && (support >= 10 || comments >= 5)) {
    story = `${support} apoios e ${comments} comentários — a comunidade está em cima.`;
  }

  let community = null;
  if (support > 0) {
    community = report.user_has_upvoted
      ? `Você e +${Math.max(0, support - 1)} pessoas apoiaram`
      : `${support} pessoas já apoiaram`;
  } else if (comments > 0) {
    community = `${comments} pessoas já comentaram`;
  }

  return { chips, story, community, score };
}
```

- [ ] **Step 2: Criar FeedCardMedia.jsx**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import Icon, { categoryIconName } from '@/design-system/icons';
import SignalChip from '@/design-system/primitives/SignalChip';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';

const PlayBadge = () => (
  <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="white" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  </div>
);

const FeedCardMedia = ({ report, index = 0, isInView = false, chips = [], onClick }) => {
  const [imgSrc, setImgSrc] = useState(report.coverImage || null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    setImgSrc(report.coverImage || null);
    retryRef.current = 0;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, [report.coverImage]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const wantsThumbnail = !report.coverImage && !!report.coverVideo && isInView && index <= 12;
  const { thumbnailUrl, failed } = useVideoThumbnail(report.coverVideo, { enabled: wantsThumbnail });

  const src = imgSrc || thumbnailUrl;
  const showVideoElement = !src && failed && !!report.coverVideo;

  const chip = chips[0];

  return (
    <button
      onClick={onClick}
      className="w-full block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label={`Ver detalhes: ${report.title}`}
    >
      {/* aspect-ratio fixo em todos os ramos: evita layout shift */}
      <div className="relative w-full aspect-[4/3] bg-surface-sunken overflow-hidden">
        {src ? (
          <img
            src={src}
            alt={report.title}
            className="w-full h-full object-cover"
            loading={index < 3 ? 'eager' : 'lazy'}
            fetchpriority={index === 0 ? 'high' : 'auto'}
            decoding="async"
            onError={() => {
              if (!imgSrc) return;
              if (imgSrc.startsWith('blob:')) return;
              if (retryRef.current >= 4) return;
              retryRef.current += 1;
              const delay = 650 * retryRef.current;
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(() => {
                setImgSrc(`${imgSrc.split('?')[0]}?v=${Date.now()}`);
              }, delay);
            }}
          />
        ) : showVideoElement ? (
          <video
            src={report.coverVideo}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onLoadedMetadata={(e) => {
              try { e.currentTarget.currentTime = 0.15; } catch {}
            }}
            onCanPlay={(e) => {
              try { e.currentTarget.pause(); } catch {}
            }}
          />
        ) : (
          <div className="w-full h-full bg-surface-sunken flex items-center justify-center text-content-tertiary">
            <Icon name={categoryIconName(report.category_id)} size={56} strokeWidth={1.25} />
          </div>
        )}

        {!report.coverImage && report.coverVideo && <PlayBadge />}

        {chip && (
          <div className="absolute top-2 left-2">
            <SignalChip variant={chip.variant} label={chip.label} />
          </div>
        )}
      </div>
    </button>
  );
};

export default React.memo(FeedCardMedia);
```

- [ ] **Step 3: Reescrever FeedCard.jsx**

Substituir o conteúdo inteiro de `src/components/FeedCard.jsx`:

```jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import EngagementBar from '@/components/EngagementBar';
import TimeAgo from '@/components/TimeAgo';
import FeedCardMedia from '@/components/feed/FeedCardMedia';
import { computeSignals } from '@/components/feed/FeedCardSignals';
import Icon, { categoryIconName } from '@/design-system/icons';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getReportShareUrl } from '@/lib/shareUtils';

const AuthorAvatar = ({ name, avatarUrl, sizeClassName = 'w-5 h-5', textClassName = 'text-2xs' }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClassName} rounded-full object-cover flex-shrink-0 bg-surface-sunken`}
        loading="lazy"
      />
    );
  }
  const initial = (name || 'C')[0].toUpperCase();
  return (
    <div className={`${sizeClassName} rounded-full bg-brand-subtleBg text-brand-subtleFg flex items-center justify-center ${textClassName} font-bold flex-shrink-0 select-none`}>
      {initial}
    </div>
  );
};

const FeedCard = ({ report, onToggleUpvote, isNew = false, index = 0 }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const createdAt = useMemo(() => new Date(report.created_at), [report.created_at]);

  const { ageDays, ageHours } = useMemo(() => {
    const ms = Date.now() - createdAt.getTime();
    return {
      ageDays: Math.max(0, Math.floor(ms / 86400000)),
      ageHours: Math.max(0, Math.floor(ms / 3600000)),
    };
  }, [createdAt]);

  const signals = useMemo(
    () => computeSignals(report, { ageDays, ageHours }),
    [report, ageDays, ageHours]
  );

  const goToReport = useCallback(() => {
    navigate(`/bronca/${report.id}`);
  }, [navigate, report.id]);

  const handleShare = useCallback(async () => {
    const url = getReportShareUrl(report.id);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: report.title, text: `Veja esta bronca: ${report.title}`, url });
      } else if (navigator.share) {
        await navigator.share({ title: report.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole onde quiser compartilhar.' });
      }
    } catch {
      // usuario cancelou ou share nao suportado
    }
  }, [report.id, report.title, toast]);

  const handleBookmark = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (report.is_favorited) {
        await supabase.from('favorite_reports').delete()
          .eq('user_id', user.id).eq('report_id', report.id);
      } else {
        await supabase.from('favorite_reports').upsert(
          { user_id: user.id, report_id: report.id },
          { onConflict: 'user_id,report_id' }
        );
      }
      toast({
        title: report.is_favorited ? 'Removido dos favoritos' : 'Salvo nos favoritos',
        duration: 1500,
      });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive', duration: 2000 });
    }
  }, [user, report, navigate, toast]);

  const isActive = report.status !== 'resolved' && report.status !== 'duplicate';

  return (
    <article
      ref={cardRef}
      className={`tc-animate-in bg-surface-raised rounded-2xl border overflow-hidden shadow-elevation-1 ${
        isNew ? 'border-brand ring-2 ring-brand/25' : 'border-edge-subtle'
      }`}
      style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold leading-snug line-clamp-2 text-content-primary">
            {report.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-2xs text-content-secondary">
            <Icon name={categoryIconName(report.category_id)} size={13} />
            <span className="truncate">{report.categoryName || report.category_id}</span>
            <span aria-hidden="true">·</span>
            <TimeAgo date={report.created_at} className="text-2xs text-content-secondary" />
          </div>
        </div>
        <StatusBadge status={report.status} />
      </div>

      <FeedCardMedia
        report={report}
        index={index}
        isInView={isInView}
        chips={signals.chips}
        onClick={goToReport}
      />

      <EngagementBar
        upvotes={report.upvotes}
        commentsCount={report.comments_count}
        isUpvoted={report.user_has_upvoted}
        isFavorited={report.is_favorited}
        onUpvote={() => onToggleUpvote?.(report.id)}
        onComment={goToReport}
        onShare={handleShare}
        onBookmark={handleBookmark}
      />

      <button onClick={goToReport} className="w-full text-left px-4 pb-3.5 pt-2 focus:outline-none">
        {(report.authorName || report.authorAvatar) && (
          <div className="flex items-center gap-2 mb-2">
            <AuthorAvatar name={report.authorName} avatarUrl={report.authorAvatar} />
            <p className="text-2xs text-content-secondary">
              por <span className="font-semibold text-content-primary">{report.authorName || 'Cidadão'}</span>
            </p>
          </div>
        )}
        {report.description && (
          <p className="text-xs text-content-secondary line-clamp-2 mb-2">{report.description}</p>
        )}
        {report.address && (
          <div className="flex items-center gap-1 text-xs text-content-secondary">
            <Icon name="location" size={12} className="flex-shrink-0" />
            <span className="truncate">{report.address}</span>
          </div>
        )}
      </button>

      {isActive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) {
              navigate('/login', { state: { from: `/bronca/${report.id}`, openUpdateModal: true } });
              return;
            }
            navigate(`/bronca/${report.id}`, { state: { openUpdateModal: true } });
          }}
          className="w-full flex items-center gap-2.5 px-4 py-3 bg-brand-subtleBg hover:brightness-95 border-t border-edge-subtle transition-all rounded-b-2xl group"
        >
          <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 text-brand">
            <Icon name="trombone" size={15} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-xs font-semibold text-brand-subtleFg">Esteve no local?</span>
            <span className="text-xs text-content-secondary"> Informe o que viu</span>
          </div>
          <span className="text-xs font-bold text-brand-subtleFg group-hover:translate-x-0.5 transition-transform" aria-hidden="true">→</span>
        </button>
      )}
    </article>
  );
};

// Re-renderiza somente quando os campos exibidos mudam.
export default React.memo(FeedCard, (prev, next) =>
  prev.report.id === next.report.id &&
  prev.report.status === next.report.status &&
  prev.report.upvotes === next.report.upvotes &&
  prev.report.comments_count === next.report.comments_count &&
  prev.report.user_has_upvoted === next.report.user_has_upvoted &&
  prev.report.is_favorited === next.report.is_favorited &&
  prev.report.coverImage === next.report.coverImage &&
  prev.isNew === next.isNew &&
  prev.index === next.index
);
```

Mudanças relevantes: `motion.div` vira `<article>` com a classe CSS `tc-animate-in` (remove framer-motion do card), `React.memo` com comparador, e `rootMargin: '200px'` no observer para a mídia começar a carregar antes de entrar em tela.

- [ ] **Step 4: Atualizar EngagementBar com ícones autorais e tokens**

Substituir o conteúdo de `src/components/EngagementBar.jsx`:

```jsx
import React from 'react';
import Icon from '@/design-system/icons';

const EngagementBar = ({
  upvotes = 0,
  commentsCount = 0,
  isUpvoted = false,
  isFavorited = false,
  onUpvote,
  onComment,
  onShare,
  onBookmark,
  className = '',
}) => (
  <div className={`flex items-center gap-1 px-3 py-1.5 border-t border-edge-subtle ${className}`}>
    <button
      onClick={onUpvote}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
        isUpvoted
          ? 'text-brand bg-brand/10'
          : 'text-content-secondary hover:text-content-primary hover:bg-surface-sunken'
      }`}
      aria-label="Apoiar bronca"
      aria-pressed={isUpvoted}
    >
      <Icon name="support" size={16} />
      <span className="text-xs tabular-nums">{upvotes > 0 ? upvotes : ''}</span>
    </button>

    <button
      onClick={onComment}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-sunken transition-colors"
      aria-label="Ver comentários"
    >
      <Icon name="comment" size={16} />
      <span className="text-xs tabular-nums">{commentsCount > 0 ? commentsCount : ''}</span>
    </button>

    <button
      onClick={onShare}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-sunken transition-colors"
      aria-label="Compartilhar"
    >
      <Icon name="share" size={16} />
    </button>

    <button
      onClick={onBookmark}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ml-auto text-sm transition-colors active:scale-95 ${
        isFavorited
          ? 'text-accent-highlight'
          : 'text-content-secondary hover:text-content-primary hover:bg-surface-sunken'
      }`}
      aria-label="Salvar nos favoritos"
      aria-pressed={isFavorited}
    >
      <Icon name="save" size={16} className={isFavorited ? 'fill-current' : ''} />
    </button>
  </div>
);

export default React.memo(EngagementBar);
```

Nota: `text-accent-highlight` requer que `accentHighlight` esteja em `colors` no Tailwind. Adicionar em `tailwind.config.js`, dentro de `colors`:

```js
        accentHighlight: "rgb(var(--accent-highlight) / <alpha-value>)",
```

- [ ] **Step 5: Verificar build e lint**

```bash
npm run build && npm run lint
```

Esperado: build conclui; nenhum erro novo de lint.

- [ ] **Step 6: Commit**

```bash
git add src/components/FeedCard.jsx src/components/feed/FeedCardMedia.jsx src/components/feed/FeedCardSignals.jsx src/components/EngagementBar.jsx tailwind.config.js
git commit -m "feat(feed): redesign do card com tokens, icones autorais e memo"
```

---

### Task 14: Redesign da página do feed, skeleton e empty state

**Files:**
- Modify: `src/pages/FeedPage.jsx`
- Modify: `src/components/FeedSkeleton.jsx`
- Modify: `src/components/FeedEmptyState.jsx`
- Modify: `src/components/feed/FeedTabs.jsx`
- Modify: `src/components/feed/FeedWelcomeCard.jsx`
- Modify: `src/components/feed/FeedCitySelector.jsx`

**Interfaces:**
- Consumes: tudo das Tasks 1-6 e 11.

- [ ] **Step 1: Skeleton com a altura exata do card**

Substituir `src/components/FeedSkeleton.jsx`:

```jsx
import React from 'react';
import { Skeleton } from '@/design-system/feedback/Skeleton';

// A estrutura espelha o FeedCard para que a troca skeleton→conteudo
// nao produza layout shift.
const FeedCardSkeleton = () => (
  <div className="bg-surface-raised rounded-2xl border border-edge-subtle shadow-elevation-1 overflow-hidden">
    <div className="flex items-start gap-3 p-3.5">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-20" rounded="rounded-full" />
    </div>

    <Skeleton className="w-full aspect-[4/3]" rounded="rounded-none" />

    <div className="flex items-center gap-2 px-3 py-2 border-t border-edge-subtle">
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-7 w-10" />
      <Skeleton className="h-7 w-8 ml-auto" />
    </div>

    <div className="px-4 pb-3.5 pt-2 space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  </div>
);

const FeedSkeleton = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <FeedCardSkeleton key={i} />
    ))}
  </div>
);

export default FeedSkeleton;
```

- [ ] **Step 2: Empty state com o primitivo e ícones autorais**

Substituir `src/components/FeedEmptyState.jsx`:

```jsx
import React from 'react';
import EmptyState from '@/design-system/primitives/EmptyState';
import Icon from '@/design-system/icons';
import { Button } from '@/components/ui/button';

const TAB_CONFIG = {
  recent: {
    icon: 'trombone',
    title: 'Nenhuma bronca por aqui!',
    subtitle: 'Seja o primeiro a reportar um problema na sua cidade.',
  },
  trending: {
    icon: 'stats',
    title: 'Nada bombando no momento',
    subtitle: 'Ainda não há broncas com muitos apoios nos últimos 7 dias.',
  },
  resolved: {
    icon: 'resolved',
    title: 'Nenhuma bronca resolvida ainda',
    subtitle: 'Quando um problema for solucionado, aparecerá aqui como case de sucesso.',
  },
};

const FeedEmptyState = ({ tab = 'recent', onCreateReport, onChangeTab }) => {
  const config = TAB_CONFIG[tab] || TAB_CONFIG.recent;

  return (
    <EmptyState
      icon={config.icon}
      title={config.title}
      description={config.subtitle}
      action={
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {tab !== 'resolved' && onCreateReport && (
            <Button onClick={onCreateReport} className="w-full gap-2">
              <Icon name="trombone" size={16} />
              Reportar uma bronca
            </Button>
          )}
          {tab === 'trending' && onChangeTab && (
            <Button variant="outline" onClick={() => onChangeTab('recent')} className="w-full">
              Ver broncas recentes
            </Button>
          )}
        </div>
      }
    />
  );
};

export default FeedEmptyState;
```

- [ ] **Step 3: Tabs com sublinhado (padrão das referências)**

Substituir o componente em `src/components/feed/FeedTabs.jsx` (mantendo `FEED_TABS` como está):

```jsx
const FeedTabs = ({ tabs = FEED_TABS, activeTab, onChange }) => (
  <div role="tablist" className="flex gap-1">
    {tabs.map((tab) => {
      const active = activeTab === tab.key;
      return (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.key)}
          className={`relative flex-1 py-3 px-3 text-sm font-semibold transition-colors ${
            active ? 'text-brand' : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          {tab.label}
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-opacity ${
              active ? 'bg-brand opacity-100' : 'opacity-0'
            }`}
          />
        </button>
      );
    })}
  </div>
);
```

- [ ] **Step 4: Welcome card tokenizado**

Em `src/components/feed/FeedWelcomeCard.jsx`, substituir as cores hardcoded, mantendo os três atalhos e todos os destinos de navegação:

- `border-red-100 bg-[#FEF2F2]` → `border-edge-subtle bg-brand-subtleBg`
- `text-primary` → `text-brand`
- `text-foreground` → `text-content-primary`
- `text-muted-foreground` → `text-content-secondary`
- `bg-white` (nos 3 botões) → `bg-surface-raised`
- `border-primary/30` → `border-brand/30`, `hover:border-primary/50` → `hover:border-brand/50`
- `border-orange-200` → `border-status-pendingBorder`, `hover:border-orange-300` → `hover:border-status-pendingFg/40`
- `bg-orange-100 text-orange-700` → `bg-status-pendingBg text-status-pendingFg`
- `border-blue-200` → `border-status-progressBorder`, `hover:border-blue-300` → `hover:border-status-progressFg/40`
- `bg-blue-100 text-blue-700` → `bg-status-progressBg text-status-progressFg`
- `text-[11px]` → `text-2xs`

Trocar os ícones lucide pelos autorais:

```jsx
import Icon from '@/design-system/icons';
```

- `<Megaphone className="w-5 h-5" />` → `<Icon name="trombone" size={20} />`
- `<ShieldCheck className="w-5 h-5" />` → `<Icon name="ambassador" size={20} />`
- `<UserPlus className="w-5 h-5" />` → `<Icon name="profile" size={20} />`

Remover o import de `lucide-react`. **Manter o texto condicional do Painel do Embaixador exatamente como está.**

- [ ] **Step 5: City selector tokenizado**

Em `src/components/feed/FeedCitySelector.jsx`:

- `border-border bg-muted/60` → `border-edge-subtle bg-surface-sunken`
- `text-foreground` → `text-content-primary`
- `text-primary` → `text-brand`
- `hover:bg-muted` → `hover:bg-surface-sunken`
- `bg-background` → `bg-surface-overlay`
- `text-muted-foreground` → `text-content-secondary`
- `border-border/50` → `border-edge-subtle`
- `bg-muted` (no input) → `bg-surface-sunken`

Trocar `<MapPin className="h-3 w-3 shrink-0 text-primary" />` por `<Icon name="location" size={12} className="shrink-0 text-brand" />` e os quatro `<Loader2 className="animate-spin" />` por `<TromboneSpinner size={16} />` (e `size={20}` no da lista de cidades). Adicionar:

```jsx
import Icon from '@/design-system/icons';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
```

Remover `Loader2` e `MapPin` do import de `lucide-react` — `ChevronDown`, `LocateFixed`, `Globe`, `Check` e `X` permanecem.

- [ ] **Step 6: Página do feed tokenizada**

Em `src/pages/FeedPage.jsx`:

- `bg-[#F3F4F6]` → `bg-surface-base`
- `bg-background/95 backdrop-blur-sm border-b border-border` → `bg-surface-base/90 backdrop-blur-md border-b border-edge-subtle`
- `text-muted-foreground` → `text-content-secondary` (3 ocorrências)
- Substituir os três `<Loader2 ... className="animate-spin" />` por `<TromboneSpinner size={14} />`, `<TromboneSpinner size={14} />` e `<TromboneSpinner size={24} />`

Adicionar o import e remover `Loader2` de `lucide-react` (que fica sem uso — remover a linha inteira do import):

```jsx
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
```

Adicionar o cabeçalho do feed acima da barra de tabs, seguindo as referências:

```jsx
      <div className="container mx-auto max-w-2xl px-3 pt-1 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-content-primary">
              Feed de denúncias
            </h1>
            <p className="text-xs text-content-secondary mt-0.5">
              Acompanhe os problemas da sua cidade
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-sm font-semibold text-content-onBrand shadow-elevation-2 hover:bg-brand-hover transition-colors flex-shrink-0"
          >
            <Icon name="newreport" size={16} />
            Nova denúncia
          </button>
        </div>
      </div>
```

Adicionar `import Icon from '@/design-system/icons';`.

- [ ] **Step 7: Verificar build, lint e contraste**

```bash
npm run build && npm run lint && npm run check:contrast
```

Esperado: build conclui; nenhum erro novo de lint; contraste com `0 reprovados`.

- [ ] **Step 8: Confirmar que não restaram cores hardcoded no feed**

```bash
grep -nE "#[0-9a-fA-F]{3,6}|bg-(gray|slate|zinc|red|orange|blue|green|yellow)-[0-9]" src/pages/FeedPage.jsx src/components/FeedCard.jsx src/components/EngagementBar.jsx src/components/FeedSkeleton.jsx src/components/FeedEmptyState.jsx src/components/feed/*.jsx
```

Esperado: nenhum resultado. As únicas exceções aceitáveis são `bg-black/50` e `border-white/10` no `PlayBadge` de `FeedCardMedia.jsx` — overlay sobre mídia, que é intencionalmente igual nos dois temas.

- [ ] **Step 9: Commit**

```bash
git add src/pages/FeedPage.jsx src/components/FeedSkeleton.jsx src/components/FeedEmptyState.jsx src/components/feed/
git commit -m "feat(feed): redesign da pagina, skeleton, empty state e tabs com tokens"
```

---

### Task 15: Verificação final

**Files:** nenhum arquivo novo; possíveis correções pontuais.

- [ ] **Step 1: Build de produção limpo**

```bash
npm run build:clean
```

Esperado: build conclui sem erro.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Esperado: sem erro novo nos arquivos tocados.

- [ ] **Step 3: Contraste**

```bash
npm run check:contrast
```

Esperado: `0 reprovados`.

- [ ] **Step 4: Conferir que nenhuma funcionalidade sumiu**

```bash
grep -rn "is_ambassador" src/components/feed/FeedWelcomeCard.jsx
grep -rn "openUpdateModal" src/components/FeedCard.jsx
grep -rn "moderation_status" src/hooks/useCreateReport.jsx
grep -rn "is_anonymous" src/hooks/useCreateReport.jsx
grep -rn "favorite_reports" src/components/FeedCard.jsx
```

Esperado: cada comando retorna ao menos uma linha. Se algum não retornar, a funcionalidade correspondente foi perdida — restaurar antes de prosseguir.

- [ ] **Step 5: Rodar o app em modo dev**

```bash
npm run dev
```

Abrir `http://localhost:3002`, ir ao feed e verificar:
1. O feed carrega e os cards aparecem
2. Perfil → Aparência → alternar entre Claro, Escuro e Automático muda o app inteiro sem recarregar
3. Recarregar a página no tema escuro não produz flash branco
4. Rolar o feed carrega mais broncas
5. Seletor de cidade abre, busca e filtra
6. Trocar de tab (Recentes / Em alta / Resolvidas) funciona
7. Os três atalhos do welcome card navegam corretamente, incluindo Painel do Embaixador
8. Apoiar, comentar, compartilhar e salvar funcionam
9. "Esteve no local?" abre a bronca com o modal de atualização

- [ ] **Step 6: Commit de eventuais correções**

```bash
git add -A
git commit -m "fix(feed): ajustes finais do redesign da fase 1"
```

---

## Notas para o executor

**Ordem obrigatória.** Tasks 1→8 (design system) antes de 9→15 (feed). Dentro do feed, a Task 11 (refatoração) precisa vir antes da 13/14 (redesign) — é essa separação que permite isolar regressões com `git bisect`.

**Se o build quebrar após a Task 1:** o motivo mais provável é a ordem dos `@import` no `src/index.css`. CSS exige que `@import` venha antes de qualquer regra; mover os imports para a primeira linha do arquivo, antes das diretivas `@tailwind`.

**Se as fontes não baixarem:** prosseguir sem `font-display`. O fallback `system-ui` mantém a UI legível, e a fonte pode ser adicionada depois sem retrabalho — só o arquivo em `public/fonts/` muda.

**Se o contraste reprovar:** ajustar o token em `semantic.css` trocando o degrau da paleta (ex: `--tc-neutral-500` → `--tc-neutral-600`). Após qualquer ajuste, recalcular o par HSL correspondente no bloco de ponte shadcn **por script**, nunca à mão — converter o triplete RGB do primitivo para HSL e usar o resultado verbatim. Valores da ponte calculados à mão já produziram um erro de 13 pontos percentuais de lightness em `--muted-foreground`, que teria feito telas migradas e não migradas exibirem cinzas diferentes lado a lado.

**Nunca reintroduzir `--primary` igual a `--destructive`.** Essa separação é a razão de o CTA e o botão destrutivo serem distinguíveis.
