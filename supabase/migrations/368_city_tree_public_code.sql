begin;

-- ALTER TABLE mantém o inventário bloqueado até o fim da transação, inclusive
-- durante a numeração inicial. UUIDs e vínculos existentes são preservados.
alter table public.city_trees
  add column registration_number bigint,
  add column public_code text generated always as ('AR' || registration_number::text) stored;

-- O preenchimento não representa uma edição nem deve recanonizar os catálogos.
alter table public.city_trees disable trigger canonical_tree_registration;
alter table public.city_trees disable trigger city_trees_updated;
with numbered as (
  select id, row_number() over (partition by city_id order by created_at, id) as number
  from public.city_trees
)
update public.city_trees t set registration_number=n.number
from numbered n where n.id=t.id;
alter table public.city_trees enable trigger canonical_tree_registration;
alter table public.city_trees enable trigger city_trees_updated;

alter table public.city_trees
  alter column registration_number set not null,
  add constraint city_trees_registration_positive check (registration_number>0),
  add constraint city_trees_city_registration_unique unique(city_id,registration_number);

-- Este contador sobrevive à exclusão de qualquer árvore, inclusive da última.
create table public.city_tree_code_counters (
  city_id bigint primary key references public.cities(id) on delete cascade,
  last_number bigint not null check (last_number>0)
);
alter table public.city_tree_code_counters enable row level security;
revoke all on public.city_tree_code_counters from public,anon,authenticated;
insert into public.city_tree_code_counters(city_id,last_number)
select city_id,max(registration_number) from public.city_trees group by city_id;

create function public.assign_city_tree_code() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then
    if new.city_id is distinct from old.city_id
      or new.registration_number is distinct from old.registration_number then
      raise exception 'O código e a cidade da árvore não podem ser alterados.';
    end if;
  else
    -- Ignora números enviados pelo cliente: somente o banco atribui o código.
    -- O UPSERT bloqueia o contador municipal e serializa cadastros concorrentes.
    insert into public.city_tree_code_counters(city_id,last_number)
    values(new.city_id,1)
    on conflict(city_id) do update
      set last_number=public.city_tree_code_counters.last_number+1
    returning last_number into new.registration_number;
  end if;
  return new;
end $$;
revoke all on function public.assign_city_tree_code() from public,anon,authenticated;
create trigger city_tree_code before insert or update on public.city_trees
  for each row execute function public.assign_city_tree_code();

comment on column public.city_trees.public_code is 'Código público permanente AR<número>, único dentro do município. Use cidade + código em consultas entre municípios.';
comment on column public.city_trees.registration_number is 'Sequência municipal atribuída no banco; não editar nem reutilizar após exclusão.';
comment on table public.city_tree_code_counters is 'Contadores privados por município; somente o trigger de cadastro pode incrementá-los.';
notify pgrst, 'reload schema';
commit;
