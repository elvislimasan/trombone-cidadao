# Redesign da plataforma — identidade visual, tema global e componentização

Data: 2026-08-06
Branch: `dev.redesign_trombone`

## Objetivo

Dar identidade visual própria ao Trombone Cidadão, com tema claro e escuro
funcionais em todo o app, um design system que faça as telas seguirem um padrão
lógico, e ícones autorais no lugar dos genéricos.

O redesign é incremental: uma tela por vez, começando pelo Feed. Nenhuma
funcionalidade ou regra de negócio existente é removida ou alterada — o escopo é
layout, tema e organização de código.

## Estado atual (medido)

- **Dark mode não funciona.** As variáveis `.dark` existem em `src/index.css`
  mas nada adiciona a classe `dark` ao `<html>`. Apenas 15 de ~250 arquivos usam
  variantes `dark:`.
- **Cores hardcoded** contornam o tema: `bg-[#F3F4F6]` no FeedPage, `#b61722`,
  `#fff7f7`, `#f5c6c8`, `bg-orange-100` no FeedCard.
- **`--primary` e `--destructive` são a mesma cor** (`0 84.2% 60.2%`). Num app de
  denúncias isso torna o CTA principal indistinguível de ações destrutivas.
- **Telas com responsabilidades demais:** ReportModal 5137 linhas,
  WorkDetailsPageProject 4315, ReportPage 2921, FeedPage 797, FeedCard 636.
- **Ícones:** `lucide-react` em todo o app, sem identidade.
- **Performance do feed:** thumbnail de vídeo gerado no main thread por card,
  um `IntersectionObserver` por card, sem `memo`, sem `aspect-ratio` fixo.

Já disponível e reaproveitável:
- PostGIS instalado, com RPCs usando `st_dwithin`/`st_distance` (migration 084).
- `reports.location` é `POINT`.
- `src/hooks/useUserLocation.js` já existe.
- `StatusBar` do Capacitor já usado em `src/main.jsx`.

## Decisões travadas

| Tema | Decisão |
|---|---|
| Referências visuais | Direção, não contrato pixel-a-pixel |
| Dark mode | Segue o sistema + override manual (Claro/Escuro/Automático) |
| Ícones autorais | ~24 SVGs: categorias, status, navegação, marca. Resto segue lucide |
| Migração | Design system primeiro; telas migram uma a uma |
| Refatoração | Extrair componentes/hooks das telas do redesign |
| Performance | Atacada junto com o redesign do feed |
| Paleta | Vermelho da marca refinado, com `brand` separado de `danger` |
| Tipografia | Fonte de display nos títulos + Inter no corpo, auto-hospedadas |
| Densidade do card | Enxugar sinais; conteúdo migra para o detalhe, não é removido |
| Validação | Mockup HTML (claro + escuro) antes de codar cada tela |
| "Perto de mim" | Implementar, como fase própria (é backend, não layout) |

## Identidade visual

**Conceito:** *"O grito registrado."* Amplificação cívica traduzida em vermelho de
urgência que não é vermelho de erro, tipografia com peso de manchete, e formas
que sugerem propagação sonora nos elementos autorais.

### Cor

`brand` e `danger` passam a ser cores distintas:

| Papel | Claro | Escuro | Uso |
|---|---|---|---|
| `brand` | `#D92D20` | `#F0483E` | Marca, CTA principal, tab ativa |
| `danger` | `#B42318` | `#FF6B60` | Destrutivo, erro |
| `status-pending` | âmbar | âmbar dessaturado | Bronca pendente |
| `status-progress` | azul | azul dessaturado | Em andamento |
| `status-resolved` | verde | verde dessaturado | Resolvida |

No dark, o vermelho sobe em luminosidade e desce em saturação — vermelho saturado
sobre preto puro vibra em OLED. O fundo dark é `#0F0F11`, não `#000`, com neutros
de tom levemente quente.

### Tipografia

Fonte de display em títulos e números; `Inter` no corpo. Ambas auto-hospedadas —
o app nativo não pode depender de CDN. Escala de 7 degraus.
`font-variant-numeric: tabular-nums` nos contadores para o número não deslocar
durante a animação.

### Ícones autorais (24 SVGs)

Grid 24px, traço 1.75px, cantos arredondados.

