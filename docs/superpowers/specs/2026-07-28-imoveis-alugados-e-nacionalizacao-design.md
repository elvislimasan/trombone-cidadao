# Imóveis Alugados (novo módulo) + Nacionalizar Pavimentação e Serviços

**Data:** 2026-07-28
**Status:** Aprovado para planejamento
**Escopo de banco:** todas as migrations/Edge Functions são validadas **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Prod é atualizado depois pelo fluxo normal.

---

## 1. Objetivo

Três frentes independentes, uma spec, um plano por fase:

1. **Novo módulo "Imóveis Alugados"**: mapa de imóveis que a prefeitura aluga, com contrato, fotos, histórico de valores e estatísticas — já nacional (por `city_id`) desde o início.
2. **Nacionalizar Pavimentação**: ruas ganham `city_id`, mapa/relatório filtram por cidade.
3. **Nacionalizar Serviços**: transporte, pontos turísticos e guia comercial ganham `city_id`, página filtra por cidade.

Todas seguem o padrão já estabelecido em obras públicas (ver `2026-07-25-nacionalizar-obras-publicas-design.md`): gestor = admin OR master OR `is_ambassador_of(uid, city_id)`; leitura pública; `CitySelector` compartilhado.

## 2. Decisões travadas (do brainstorming)

| Decisão | Escolha |
|---|---|
| Quem gerencia imóveis alugados | admin/master (qualquer cidade) + embaixador (só a própria cidade) — mesmo padrão de obras |
| Visualização pública de imóveis | Mapa + lista/grid (igual obras públicas) |
| Histórico de valores/contratos | Tabela separada de contratos (não é 1 contrato fixo por imóvel) |
| Acesso a documentos (contrato/aditivos) | **Público** — mesmo espírito de transparência do app |
| Campo "Secretaria Municipal responsável" | Texto livre (sem tabela de secretarias) |
| Cálculo do "gasto anual total" | Soma do valor mensal dos contratos **ativos** × 12 (não é histórico real do ano) |
| `pavement_streets.city_id` | Coluna denormalizada direto na tabela (não só via join com `bairros`) |
| Serviços (transporte/pontos turísticos/guia) | Ganham `city_id`; `/servicos` ganha `CitySelector` |
| Gestão de Serviços por embaixador | Sim — mesmo padrão (admin/master qualquer cidade, embaixador só a própria) |

## 3. Estado atual (não recriar)

- Padrão de obras públicas (`public_works`) já nacionalizado: `city_id bigint references cities(id)`, RLS gestor via `is_ambassador_of`, `LocationPickerMap` com `fallbackCityCenter`, `WorksMapView`/`FitToWorks`, hook `useCityIdFromLocation` (`resolveCityIdFromLocation`), `geocodeCity.js` (forward geocode para centralizar mapas), `CitySelector.jsx` compartilhado (`src/components/CitySelector.jsx`), `useCity()` (`CityContext`: `activeCityId`, `activeCityName`, `setActiveCity`, `cities`, `loadingCities`).
- Upload de mídia segue o padrão de `WorkGalleryManager.jsx`/`WorkMediaManager.jsx`: `supabase.storage.from(BUCKET).upload(path, file)` + `.getPublicUrl(path)`. Buckets existentes são todos `public: true` (`work-media`, `pavement-media`, etc.) — sem signed URLs.
- `pavement_streets`: tem `bairro_id` (FK para `bairros`, que já tem `city_id` desde a migration 144), **não tem `city_id` próprio**. Gerenciada em `ManagePavementPage.jsx` (`/admin/pavimentacao`, hoje `AdminRoute`), exibida em `PavementMapPage.jsx` (`/mapa-pavimentacao`, pública).
- `transport`, `tourist_spots`, `directory`: sem nenhum vínculo geográfico (`id` apenas). Gerenciadas em `ManageServicesPage.jsx` (`/admin/servicos`, hoje `AdminRoute`), exibidas em `ServicesPage.jsx` (`/servicos`, pública, com abas Tabs).
- `AmbassadorOrAdminRoute` já existe em `src/App.jsx` (linha ~237), usado hoje por `/obras/gerenciar`. Reusar para as novas rotas de gestão escopada.
- `is_ambassador_of(uuid, bigint)` e `is_admin`/`is_master`: helpers já existentes, reusar sempre.
- Gotcha conhecido: `match_city`/RPCs `returns bigint` vêm como **string** via PostgREST. Nunca `typeof === 'number'`; usar `parseCityId`. Ver [[project-postgrest-bigint-string]].
- Bairros de uma cidade: `bairros` já tem `city_id` (migration 144) e INSERT liberado a gestor (migration 145) — reusar exatamente o mesmo componente/fluxo de "criar bairro ou pegar do mapa" já construído em `ManageWorksPage`/`WorkEditModal` para o formulário de imóveis alugados.

