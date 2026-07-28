# Imóveis Alugados — Fase 1 (módulo novo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o módulo "Imóveis Alugados" — mapa público de imóveis alugados pela prefeitura com página de detalhes completa (valor, endereço, documentos, fotos, tamanho, histórico de contratos), estatísticas, relatório em PDF, e gestão por admin/master/embaixador (escopado à cidade).

**Architecture:** Segue exatamente o padrão já usado em `public_works`/`ManageWorksPage`: schema com `city_id` desde o início, RLS "gestor" (`is_admin OR is_master OR is_ambassador_of(uid, city_id)`), `LocationPickerMap` + `useCityIdFromLocation` para o pin do imóvel, upload de mídia via Supabase Storage bucket público, página pública com mapa+lista+`CitySelector`, página de gestão reaproveitando os componentes de bairro (criar/pegar do mapa) do `WorkEditModal`.

**Tech Stack:** React 18 + Vite, Supabase (Postgres/RLS/Storage/Edge Functions), react-leaflet, jsPDF + jspdf-autotable, Tailwind + shadcn/ui.

## Global Constraints

- Todas as migrations e deploys de Edge Function rodam **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Nunca aplicar em prod nesta sessão.
- Gestor = `is_admin OR is_master OR is_ambassador_of(auth.uid(), city_id)` — copiar esse padrão exato de `142_public_works_ambassador_rls.sql`/`146_measurements_ambassador_rls.sql`/`147_payments_ambassador_rls.sql`.
- SELECT é sempre público (`using (true)`) em todas as 4 tabelas novas — incluindo documentos de contrato (decisão travada: transparência).
- `city_id` da tabela `cities` referenciado é `bigint`; ao resolver via `match_city`/RPC, o retorno vem como **string** via PostgREST — nunca `typeof === 'number'`, usar o hook `useCityIdFromLocation` (já existente, não recriar) ou `Number(raw)` explícito.
- Bucket de storage novo `rental-property-media`, público (`public: true`), mesmo padrão dos buckets existentes (`work-media`, etc.) — sem signed URLs.
- Cálculo de "gasto anual total" = soma de `monthly_value` de todos os contratos com `is_current = true` (da cidade filtrada) × 12. Não considerar histórico de meses parciais.
- Um único contrato `is_current = true` por imóvel, garantido por unique partial index — nunca por trigger.
- Não criar tabela de "secretarias" — campo `department` é texto livre.
- Reaproveitar sem duplicar: `useCityIdFromLocation` (`src/hooks/useCityIdFromLocation.js`), `geocodeCity` (`src/lib/geocodeCity.js`), `CitySelector` (`src/components/CitySelector.jsx`), `useCity()` (`CityContext`), `LocationPickerMap` (`src/components/LocationPickerMap.jsx`), `AmbassadorOrAdminRoute` (já existe em `src/App.jsx`).

---

### Task 1: Schema — tabelas, RLS e bucket de storage

**Files:**
- Create: `supabase/migrations/148_rental_properties_schema.sql`
- Create: `supabase/migrations/149_rental_properties_rls.sql`
- Create: `supabase/migrations/150_rental_property_media_bucket.sql`

**Interfaces:**
- Produces: tabelas `public.rental_properties`, `public.rental_property_contracts`, `public.rental_property_media`, `public.rental_property_documents`; bucket de storage `rental-property-media`. Todas as tarefas seguintes consomem esse schema exato — não alterar nomes de coluna sem atualizar as tarefas seguintes.

- [ ] **Step 1: Escrever a migration de schema**

`supabase/migrations/148_rental_properties_schema.sql`:
```sql
-- 148_rental_properties_schema.sql
-- Módulo "Imóveis Alugados": mapa de imóveis que a prefeitura aluga,
-- com histórico de contratos, fotos e documentos. Nacional desde o início
-- (city_id obrigatório), seguindo o padrão de public_works.

create table public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id),
  bairro_id uuid references public.bairros(id),
  address text not null,
  location geography(point, 4326),
  length_m numeric,
  width_m numeric,
  area_m2 numeric generated always as (length_m * width_m) stored,
  characteristics text,
  department text,
  thumbnail_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_rental_properties_city_id on public.rental_properties (city_id);
create index idx_rental_properties_bairro_id on public.rental_properties (bairro_id);

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
create unique index uq_rental_contracts_one_current
  on public.rental_property_contracts (property_id)
  where is_current;

create table public.rental_property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index idx_rental_property_media_property_id on public.rental_property_media (property_id);

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

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar migration 148 no dev e verificar**

Run: `npx supabase db push --linked` (a partir da raiz do projeto; garantir que o CLI está linkado a `xxdletrjyjajtrmhwzev` — se não estiver, `npx supabase link --project-ref xxdletrjyjajtrmhwzev` primeiro).

Verificar: `npx supabase db query --linked "select table_name from information_schema.tables where table_schema='public' and table_name like 'rental_property%' order by table_name;"` deve listar as 4 tabelas (mais `rental_properties`).

- [ ] **Step 3: Escrever a migration de RLS**

`supabase/migrations/149_rental_properties_rls.sql`:
```sql
-- 149_rental_properties_rls.sql
-- RLS das 4 tabelas de imóveis alugados. SELECT sempre público (transparência,
-- incluindo documentos de contrato). INSERT/UPDATE/DELETE restritos a gestor:
-- admin OU master OU embaixador ativo da cidade do imóvel (via join até
-- rental_properties.city_id nas tabelas filhas).

alter table public.rental_properties enable row level security;
alter table public.rental_property_contracts enable row level security;
alter table public.rental_property_media enable row level security;
alter table public.rental_property_documents enable row level security;

-- rental_properties
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

-- rental_property_contracts
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

create policy "rental_property_contracts_gestor_update" on public.rental_property_contracts for update
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_contracts_gestor_delete" on public.rental_property_contracts for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

-- rental_property_media
create policy "rental_property_media_select_public" on public.rental_property_media for select using (true);

create policy "rental_property_media_gestor_insert" on public.rental_property_media for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_media.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_media_gestor_delete" on public.rental_property_media for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_media.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

-- rental_property_documents
create policy "rental_property_documents_select_public" on public.rental_property_documents for select using (true);

