# Nacionalizar Pavimentação — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o mapa de pavimentação (ruas) nacional por município: `pavement_streets` ganha `city_id` próprio, o cadastro (`ManagePavementPage`) passa a ser gerenciável por embaixador (escopado à cidade) além de admin/master, e a exibição pública (`PavementMapPage`) ganha filtro por cidade com o `CitySelector` compartilhado.

**Architecture:** Mesmo padrão já usado em obras públicas e imóveis alugados: `city_id bigint references cities(id)` denormalizado direto na tabela (não só via join com `bairros`), RLS "gestor" (`is_admin(auth.uid()) OR is_master(auth.uid()) OR is_ambassador_of(auth.uid(), city_id)`), nova rota `/pavimentacao/gerenciar` com `AmbassadorOrAdminRoute` ao lado da `/admin/pavimentacao` (`AdminRoute`) existente, `CitySelector`/`useCity()` na página pública.

**Tech Stack:** React 18 + Vite, Supabase (Postgres/RLS), react-leaflet, Tailwind + shadcn/ui.

## Global Constraints

- Todas as migrations rodam **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Nunca aplicar em prod nesta sessão.
- Gestor = `is_admin(auth.uid()) OR is_master(auth.uid()) OR is_ambassador_of(auth.uid(), city_id)`. Este repo tem DUAS formas equivalentes de checar admin/master usadas em migrations diferentes: `coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)` (usada em obras/imóveis) e as funções `is_admin(uuid)`/`is_master(uuid)` já existentes (usada na policy atual de `pavement_streets`). Para esta feature, usar as funções `is_admin(auth.uid())`/`is_master(auth.uid())` diretamente (mais curto, já é o estilo usado nesta tabela) — não misturar os dois estilos na mesma migration.
- A policy antiga `"Admins can manage pavment street"` (`cmd=ALL`, `qual=is_admin(auth.uid())`, sem `is_master`) deve ser **substituída** (drop + create), não deixada lado a lado, para não haver duas policies ALL conflitantes na mesma tabela.
- SELECT pública em `pavement_streets` já existe (`"Public pavement streets are viewable by everyone."`, `qual=true`) e **não deve ser alterada**.
- Backfill: todas as ruas existentes em dev pertencem a Floresta-PE (`city_id = 64` — mesmo id confirmado nas Fases anteriores). Resolver via join com `bairros.city_id` quando o bairro já tiver cidade certa; usar `64` como fallback direto apenas se necessário (mas o join deve cobrir todos os casos, já que `bairros` já foi 100% backfillado para Floresta na Fase 0).
- Reaproveitar sem duplicar: `CitySelector` (`src/components/CitySelector.jsx`), `useCity()` (`CityContext`), `AmbassadorOrAdminRoute`/`AdminRoute` (já existem em `src/App.jsx`), `LocationPickerMap` (já usado em `ManagePavementPage.jsx` via `lazy()`).
- Não recriar `useCityIdFromLocation` — este plano **não** usa reverse-geocode do pin para resolver a cidade da rua. A cidade da rua vem do **bairro selecionado** (que já tem `city_id`), não do marcador — diferente do padrão de obras/imóveis. Isso é intencional (decisão travada no spec, seção 5.2): "`city_id` da rua é preenchido a partir do `bairro_id` escolhido no formulário".

---

### Task 1: Schema — `pavement_streets.city_id` + backfill + RLS

**Files:**
- Create: `supabase/migrations/151_pavement_streets_city_id.sql`
- Create: `supabase/migrations/152_pavement_streets_ambassador_rls.sql`

**Interfaces:**
- Produces: coluna `public.pavement_streets.city_id` (bigint, not null após backfill, com índice). Todas as tarefas seguintes dependem desta coluna existir e estar preenchida.

- [ ] **Step 1: Escrever a migration de schema + backfill**

