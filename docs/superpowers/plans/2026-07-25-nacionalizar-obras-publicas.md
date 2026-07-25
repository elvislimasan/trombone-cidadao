# Nacionalizar obras públicas + gestão por embaixador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Associar obras públicas a um município (`city_id` do marcador) e permitir que embaixadores criem/editem/moderem/excluam obras da(s) cidade(s) deles.

**Architecture:** Banco primeiro (coluna city_id + RLS de obras e mídias), depois backfill (Edge Function), depois o hook compartilhado de resolução de city_id, depois as telas (ManageWorksPage em modo escopo + rota, painel do embaixador com aba de mídias, filtro na página pública).

**Tech Stack:** React 18 + Vite + Tailwind, Supabase (Postgres + RLS + Edge Functions Deno), react-router.

## Global Constraints

- **Banco/Edge Functions: aplicar/deploy SOMENTE no projeto de dev `xxdletrjyjajtrmhwzev`.** Prod depois, pelo usuário. Projeto linkado (`supabase/.temp/project-ref`) já é o dev.
- `match_city` retorna `bigint` → PostgREST serializa como **string**; usar `parseCityId` (aceita number|string), nunca `typeof === 'number'`.
- "Pode gerir obra" = `is_admin OR is_master OR public.is_ambassador_of(auth.uid(), <city_id da obra>)`. `is_master`/`is_admin` são colunas independentes em `profiles`.
- Funções que leem tabelas com RLS restritiva usam `SECURITY DEFINER set search_path = public` (padrão de `is_ambassador_of`).
- Migrations nunca editam arquivos já aplicados; sempre nova migration com `create or replace` / `drop policy if exists` / `add column if not exists`. Numeração continua de **141**.
- Preservar comportamento de admin/master em todo lugar; só ADICIONAR o escopo do embaixador.
- Commits pequenos, mensagens em pt-BR, terminando com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Validar JSX/TS com esbuild antes de commitar: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('<file>','utf8'),{loader:'jsx'|'ts'}); console.log('OK')"`.

## File Structure

- `supabase/migrations/141_public_works_city_id.sql` — coluna city_id + índice.
- `supabase/migrations/142_public_works_ambassador_rls.sql` — RLS de public_works e public_work_media para embaixador.
- `supabase/functions/backfill-public-works-city/index.ts` — backfill do city_id pelo location.
- `src/hooks/useCityIdFromLocation.js` — hook compartilhado (extraído do ReportModal).
- `src/components/ReportModal.jsx` — passa a consumir o hook.
- `src/pages/admin/ManageWorksPage.jsx` — resolução do city_id no submit + modo escopo.
- `src/App.jsx` — rota `/obras/gerenciar` + wrapper `AmbassadorOrAdminRoute`.
- `src/pages/AmbassadorPage.jsx` — aba "Mídias de Obra" + link "Gerenciar obras".
- `src/pages/PublicWorksPage.jsx` — filtro por cidade.

---

### Task 1: Migration — `public_works.city_id` + índice

**Files:**
- Create: `supabase/migrations/141_public_works_city_id.sql`

**Interfaces:**
- Produces: coluna `public.public_works.city_id bigint` (FK cities), índice `idx_public_works_city_id`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 141_public_works_city_id.sql
-- Nacionalização de obras públicas: associa cada obra a um município.
alter table public.public_works
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_public_works_city_id
  on public.public_works (city_id);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: aplica a migration 141 (ou já up-to-date se a coluna existir). Sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/141_public_works_city_id.sql