create policy "rental_property_documents_gestor_insert" on public.rental_property_documents for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_documents.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_documents_gestor_delete" on public.rental_property_documents for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_documents.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Aplicar migration 149 e verificar RLS ativo**

Run: `npx supabase db push --linked`

Verificar: `npx supabase db query --linked "select relname, relrowsecurity from pg_class where relname like 'rental_property%';"` — todas as 4 linhas com `relrowsecurity = true`.

- [ ] **Step 5: Criar o bucket de storage**

`supabase/migrations/150_rental_property_media_bucket.sql`:
```sql
-- 150_rental_property_media_bucket.sql
-- Bucket público para fotos e documentos (contrato/aditivo) dos imóveis
-- alugados. Mesmo padrão de work-media: upload direto, sem signed URLs.

insert into storage.buckets (id, name, public)
values ('rental-property-media', 'rental-property-media', true)
on conflict (id) do nothing;

create policy "rental_property_media_bucket_select_public"
  on storage.objects for select
  using (bucket_id = 'rental-property-media');

create policy "rental_property_media_bucket_gestor_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'rental-property-media'
    and auth.role() = 'authenticated'
  );

create policy "rental_property_media_bucket_gestor_delete"
  on storage.objects for delete
  using (
    bucket_id = 'rental-property-media'
    and auth.role() = 'authenticated'
  );
```

- [ ] **Step 6: Aplicar migration 150 e verificar bucket**

Run: `npx supabase db push --linked`

Verificar: `npx supabase db query --linked "select id, public from storage.buckets where id = 'rental-property-media';"` deve retornar 1 linha com `public = true`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/148_rental_properties_schema.sql supabase/migrations/149_rental_properties_rls.sql supabase/migrations/150_rental_property_media_bucket.sql
git commit -m "feat(imoveis-alugados): schema, RLS e bucket de storage"
```

---

### Task 2: Componente de mapa público (`RentalPropertiesMapView`)

**Files:**
- Create: `src/components/RentalPropertiesMapView.jsx`
- Test: manual (componente visual — sem suíte de testes automatizados no projeto; validar rodando `npm run dev` e abrindo a rota que a Task 4 vai criar)

**Interfaces:**
- Consumes: `useCity()` → `{ activeCity }`; `geocodeCity(name, uf)` de `src/lib/geocodeCity.js`; `FLORESTA_COORDS`, `INITIAL_ZOOM` de `src/config/mapConfig.js`.
- Produces: `export default function RentalPropertiesMapView({ properties, onSelectProperty })` — `properties: Array<{ id, address, location: {lat,lng}|null, thumbnail_url, is_active, monthly_value }>`. Ao clicar num pin, chama `onSelectProperty(property)` (o consumidor decide se navega para detalhes ou abre modal). Task 4 consome este componente.

Não generalizar `WorksMapView.jsx` (está fortemente acoplado a obras: status coloridos, `public_work_media`, medições). Criar um componente novo e mais simples, do zero, é mais barato e seguro.

- [ ] **Step 1: Criar o componente do mapa**

`src/components/RentalPropertiesMapView.jsx`:
```jsx
import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { geocodeCity } from '@/lib/geocodeCity';
import { useCity } from '@/contexts/CityContext';
import { formatCurrency } from '@/lib/utils';

