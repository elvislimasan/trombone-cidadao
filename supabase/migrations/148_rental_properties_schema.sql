-- 148_rental_properties_schema.sql
-- Módulo "Imóveis Alugados": mapa de imóveis que a prefeitura aluga,
-- com histórico de contratos, fotos e documentos. Nacional desde o início
-- (city_id obrigatório), seguindo o padrão de public_works.

create table if not exists public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id),
  bairro_id uuid references public.bairros(id),
  address text not null,
  -- Tipo qualificado com o schema: o PostGIS vive em `extensions`, que não
  -- está no search_path durante o `supabase db push` -- sem o prefixo a
  -- migração falha com 'type "geography" does not exist'. A 156 converte
  -- esta coluna para geometry logo em seguida.
  location extensions.geography(point, 4326),
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
create index if not exists idx_rental_properties_city_id on public.rental_properties (city_id);
create index if not exists idx_rental_properties_bairro_id on public.rental_properties (bairro_id);

create table if not exists public.rental_property_contracts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_name text not null,
  monthly_value numeric not null,
  start_date date not null,
  end_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_rental_property_contracts_property_id on public.rental_property_contracts (property_id);
create unique index if not exists uq_rental_contracts_one_current
  on public.rental_property_contracts (property_id)
  where is_current;

create table if not exists public.rental_property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rental_property_media_property_id on public.rental_property_media (property_id);

create table if not exists public.rental_property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  contract_id uuid references public.rental_property_contracts(id) on delete cascade,
  type text not null check (type in ('contrato', 'aditivo')),
  url text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rental_property_documents_property_id on public.rental_property_documents (property_id);

notify pgrst, 'reload schema';
