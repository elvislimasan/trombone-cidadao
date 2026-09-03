-- A categoria escolhida na campanha precisa chegar à fonte dos candidatos.
-- Filtrar depois do LIMIT poderia devolver poucas paradas de iluminação mesmo
-- existindo outras logo depois das 40 linhas, então a condição mora na RPC.

drop function if exists public.rota_do_dia_alvos(
  double precision, double precision, double precision, integer
);

create or replace function public.rota_do_dia_alvos(
  p_lat          double precision,
  p_lng          double precision,
  p_raio_m       double precision default 800,
  p_limite       integer default 40,
  p_categoria_id text default null
)
returns table (
  id                uuid,
  tipo              text,
  lat               double precision,
  lng               double precision,
  category_id       text,
  category_name     text,
  title             text,
  address           text,
  status            text,
  author_id         uuid,
  completed_by      uuid,
  created_at        timestamptz,
  distance_meters   double precision,
  observacoes       jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with origem as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as pt
  ),
  perto as (
    select r.*
    from public.reports r
    cross join origem o
    where r.location is not null
      and coalesce(r.moderation_status, 'approved') = 'approved'
      and (p_categoria_id is null or r.category_id = p_categoria_id)
      and (
        (coalesce(r.origin, 'full') = 'full' and r.status in ('pending', 'in-progress'))
        or (r.origin = 'signal' and r.signal_status = 'open')
      )
      and extensions.st_dwithin(
            r.location::extensions.geography,
            o.pt::extensions.geography,
            greatest(100, least(coalesce(p_raio_m, 800), 2000))
          )
  )
  select
    p.id,
    case when p.origin = 'signal' then 'sinal' else 'bronca' end,
    extensions.st_y(p.location::extensions.geometry),
    extensions.st_x(p.location::extensions.geometry),
    p.category_id,
    c.name,
    p.title,
    p.address,
    p.status,
    p.author_id,
    p.completed_by,
    p.created_at,
    extensions.st_distance(p.location::extensions.geography, o.pt::extensions.geography),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
                 'author_id',   u.author_id,
                 'update_type', u.update_type,
                 'status',      u.status,
                 'created_at',  u.created_at
               ))
        from public.report_updates u
        where u.report_id = p.id
          and coalesce(u.status, '') <> 'rejected'
          and u.created_at >= now() - interval '90 days'
      ),
      '[]'::jsonb
    )
  from perto p
  cross join origem o
  left join public.categories c on c.id = p.category_id
  order by p.location operator(extensions.<->) o.pt
  limit greatest(1, least(coalesce(p_limite, 40), 100));
$fn$;

comment on function public.rota_do_dia_alvos(
  double precision, double precision, double precision, integer, text
) is
  'Broncas e sinais próximos para a Rota do Dia. Quando p_categoria_id é informado por uma campanha, devolve somente alvos daquela categoria.';

grant execute on function public.rota_do_dia_alvos(
  double precision, double precision, double precision, integer, text
) to authenticated;