`supabase/migrations/151_pavement_streets_city_id.sql`:
```sql
-- 151_pavement_streets_city_id.sql
-- Nacionaliza pavimentação: pavement_streets ganha city_id próprio
-- (denormalizado, não só via join com bairros), seguindo o padrão de
-- public_works e rental_properties. Backfill resolve a cidade de cada
-- rua a partir do bairro já vinculado (bairros já tem city_id desde a
-- migration 144 — todas as ruas existentes em dev são de Floresta-PE).

alter table public.pavement_streets
  add column if not exists city_id bigint references public.cities(id);

update public.pavement_streets s
set city_id = b.city_id
from public.bairros b
where s.bairro_id = b.id
  and s.city_id is null;

create index if not exists idx_pavement_streets_city_id on public.pavement_streets (city_id);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar migration 151 e verificar backfill**

Run: `npx supabase db push --linked` (a partir da raiz do projeto).

Verificar:
```bash
npx supabase db query --linked "select count(*) as total, count(city_id) as com_city_id, count(*) - count(city_id) as sem_city_id from public.pavement_streets;"
```
Expected: `sem_city_id = 0` (toda rua que tinha `bairro_id` válido ganhou `city_id`). Se `sem_city_id > 0`, investigar: rodar `select id, name, bairro_id from public.pavement_streets where city_id is null;` — provavelmente ruas sem `bairro_id` preenchido. Não bloquear a migration por isso (ruas órfãs sem bairro ficam null e aparecem só em "todas as cidades", igual ao padrão de obras); apenas registrar o resultado no relatório da task.

- [ ] **Step 3: Escrever a migration de RLS**

`supabase/migrations/152_pavement_streets_ambassador_rls.sql`:
```sql
-- 152_pavement_streets_ambassador_rls.sql
-- Substitui a policy antiga "Admins can manage pavment street" (só admin,
-- sem master/embaixador) por uma policy de gestor escopada por cidade,
-- espelhando o padrão de public_works/rental_properties. Não altera a
-- policy de SELECT público existente.

drop policy if exists "Admins can manage pavment street" on public.pavement_streets;

drop policy if exists "pavement_streets_gestor_insert" on public.pavement_streets;
create policy "pavement_streets_gestor_insert"
  on public.pavement_streets for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "pavement_streets_gestor_update" on public.pavement_streets;
create policy "pavement_streets_gestor_update"
  on public.pavement_streets for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "pavement_streets_gestor_delete" on public.pavement_streets;
create policy "pavement_streets_gestor_delete"
  on public.pavement_streets for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Aplicar migration 152 e verificar**

Run: `npx supabase db push --linked`

Verificar:
```bash
npx supabase db query --linked "select policyname, cmd from pg_policies where tablename='pavement_streets' order by policyname;"
```
Expected: 4 policies — `pavement_streets_gestor_insert` (INSERT), `pavement_streets_gestor_update` (UPDATE), `pavement_streets_gestor_delete` (DELETE), `Public pavement streets are viewable by everyone.` (SELECT). A policy antiga `"Admins can manage pavment street"` NÃO deve mais aparecer.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/151_pavement_streets_city_id.sql supabase/migrations/152_pavement_streets_ambassador_rls.sql
git commit -m "feat(pavimentacao): city_id + backfill + RLS de gestor (admin/master/embaixador)"
```

---

### Task 2: Cadastro escopado (`ManagePavementPage.jsx`) + nova rota

**Files:**
- Modify: `src/pages/admin/ManagePavementPage.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useAuth()` → `user.{is_admin,is_master,is_ambassador}` (já usado em `ManageWorksPage.jsx`), tabela `ambassador_cities` (`city_id`, `status='active'`, `user_id`), schema da Task 1 (`pavement_streets.city_id`), `AmbassadorOrAdminRoute` (já existe em `src/App.jsx`).
- Produces: `/pavimentacao/gerenciar` (nova rota, embaixador+admin+master) ao lado de `/admin/pavimentacao` (inalterada, admin-only). `ManagePavementPage` funciona nas duas rotas, adaptando o filtro conforme o usuário.

- [ ] **Step 1: Adicionar estado de escopo de embaixador**

Em `src/pages/admin/ManagePavementPage.jsx`, adicionar os imports e estados necessários. Adicionar após a linha `import { supabase } from '@/lib/customSupabaseClient';`:
```jsx
import { useAuth } from '@/contexts/SupabaseAuthContext';
```

Dentro do componente `ManagePavementPage` (função, não o modal), adicionar logo após `const { toast } = useToast();`:
```jsx
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]);
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) return;
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
        setMyCities(rows.map((r) => ({
          id: r.city_id,
          name: r.cities?.name || null,
          uf: r.cities?.states?.uf || null,
        })).filter((c) => c.name));
      });
  }, [isScopedAmbassador, user?.id]);