- **Categorias (7):** buraco, esgoto, iluminação, limpeza, poda/área verde,
  vazamento, outros
- **Status (4):** recebido, análise, execução, resolvido
- **Navegação (5):** feed, mapa, estatísticas, perfil, nova bronca
- **Sistema (8):** trombone (marca), apoio, comentário, compartilhar, salvar,
  localização, embaixador, notificação

### Loading autoral do Trombone

Uma família, quatro variantes, todas derivadas do mesmo gesto — ondas sonoras
saindo do bocal do trombone:

1. **Splash** — trombone desenhando-se por `stroke-dashoffset`, ondas pulsando
2. **Spinner inline** — três arcos concêntricos em cascata (substitui `Loader2`)
3. **Skeleton do feed** — shimmer diagonal no formato exato do card
4. **Pull-to-refresh** — ondas que se expandem conforme o gesto

CSS puro e SVG, sem framer-motion. `prefers-reduced-motion` respeitado em todas.

## Arquitetura do design system

```
src/design-system/
  tokens/
    primitives.css      # paleta bruta: --tc-red-50..950, --tc-neutral-*
    semantic.css        # papéis: --surface-*, --text-*, --status-*
    typography.css      # escala + famílias
    motion.css          # durações/easings + reduced-motion
  theme/
    ThemeProvider.jsx   # 'light' | 'dark' | 'system'
    useTheme.js
    applyTheme.js       # classList + StatusBar nativa + meta theme-color
  icons/
    categories/ status/ nav/ system/
    Icon.jsx            # wrapper: tamanho, cor herdada, aria
  feedback/
    TromboneSpinner.jsx
    TromboneSplash.jsx
    Skeleton.jsx        # variantes: card, texto, avatar, mídia
    PullToRefresh.jsx
  primitives/
    Surface.jsx         # card/painel com elevação por token
    StatusBadge.jsx     # badge de status, definido em um lugar só
    SignalChip.jsx
    SectionHeader.jsx
    EmptyState.jsx
    Stack.jsx / Inline.jsx
```

### Duas camadas de token

**Primitiva** — invariável entre temas:

```css
--tc-red-500: 217 45 32;   /* canal RGB cru, permite alpha */
--tc-neutral-950: 15 15 17;
```

**Semântica** — remapeada por tema:

```css
:root {
  --surface-base:      var(--tc-neutral-50);
  --surface-raised:    255 255 255;
  --text-primary:      var(--tc-neutral-900);
  --brand:             var(--tc-red-600);
  --danger:            var(--tc-red-800);
  --status-pending-fg: var(--tc-amber-700);
}
.dark {
  --surface-base:      var(--tc-neutral-950);
  --surface-raised:    var(--tc-neutral-900);
  --text-primary:      var(--tc-neutral-50);
  --brand:             var(--tc-red-400);
  --danger:            var(--tc-red-300);
  --status-pending-fg: var(--tc-amber-300);
}
```

Canal RGB em vez de HSL para permitir `rgb(var(--brand) / 0.1)`, mantendo a
sintaxe `bg-primary/10` que o projeto já usa.

### Compatibilidade retroativa

Os tokens shadcn existentes (`--background`, `--primary`, `--card`, …)
**continuam existindo** e passam a apontar para os semânticos. Os 30+ componentes
em `src/components/ui/` e todas as telas não migradas seguem funcionando sem
alteração. A migração de cada tela é incremental e opcional.

### ThemeProvider e integração nativa

```
resolveTheme(preference)     # 'system' → matchMedia
  ↓
applyTheme(resolved)
  ├─ html.classList.toggle('dark')
  ├─ <meta name="theme-color">          # PWA / barra do browser
  ├─ StatusBar.setStyle(Dark|Light)     # se plugin disponível
  └─ StatusBar.setBackgroundColor()     # Android apenas — iOS ignora
```

Persistência: `Preferences` no nativo, `localStorage` na web. Um script inline em
`index.html` aplica a classe antes do React montar, evitando flash branco ao
abrir no tema escuro.

`ThemeProvider` entra em `src/main.jsx` como provider mais externo, acima de
`AuthProvider` — tema não depende de sessão.

Toggle Claro/Escuro/Automático exposto na tela de Perfil.

### Verificação de contraste

