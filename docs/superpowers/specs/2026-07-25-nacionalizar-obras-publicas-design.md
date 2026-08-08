# Nacionalizar obras públicas por município + gestão por embaixador

**Data:** 2026-07-25
**Status:** Aprovado para planejamento
**Escopo de banco:** todas as migrations/Edge Functions são validadas **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Prod é atualizado depois pelo fluxo normal.

---

## 1. Objetivo

Tornar as obras públicas nacionais (associadas a um município via `city_id`, como já feito com broncas) e permitir que **embaixadores** gerenciem as obras da(s) cidade(s) deles: criar, editar, moderar mídias e excluir — sempre escopado à cidade.

## 2. Decisões travadas (do brainstorming)

| Decisão | Escolha |
|---|---|
| Poderes do embaixador sobre obras | Criar, editar, moderar mídias, excluir — escopado à cidade |
| Como definir city_id da obra | Do **marcador no mapa** (reusa match_city + reverse-geocode das broncas) |
| Obras existentes sem city_id | **Backfill automático** pelo location |
| Acesso do embaixador ao gerenciamento | Reusar a **ManageWorksPage** em modo escopo |
| Rota | **Nova `/obras/gerenciar`** (admin OU embaixador); `/admin/obras` segue só admin |
| Notificação de mídia de obra pendente | **Admins + embaixadores da cidade** (já feito na migration 123) |
| Filtro por cidade na página pública `/obras` | Sim — mesmo seletor `activeCityId` do feed/estatísticas |

## 3. Estado atual (não recriar)

- `public_works`: tem `location` (POINT), `address` e `city` (texto), **NÃO tem `city_id`**. Criadas na `ManageWorksPage` (rota `/admin/obras`, hoje `AdminRoute`) com `LocationPickerMap`.
- `public_work_media`: mídias enviadas por cidadãos, moderadas hoje só por admin (`ModerationPage`, AdminRoute). Status `pending`.
- Migration **123** (`notifications_geo_scope`, já aplicada) já notifica admins globais **e** embaixadores ativos da cidade quando há mídia de obra pendente — **depende de a obra ter city_id**.
- `is_ambassador_of(user, city_id)` e `is_master(user)`: helpers SECURITY DEFINER, reusados.
- Gotcha conhecido: `match_city` retorna `bigint` → PostgREST serializa como **string**; usar `parseCityId` (number|string), nunca `typeof === 'number'`. Ver [[project-postgrest-bigint-string]].
- Resolução de city_id do marcador já existe e foi testada no `ReportModal` (`resolveCityIdFromLocation`): reverse-geocode zoom 18 → fallback 10 → match_city → parseCityId; bloqueia submit se null.
- Painel do embaixador (`/embaixador` = `AmbassadorPage.jsx`) já tem abas Cidades / Broncas Pendentes / Atualizações Pendentes, com padrão de card + `actionLoadingId` + `fetchX`.

## 4. Mudanças de dados

### 4.1 `public_works.city_id`
```sql
alter table public.public_works
  add column if not exists city_id bigint references public.cities(id);
create index if not exists idx_public_works_city_id on public.public_works (city_id);
```

### 4.2 RLS de `public_works` (INSERT/UPDATE/DELETE p/ embaixador)
Espelha migrations 122/130/137. "Pode gerir" = admin OR master OR embaixador ativo da cidade da obra.
```sql
-- INSERT: with check no city_id da nova obra
-- UPDATE/DELETE: using no city_id da obra
using/with check (
  coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
  or public.is_ambassador_of(auth.uid(), city_id)
)
```
SELECT permanece público (obras são visíveis a todos) — não alterar.

### 4.3 RLS de `public_work_media` (moderação por embaixador)
Via join na obra-pai (`public_works.city_id`). INSERT/UPDATE/DELETE:
```sql
using/with check (
  exists (
    select 1 from public.public_works w
    where w.id = public_work_media.work_id
      and (
        coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
        or public.is_ambassador_of(auth.uid(), w.city_id)
      )
  )
)
```
Preservar policies existentes de admin; só ADICIONAR o escopo do embaixador (drop/create das policies específicas de embaixador, sem tocar nas de admin).

### 4.4 Backfill — Edge Function `backfill-public-works-city`
Rodada uma vez, manualmente. Passos:
1. `select id, location from public_works where city_id is null and location is not null`.
2. Para cada: extrai lat/lng do POINT, reverse-geocode (zoom 18 → 10) + `match_city` + `parseCityId`.
3. `update public_works set city_id = <resolvido> where id = <id>`.
4. Loga total resolvido/não resolvido. Não resolvidas ficam null (aparecem só em "todas as cidades").
Reusa o padrão de `reverse-geocode`/`match_city` já usado em `create-anonymous-report`.

## 5. Resolução do city_id no formulário de obra

### 5.1 Hook compartilhado `useCityIdFromLocation`
Extrair a lógica de `resolveCityIdFromLocation` do `ReportModal` para `src/hooks/useCityIdFromLocation.js` (ou `.jsx`), evitando duplicar o gotcha do `parseCityId`. Exporta uma função `resolve(location) → Promise<number|null>` com cache por coordenada. O `ReportModal` passa a consumir o hook (refactor DRY, sem mudar comportamento observável).