## 4. Fase 1 — Módulo Imóveis Alugados

### 4.1 Schema

```sql
-- rental_properties: o imóvel em si
create table public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id),
  bairro_id uuid references public.bairros(id),
  address text not null,
  location geography(point, 4326),
  length_m numeric,           -- comprimento
  width_m numeric,            -- largura
  area_m2 numeric generated always as (length_m * width_m) stored,
  characteristics text,        -- características e utilização do imóvel
  department text,             -- Secretaria Municipal responsável (texto livre)
  thumbnail_url text,
  is_active boolean not null default true,  -- aluguel ativo ou não
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_rental_properties_city_id on public.rental_properties (city_id);
create index idx_rental_properties_bairro_id on public.rental_properties (bairro_id);

-- rental_property_contracts: histórico de contratos (valor, dono, período)
create table public.rental_property_contracts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_name text not null,
  monthly_value numeric not null,
  start_date date not null,
  end_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_rental_property_contracts_property_id on public.rental_property_contracts (property_id);
-- No máximo um contrato "is_current = true" por imóvel:
create unique index uq_rental_contracts_one_current
  on public.rental_property_contracts (property_id)
  where is_current;

-- rental_property_media: fotos do imóvel
create table public.rental_property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index idx_rental_property_media_property_id on public.rental_property_media (property_id);

-- rental_property_documents: contrato + aditivos
create table public.rental_property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  contract_id uuid references public.rental_property_contracts(id) on delete cascade,
  type text not null check (type in ('contrato', 'aditivo')),
  url text not null,
  description text,
  created_at timestamptz not null default now()
);
create index idx_rental_property_documents_property_id on public.rental_property_documents (property_id);
```

Nota: `area_m2` como coluna gerada evita recalcular em toda leitura (usado nas estatísticas "maior/menor imóvel").

### 4.2 RLS (mesmo padrão de `public_works`/`142_public_works_ambassador_rls.sql`)

Todas as 4 tabelas: **SELECT público** (`using (true)`), INSERT/UPDATE/DELETE restritos a gestor:

```sql
alter table public.rental_properties enable row level security;
alter table public.rental_property_contracts enable row level security;
alter table public.rental_property_media enable row level security;
alter table public.rental_property_documents enable row level security;

create policy "rental_properties_select_public" on public.rental_properties for select using (true);
create policy "rental_properties_gestor_insert" on public.rental_properties for insert
  with check (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );
create policy "rental_properties_gestor_update" on public.rental_properties for update
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );
create policy "rental_properties_gestor_delete" on public.rental_properties for delete
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );
```

`rental_property_contracts`/`media`/`documents` seguem o mesmo padrão de `public_work_measurements`/`public_work_payments` (join até `rental_properties.city_id` via `property_id`):

```sql
create policy "rental_property_contracts_select_public" on public.rental_property_contracts for select using (true);
create policy "rental_property_contracts_gestor_insert" on public.rental_property_contracts for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );
-- update/delete: mesmo "exists" em `using`
```
(Repetir o mesmo padrão de policy para `rental_property_media` e `rental_property_documents`, trocando a tabela.)

### 4.3 Novo contrato "encerra" o anterior