```

- [ ] **Step 2: Filtrar `fetchStreets` e `fetchBairros` por cidade quando escopado**

Modificar `fetchStreets` (já existente) para filtrar fail-closed:
```jsx
  const fetchStreets = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setStreets([]);
      return;
    }
    let query = supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .order('updated_at', { ascending: false });
    if (isScopedAmbassador) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    else setStreets(data.map(s => ({...s, bairro_name: s.bairro?.name})));
  }, [toast, isScopedAmbassador, myActiveCityIds]);
```

Modificar `fetchBairros` (já existente) para filtrar por cidade do embaixador:
```jsx
  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*').order('name');
    if (isScopedAmbassador && myActiveCityIds.length > 0) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Erro ao buscar bairros", description: error.message, variant: "destructive" });
    else setBairros(data);
  }, [toast, isScopedAmbassador, myActiveCityIds]);
```

Atualizar o `useEffect` que chama `fetchStreets`/`fetchBairros` (já existente logo abaixo) — a assinatura de dependências não muda porque `fetchStreets`/`fetchBairros` já são as próprias dependências via `useCallback`:
```jsx
  useEffect(() => {
    fetchStreets();
    fetchBairros();
  }, [fetchStreets, fetchBairros]);
```
(Este bloco já existe no arquivo — confirmar que continua exatamente assim após as mudanças acima, sem precisar editar.)

- [ ] **Step 3: Resolver `city_id` a partir do bairro selecionado em `handleSaveStreet`**

Modificar `handleSaveStreet` (já existente) para incluir `city_id` no payload, resolvido a partir do `bairro_id` escolhido, e bloquear fora do escopo do embaixador:
```jsx
  const handleSaveStreet = async (streetToSave) => {
    const { id, name, location, bairro, bairro_name, cep, work_id, ...data } = streetToSave;

    if (!name || name.trim() === '') {
        toast({ title: "Erro ao salvar", description: "O nome da rua é obrigatório.", variant: "destructive" });
        return;
    }

    if (!data.bairro_id) {
      toast({ title: "Selecione um bairro", description: "A cidade da rua é definida pelo bairro selecionado.", variant: "destructive" });
      return;
    }

    const selectedBairro = bairros.find((b) => b.id === data.bairro_id);
    const resolvedCityId = selectedBairro?.city_id || null;
    if (!resolvedCityId) {
      toast({ title: "Bairro sem cidade definida", description: "Escolha outro bairro ou cadastre o bairro corretamente antes.", variant: "destructive" });
      return;
    }

    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({ title: "Fora da sua área", description: "Você só pode gerenciar ruas nas suas cidades.", variant: "destructive" });
      return;
    }

    const trimmedName = name.trim();
    let query = supabase
        .from('pavement_streets')
        .select('id', { count: 'exact' })
        .ilike('name', trimmedName);

    if (id) {
        query = query.neq('id', id);
    }

    const { error: checkError, count } = await query;

    if (checkError) {
        toast({ title: "Erro ao verificar duplicidade", description: checkError.message, variant: "destructive" });
        return;
    }

    if (count > 0) {
        toast({ title: "Rua já cadastrada", description: `A rua "${trimmedName}" já existe no sistema.`, variant: "destructive" });
        return;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;

    const payload = {
      name: trimmedName,
      status: data.status,
      paving_date: data.paving_date,
      pavement_type: data.pavement_type,
      bairro_id: data.bairro_id,
      location: locationString,
      city_id: resolvedCityId,
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('pavement_streets').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('pavement_streets').insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar rua", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Rua ${id ? 'atualizada' : 'adicionada'} com sucesso!` });
      fetchStreets();
      setEditingStreet(null);
    }
  };