### 5.2 Submit da obra (`ManageWorksPage.handleSaveWork`)
```js
const cityId = await resolveCityIdFromLocation(workToSave.location);
if (cityId == null) {
  toast({ title: 'Não foi possível identificar a cidade', description: '...marcador...' });
  return; // nunca salva null
}
// checagem cidade-permitida para embaixador (admin/master isentos):
if (isScopedAmbassador && !myActiveCityIds.includes(cityId)) {
  toast({ title: 'Fora da sua área', description: 'Você só pode cadastrar obras nas suas cidades: ...' });
  return;
}
// inclui city_id no insert/update de public_works
```
Edição: se o marcador muda, city_id é re-resolvido (cache invalida por coordenada).

## 6. Rota e página em modo escopo

### 6.1 Rota + wrapper
- `/admin/obras` → `AdminRoute` (inalterado).
- `/obras/gerenciar` → novo `AmbassadorOrAdminRoute` (libera `is_admin || is_master || is_ambassador`).
- Wrapper novo `AmbassadorOrAdminRoute` em `App.jsx`, espelhando `AdminRoute`.

### 6.2 Modo escopo na ManageWorksPage
Detecção pelo usuário (funciona nas duas URLs):
```js
const isScopedAmbassador = user && !user.is_admin && !user.is_master && user.is_ambassador;
```
Quando escopo:
- **Obter `myActiveCityIds`**: query `ambassador_cities` `.eq('user_id', user.id).eq('status','active')` → mapeia `city_id` (mesma query que `AmbassadorPage.fetchMyCities` já faz). Carregada uma vez ao montar, quando `isScopedAmbassador`.
- **Lista filtrada** por `myActiveCityIds` (`.in('city_id', myActiveCityIds)`). Admin/master veem todas (intacto).
- **Criar/editar/excluir** funcionam; RLS é a rede final; criar tem a checagem 5.2.
- **UI adaptada**: título "Obras da minha cidade"; sem links para outras áreas do /admin.

## 7. Painel do embaixador (`AmbassadorPage.jsx`)

- **Link "Gerenciar obras"** → `/obras/gerenciar`.
- **Nova aba "Mídias de Obra"** (espelha as abas Broncas/Atualizações Pendentes): busca `public_work_media` status `pending` cujas obras estão nas cidades ativas do embaixador; aprovar/rejeitar com o mesmo padrão de `handleReportAction`/`actionLoadingId`. A aprovação segue o mesmo update que o admin faz hoje (`ModerationPage`): `status='approved'` etc.; rejeição notifica o contribuidor.

## 8. Página pública `/obras` (PublicWorksPage)

Adiciona o seletor de cidade ligado ao `activeCityId` (CityContext, mesmo do feed/estatísticas). As queries de `public_works` filtram por `city_id` quando há cidade ativa; "Todas as cidades" = nacional. Reusa o componente de seletor de cidade (o `CitySelector` criado para as estatísticas pode ser promovido a componente compartilhado).

## 9. Arquivos afetados

| # | Entrega | Arquivos |
|---|---|---|
| 1 | `public_works.city_id` + índice | nova migration |
| 2 | RLS public_works (embaixador) | nova migration |
| 3 | RLS public_work_media (embaixador) | mesma/nova migration |
| 4 | Backfill city_id | `supabase/functions/backfill-public-works-city/` (nova) |
| 5 | Hook + resolução no submit + checagem | `src/hooks/useCityIdFromLocation.js` (novo), `src/components/ReportModal.jsx`, `src/pages/admin/ManageWorksPage.jsx` |
| 6 | Rota + wrapper + modo escopo | `src/App.jsx`, `src/pages/admin/ManageWorksPage.jsx` |
| 7 | Painel embaixador (aba mídias + link) | `src/pages/AmbassadorPage.jsx` |
| 8 | Filtro cidade na página pública | `src/pages/PublicWorksPage.jsx` (+ CitySelector compartilhado) |

## 10. Verificação (dev `xxdletrjyjajtrmhwzev` apenas)

- Criar obra como admin → `city_id` resolvido do marcador (não null).
- Backfill → obras antigas ganham `city_id`; contar resolvidas/não.
- Embaixador em `/obras/gerenciar` → vê só obras da(s) cidade(s) dele.
- Embaixador cria/edita/exclui uma obra da cidade dele → ok (RLS permite).
- Embaixador tenta criar obra fora da cidade → bloqueado com mensagem.
- Cidadão envia mídia numa obra da cidade → embaixador notificado → aprova pela aba "Mídias de Obra".
- Admin continua gerenciando tudo em `/admin/obras`.
- `/obras` filtra por cidade selecionada; "Todas" = nacional.

## 11. Fora de escopo (YAGNI)

- Revisão manual do backfill não resolvido (fica null).
- Medições/measurements de obra por embaixador (segue admin-only).
- Obras multi-cidade (uma cidade por obra).