`scripts/check-contrast.mjs` lê os tokens semânticos e valida os pares
texto/fundo contra WCAG AA (4.5:1 corpo, 3:1 texto grande), em ambos os temas.

## Roadmap

| Fase | Escopo | Depende de |
|---|---|---|
| **0** | Design system | — |
| **1** | Feed | 0 |
| **2** | Detalhe da bronca (ReportPage) | 1 |
| **3** | Nova denúncia (ReportModal) | 1 |
| **4** | Tab "Perto de mim" | 1 |
| **5+** | Mapa, Estatísticas, Perfil, Admin | 1 |

A Fase 4 é backend e pode rodar em paralelo à 2.

## Fase 1 — Feed, em 4 etapas

### 1.1 Mockup HTML

Arquivo estático com claro e escuro lado a lado, incluindo as duas densidades de
card para comparação. Nenhum código de produção antes da aprovação.

### 1.2 Refatoração sem mudança visual

`FeedPage.jsx` (797 linhas) passa a ~120 linhas de composição:

| Extração | Responsabilidade hoje inline |
|---|---|
| `useCreateReport` | Insert Supabase, upload, confetti, haptics, contador, toast |
| `FeedCitySelector` | Picker, busca, GPS/Nominatim, click-outside |
| `FeedStates` | Offline, lento, erro, erro de paginação |
| `FeedTabs` | Tabs — preparado para a 4ª tab da Fase 4 |
| `FeedWelcomeCard` | 3 atalhos, incluindo Painel do Embaixador |
| `useFeedRealtime` | Canal Supabase + contador de novas broncas |

Lógica idêntica; apenas muda de arquivo. Commit próprio.

### 1.3 Redesign

Aplica tokens e SVGs autorais. `FeedCard` (636 linhas) se divide em `FeedCard` /
`FeedCardMedia` / `FeedCardSignals`. Cores hardcoded viram tokens. `STATUS_CONFIG`
sai do card e vira `StatusBadge` do design system, reutilizado nas Fases 2 e 5.

Densidade: no máximo 1 chip de sinal + status no card. Os demais sinais
(história, linha de comunidade) migram para a tela de detalhe.

### 1.4 Performance

- **Thumbnail de vídeo:** fila com concorrência 1, apenas para cards visíveis,
  `createImageBitmap` quando disponível
- **Observers:** um `IntersectionObserver` compartilhado no lugar de um por card;
  animação de entrada vira CSS
- **`React.memo`** com comparador no `FeedCard`
- **Layout shift:** `aspect-ratio` fixo no container de mídia; skeleton com a
  altura exata do card
- **Virtualização:** apenas se a medição em device Android justificar

## Fase 4 — "Perto de mim"

A tab não existe hoje no código. Requer:

- RPC PostGIS nova, seguindo o padrão da migration 084, ordenando por
  `st_distance` com paginação por offset dentro da própria função SQL
- `useFeed` ganha estratégia de data source por tab: as tabs atuais continuam na
  query PostgREST com `.range()`; "Perto de mim" usa a RPC
- Reaproveita `src/hooks/useUserLocation.js`
- Trata negação de permissão de localização com fallback explícito para o usuário

## Restrições

1. **Nenhuma funcionalidade removida.** Painel do Embaixador, "Esteve no local?",
   republicar, favoritar, compartilhar, moderação, denúncia anônima e demais
   regras permanecem. Conteúdo enxugado do card migra para o detalhe.
2. **Refatoração e redesign em commits separados**, para que `git bisect` isole
   regressões.
3. **Telas não migradas permanecem intactas** e funcionais.
4. **Toda tela entregue em claro e escuro**, com contraste verificado.
5. **Regras de Capacitor do CLAUDE.md valem integralmente** — qualquer código
   nativo trata Android e iOS, com fallback web.

## Critérios de sucesso

- Alternar tema no Perfil muda todo o Feed, incluindo status bar nativa, sem
  recarregar o app
- Abrir o app no tema escuro não produz flash branco
- `scripts/check-contrast.mjs` passa em ambos os temas
- `FeedPage.jsx` abaixo de 150 linhas
- Nenhuma cor hardcoded restante no Feed
- Rolagem do feed sem travamento perceptível em device Android, incluindo
  broncas com vídeo e sem imagem de capa
- Todas as funcionalidades do Feed continuam operando como antes