Ao criar um contrato novo para um imóvel que já tem um `is_current = true`:
1. Frontend faz `update rental_property_contracts set is_current = false, end_date = coalesce(end_date, <data do novo contrato - 1 dia>) where property_id = X and is_current = true`.
2. Depois `insert` do novo contrato com `is_current = true`.
Isso é feito em duas chamadas sequenciais do client (não precisa de trigger — mesma abordagem simples usada em `handleSuspend` do sistema de embaixadores). A constraint `uq_rental_contracts_one_current` garante que nunca há 2 correntes ao mesmo tempo (a segunda chamada falharia se a primeira não tivesse rodado).

### 4.4 Storage

Novo bucket `rental-property-media` (público, igual aos demais) para fotos e documentos (PDFs de contrato também podem ir no mesmo bucket, path prefixado por tipo: `properties/{property_id}/photos/...` e `properties/{property_id}/documents/...`).

### 4.5 Páginas

**`/imoveis-alugados`** (pública, nova) — `src/pages/RentalPropertiesPage.jsx`:
- `CitySelector` (igual `PublicWorksPage`) ligado a `activeCityId`.
- Cards de estatística no topo: imóvel mais caro / mais barato (por `monthly_value` do contrato corrente), maior / menor (por `area_m2`), gasto anual total (soma de `monthly_value` de todos os contratos `is_current=true` da cidade filtrada × 12).
- Mapa (reusa `WorksMapView`-like component, ou o próprio `WorksMapView` generalizado para aceitar `location`/`title` genéricos — decidir no plano se generaliza ou clona como `RentalPropertiesMapView`) com pins clicáveis.
- Lista/grid abaixo do mapa, com filtro por **bairro** e por **nome do proprietário** (busca em `rental_property_contracts.owner_name` do contrato corrente).
- Botão "Baixar Relatório" (mesmo padrão jsPDF de `PavementMapPage.generatePdf`): lista endereço, proprietário atual, valor mensal, por cidade filtrada.

**`/imoveis-alugados/:id`** (pública, nova) — `src/pages/RentalPropertyDetailsPage.jsx`:
- Valor do aluguel (contrato corrente), endereço + bairro, documentos (lista de `rental_property_documents`, com botão de download — `url` é pública), fotos (grid, de `rental_property_media`), tamanho (`length_m x width_m` → `area_m2`), características/utilização (`characteristics`), nome do proprietário (contrato corrente), histórico de valores (tabela de todos os `rental_property_contracts` ordenados por `start_date desc`), datas início/fim do contrato corrente, badge ativo/inativo (`is_active`), Secretaria Municipal responsável (`department`).

**`/admin/imoveis-alugados`** (gestão, admin/master only) e **`/imoveis-alugados/gerenciar`** (gestão, admin/master/embaixador) — `src/pages/admin/ManageRentalPropertiesPage.jsx`:
- Mesmo padrão de `ManageWorksPage`: `isScopedAmbassador`, `myActiveCityIds`, filtro fail-closed quando escopado.
- Formulário do imóvel: `LocationPickerMap` com `fallbackCityCenter` (igual obras), campo bairro com "criar bairro ou pegar do mapa" (reusar `handleCreateBairro`/`handleUseBairroFromMap` de `WorkEditModal`, extraindo se fizer sentido — decidir no plano se generaliza em hook/componente compartilhado ou duplica o padrão pontualmente), endereço auto-preenchido por reverse-geocode do pin (igual obras).
- Aba/seção de contratos: formulário para criar novo contrato (encerra o anterior conforme 4.3), lista do histórico.
- Upload de fotos e documentos (reusa padrão `WorkGalleryManager`/`WorkMediaManager`, bucket `rental-property-media`).

### 4.6 Rotas (`src/App.jsx`)