git commit -m "feat(obras): adiciona city_id em public_works + índice"
```

---

### Task 2: Migration — RLS de embaixador em public_works e public_work_media

**Files:**
- Create: `supabase/migrations/142_public_works_ambassador_rls.sql`

**Interfaces:**
- Consumes: `public.is_ambassador_of`, `public.profiles.is_admin/is_master`, `public.public_works.city_id` (Task 1).
- Produces: policies `works_gestor_insert/update/delete` e `work_media_gestor_insert/update/delete`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 142_public_works_ambassador_rls.sql
-- Permite admin/master OU embaixador ativo da cidade gerir obras e moderar mídias.
-- SELECT permanece público (não tocado). Só adiciona policies de escopo.

-- helper inline: "é gestor da cidade da obra"
-- (usado via expressão nas policies; is_ambassador_of é SECURITY DEFINER)

-- ── public_works: INSERT/UPDATE/DELETE ──
drop policy if exists "works_gestor_insert" on public.public_works;
create policy "works_gestor_insert"
  on public.public_works for insert
  with check (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "works_gestor_update" on public.public_works;
create policy "works_gestor_update"
  on public.public_works for update
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "works_gestor_delete" on public.public_works;
create policy "works_gestor_delete"
  on public.public_works for delete
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

-- ── public_work_media: INSERT/UPDATE/DELETE via obra-pai ──
drop policy if exists "work_media_gestor_insert" on public.public_work_media;
create policy "work_media_gestor_insert"
  on public.public_work_media for insert
  with check (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "work_media_gestor_update" on public.public_work_media;
create policy "work_media_gestor_update"
  on public.public_work_media for update
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "work_media_gestor_delete" on public.public_work_media;
create policy "work_media_gestor_delete"
  on public.public_work_media for delete
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: migration 142 aplicada.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/142_public_works_ambassador_rls.sql
git commit -m "feat(obras): RLS permite embaixador da cidade gerir obras e moderar mídias"
```

---

### Task 3: Edge Function — backfill do city_id das obras existentes

**Files:**
- Create: `supabase/functions/backfill-public-works-city/index.ts`

**Interfaces:**
- Consumes: `public_works` (location, city_id), `match_city`, Nominatim.
- Produces: obras existentes com city_id preenchido; retorna `{ total, resolved, unresolved }`.

- [ ] **Step 1: Escrever a função**

```ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const extractCityUF = (data: Record<string, any>) => {
  const a = data?.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county || null;
  const uf = (a["ISO3166-2-lvl4"] || "").split("-")[1] || a.state_code || null;
  return { city, uf };
};

const reverseGeocode = async (lat: number, lng: number, zoom: number) => {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR");
  const ua = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0";
  const res = await fetch(url.toString(), { headers: { "User-Agent": ua, "Accept": "application/json" } });
  if (!res.ok) return null;
  return extractCityUF(await res.json());
};

const parseCityId = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Busca obras sem city_id e com location (PostGIS retorna GeoJSON via to_jsonb? — usamos RPC simples)
    const { data: works, error } = await admin
      .from("public_works")
      .select("id, location")
      .is("city_id", null)
      .not("location", "is", null);
    if (error) throw error;

    let resolved = 0;
    const unresolved: string[] = [];

    for (const w of works || []) {
      // location vem como GeoJSON { type:'Point', coordinates:[lng,lat] } ou string WKB.
      const coords = (w as any).location?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { unresolved.push(w.id); continue; }

      let cityId: number | null = null;
      for (const zoom of [18, 10]) {
        const geo = await reverseGeocode(lat, lng, zoom);
        if (geo?.city && geo?.uf) {
          const { data: cid } = await admin.rpc("match_city", { p_name: geo.city, p_uf: geo.uf });
          cityId = parseCityId(cid);
          if (cityId) break;
        }
        await new Promise((r) => setTimeout(r, 1100)); // respeita rate limit do Nominatim
      }

      if (cityId) {
        await admin.from("public_works").update({ city_id: cityId }).eq("id", w.id);
        resolved++;
      } else {
        unresolved.push(w.id);
      }
    }

    return new Response(
      JSON.stringify({ total: (works || []).length, resolved, unresolved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
```

