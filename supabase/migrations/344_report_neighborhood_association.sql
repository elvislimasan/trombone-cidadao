-- Padroniza nomes e recupera bairros explícitos nos endereços, incluindo
-- broncas antigas e clientes que ainda não enviam neighborhood. Sem polígonos,
-- não é possível inferir com segurança um bairro só pela proximidade.
begin;

create or replace function public.report_neighborhood_key(p_name text)
returns text language sql immutable
set search_path = public
as $fn$
  select nullif(btrim(regexp_replace(lower(translate(
    btrim(coalesce(p_name, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  )), '[^a-z0-9]+', ' ', 'g')), '');
$fn$;

create or replace function public.resolve_report_neighborhood(
  p_city_id bigint, p_neighborhood text, p_address text
)
returns text language sql stable
set search_path = public
as $fn$
  with registered as (
    select btrim(b.name) as name, public.report_neighborhood_key(b.name) as key
    from public.bairros b where b.city_id = p_city_id
  ), aliases as (
    select name, key from registered
    union all
    select name, 'dner' from registered where key = 'sao francisco de assis dner'
  ), segments as (
    select public.report_neighborhood_key(segment) as key
    from regexp_split_to_table(coalesce(p_address, ''), '\s+[-–—]\s+|[,;]')
      with ordinality as s(segment, position)
    where position > 1
  ), matches as (
    select distinct a.name from aliases a
    where a.key is not null and (
      (nullif(btrim(p_neighborhood), '') is not null
        and a.key = public.report_neighborhood_key(p_neighborhood))
      or (nullif(btrim(p_neighborhood), '') is null and (
        exists (select 1 from segments s where s.key in (a.key, 'bairro ' || a.key))
        or public.report_neighborhood_key(p_address) ~ ('(^| )bairro ' || a.key || '($| )')
        or (a.key = 'dner' and public.report_neighborhood_key(p_address) ~ '(^| )(no|na|do|da) dner($| )')
      ))
    )
  )
  select case when count(*) = 1 then min(name) else null end from matches;
$fn$;

create or replace function public.assign_report_neighborhood()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  new.neighborhood := coalesce(
    public.resolve_report_neighborhood(new.city_id, new.neighborhood, new.address),
    nullif(btrim(new.neighborhood), '')
  );
  return new;
end;
$fn$;

drop trigger if exists reports_assign_neighborhood on public.reports;
create trigger reports_assign_neighborhood
before insert or update of city_id, address, neighborhood on public.reports
for each row execute function public.assign_report_neighborhood();

-- Um endereço com dois bairros diferentes continua pendente de revisão.
-- Não altera endereço, coordenadas, status ou bairro sem correspondência única.
with resolved as (
  select r.id, public.resolve_report_neighborhood(r.city_id, r.neighborhood, r.address) as name
  from public.reports r where r.city_id is not null
)
update public.reports r set neighborhood = x.name
from resolved x where x.id = r.id and x.name is not null
  and r.neighborhood is distinct from x.name;

commit;