```jsx
<Route path="/imoveis-alugados" element={<RentalPropertiesPage />} />
<Route path="/imoveis-alugados/:id" element={<RentalPropertyDetailsPage />} />
<Route path="/admin/imoveis-alugados" element={<AdminRoute><ManageRentalPropertiesPage /></AdminRoute>} />
<Route path="/imoveis-alugados/gerenciar" element={<AmbassadorOrAdminRoute><ManageRentalPropertiesPage /></AmbassadorOrAdminRoute>} />
```
(Mesmo padrão de `/admin/obras` + `/obras/gerenciar`.)

### 4.7 Menu

Adicionar item em `defaultMenuSettings.items` (`src/config/menuConfig.js`): `{ name: 'Imóveis Alugados', path: '/imoveis-alugados', icon: 'Building', isVisible: true }`.

## 5. Fase 2 — Nacionalizar Pavimentação

### 5.1 Schema

```sql
alter table public.pavement_streets
  add column if not exists city_id bigint references public.cities(id);
create index if not exists idx_pavement_streets_city_id on public.pavement_streets (city_id);
```

Backfill: como todas as ruas existentes pertencem a bairros de Floresta (única cidade antes da nacionalização), `update pavement_streets set city_id = (select city_id from bairros where bairros.id = pavement_streets.bairro_id) where city_id is null` resolve tudo sem geocoding (mesma situação resolvida manualmente para `public_works` nesta conversa).

RLS: `pavement_streets` hoje é gerenciada só por admin (confirmar policy exata no plano/implementação); adicionar policies de gestor espelhando `142_public_works_ambassador_rls.sql`, trocando `city_id` da própria tabela (agora existe direto, sem precisar de join).

### 5.2 Cadastro (`ManagePavementPage.jsx`)

- `city_id` da rua é preenchido a partir do `bairro_id` escolhido no formulário (o bairro já carrega a cidade — não precisa de novo reverse-geocode).
- Filtro de bairros disponíveis no formulário: escopado à cidade do embaixador (igual `ManageWorksPage.fetchOptions`), admin/master veem todos.
- Modo escopo (`isScopedAmbassador`/`myActiveCityIds`) igual `ManageWorksPage`.
- Rota nova `/pavimentacao/gerenciar` com `AmbassadorOrAdminRoute` (mesmo padrão de `/obras/gerenciar`); `/admin/pavimentacao` continua `AdminRoute`.

### 5.3 Exibição pública (`PavementMapPage.jsx`)

- Adiciona `CitySelector`, filtra `streetData` por `activeCityId`.
- Mapa centraliza na cidade ativa quando não há ruas (reusa `geocodeCity` + padrão `FitToWorks`/`fallbackCityCenter` já usado em `WorksMapView`/`LocationPickerMap`).
- Relatório PDF (`generatePdf`) inclui o nome da cidade filtrada no título quando `activeCityId` não é null; "Todas as cidades" mantém o comportamento atual (nacional).

## 6. Fase 3 — Nacionalizar Serviços

### 6.1 Schema

```sql
alter table public.transport add column if not exists city_id bigint references public.cities(id);
alter table public.tourist_spots add column if not exists city_id bigint references public.cities(id);
alter table public.directory add column if not exists city_id bigint references public.cities(id);
create index if not exists idx_transport_city_id on public.transport (city_id);
create index if not exists idx_tourist_spots_city_id on public.tourist_spots (city_id);
create index if not exists idx_directory_city_id on public.directory (city_id);
```

Backfill: mesma lógica — todos os registros existentes são de Floresta (id 64), `update ... set city_id = 64 where city_id is null` nas 3 tabelas.

RLS: adicionar policies de gestor (admin/master OR `is_ambassador_of(uid, city_id)`) para INSERT/UPDATE/DELETE nas 3 tabelas, espelhando `142`. SELECT permanece público.

### 6.2 Cadastro (`ManageServicesPage.jsx`)

- Formulário de cada tipo (transporte, ponto turístico, item de diretório) ganha campo de cidade (dropdown `cities`, ou preenchido automaticamente pela cidade ativa do embaixador quando ele é o único elegível — decidir no plano qual UX é mais simples).
- Modo escopo igual `ManageWorksPage`: embaixador só vê/edita itens das próprias cidades; admin/master tudo.
- Rota nova `/servicos/gerenciar` com `AmbassadorOrAdminRoute`; `/admin/servicos` continua `AdminRoute`.