- [ ] **Step 2: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('supabase/functions/backfill-public-works-city/index.ts','utf8'),{loader:'ts'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Deploy no dev**

Run: `supabase functions deploy backfill-public-works-city`
Expected: `Deployed Functions on project xxdletrjyjajtrmhwzev`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/backfill-public-works-city/index.ts
git commit -m "feat(obras): Edge Function de backfill do city_id pelo location"
```

- [ ] **Step 5: Nota para o humano**

Reportar que o backfill deve ser DISPARADO manualmente uma vez (via curl/SQL editor/dashboard) e o resultado `{total, resolved, unresolved}` conferido. Não disparar automaticamente aqui.

---

### Task 4: Hook `useCityIdFromLocation` + refactor do ReportModal

**Files:**
- Create: `src/hooks/useCityIdFromLocation.js`
- Modify: `src/components/ReportModal.jsx`

**Interfaces:**
- Produces: `useCityIdFromLocation()` → `{ resolveCityIdFromLocation, resetCityCache }`. `resolveCityIdFromLocation(loc)` retorna `Promise<number|null>` com cache por coordenada.
- Consumes (ReportModal): substitui a função interna homônima pelo hook.

- [ ] **Step 1: Criar o hook (código extraído do ReportModal, idêntico em comportamento)**

```js
import { useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// Resolve o city_id SEMPRE a partir das coordenadas do marcador (não do usuário).
// Reutilizável por qualquer formulário com marcador no mapa (broncas, obras...).
export function useCityIdFromLocation() {
  const resolvedCityIdRef = useRef(null);
  const resolvedCityKeyRef = useRef(null);

  const resolveCityIdFromLocation = useCallback(async (loc) => {
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const key = `${Number(lng).toFixed(5)},${Number(lat).toFixed(5)}`;
    if (resolvedCityKeyRef.current === key && resolvedCityIdRef.current != null) {
      return resolvedCityIdRef.current;
    }

    // match_city pode voltar bigint como number OU string ("159"). Normaliza.
    const parseCityId = (raw) => {
      if (raw == null) return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const matchFromGeocode = async (zoom) => {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat, lng, zoom },
      });
      if (error || !data) return null;
      const city = data.city;
      const state_uf = data.state_uf;
      if (!city || !state_uf) return null;
      const { data: cityId } = await supabase.rpc('match_city', { p_name: city, p_uf: state_uf });
      return parseCityId(cityId);
    };

    try {
      let cityId = await matchFromGeocode(18);
      if (cityId == null) cityId = await matchFromGeocode(10);
      if (cityId != null) {
        resolvedCityIdRef.current = cityId;
        resolvedCityKeyRef.current = key;
        return cityId;
      }
    } catch (e) {
      console.error('[useCityIdFromLocation] falhou:', e);
    }
    return resolvedCityIdRef.current;
  }, []);

  const resetCityCache = useCallback(() => {
    resolvedCityIdRef.current = null;
    resolvedCityKeyRef.current = null;
  }, []);

  return { resolveCityIdFromLocation, resetCityCache };
}
```

- [ ] **Step 2: Refatorar o ReportModal para usar o hook**

Em `src/components/ReportModal.jsx`:
1. Adicionar o import no topo (junto aos outros de hooks/lib):

```jsx
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
```

2. Substituir as duas refs (`resolvedCityIdRef`, `resolvedCityKeyRef`, linhas ~318-320) e a função `resolveCityIdFromLocation` (linhas ~327-377) por:

```jsx
  const { resolveCityIdFromLocation, resetCityCache } = useCityIdFromLocation();
