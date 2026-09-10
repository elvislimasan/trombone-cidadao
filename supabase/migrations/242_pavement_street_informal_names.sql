-- Apelidos e nomes informais ajudam o morador a encontrar a rua sem alterar o
-- nome oficial usado em documentos, CEP e URL.

alter table public.pavement_streets
  add column if not exists informal_names text[] not null default '{}'::text[];

alter table public.pavement_streets
  drop constraint if exists pavement_streets_informal_names_limit;

alter table public.pavement_streets
  add constraint pavement_streets_informal_names_limit
  check (cardinality(informal_names) <= 20);

create index if not exists pavement_streets_informal_names_idx
  on public.pavement_streets using gin (informal_names);

comment on column public.pavement_streets.informal_names is
  'Apelidos, nomes antigos ou informais da via. Nao substituem pavement_streets.name.';
