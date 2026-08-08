# Métricas de impacto no painel do embaixador

## Problema

`AmbassadorPage.jsx` só mostra filas de pendências (Broncas Pendentes, Atualizações Pendentes) — nunca o que já foi feito. Num papel voluntário, mostrar só trabalho pendente (que nunca esvazia de vez) pode desmotivar; números de progresso acumulado reforçam a sensação de contribuição real.

## Contexto confirmado no código

- `reports` já tem `moderation_status` (`'approved'`/`'rejected'`/`'pending_approval'`) e `status` (`'pending'`/`'in-progress'`/`'resolved'`/`'duplicate'`) — sem ambiguidade para saber quando uma bronca foi resolvida ou aprovada.
- `report_updates` tem `status` com `check (status in ('pending', 'confirmed', 'rejected'))` (migrations `102`/`104`). **Achado importante:** `handleUpdateAction` em `AmbassadorPage.jsx:133-138` grava `status: newStatus === 'approved' ? 'pending' : 'rejected'` — ou seja, ao **aprovar** uma atualização, o valor gravado é `'pending'` (não `'confirmed'` nem `'approved'`), tornando o `status` sozinho ambíguo para saber se algo já foi moderado versus ainda não foi. Por isso a métrica de aprovação não pode se basear em `report_updates.status` isoladamente — precisa de uma coluna própria que registre a decisão do moderador.
- Nem `reports` nem `report_updates` guardam hoje quem moderou (`moderated_by`) ou quando (`moderated_at`) — precisa de migration nova. Dados históricos (antes da migration) ficam sem essa informação; a métrica de "suas aprovações" só contabiliza a partir da entrada em produção desta feature.
- `myCities` (estado em `AmbassadorPage.jsx:19`) já lista as cidades ativas do embaixador via `ambassador_cities` join `cities`.

## Design

### 1. Migration — rastreamento de quem moderou

- `reports`: adicionar `moderated_by uuid references auth.users(id)` e `moderated_at timestamptz`.
- `report_updates`: adicionar `moderated_by uuid references auth.users(id)`, `moderated_at timestamptz`, e `moderation_decision text check (moderation_decision in ('approved', 'rejected'))` — coluna própria e inequívoca, já que `status='pending'` não diferencia "aguardando moderação" de "aprovado pelo moderador".

### 2. Preencher as colunas nas ações existentes

- `handleReportAction` (`AmbassadorPage.jsx:116-131`): o `update()` que já roda passa a incluir `moderated_by: user.id, moderated_at: new Date().toISOString()`. Como `reports.moderation_status` já grava `'approved'`/`'rejected'` sem ambiguidade, nenhuma coluna de decisão extra é necessária aqui.
- `handleUpdateAction` (`AmbassadorPage.jsx:133-148`): o `update()` passa a incluir `moderated_by: user.id, moderated_at: new Date().toISOString(), moderation_decision: newStatus`.

### 3. Cards de métricas no topo do painel

Renderizados abaixo do banner de onboarding (spec relacionada: `2026-07-20-onboarding-embaixador-design.md`) e acima das `Tabs`:

- **Card "Resolvidas por cidade"**: uma linha por cidade do embaixador (a partir de `myCities`) — nome da cidade + contagem de `reports` com `status = 'resolved'` e `city_id` daquela cidade. Quebrado por cidade (não somado), para transparência quando o embaixador cobre mais de uma.
- **Card "Suas aprovações (30 dias)"**: soma de duas contagens — `reports` onde `moderated_by = user.id`, `moderation_status = 'approved'` e `moderated_at >= now() - 30 dias`; mais `report_updates` onde `moderated_by = user.id`, `moderation_decision = 'approved'` e `moderated_at >= now() - 30 dias`.

## Fora de escopo

- Sem retroatividade: broncas/atualizações moderadas antes desta migration não contam para "suas aprovações" (campo fica `null`).
- Sem gráfico ou série temporal — só os números atuais, sem histórico visual.
- Não altera as filas de pendências existentes nem o fluxo de aprovação/rejeição em si (só adiciona os campos de auditoria ao `update()` que já acontece).

Relacionado: `2026-07-20-onboarding-embaixador-design.md` (mesmo arquivo `AmbassadorPage.jsx`, banner renderizado logo acima destes cards).