```

3. Onde o código antigo fazia `resolvedCityIdRef.current = null; resolvedCityKeyRef.current = null;` (em `handleLocationChange`), trocar por `resetCityCache();`.

4. Onde o geocode `useEffect` gravava em `resolvedCityIdRef.current`/`resolvedCityKeyRef.current` diretamente (bloco do match_city no useEffect ~linha 600s): remover essas atribuições diretas (o cache agora é interno ao hook). Manter o `setFormData((prev) => ({ ...prev, city_id: cityId }))`. Se após remover restar variável não usada, limpar.

IMPORTANTE: preservar o comportamento observável — o submit ainda chama `resolveCityIdFromLocation(formData.location)` e bloqueia se null (bloco já existente). Não alterar o fluxo de bloqueio.

- [ ] **Step 3: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); for(const f of ['src/hooks/useCityIdFromLocation.js','src/components/ReportModal.jsx']){eb.transformSync(fs.readFileSync(f,'utf8'),{loader:'jsx'}); console.log('OK',f);}"`
Expected: `OK` para os dois.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCityIdFromLocation.js src/components/ReportModal.jsx
git commit -m "refactor(cidade): extrai useCityIdFromLocation e reusa no ReportModal"
```

---

### Task 5: ManageWorksPage — resolve city_id no submit + modo escopo

**Files:**
- Modify: `src/pages/admin/ManageWorksPage.jsx`

**Interfaces:**
- Consumes: `useCityIdFromLocation` (Task 4), `useAuth`, `ambassador_cities`.
- Produces: obras salvas com `city_id`; lista filtrada quando embaixador.

- [ ] **Step 1: Imports e detecção de escopo**

No topo do componente `ManageWorksPage` (após os hooks existentes como `useToast`, `useLocation`), adicionar:

```jsx
  const { user } = useAuth();
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
```

Imports no topo do arquivo (se ainda não existirem):

```jsx
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
```

(`useState` já é importado no arquivo.)

- [ ] **Step 2: Carregar as cidades ativas do embaixador**

Adicionar um efeito (perto dos outros `useEffect`):

```jsx
  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) return;
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isScopedAmbassador, user?.id]);
```

- [ ] **Step 3: Resolver o city_id e aplicar guardas no `handleSaveWork`**

No início de `handleSaveWork` (após `const { id, location, ...data } = workToSave;`), inserir:

```jsx
    // city_id SEMPRE do marcador (nunca nulo). Reusa a mesma lógica das broncas.
    const resolvedCityId = await resolveCityIdFromLocation(location);
    if (resolvedCityId == null) {
      toast({
        title: 'Não foi possível identificar a cidade',
        description: 'Confira se o marcador no mapa está sobre a localização correta e tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    // Embaixador só cadastra/edita obra nas cidades dele (admin/master isentos).
    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({
        title: 'Fora da sua área',
        description: 'Você só pode gerenciar obras nas suas cidades.',
        variant: 'destructive',
      });
      return;
    }
```

E incluir `city_id` no payload. Localizar `const payload = { ...data, location: locationString };` e trocar por:

```jsx
    const payload = { ...data, location: locationString, city_id: resolvedCityId };
```

- [ ] **Step 4: Filtrar a lista de obras quando embaixador**

Localizar a query que carrega as obras em `fetchData` (a que faz `.from('public_works').select(...)` para a lista principal). Envolver o filtro condicional: após montar a query base, se `isScopedAmbassador && myActiveCityIds.length > 0`, aplicar `.in('city_id', myActiveCityIds)`. Ex.:

```jsx
      let worksQuery = supabase.from('public_works').select(/* ...campos existentes... */);
      if (isScopedAmbassador && myActiveCityIds.length > 0) {
        worksQuery = worksQuery.in('city_id', myActiveCityIds);
      }
      const { data: worksData, error: worksError } = await worksQuery;
```

(Manter os campos do select exatamente como estavam. Se `fetchData` depende de `myActiveCityIds`, adicioná-lo às deps do `useCallback`/`useEffect` que chama `fetchData`.)

- [ ] **Step 5: Título adaptado (UI)**

Onde a página renderiza o título principal (cabeçalho "Gerenciar Obras" ou similar), tornar condicional:

```jsx
{isScopedAmbassador ? 'Obras da minha cidade' : /* título atual */}
```

(Localizar o `<h1>`/título existente e aplicar; não introduzir texto novo além dessa troca.)

- [ ] **Step 6: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/pages/admin/ManageWorksPage.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/ManageWorksPage.jsx
git commit -m "feat(obras): resolve city_id do marcador no submit + modo escopo do embaixador"
```

---

### Task 6: Rota `/obras/gerenciar` + wrapper `AmbassadorOrAdminRoute`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `ManageWorksPage`.
- Produces: rota `/obras/gerenciar` acessível a admin/master/embaixador.

- [ ] **Step 1: Criar o wrapper**

Perto de `AdminRoute` em `src/App.jsx`, adicionar:

```jsx
const AmbassadorOrAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  const allowed = user && (user.is_admin || user.is_master || user.is_ambassador);
  return allowed
    ? children
    : <Navigate to={user ? '/' : '/login'} replace state={!user ? { from: location } : undefined} />;
};
```

- [ ] **Step 2: Registrar a rota**

Junto às rotas de admin de obras (perto de `/admin/obras`), adicionar (ManageWorksPage já é importado no App):

```jsx
              <Route path="/obras/gerenciar" element={<AmbassadorOrAdminRoute><ManageWorksPage /></AmbassadorOrAdminRoute>} />
```

- [ ] **Step 3: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/App.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(obras): rota /obras/gerenciar para admin ou embaixador"
```

---

### Task 7: Painel do embaixador — aba "Mídias de Obra" + link "Gerenciar obras"

**Files:**
- Modify: `src/pages/AmbassadorPage.jsx`

**Interfaces:**
- Consumes: `public_work_media`, `myCities` (já carregado no AmbassadorPage), `/obras/gerenciar`.
- Produces: nova aba de moderação de mídia de obra.

- [ ] **Step 1: Estado + fetch das mídias pendentes**

No `AmbassadorPage`, junto aos estados existentes (`pendingReports`, `pendingUpdates`...), adicionar:

```jsx
  const [pendingWorkMedia, setPendingWorkMedia] = useState([]);
  const [loadingWorkMedia, setLoadingWorkMedia] = useState(true);
```

E uma função de busca (espelha `fetchPendingUpdates`, filtrando por cidade da obra):

```jsx
  const fetchPendingWorkMedia = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) { setPendingWorkMedia([]); setLoadingWorkMedia(false); return; }
    setLoadingWorkMedia(true);
    const { data, error } = await supabase
      .from('public_work_media')
      .select('id, url, type, status, created_at, contributor_id, work_id, work:public_works!inner(id, title, city_id), contributor:profiles!contributor_id(name)')
      .eq('status', 'pending')
      .in('work.city_id', cityIds)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'Erro ao buscar mídias de obra', description: error.message, variant: 'destructive' });
    } else {
      setPendingWorkMedia(data || []);
    }
    setLoadingWorkMedia(false);
  }, [toast]);
