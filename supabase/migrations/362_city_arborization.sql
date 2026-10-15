begin;

-- O inventário de arborização compartilha a concessão municipal de Planejamento
-- Urbano: master global ou órgão público com cargo, cidade e permissão explícita.
create table public.city_trees (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id) on delete cascade,
  common_name text not null check (length(trim(common_name)) between 1 and 160),
  scientific_name text,
  origin text not null default 'nao_identificada' check (origin in ('nativa', 'exotica', 'nao_identificada')),
  status text not null default 'saudavel' check (status in ('saudavel', 'atencao', 'risco', 'removida')),
  address text,
  neighborhood text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  height_m numeric check (height_m > 0),
  crown_diameter_m numeric check (crown_diameter_m > 0),
  planted_at date,
  maintenance_action text not null default 'nenhuma' check (maintenance_action in ('nenhuma', 'vistoria', 'poda', 'tratamento', 'remocao', 'plantio')),
  maintenance_due_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index city_trees_city_created_idx on public.city_trees(city_id, created_at desc, id);
create index city_trees_city_status_idx on public.city_trees(city_id, status);

create function public.touch_city_tree() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger city_trees_updated before update on public.city_trees
  for each row execute function public.touch_city_tree();

alter table public.city_trees enable row level security;
revoke all on public.city_trees from public, anon, authenticated;
grant select on public.city_trees to anon, authenticated;
grant insert, update, delete on public.city_trees to authenticated;
create policy city_trees_public_read on public.city_trees for select to anon, authenticated using (true);
create policy city_trees_insert on public.city_trees for insert to authenticated
  with check (public.pode_gerenciar_mapa_ruas(city_id));
create policy city_trees_update on public.city_trees for update to authenticated
  using (public.pode_gerenciar_mapa_ruas(city_id)) with check (public.pode_gerenciar_mapa_ruas(city_id));
create policy city_trees_delete on public.city_trees for delete to authenticated
  using (public.pode_gerenciar_mapa_ruas(city_id));

comment on table public.city_trees is 'Inventário público de árvores urbanas; manutenção restrita aos gestores de Planejamento Urbano da cidade.';

-- Reserva as rotas públicas também na validação de usernames do banco.
create or replace function public.is_username_reserved(p_username text)
returns boolean language sql immutable set search_path = public as $$
  select lower(trim(p_username)) in (
    'admin', 'administrator', 'suporte', 'support', 'trombone', 'trombonecidadao',
    'prefeitura', 'vereador', 'vereadores', 'mandato', 'oficial', 'governo', 'camara',
    'feed', 'mapa', 'bronca', 'broncas', 'obras', 'obras-publicas', 'estatisticas',
    'sobre', 'contato', 'noticia', 'noticias', 'servicos', 'guiadacidade', 'guia-da-cidade', 'perfil', 'login', 'cadastro',
    'entrar', 'sair', 'ajuda', 'termos', 'privacidade', 'patrulha', 'missoes',
    'agora', 'radar', 'pavimentacao', 'mapa-pavimentacao', 'arborizacao', 'mapa-arborizacao', 'abaixo-assinado',
    'abaixo-assinados', 'peticoes', 'favoritos', 'salvos-outros', 'obras-favoritas',
    'settings', 'configuracoes', 'explorar', 'seguindo', 'api', 'auth', 'share', 'u',
    'root', 'moderador', 'moderacao', 'sistema', 'ouvidoria', 'denuncia', 'relatorio',
    'buscar', 'app', 'convite', 'imoveis-alugados', 'meta', 'embaixador',
    'painel-usuario', 'alterar-senha', 'excluir-conta', 'minhas-peticoes'
  );
$$;
notify pgrst, 'reload schema';
commit;