const createPropertyMarkerIcon = (isActive) => {
  const color = isActive ? '#16A34A' : '#6B7280';
  const html = `
    <div style="
      background-color: ${color};
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <path d="M9 22V12h6v10"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-rental-property-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

// Centraliza no conjunto de imóveis carregados, ou na cidade ativa quando
// não há imóveis para exibir (mesmo padrão de FitToWorks em WorksMapView).
const FitToProperties = ({ properties, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (properties || [])
      .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng))
      .map((p) => [p.location.lat, p.location.lng]);

    if (pts.length > 0) {
      const key = 'properties:' + pts.map((p) => p.join(',')).sort().join('|');
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
  }, [properties, activeCity, map]);
  return null;
};

export default function RentalPropertiesMapView({ properties, onSelectProperty }) {
  const { activeCity } = useCity();
  const list = properties || [];

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <FitToProperties properties={list} activeCity={activeCity} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {list.map((property) => (
          property.location && (
            <Marker
              key={property.id}
              position={[property.location.lat, property.location.lng]}
              icon={createPropertyMarkerIcon(property.is_active)}
              eventHandlers={{
                click: () => onSelectProperty?.(property),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{property.address}</p>
                  {property.monthly_value != null && (
                    <p className="text-muted-foreground">{formatCurrency(property.monthly_value)}/mês</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila (esbuild)**

Run: `npx esbuild src/components/RentalPropertiesMapView.jsx --bundle --format=esm --outfile=/tmp/check.js --loader:.js=jsx --external:react --external:react-dom --external:react-leaflet --external:leaflet --external:@/config/mapConfig --external:@/lib/geocodeCity --external:@/contexts/CityContext --external:@/lib/utils`

Expected: sem erros de sintaxe (avisos de módulos externos não resolvidos são esperados e aceitáveis, já que os `--external` cobrem os aliases `@/`).

- [ ] **Step 3: Commit**

```bash
git add src/components/RentalPropertiesMapView.jsx
git commit -m "feat(imoveis-alugados): componente de mapa publico"
```

---

### Task 3: Página pública de detalhes (`RentalPropertyDetailsPage`)

**Files:**
- Create: `src/pages/RentalPropertyDetailsPage.jsx`
- Modify: `src/App.jsx` (rota `/imoveis-alugados/:id`)

**Interfaces:**
- Consumes: schema da Task 1 (`rental_properties`, `rental_property_contracts`, `rental_property_media`, `rental_property_documents`); `formatCurrency`, `formatDate` de `src/lib/utils.js`.
- Produces: rota pública `/imoveis-alugados/:id`. Task 4 (página de lista) linka para esta rota via `Link to={`/imoveis-alugados/${property.id}`}`.

- [ ] **Step 1: Criar a página de detalhes**

`src/pages/RentalPropertyDetailsPage.jsx`:
```jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Ruler, User, Building2, FileText, Image as ImageIcon, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';

const RentalPropertyDetailsPage = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [property, setProperty] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, contractsRes, mediaRes, docsRes] = await Promise.all([
        supabase.from('rental_properties').select('*, bairro:bairro_id(id, name)').eq('id', id).maybeSingle(),
        supabase.from('rental_property_contracts').select('*').eq('property_id', id).order('start_date', { ascending: false }),
        supabase.from('rental_property_media').select('*').eq('property_id', id).order('created_at'),
        supabase.from('rental_property_documents').select('*').eq('property_id', id).order('created_at'),
      ]);
      if (propRes.error) throw propRes.error;
      setProperty(propRes.data);
      setContracts(contractsRes.data || []);
      setMedia(mediaRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóvel', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando imóvel...</div>;
  }

  if (!property) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Imóvel não encontrado.</p>
        <Link to="/imoveis-alugados"><Button className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const currentContract = contracts.find((c) => c.is_current) || contracts[0] || null;

  return (
    <>
      <Helmet>
        <title>{property.address} - Imóveis Alugados - Trombone Cidadão</title>
      </Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="container max-w-4xl mx-auto w-full px-4 py-8">
        <Link to="/imoveis-alugados" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar para Imóveis Alugados
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{property.address}</h1>
            <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
              <MapPin className="w-4 h-4" /> {property.bairro?.name || 'Bairro não informado'}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${property.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {property.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {property.is_active ? 'Aluguel ativo' : 'Aluguel encerrado'}
          </div>
        </div>

        {media.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {media.map((m) => (
              <img key={m.id} src={m.url} alt={property.address} className="w-full h-40 object-cover rounded-xl border" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader><CardTitle className="text-base">Contrato atual</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {currentContract?.owner_name || 'Não informado'}</p>
              <p className="flex items-center gap-2 font-semibold text-lg text-tc-red">{currentContract ? formatCurrency(currentContract.monthly_value) : '—'}/mês</p>
              <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Início: {currentContract ? formatDate(currentContract.start_date) : '—'}</p>
              {currentContract?.end_date && (
                <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Fim: {formatDate(currentContract.end_date)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Características</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Ruler className="w-4 h-4 text-muted-foreground" />
                {property.length_m && property.width_m ? `${property.length_m}m x ${property.width_m}m (${property.area_m2}m²)` : 'Não informado'}
              </p>
              <p className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {property.department || 'Secretaria não informada'}</p>
              {property.characteristics && <p className="text-muted-foreground">{property.characteristics}</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader><CardTitle className="text-base">Histórico de valores</CardTitle></CardHeader>
          <CardContent>
            {contracts.length > 0 ? (
              <div className="space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{c.owner_name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : (c.is_current ? 'atual' : '—')}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(c.monthly_value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Documentos</CardTitle></CardHeader>
          <CardContent>
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-tc-red hover:underline p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{d.type === 'contrato' ? 'Contrato' : 'Aditivo'}{d.description ? ` — ${d.description}` : ''}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum documento disponível.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default RentalPropertyDetailsPage;
```

- [ ] **Step 2: Adicionar a rota em `src/App.jsx`**

Encontrar o import de `PublicWorksPage` (linha ~20) e adicionar logo abaixo:
```jsx
import RentalPropertyDetailsPage from '@/pages/RentalPropertyDetailsPage';
```
Encontrar a rota `<Route path="/obras-publicas" element={<PublicWorksPage />} />` (linha ~622) e adicionar logo abaixo:
```jsx
<Route path="/imoveis-alugados/:id" element={<RentalPropertyDetailsPage />} />
```
(A rota `/imoveis-alugados` de lista é adicionada na Task 4 — não duplicar aqui.)

- [ ] **Step 3: Verificar que compila**

Run: `npm run build` (a partir da raiz do projeto)

Expected: build finaliza sem erros relacionados a `RentalPropertyDetailsPage` ou às novas rotas.

- [ ] **Step 4: Commit**

```bash
git add src/pages/RentalPropertyDetailsPage.jsx src/App.jsx
git commit -m "feat(imoveis-alugados): pagina publica de detalhes do imovel"
```

---

### Task 4: Página pública de lista + mapa + estatísticas + relatório (`RentalPropertiesPage`)

**Files:**
- Create: `src/pages/RentalPropertiesPage.jsx`
- Modify: `src/App.jsx` (rota `/imoveis-alugados`)
- Modify: `src/config/menuConfig.js` (item de menu)

**Interfaces:**
- Consumes: `RentalPropertiesMapView` (Task 2); `CitySelector`, `useCity()` (existentes); schema da Task 1; `formatCurrency` de `src/lib/utils.js`; `jsPDF` + `jspdf-autotable` (mesmo padrão de `PavementMapPage.jsx`).
- Produces: rota pública `/imoveis-alugados` (lista principal do módulo).

- [ ] **Step 1: Criar a página de lista**

`src/pages/RentalPropertiesPage.jsx`:
```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Search, Building, DollarSign, TrendingUp, TrendingDown, Maximize2, Minimize2, Download, Loader2, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import RentalPropertiesMapView from '@/components/RentalPropertiesMapView';
import CitySelector from '@/components/CitySelector';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const StatCard = ({ icon: Icon, label, value, color }) => (
  <Card className="border-border">
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const RentalPropertiesPage = () => {
  const { activeCityId, activeCityName } = useCity();
  const { toast } = useToast();
  const [properties, setProperties] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [searchOwner, setSearchOwner] = useState('');
  const [selectedBairro, setSelectedBairro] = useState('all');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rental_properties')
        .select(`
          id, address, location, is_active, area_m2, bairro_id,
          bairro:bairro_id(id, name),
          contracts:rental_property_contracts(id, owner_name, monthly_value, is_current, start_date, end_date)
        `)
        .order('created_at', { ascending: false });
      if (activeCityId) query = query.eq('city_id', activeCityId);
      const { data, error } = await query;
      if (error) throw error;
      const formatted = (data || []).map((p) => {
        const currentContract = (p.contracts || []).find((c) => c.is_current) || null;
        return {
          ...p,
          location: p.location ? { lat: p.location.coordinates[1], lng: p.location.coordinates[0] } : null,
          currentContract,
          monthly_value: currentContract?.monthly_value ?? null,
          owner_name: currentContract?.owner_name ?? null,
        };
      });
      setProperties(formatted);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóveis alugados', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeCityId, toast]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('id, name');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (!error) setBairros(data || []);
  }, [activeCityId]);

  useEffect(() => {
    fetchProperties();
    fetchBairros();
    setSelectedBairro('all');
  }, [fetchProperties, fetchBairros]);

  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const ownerMatch = !searchOwner.trim() || (p.owner_name || '').toLowerCase().includes(searchOwner.trim().toLowerCase());
      const bairroMatch = selectedBairro === 'all' || p.bairro_id === selectedBairro;
      return ownerMatch && bairroMatch;
    });
  }, [properties, searchOwner, selectedBairro]);

  const stats = useMemo(() => {
    const active = properties.filter((p) => p.is_active && p.monthly_value != null);
    const withArea = properties.filter((p) => Number.isFinite(p.area_m2));
    const mostExpensive = active.length ? active.reduce((a, b) => (b.monthly_value > a.monthly_value ? b : a)) : null;
    const cheapest = active.length ? active.reduce((a, b) => (b.monthly_value < a.monthly_value ? b : a)) : null;
    const largest = withArea.length ? withArea.reduce((a, b) => (b.area_m2 > a.area_m2 ? b : a)) : null;
    const smallest = withArea.length ? withArea.reduce((a, b) => (b.area_m2 < a.area_m2 ? b : a)) : null;
    const annualTotal = active.reduce((sum, p) => sum + Number(p.monthly_value || 0), 0) * 12;
    return { mostExpensive, cheapest, largest, smallest, annualTotal };
  }, [properties]);

  const handleDownloadReport = () => {
    setDownloading(true);
    try {
      const doc = new jsPDF();
      const title = `Relatório de Imóveis Alugados${activeCityName ? ` — ${activeCityName}` : ''}`;
      doc.setFontSize(16);
      doc.text(title, 14, 18);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26);
      doc.setFontSize(12);
      doc.text(`Gasto anual total (contratos ativos): ${formatCurrency(stats.annualTotal)}`, 14, 34);

      const rows = filteredProperties.map((p) => [
        p.address,
        p.bairro?.name || '-',
        p.owner_name || '-',
        p.monthly_value != null ? formatCurrency(p.monthly_value) : '-',
        p.is_active ? 'Ativo' : 'Encerrado',
      ]);
      doc.autoTable({
        head: [['Endereço', 'Bairro', 'Proprietário', 'Valor mensal', 'Status']],
        body: rows,
        startY: 42,
        styles: { fontSize: 9 },
      });
      doc.save(`relatorio_imoveis_alugados_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({ title: 'Download concluído!' });
    } catch (error) {
      toast({ title: 'Erro ao gerar relatório', description: error.message, variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  };

  return (
    <>
      <Helmet>
        <title>Imóveis Alugados - Trombone Cidadão</title>
        <meta name="description" content="Acompanhe os imóveis alugados pela prefeitura, valores e contratos." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Imóveis Alugados pela Prefeitura</h1>
          <p className="mt-2 text-muted-foreground">Acompanhe os gastos e o uso de cada imóvel alugado</p>
          <div className="mt-4 flex justify-center">
            <CitySelector />
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={TrendingUp} label="Mais caro" value={stats.mostExpensive ? formatCurrency(stats.mostExpensive.monthly_value) : '—'} color="bg-red-500" />
          <StatCard icon={TrendingDown} label="Mais barato" value={stats.cheapest ? formatCurrency(stats.cheapest.monthly_value) : '—'} color="bg-green-500" />
          <StatCard icon={Maximize2} label="Maior imóvel" value={stats.largest ? `${stats.largest.area_m2}m²` : '—'} color="bg-blue-500" />
          <StatCard icon={Minimize2} label="Menor imóvel" value={stats.smallest ? `${stats.smallest.area_m2}m²` : '—'} color="bg-amber-500" />
          <StatCard icon={DollarSign} label="Gasto anual total" value={formatCurrency(stats.annualTotal)} color="bg-tc-red" />
        </div>

        <Card className="mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome do proprietário..." className="pl-9" value={searchOwner} onChange={(e) => setSearchOwner(e.target.value)} />
            </div>
            <Combobox
              value={selectedBairro}
              onChange={setSelectedBairro}
              options={[{ value: 'all', label: 'Todos os bairros' }, ...bairros.map((b) => ({ value: b.id, label: b.name }))]}
              placeholder="Filtrar por bairro"
              searchPlaceholder="Buscar bairro..."
            />
            <Button onClick={handleDownloadReport} disabled={downloading} variant="outline">
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Baixar Relatório
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="text-center p-8">Carregando imóveis...</div>
        ) : (
          <>
            <div className="h-[50vh] w-full rounded-xl overflow-hidden shadow-lg border mb-6">
              <RentalPropertiesMapView properties={filteredProperties} onSelectProperty={(p) => window.location.assign(`/imoveis-alugados/${p.id}`)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProperties.length > 0 ? filteredProperties.map((property) => (
                <Card key={property.id} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
                  <div className="relative h-32 w-full bg-muted">
                    {property.thumbnail_url ? (
                      <img src={property.thumbnail_url} alt={property.address} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Building className="w-8 h-8" /></div>
                    )}
                  </div>
                  <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold mb-1 line-clamp-1">{property.address}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{property.bairro?.name || 'Bairro não informado'}</p>
                    {property.owner_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><User className="w-3 h-3" /> {property.owner_name}</p>
                    )}
                    {property.monthly_value != null && (
                      <p className="text-sm font-semibold text-tc-red mt-auto">{formatCurrency(property.monthly_value)}/mês</p>
                    )}
                    <Link to={`/imoveis-alugados/${property.id}`} className="mt-3">
                      <Button className="w-full" size="sm">Ver Detalhes</Button>
                    </Link>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nenhum imóvel encontrado com os filtros selecionados.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default RentalPropertiesPage;
```

- [ ] **Step 2: Adicionar a rota em `src/App.jsx`**

Adicionar o import junto ao de `RentalPropertyDetailsPage` (da Task 3):
```jsx
import RentalPropertiesPage from '@/pages/RentalPropertiesPage';
```
Adicionar a rota **antes** de `/imoveis-alugados/:id` (rotas mais específicas depois das genéricas não importa aqui pois os paths não colidem, mas manter ordem de leitura):
```jsx
<Route path="/imoveis-alugados" element={<RentalPropertiesPage />} />
```

- [ ] **Step 3: Adicionar item de menu**

Em `src/config/menuConfig.js`, dentro de `defaultMenuSettings.items`, adicionar após o item `'Obras'`:
```js
{ name: 'Imóveis Alugados', path: '/imoveis-alugados', icon: 'Building', isVisible: true },
```

- [ ] **Step 4: Verificar que compila e rodar visualmente**

Run: `npm run build`

Expected: build sem erros. Depois, `npm run dev` e abrir `http://localhost:5173/imoveis-alugados` — deve carregar sem erros no console (lista vazia é esperado até a Task 5 permitir cadastro).

- [ ] **Step 5: Commit**

```bash
git add src/pages/RentalPropertiesPage.jsx src/App.jsx src/config/menuConfig.js
git commit -m "feat(imoveis-alugados): pagina publica de lista, mapa, estatisticas e relatorio"
```

---

### Task 5: Página de gestão (`ManageRentalPropertiesPage`) — CRUD do imóvel + rotas

**Files:**
- Create: `src/pages/admin/ManageRentalPropertiesPage.jsx`
- Modify: `src/App.jsx` (rotas `/admin/imoveis-alugados` e `/imoveis-alugados/gerenciar`)

**Interfaces:**
- Consumes: `LocationPickerMap` (existente, prop `fallbackCityCenter`), `useCityIdFromLocation` (existente), `AmbassadorOrAdminRoute` e `AdminRoute` (existentes em `src/App.jsx`), `useAuth()` → `user.{is_admin,is_master,is_ambassador}`, schema da Task 1.
- Produces: CRUD completo do imóvel (sem contratos/mídia/documentos ainda — essas vêm na Task 6). Exporta também `RentalPropertyEditModal` (nomeado, como `WorkEditModal` é exportado de `ManageWorksPage.jsx`) para a Task 6 estender com as abas de contrato/mídia/documentos.

- [ ] **Step 1: Criar a página de gestão com o modal de edição**

`src/pages/admin/ManageRentalPropertiesPage.jsx`:
```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { PlusCircle, Edit, Trash2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import LocationPickerMap from '@/components/LocationPickerMap';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';

export const RentalPropertyEditModal = ({ property, onSave, onClose, bairros, defaultCityId, fallbackCityCenter, onBairroCreated }) => {
  const { toast } = useToast();
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [formData, setFormData] = useState(null);
  const [bairroSearch, setBairroSearch] = useState('');
  const [creatingBairro, setCreatingBairro] = useState(false);
  const [fetchingMapBairro, setFetchingMapBairro] = useState(false);
  const addressTouchedRef = useRef(false);

  useEffect(() => {
    if (property) {
      const parseLocation = (loc) => {
        if (!loc) return null;
        if (typeof loc === 'object' && loc.coordinates) return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        if (typeof loc === 'string') {
          const match = loc.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
          if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
        }
        return null;
      };
      const initialData = property.id ? {
        ...property,
        location: parseLocation(property.location),
        bairro_id: property.bairro_id || '',
      } : {
        id: null,
        address: '',
        location: null,
        bairro_id: '',
        length_m: '',
        width_m: '',
        characteristics: '',
        department: '',
        is_active: true,
      };
      setFormData(initialData);
      addressTouchedRef.current = !!(initialData.address && initialData.address.trim());
    }
  }, [property]);

  const resolveTargetCityId = async () => {
    if (defaultCityId) return defaultCityId;
    if (formData?.location) return await resolveCityIdFromLocation(formData.location);
    return null;
  };

  const handleCreateBairro = async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    const cityId = await resolveTargetCityId();
    if (!cityId) {
      toast({ title: 'Defina a localização no mapa primeiro', description: 'Precisamos da cidade para criar o bairro.', variant: 'destructive' });
      return;
    }
    const existing = (bairros || []).find((b) => (b.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setFormData((prev) => ({ ...prev, bairro_id: existing.id }));
      setBairroSearch('');
      return;
    }
    setCreatingBairro(true);
    const { data, error } = await supabase.from('bairros').insert({ name, city_id: cityId }).select('id, name').single();
    setCreatingBairro(false);
    if (error) {
      toast({ title: 'Erro ao criar bairro', description: error.message, variant: 'destructive' });
      return;
    }
    onBairroCreated?.(data);
    setFormData((prev) => ({ ...prev, bairro_id: data.id }));
    setBairroSearch('');
    toast({ title: `Bairro "${data.name}" criado.` });
  };

  const handleUseBairroFromMap = async () => {
    if (!formData?.location) {
      toast({ title: 'Marque a localização no mapa primeiro', variant: 'destructive' });
      return;
    }
    setFetchingMapBairro(true);
    try {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: formData.location.lat, lng: formData.location.lng, zoom: 18 },
      });
      const suburb = !error ? (data?.suburb || null) : null;
      if (!suburb) {
        toast({ title: 'Bairro não encontrado no mapa', description: 'Digite o nome do bairro manualmente.', variant: 'destructive' });
        return;
      }
      await handleCreateBairro(suburb);
    } finally {
      setFetchingMapBairro(false);
    }
  };

  const handleLocationChange = (newLocation) => {
    setFormData((prev) => ({ ...prev, location: newLocation }));
    if (!newLocation || addressTouchedRef.current) return;
    supabase.functions
      .invoke('reverse-geocode', { body: { lat: newLocation.lat, lng: newLocation.lng, zoom: 18 } })
      .then(({ data, error }) => {
        if (error) return;
        const addr = data?.address;
        if (typeof addr === 'string' && addr.trim()) {
          setFormData((prev) => (addressTouchedRef.current ? prev : { ...prev, address: addr }));
        }
      })
      .catch(() => {});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!formData) return null;

  const filteredBairros = (bairros || []).filter((b) => (b.name || '').toLowerCase().includes(bairroSearch.toLowerCase()));

  return (
    <Dialog open={!!property} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property?.id ? 'Editar Imóvel' : 'Novo Imóvel Alugado'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="h-64 rounded-xl overflow-hidden border">
            <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} fallbackCityCenter={fallbackCityCenter} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" name="address" value={formData.address} onChange={(e) => { addressTouchedRef.current = true; handleChange(e); }} required />
          </div>

          <div className="grid gap-2">
            <Label>Bairro</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar ou criar bairro..."
                value={bairroSearch}
                onChange={(e) => setBairroSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBairro(bairroSearch); } }}
              />
              <Button type="button" variant="outline" disabled={creatingBairro} onClick={() => handleCreateBairro(bairroSearch)}>
                Criar
              </Button>
              <Button type="button" variant="outline" disabled={fetchingMapBairro} onClick={handleUseBairroFromMap}>
                Usar bairro do mapa
              </Button>
            </div>
            {filteredBairros.length > 0 && (
              <div className="max-h-32 overflow-y-auto border rounded-md">
                {filteredBairros.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => setFormData((prev) => ({ ...prev, bairro_id: b.id }))}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${formData.bairro_id === b.id ? 'bg-muted font-semibold' : ''}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="length_m">Comprimento (m)</Label>
              <Input id="length_m" name="length_m" type="number" step="0.01" value={formData.length_m || ''} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="width_m">Largura (m)</Label>
              <Input id="width_m" name="width_m" type="number" step="0.01" value={formData.width_m || ''} onChange={handleChange} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="characteristics">Características e utilização</Label>
            <Input id="characteristics" name="characteristics" value={formData.characteristics || ''} onChange={handleChange} placeholder="Ex: prédio de 2 andares, usado como posto de saúde" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="department">Secretaria Municipal responsável</Label>
            <Input id="department" name="department" value={formData.department || ''} onChange={handleChange} placeholder="Ex: Secretaria de Saúde" />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))} />
            <Label htmlFor="is_active">Aluguel ativo</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageRentalPropertiesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [properties, setProperties] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProperty, setEditingProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]);

  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const { resolveCityIdFromLocation } = useCityIdFromLocation();

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
        setMyCities(rows.map((r) => ({ id: r.city_id, name: r.cities?.name || null, uf: r.cities?.states?.uf || null })).filter((c) => c.name));
      });
  }, [isScopedAmbassador, user?.id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rental_properties')
        .select('*, bairro:bairro_id(id, name), contracts:rental_property_contracts(owner_name, monthly_value, is_current)')
        .order('created_at', { ascending: false });
      if (isScopedAmbassador) {
        if (myActiveCityIds.length === 0) { setProperties([]); setLoading(false); return; }
        query = query.in('city_id', myActiveCityIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóveis', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isScopedAmbassador, myActiveCityIds, toast]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*');
    if (isScopedAmbassador && myActiveCityIds.length > 0) query = query.in('city_id', myActiveCityIds);
    const { data, error } = await query;
    if (!error) setBairros(data || []);
  }, [isScopedAmbassador, myActiveCityIds]);

  useEffect(() => { fetchData(); fetchBairros(); }, [fetchData, fetchBairros]);

  const handleSaveProperty = async (propertyToSave) => {
    const { id, location, bairro, contracts, ...data } = propertyToSave;

    let resolvedCityId = null;
    if (location) {
      resolvedCityId = await resolveCityIdFromLocation(location);
    }
    if (resolvedCityId == null) {
      toast({ title: 'Não foi possível identificar a cidade', description: 'Confira se o marcador no mapa está sobre a localização correta.', variant: 'destructive' });
      return;
    }
    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({ title: 'Fora da sua área', description: 'Você só pode gerenciar imóveis nas suas cidades.', variant: 'destructive' });
      return;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    const payload = { ...data, location: locationString, city_id: resolvedCityId };
    if (payload.bairro_id === '') payload.bairro_id = null;
    ['length_m', 'width_m'].forEach((k) => { if (payload[k] === '') payload[k] = null; });

    let result;
    if (id) {
      result = await supabase.from('rental_properties').update(payload).eq('id', id).select().single();
    } else {
      result = await supabase.from('rental_properties').insert(payload).select().single();
    }

    if (result.error) {
      toast({ title: 'Erro ao salvar imóvel', description: result.error.message, variant: 'destructive' });
    } else {
      toast({ title: `Imóvel ${id ? 'atualizado' : 'criado'} com sucesso!` });
      await fetchData();
      setEditingProperty(null);
    }
  };

  const handleDeleteProperty = async (propertyId) => {
    const { error } = await supabase.from('rental_properties').delete().eq('id', propertyId);
    if (error) {
      toast({ title: 'Erro ao remover imóvel', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Imóvel removido com sucesso!', variant: 'destructive' });
      fetchData();
    }
    setDeletingProperty(null);
  };

  const filteredProperties = properties.filter((p) => !searchTerm || p.address.toLowerCase().includes(searchTerm.toLowerCase()));

  const fallbackCityCenter = isScopedAmbassador && myCities.length > 0 ? { name: myCities[0].name, uf: myCities[0].uf } : null;
  const defaultCityId = isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null;

  return (
    <>
      <Helmet><title>Gerenciar Imóveis Alugados - Trombone Cidadão</title></Helmet>
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-tc-red">
            {isScopedAmbassador ? 'Imóveis alugados da minha cidade' : 'Gerenciar Imóveis Alugados'}
          </h1>
          <Button onClick={() => setEditingProperty({})}>
            <PlusCircle className="w-4 h-4 mr-2" /> Novo Imóvel
          </Button>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por endereço..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {loading ? (
          <div className="text-center py-10">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProperties.map((property) => {
              const currentContract = (property.contracts || []).find((c) => c.is_current);
              return (
                <Card key={property.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold line-clamp-1">{property.address}</h3>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditingProperty(property)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeletingProperty(property)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {property.bairro?.name || 'Sem bairro'}</p>
                    {currentContract && <p className="text-sm font-semibold text-tc-red">{currentContract.owner_name}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editingProperty && (
        <RentalPropertyEditModal
          property={editingProperty}
          onSave={handleSaveProperty}
          onClose={() => setEditingProperty(null)}
          bairros={bairros}
          defaultCityId={defaultCityId}
          fallbackCityCenter={fallbackCityCenter}
          onBairroCreated={(newBairro) => setBairros((prev) => [...prev, newBairro])}
        />
      )}

      <AlertDialog open={!!deletingProperty} onOpenChange={(open) => !open && setDeletingProperty(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover imóvel?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os contratos, fotos e documentos vinculados também serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDeleteProperty(deletingProperty.id)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageRentalPropertiesPage;
```


- [ ] **Step 2: Adicionar as rotas em `src/App.jsx`**

Adicionar o import junto aos demais desta página:
```jsx
import ManageRentalPropertiesPage from '@/pages/admin/ManageRentalPropertiesPage';
```
Adicionar as rotas próximas de `/obras/gerenciar` (linha ~647):
```jsx
<Route path="/admin/imoveis-alugados" element={<AdminRoute><ManageRentalPropertiesPage /></AdminRoute>} />
<Route path="/imoveis-alugados/gerenciar" element={<AmbassadorOrAdminRoute><ManageRentalPropertiesPage /></AmbassadorOrAdminRoute>} />
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`

Expected: build sem erros. Prestar atenção a qualquer warning de "Rules of Hooks" no console do `npm run dev` relacionado ao uso de `useCityIdFromLocation` dentro de `handleSaveProperty` — deve estar corrigido conforme a nota do Step 1.

- [ ] **Step 4: Teste manual (dev, banco `xxdletrjyjajtrmhwzev`)**

Logado como admin, acessar `/admin/imoveis-alugados`, clicar "Novo Imóvel", marcar um pin no mapa (em Floresta-PE, cidade já conhecida), preencher endereço, comprimento/largura, características, secretaria, salvar. Verificar:
```bash
npx supabase db query --linked "select id, address, city_id, area_m2 from public.rental_properties order by created_at desc limit 1;"
```
Expected: uma linha nova com `city_id` preenchido (não null) e `area_m2` calculado corretamente (comprimento × largura).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/ManageRentalPropertiesPage.jsx src/App.jsx
git commit -m "feat(imoveis-alugados): pagina de gestao CRUD do imovel com escopo de embaixador"
```

---

### Task 6: Gestão de contratos, fotos e documentos (aba dentro do modal de edição)

**Files:**
- Modify: `src/pages/admin/ManageRentalPropertiesPage.jsx` (adicionar abas Tabs no `RentalPropertyEditModal`, novo estado/handlers de contratos e mídia)

**Interfaces:**
- Consumes: `RentalPropertyEditModal` da Task 5 (mesmo arquivo); bucket `rental-property-media` (Task 1); schema `rental_property_contracts`/`rental_property_media`/`rental_property_documents` (Task 1).
- Produces: dentro do modal — aba "Contratos" (histórico + criar novo, que encerra o anterior) e aba "Mídia" (upload de fotos e documentos). Só disponível quando `property.id` existe (imóvel já salvo — mesma lógica de `formData?.id` em `WorkEditModal`).

- [ ] **Step 1: Adicionar `Tabs` ao redor do formulário existente**

Em `src/pages/admin/ManageRentalPropertiesPage.jsx`, importar `Tabs, TabsContent, TabsList, TabsTrigger` de `@/components/ui/tabs`, e envolver o conteúdo atual do `<form>` dentro de `RentalPropertyEditModal` numa aba "Informações", adicionando abas "Contratos" e "Mídia" que só aparecem quando `formData?.id` existe:

```jsx
// Dentro de RentalPropertyEditModal, substituir o <form>...</form> por:
<Tabs defaultValue="info" className="w-full">
  <TabsList className={`grid w-full ${formData.id ? 'grid-cols-3' : 'grid-cols-1'} mb-4`}>
    <TabsTrigger value="info">Informações</TabsTrigger>
    {formData.id && <TabsTrigger value="contracts">Contratos</TabsTrigger>}
    {formData.id && <TabsTrigger value="media">Mídia</TabsTrigger>}
  </TabsList>
  <TabsContent value="info">
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ...todo o conteúdo do form já escrito na Task 5, sem alterações... */}
    </form>
  </TabsContent>
  {formData.id && (
    <TabsContent value="contracts">
      <RentalContractsManager propertyId={formData.id} />
    </TabsContent>
  )}
  {formData.id && (
    <TabsContent value="media">
      <RentalMediaManager propertyId={formData.id} />
    </TabsContent>
  )}
</Tabs>
```

- [ ] **Step 2: Implementar `RentalContractsManager`**

Adicionar no mesmo arquivo, antes de `RentalPropertyEditModal`:
```jsx
const RentalContractsManager = ({ propertyId }) => {
  const { toast } = useToast();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newContract, setNewContract] = useState({ owner_name: '', monthly_value: '', start_date: '' });
  const [saving, setSaving] = useState(false);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_property_contracts')
      .select('*')
      .eq('property_id', propertyId)
      .order('start_date', { ascending: false });
    if (!error) setContracts(data || []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (!newContract.owner_name.trim() || !newContract.monthly_value || !newContract.start_date) {
      toast({ title: 'Preencha proprietário, valor e data de início', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const current = contracts.find((c) => c.is_current);
      if (current) {
        const { error: closeError } = await supabase
          .from('rental_property_contracts')
          .update({ is_current: false, end_date: current.end_date || newContract.start_date })
          .eq('id', current.id);
        if (closeError) throw closeError;
      }
      const { error: insertError } = await supabase.from('rental_property_contracts').insert({
        property_id: propertyId,
        owner_name: newContract.owner_name.trim(),
        monthly_value: Number(newContract.monthly_value),
        start_date: newContract.start_date,
        is_current: true,
      });
      if (insertError) throw insertError;
      toast({ title: 'Contrato criado. O contrato anterior foi encerrado automaticamente.' });
      setNewContract({ owner_name: '', monthly_value: '', start_date: '' });
      await fetchContracts();
    } catch (error) {
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateContract} className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 border rounded-lg">
        <Input placeholder="Nome do proprietário" value={newContract.owner_name} onChange={(e) => setNewContract((p) => ({ ...p, owner_name: e.target.value }))} />
        <Input placeholder="Valor mensal" type="number" step="0.01" value={newContract.monthly_value} onChange={(e) => setNewContract((p) => ({ ...p, monthly_value: e.target.value }))} />
        <Input placeholder="Data de início" type="date" value={newContract.start_date} onChange={(e) => setNewContract((p) => ({ ...p, start_date: e.target.value }))} />
        <Button type="submit" disabled={saving}>Novo Contrato</Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico...</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
              <div>
                <p className="font-medium">{c.owner_name} {c.is_current && <span className="text-xs text-green-600">(atual)</span>}</p>
                <p className="text-xs text-muted-foreground">{c.start_date} — {c.end_date || 'em vigor'}</p>
              </div>
              <p className="font-semibold">{c.monthly_value}</p>
            </div>
          ))}
          {contracts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado ainda.</p>}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Implementar `RentalMediaManager`**

Adicionar no mesmo arquivo, antes de `RentalPropertyEditModal`:
```jsx
const RentalMediaManager = ({ propertyId }) => {
  const { toast } = useToast();
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docType, setDocType] = useState('contrato');

  const fetchMedia = useCallback(async () => {
    const [photosRes, docsRes] = await Promise.all([
      supabase.from('rental_property_media').select('*').eq('property_id', propertyId).order('created_at'),
      supabase.from('rental_property_documents').select('*').eq('property_id', propertyId).order('created_at'),
    ]);
    setPhotos(photosRes.data || []);
    setDocuments(docsRes.data || []);
  }, [propertyId]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `properties/${propertyId}/photos/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('rental-property-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('rental-property-media').getPublicUrl(path);
        const { error: dbError } = await supabase.from('rental_property_media').insert({ property_id: propertyId, url: publicUrl });
        if (dbError) throw dbError;
      }
      toast({ title: 'Fotos adicionadas' });
      await fetchMedia();
    } catch (error) {
      toast({ title: 'Erro ao enviar fotos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleUploadDocuments = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingDocs(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `properties/${propertyId}/documents/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('rental-property-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('rental-property-media').getPublicUrl(path);
        const { error: dbError } = await supabase.from('rental_property_documents').insert({ property_id: propertyId, type: docType, url: publicUrl, description: file.name });
        if (dbError) throw dbError;
      }
      toast({ title: 'Documentos adicionados' });
      await fetchMedia();
    } catch (error) {
      toast({ title: 'Erro ao enviar documentos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleRemovePhoto = async (photo) => {
    const { error } = await supabase.from('rental_property_media').delete().eq('id', photo.id);
    if (!error) {
      try {
        const filePath = new URL(photo.url).pathname.split('/rental-property-media/')[1];
        if (filePath) await supabase.storage.from('rental-property-media').remove([decodeURIComponent(filePath)]);
      } catch {}
      fetchMedia();
    }
  };

  const handleRemoveDocument = async (doc) => {
    const { error } = await supabase.from('rental_property_documents').delete().eq('id', doc.id);
    if (!error) {
      try {
        const filePath = new URL(doc.url).pathname.split('/rental-property-media/')[1];
        if (filePath) await supabase.storage.from('rental-property-media').remove([decodeURIComponent(filePath)]);
      } catch {}
      fetchMedia();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Fotos do imóvel</Label>
        <Input type="file" accept="image/*" multiple onChange={handleUploadPhotos} disabled={uploadingPhotos} />
        <div className="grid grid-cols-3 gap-2 mt-3">
          {photos.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.url} alt="" className="w-full h-20 object-cover rounded-md" />
              <button type="button" onClick={() => handleRemovePhoto(p)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Documentos (contrato / aditivos)</Label>
        <div className="flex gap-2 mb-2">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-md px-2 text-sm">
            <option value="contrato">Contrato</option>
            <option value="aditivo">Aditivo</option>
          </select>
          <Input type="file" accept="application/pdf,image/*" multiple onChange={handleUploadDocuments} disabled={uploadingDocs} />
        </div>
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-tc-red hover:underline truncate flex-1">
                {d.type === 'contrato' ? 'Contrato' : 'Aditivo'} — {d.description}
              </a>
              <Button size="icon" variant="ghost" onClick={() => handleRemoveDocument(d)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>}
        </div>
      </div>
    </div>
  );
};
```

Import necessário no topo do arquivo: `import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';`

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`

Expected: sem erros de sintaxe ou import faltando.

- [ ] **Step 5: Teste manual (dev, banco `xxdletrjyjajtrmhwzev`)**

No imóvel criado na Task 5, abrir a aba "Contratos", criar um contrato (proprietário, valor, data início) → aparece como "(atual)". Criar um segundo contrato → o primeiro deve sair da lista de "atual" e ganhar `end_date`. Verificar:
```bash
npx supabase db query --linked "select owner_name, monthly_value, is_current, start_date, end_date from public.rental_property_contracts order by created_at;"
```
Expected: só 1 linha com `is_current = true` (a mais recente); a anterior com `end_date` preenchida.

Na aba "Mídia", enviar uma foto e um documento PDF → devem aparecer na página pública de detalhes (`/imoveis-alugados/:id`) criada na Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/ManageRentalPropertiesPage.jsx
git commit -m "feat(imoveis-alugados): gestao de contratos historico e midia (fotos/documentos)"
```

---

## Verificação final da Fase 1 (dev `xxdletrjyjajtrmhwzev` apenas)

- Criar imóvel como admin em Floresta → `city_id` resolvido do marcador (Task 5, Step 4).
- Criar imóvel como embaixador → só permite dentro da(s) cidade(s) dele; RLS bloqueia fora.
- Criar 2º contrato → 1º encerra automaticamente; nunca 2 `is_current=true` simultâneos (constraint testada).
- Upload de fotos e documentos funciona; documentos ficam acessíveis publicamente na página de detalhes.
- `/imoveis-alugados` mostra mapa + lista + estatísticas (mais caro/barato, maior/menor, gasto anual) corretas para os dados cadastrados.
- Filtro por bairro e por nome do proprietário funcionam na lista pública.
- Botão "Baixar Relatório" gera PDF com endereço, proprietário, valor.
- `/imoveis-alugados/:id` mostra todas as informações pedidas: valor, endereço/bairro, documentos, fotos, tamanho, características, proprietário, histórico, datas, status ativo/inativo, secretaria.
- Menu do site mostra o novo item "Imóveis Alugados".

## Fora de escopo (YAGNI, herdado do spec)

- Assinatura eletrônica/validação de autenticidade de documentos.
- Alertas de contrato vencendo.
- Cadastro estruturado de "Secretaria" (texto livre, decisão travada).
- Cálculo de gasto anual "real" com meses parciais.
- Multi-imóvel por contrato ou múltiplos contratos correntes simultâneos.