```

**Nota:** isso pressupõe que o objeto `bairro` retornado por `fetchBairros` (`supabase.from('bairros').select('*')`) inclui a coluna `city_id` — já é o caso, pois `select('*')` traz todas as colunas, incluindo `city_id` (adicionada na migration 144). Não precisa alterar o select de `fetchBairros`.

- [ ] **Step 4: Ajustar título da página conforme o escopo**

Modificar o `<h1>` existente na seção de header (dentro do JSX de retorno, próximo a `Gerenciar Pavimentação`):
```jsx
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">
                {isScopedAmbassador ? 'Pavimentação da minha cidade' : 'Gerenciar Pavimentação'}
              </h1>
```

- [ ] **Step 5: Adicionar a rota `/pavimentacao/gerenciar` em `src/App.jsx`**

Encontrar a rota existente `<Route path="/admin/pavimentacao" element={<AdminRoute><ManagePavementPage /></AdminRoute>} />` (linha ~656) e adicionar logo abaixo:
```jsx
<Route path="/pavimentacao/gerenciar" element={<AmbassadorOrAdminRoute><ManagePavementPage /></AmbassadorOrAdminRoute>} />
```
(`ManagePavementPage` já está importado — não duplicar o import.)

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`

Expected: build sem erros.

- [ ] **Step 7: Teste manual (dev, banco `xxdletrjyjajtrmhwzev`)**

Como admin, acessar `/admin/pavimentacao`, criar/editar uma rua escolhendo um bairro de Floresta → verificar:
```bash
npx supabase db query --linked "select id, name, bairro_id, city_id from public.pavement_streets order by updated_at desc limit 1;"
```
Expected: `city_id = 64` (Floresta-PE), preenchido automaticamente a partir do bairro escolhido.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/ManagePavementPage.jsx src/App.jsx
git commit -m "feat(pavimentacao): cadastro escopado por embaixador + rota /pavimentacao/gerenciar"
```

---

### Task 3: Exibição pública filtrada (`PavementMapPage.jsx`)

**Files:**
- Modify: `src/pages/PavementMapPage.jsx`

**Interfaces:**
- Consumes: `CitySelector` (`src/components/CitySelector.jsx`), `useCity()` (`CityContext` → `activeCityId`, `activeCityName`), schema da Task 1 (`pavement_streets.city_id`).
- Produces: `/mapa-pavimentacao` filtra ruas pela cidade ativa; relatório PDF inclui nome da cidade quando filtrado.

- [ ] **Step 1: Adicionar `CitySelector` e filtro por `activeCityId`**

Em `src/pages/PavementMapPage.jsx`, adicionar os imports (junto aos demais imports já existentes no topo do arquivo):
```jsx
import { useCity } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
```

Dentro do componente `PavementMapPage`, adicionar logo após `const { toast } = useToast();`:
```jsx
  const { activeCityId, activeCityName } = useCity();
```

Modificar `fetchStreets` (já existente) para filtrar por `activeCityId`:
```jsx
  const fetchStreets = useCallback(async () => {
    let query = supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(s => ({
        ...s,
        location: s.location ? { lat: s.location.coordinates[1], lng: s.location.coordinates[0] } : null,
      }));
      setStreetData(formattedData);
      if (data.length > 0) {
        const mostRecent = data.reduce((latest, street) => {
            const streetDate = new Date(street.updated_at || 0);
            return streetDate > latest ? streetDate : latest;
        }, new Date(0));
        if (mostRecent.getTime() > 0) setLastUpdate(mostRecent.toISOString());
      }
    }
  }, [toast, activeCityId]);