### 6.3 Exibição pública (`ServicesPage.jsx`)

- Adiciona `CitySelector` no topo (fora das `Tabs`, afeta todas as abas).
- Cada `fetchData` (`transport`, `tourist_spots`, `directory`) filtra por `activeCityId` quando setado.
- Aba "Ruas e CEPs" já fica nacionalizada pela Fase 2 (mesma tabela `pavement_streets`); aplicar o mesmo filtro por `activeCityId` aqui também, já que a aba vive nesta página.

## 7. Arquivos afetados (visão geral)

| Fase | Entrega | Arquivos |
|---|---|---|
| 1 | Schema + RLS imóveis alugados | novas migrations |
| 1 | Bucket de mídia | `rental-property-media` (nova migration/setup de storage) |
| 1 | Página pública lista+mapa+stats+relatório | `src/pages/RentalPropertiesPage.jsx` (novo) |
| 1 | Página de detalhes | `src/pages/RentalPropertyDetailsPage.jsx` (novo) |
| 1 | Gestão (CRUD + contratos + mídia) | `src/pages/admin/ManageRentalPropertiesPage.jsx` (novo) |
| 1 | Rotas + menu | `src/App.jsx`, `src/config/menuConfig.js` |
| 2 | `pavement_streets.city_id` + backfill + RLS | nova migration |
| 2 | Cadastro escopado | `src/pages/admin/ManagePavementPage.jsx`, `src/App.jsx` |
| 2 | Exibição pública filtrada | `src/pages/PavementMapPage.jsx` |
| 3 | `city_id` em transport/tourist_spots/directory + backfill + RLS | nova migration |
| 3 | Cadastro escopado | `src/pages/admin/ManageServicesPage.jsx`, `src/App.jsx` |
| 3 | Exibição pública filtrada | `src/pages/ServicesPage.jsx` |

## 8. Verificação (dev `xxdletrjyjajtrmhwzev` apenas)

**Fase 1:**
- Criar imóvel como admin em Floresta e em outra cidade → aparece em `/imoveis-alugados` só quando a cidade correspondente está selecionada (ou em "Todas").
- Embaixador em `/imoveis-alugados/gerenciar` só vê/edita imóveis da própria cidade.
- Criar 2º contrato para um imóvel → 1º vira `is_current=false` com `end_date` preenchida; só 1 contrato corrente por imóvel (constraint testada).
- Página de detalhes mostra histórico completo, fotos, documentos (download público), características, secretaria.
- Estatísticas (mais caro/barato, maior/menor, gasto anual) batem com os dados cadastrados.
- Relatório PDF baixa lista de endereço/dono/valor.
- Filtro por nome do proprietário funciona na lista pública.

**Fase 2:**
- Backfill: todas as ruas existentes ganham `city_id` de Floresta.
- `/mapa-pavimentacao` filtra por cidade selecionada; mapa centraliza na cidade quando não há ruas cadastradas ainda.
- Embaixador cadastra rua só com bairros da própria cidade.

**Fase 3:**
- Backfill: transporte/pontos turísticos/diretório existentes ganham `city_id` de Floresta.
- `/servicos` com `CitySelector` filtra as 4 abas (tourist, transport, directory, streets) pela cidade ativa.
- Embaixador gerencia itens só da própria cidade em `/servicos/gerenciar`.

## 9. Fora de escopo (YAGNI)

- Assinatura eletrônica ou validação de autenticidade de documentos de contrato.
- Alertas automáticos de contrato vencendo (fica para uma fase futura, se pedido).
- Cadastro de "Secretaria Municipal" como entidade estruturada (texto livre, decisão travada).
- Cálculo de gasto anual "real" considerando meses parciais de contratos encerrados no meio do ano.
- Multi-imóvel por contrato ou multi-contrato simultâneo por imóvel (1 corrente por vez).
