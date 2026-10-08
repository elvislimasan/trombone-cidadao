-- Contornos manuais de bairros, independentes dos traçados e vínculos das ruas.
begin;

create table public.pavement_neighborhood_boundaries (
  bairro_id uuid primary key references public.bairros(id) on delete cascade,
  boundary extensions.geometry(polygon, 4326) not null,
  color text not null default '#bfe1ee' check (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default clock_timestamp(),
  constraint neighborhood_boundary_valid check (
    not extensions.st_isempty(boundary)
    and extensions.st_isvalid(boundary)
    and extensions.st_area(boundary) > 0
    and extensions.st_numinteriorrings(boundary) = 0
    and extensions.st_xmin(boundary::extensions.box3d) >= -180
    and extensions.st_xmax(boundary::extensions.box3d) <= 180
    and extensions.st_ymin(boundary::extensions.box3d) >= -90
    and extensions.st_ymax(boundary::extensions.box3d) <= 90
  )
);

comment on column public.pavement_neighborhood_boundaries.boundary is
  'Contorno manual em WGS84. Não representa homologação de limite cadastral oficial nem altera o bairro das ruas.';

create function public.touch_pavement_neighborhood_boundary()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger pavement_neighborhood_boundary_updated
  before update on public.pavement_neighborhood_boundaries
  for each row execute function public.touch_pavement_neighborhood_boundary();

alter table public.pavement_neighborhood_boundaries enable row level security;
revoke all on public.pavement_neighborhood_boundaries from public, anon, authenticated;
grant select on public.pavement_neighborhood_boundaries to anon, authenticated;
grant insert, update, delete on public.pavement_neighborhood_boundaries to authenticated;

create policy neighborhood_boundaries_read on public.pavement_neighborhood_boundaries
  for select to anon, authenticated using (true);

create policy neighborhood_boundaries_manage on public.pavement_neighborhood_boundaries
  for all to authenticated
  using (
    public.can_write(auth.uid(), 'pavement') and exists (
      select 1 from public.bairros b where b.id = bairro_id and b.city_id is not null
        and (public.is_admin(auth.uid()) or public.is_master(auth.uid())
          or public.is_ambassador_of(auth.uid(), b.city_id))
    )
  )
  with check (
    public.can_write(auth.uid(), 'pavement') and exists (
      select 1 from public.bairros b where b.id = bairro_id and b.city_id is not null
        and (public.is_admin(auth.uid()) or public.is_master(auth.uid())
          or public.is_ambassador_of(auth.uid(), b.city_id))
    )
  );

notify pgrst, 'reload schema';
commit;