```

Modificar `fetchWorks` (já existente) para também filtrar por `activeCityId` (a página mostra obras vinculadas no mapa via `handleWorkClick`; obras já têm `city_id` desde a Fase de nacionalização de obras públicas):
```jsx
  const fetchWorks = useCallback(async () => {
    let query = supabase.from('public_works').select('id, title, description, status, location, city_id');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (error) toast({ title: "Erro ao buscar obras", description: error.message, variant: "destructive" });
    else {
        const formattedWorks = data.map(w => ({
            ...w,
            location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null,
        }));
        setAllWorks(formattedWorks);
    }
  }, [toast, activeCityId]);
```

O `useEffect` que chama ambos (já existente: `useEffect(() => { fetchStreets(); fetchWorks(); }, [fetchStreets, fetchWorks]);`) não precisa mudar — já reexecuta quando `fetchStreets`/`fetchWorks` mudam de identidade (o que acontece quando `activeCityId` muda, via `useCallback`).

- [ ] **Step 2: Adicionar o `CitySelector` no cabeçalho da página**

No JSX de retorno, dentro do bloco de header (onde hoje mostra "Infraestrutura" / "Mapa de Pavimentação"), adicionar o seletor logo abaixo do parágrafo descritivo, seguindo o padrão de `PublicWorksPage.jsx`:
```jsx
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827]">Mapa de Pavimentação</h1>
              <p className="text-xs lg:text-sm text-[#6B7280] max-w-2xl">
                Visualize o status da pavimentação e acesse relatórios detalhados.
              </p>
              {lastUpdate && (
                <p className="text-[11px] text-[#6B7280] mt-1 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}
                </p>
              )}
              <div className="mt-3">
                <CitySelector />
              </div>
            </div>