```

Chamá-la junto das outras no efeito que dispara após carregar `myCities` (onde já chama `fetchPendingReports(cityIds)` e `fetchPendingUpdates(cityIds)`), adicionando `fetchPendingWorkMedia(cityIds);`. Incluir `fetchPendingWorkMedia` nas deps desse `useEffect`.

NOTA sobre o filtro por cidade: o `.in('work.city_id', cityIds)` com embed `!inner` pode não funcionar em todas as versões do PostgREST. Se der erro de sintaxe/coluna, usar o mesmo padrão que `fetchPendingUpdates` já usa neste arquivo: buscar sem o filtro embed e **filtrar client-side** por `cityIds.has(row.work?.city_id)`. Escolher o que funcionar contra o dev; ambos são aceitáveis.

- [ ] **Step 2: Handler de aprovar/rejeitar mídia**

Espelha o comportamento do admin (ModerationPage): aprovar → update status; rejeitar → notifica contribuidor + delete + remove do storage.

```jsx
  const handleWorkMediaAction = async (item, newStatus) => {
    setActionLoadingId(`wm-${item.id}-${newStatus}`);
    try {
      if (newStatus === 'approved') {
        const { error } = await supabase.from('public_work_media')
          .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_comment: null })
          .eq('id', item.id);
        if (error) throw error;
      } else {
        if (item.contributor_id) {
          await supabase.from('notifications').insert({
            user_id: item.contributor_id,
            type: 'work_media_rejected',
            message: `A mídia enviada para a obra "${item.work?.title || 'desconhecida'}" não foi aprovada.`,
            work_id: item.work_id,
            is_read: false,
          });
        }
        const { error: delErr } = await supabase.from('public_work_media').delete().eq('id', item.id);
        if (delErr) throw delErr;
        try {
          const url = new URL(item.url);
          const parts = url.pathname.split('/work-media/');
          const storagePath = parts[1];
          if (storagePath) await supabase.storage.from('work-media').remove([decodeURIComponent(storagePath)]);
        } catch (_) {}
      }
      toast({ title: newStatus === 'approved' ? 'Mídia aprovada!' : 'Mídia rejeitada.' });
      const cityIds = myCities.map((c) => c.city_id);
      fetchPendingWorkMedia(cityIds);
    } catch (err) {
      toast({ title: 'Erro ao moderar mídia', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };
```

- [ ] **Step 3: Aba na TabsList + TabsContent**

Aumentar a grade de tabs (localizar `grid-cols-3` na TabsList do AmbassadorPage e trocar por `grid-cols-4`). Adicionar o gatilho após "updates":

```jsx
            <TabsTrigger value="work-media" className="gap-2 text-xs sm:text-sm">
              <ImageIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Mídias de Obra</span>
              <span className="sm:hidden">Mídias</span>
              {pendingWorkMedia.length > 0 && (
                <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-tc-red text-white text-[10px]">
                  {pendingWorkMedia.length}
                </Badge>
              )}
            </TabsTrigger>
```

Adicionar `import { Image as ImageIcon } from 'lucide-react';` ao import de ícones existente (acrescentar `Image as ImageIcon` à lista atual, não criar novo import).

E o conteúdo (após o TabsContent de "updates"):

```jsx
          <TabsContent value="work-media">
            {loadingWorkMedia ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando mídias...</span>
              </div>
            ) : pendingWorkMedia.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma mídia pendente!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pendingWorkMedia.map((m) => (
                  <Card key={m.id} className="overflow-hidden">
                    <div className="aspect-video bg-black/5">
                      {m.type === 'video' ? (
                        <video src={m.url} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate">{m.work?.title || 'Obra'}</p>
                      <p className="text-[11px] text-muted-foreground">Por {m.contributor?.name || 'Cidadão'}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-300 hover:bg-red-50"
                          disabled={!!actionLoadingId} onClick={() => handleWorkMediaAction(m, 'rejected')}>
                          {actionLoadingId === `wm-${m.id}-rejected` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3 mr-1" /> Rejeitar</>}
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={!!actionLoadingId} onClick={() => handleWorkMediaAction(m, 'approved')}>
                          {actionLoadingId === `wm-${m.id}-approved` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Aprovar</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
```

- [ ] **Step 4: Link "Gerenciar obras"**

No cabeçalho do AmbassadorPage (perto do título "Painel do Embaixador"), adicionar um botão:

```jsx
          <Button asChild variant="outline" className="gap-2">
            <Link to="/obras/gerenciar">
              <ImageIcon className="w-4 h-4" /> Gerenciar obras
            </Link>
          </Button>
```

Garantir que `Link` (react-router-dom) e `Button` estejam importados (Button já é; adicionar `Link` se faltar).

- [ ] **Step 5: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/pages/AmbassadorPage.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add src/pages/AmbassadorPage.jsx
git commit -m "feat(obras): aba Mídias de Obra e link Gerenciar obras no painel do embaixador"
```

---

### Task 8: Filtro por cidade na página pública `/obras`

**Files:**
- Modify: `src/pages/PublicWorksPage.jsx`

**Interfaces:**
- Consumes: `useCity` (activeCityId), queries de `public_works`.
- Produces: obras filtradas por cidade.

- [ ] **Step 1: Ligar o useCity e filtrar as queries**

No topo do componente adicionar (importar `useCity` de `@/contexts/CityContext`):

```jsx
import { useCity } from '@/contexts/CityContext';
// ...
  const { activeCityId } = useCity();
```

Nas queries `.from('public_works')` (há duas — linhas ~123 e ~156), aplicar o filtro condicional. Transformar cada uma em builder:

```jsx
      let q = supabase.from('public_works').select(/* ...campos existentes exatos... */);
      if (activeCityId) q = q.eq('city_id', activeCityId);
      // ...demais filtros existentes (status etc.) permanecem...
      const { data, error } = await q;
```

Adicionar `activeCityId` às deps do `useCallback`/`useEffect` que dispara essas buscas.

- [ ] **Step 2: Seletor de cidade no header (reuso)**

Renderizar o seletor de cidade no topo da PublicWorksPage. Reusar o componente `CitySelector` — se ele estiver definido localmente em `StatsPage.jsx`, movê-lo para `src/components/CitySelector.jsx` (export default) e importar nos dois lugares (StatsPage e PublicWorksPage). Se mover, atualizar o import em StatsPage.

```jsx
import CitySelector from '@/components/CitySelector';
// no header:
<CitySelector />
```

- [ ] **Step 3: Validar sintaxe**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); for(const f of ['src/pages/PublicWorksPage.jsx','src/components/CitySelector.jsx','src/pages/StatsPage.jsx']){eb.transformSync(fs.readFileSync(f,'utf8'),{loader:'jsx'}); console.log('OK',f);}"`
Expected: `OK` para todos (CitySelector só se foi extraído).

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicWorksPage.jsx src/components/CitySelector.jsx src/pages/StatsPage.jsx
git commit -m "feat(obras): filtro por cidade na página pública de obras (CitySelector compartilhado)"
```

---

## Verificação final (integração, dev `xxdletrjyjajtrmhwzev`)

- [ ] Criar obra como admin em `/admin/obras` → salva com `city_id` do marcador (não null).
- [ ] Disparar o backfill → conferir `{ total, resolved, unresolved }`; obras antigas ganham city_id.
- [ ] Embaixador acessa `/obras/gerenciar` (link no painel) → vê só obras da(s) cidade(s) dele.
- [ ] Embaixador cria/edita/exclui obra da cidade dele → ok; tentar fora da cidade → bloqueado com mensagem.
- [ ] Cidadão envia mídia numa obra da cidade → embaixador notificado → aba "Mídias de Obra" mostra e aprova/rejeita.
- [ ] Admin continua gerenciando tudo em `/admin/obras` (lista completa, sem filtro).
- [ ] `/obras` (pública) filtra por cidade selecionada; "Todas as cidades" = nacional.
- [ ] Broncas continuam funcionando (regressão do refactor do hook): criar bronca resolve city_id e bloqueia se null.

## Deploy para prod (feito pelo usuário depois)

- `supabase db push` (migrations 141, 142) linkado ao prod.
- `supabase functions deploy backfill-public-works-city` linkado ao prod + disparar uma vez.
- Frontend segue o build normal.