```
(Substituir o bloco `<div>...</div>` existente que contém o `<h1>`/`<p>`/`lastUpdate` por esta versão com o `CitySelector` adicionado ao final — não duplicar o `<h1>`/parágrafos já existentes.)

- [ ] **Step 3: Centralizar o mapa na cidade ativa quando não há ruas**

`PavementMapView` (`src/components/PavementMapView.jsx`) hoje sempre usa `FLORESTA_COORDS` como centro fixo, sem re-fit dinâmico. O arquivo já importa `React, { useState, useImperativeHandle, forwardRef, useRef }` de `'react'` (linha 1), `{ MapContainer, TileLayer, Marker, Popup, useMap }` de `'react-leaflet'` (linha 2), e `L` de `'leaflet'` (linha 5) — **não** importa `useEffect` ainda. O componente exportado é `PavementMapView` (`const PavementMapView = forwardRef(({ streets, onWorkClick }, ref) => {...})`, linha 24), com `export default PavementMapView;` no final (linha 263) e `PavementMapView.displayName = 'PavementMapView';` logo antes (linha 261). A prop `streets` já vem no formato `{ location: {lat, lng} }` (confirmado — `PavementMapPage.jsx` faz essa transformação em `fetchStreets` antes de passar `filteredStreets` para `<PavementMapView>`).

Replicar o padrão de `FitToWorks` (já usado em `WorksMapView.jsx`), adaptado para ruas:

1. Modificar a linha 1 do import de React para incluir `useEffect`:
```jsx
import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
```
2. Adicionar dois novos imports logo após a linha 11 (`import { Button } from "@/components/ui/button";`):
```jsx
import { useCity } from '@/contexts/CityContext';
import { geocodeCity } from '@/lib/geocodeCity';
```
3. Adicionar um novo componente `FitToStreets` logo após `MapScrollLock` (linha 22, antes de `const PavementMapView = forwardRef(...)`):
```jsx
const FitToStreets = ({ streets, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (streets || [])
      .filter((s) => s.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng))
      .map((s) => [s.location.lat, s.location.lng]);

    if (pts.length > 0) {
      const key = 'streets:' + pts.map((p) => p.join(',')).sort().join('|');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      try {
        if (pts.length === 1) {
          map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: true });
        } else {
          map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], animate: true });
        }
      } catch (e) { /* noop */ }
      return;
    }

    if (activeCity?.name) {
      const key = 'city:' + activeCity.name + '|' + (activeCity.state?.uf || '');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      geocodeCity(activeCity.name, activeCity.state?.uf).then((coord) => {
        if (cancelled || !coord) return;
        try { map.setView([coord.lat, coord.lng], 13, { animate: true }); } catch {}
      });
    }
    return () => { cancelled = true; };
  }, [streets, activeCity, map]);
  return null;
};
```
4. Dentro de `PavementMapView` (linha 24), adicionar `const { activeCity } = useCity();` logo após `const { mode } = useMapModeToggle();` (linha 30).
5. Dentro do JSX retornado, renderizar `<FitToStreets streets={streets} activeCity={activeCity} />` logo após `<MapScrollLock mode={mode} />` (linha 102) e antes de `<TileLayer .../>` (linha 103) — mesma posição relativa usada em `WorksMapView.jsx` para `<FitToWorks .../>`.

- [ ] **Step 4: Ajustar o texto do relatório PDF para incluir a cidade filtrada**

Em `PavementMapPage.jsx`, dentro de `generatePdf` (já existente), modificar a linha do título:
```jsx
  const generatePdf = (scope) => {
    const doc = new jsPDF();
    const title = `Relatório de Pavimentação${activeCityName ? ` — ${activeCityName}` : ''}`;
    doc.setFontSize(16);
    doc.text(title, 14, 18);
```
(Só a linha `const title = ...` muda; o resto de `generatePdf` permanece igual.)

- [ ] **Step 5: Verificar que compila e testar visualmente**

Run: `npm run build`

Expected: build sem erros. Depois, `npm run dev` e abrir `/mapa-pavimentacao`, trocar a cidade no `CitySelector` e confirmar que a lista de ruas filtra corretamente (comparar com uma consulta direta: `npx supabase db query --linked "select count(*) from public.pavement_streets where city_id = 64;"`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/PavementMapPage.jsx src/components/PavementMapView.jsx
git commit -m "feat(pavimentacao): filtro por cidade na exibicao publica + relatorio"
```

---

## Verificação final da Fase 2 (dev `xxdletrjyjajtrmhwzev` apenas)

- Backfill: todas as ruas existentes ganham `city_id` de Floresta (verificado via contagem `sem_city_id = 0` ou justificado se houver ruas órfãs sem bairro).
- RLS: a policy antiga `is_admin`-only foi substituída por 3 policies de gestor (insert/update/delete); SELECT público inalterado.
- Admin continua gerenciando qualquer cidade em `/admin/pavimentacao`.
- Embaixador em `/pavimentacao/gerenciar` só vê/edita ruas cujo bairro pertence à(s) cidade(s) dele; tentativa de salvar rua com bairro de outra cidade é bloqueada.
- `/mapa-pavimentacao` filtra por cidade selecionada; mapa centraliza na cidade quando não há ruas cadastradas ainda; "Todas as cidades" mantém comportamento nacional.
- Relatório PDF inclui o nome da cidade filtrada no título quando uma cidade está selecionada.

## Fora de escopo (YAGNI, herdado do spec)

- Revisão manual de ruas sem bairro (ficam com `city_id` null, aparecem só em "todas as cidades").
- Geocoding automático da rua a partir do pin (a cidade vem do bairro escolhido, não do marcador).
- Alteração da aba "Ruas e CEPs" dentro de `ServicesPage.jsx` — isso é tratado na Fase 3 (nacionalizar Serviços), que reusa esta mesma coluna `city_id`.
