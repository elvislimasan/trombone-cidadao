begin;

-- O identificador interno e independente de codigos usados por outros orgaos.
create sequence public.pipa_tank_code_seq as bigint;
alter table public.pipa_tanks
  add column system_code text,
  add column official_code text;

-- Identifica tambem as caixas cadastradas antes desta migracao.
with numbered as (
  select id, row_number() over (order by created_at, id) as number
  from public.pipa_tanks
)
update public.pipa_tanks tank
set system_code = 'CX' || numbered.number::text
from numbered where numbered.id = tank.id;

select setval('public.pipa_tank_code_seq'::regclass,
  greatest((select count(*) from public.pipa_tanks), 1),
  exists(select 1 from public.pipa_tanks));

alter table public.pipa_tanks
  alter column system_code set default 'CX' || nextval('public.pipa_tank_code_seq'::regclass)::text,
  alter column system_code set not null,
  add constraint pipa_tanks_official_code_length check (official_code is null or length(official_code) between 1 and 80);
alter sequence public.pipa_tank_code_seq owned by public.pipa_tanks.system_code;
create unique index pipa_tanks_system_code_unique on public.pipa_tanks(system_code);

comment on column public.pipa_tanks.system_code is 'Codigo CX gerado pelo sistema; nao muda ao editar a caixa.';
comment on column public.pipa_tanks.official_code is 'Codigo externo opcional informado pelo orgao responsavel.';

create or replace function public.pipa_save_tank(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid=coalesce((p_data->>'id')::uuid,gen_random_uuid()); v_channel uuid=(p_data->>'channel_id')::uuid; v_days integer; v_code text;
begin
  if not public.pipa_can(v_channel,'manage') then raise exception 'Sem permissão para cadastrar caixas nesta secretaria.' using errcode='42501'; end if;
  if exists(select 1 from public.pipa_tanks where id=v_id and channel_id<>v_channel) then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  if p_data ? 'emptying_days' then v_days=nullif(p_data->>'emptying_days','')::integer;
  else select emptying_days into v_days from public.pipa_tanks where id=v_id; end if;
  if v_days is not null and v_days not between 1 and 365 then raise exception 'Informe uma média entre 1 e 365 dias.'; end if;
  select system_code into v_code from public.pipa_tanks where id=v_id;
  insert into public.pipa_tanks(id,channel_id,name,locality,address,latitude,longitude,capacity_liters,provider,responsible_name,responsible_document,responsible_phone,responsible_address,notes,active,emptying_days,official_code,system_code)
  values(v_id,v_channel,btrim(p_data->>'name'),btrim(p_data->>'locality'),coalesce(p_data->>'address',''),(p_data->>'latitude')::float8,(p_data->>'longitude')::float8,
    (p_data->>'capacity_liters')::integer,p_data->>'provider',btrim(p_data->>'responsible_name'),regexp_replace(p_data->>'responsible_document','\D','','g'),p_data->>'responsible_phone',p_data->>'responsible_address',coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true),v_days,nullif(btrim(p_data->>'official_code'),''),coalesce(v_code,'CX'||nextval('public.pipa_tank_code_seq'::regclass)::text))
  on conflict(id) do update set name=excluded.name,locality=excluded.locality,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
    capacity_liters=excluded.capacity_liters,provider=excluded.provider,responsible_name=excluded.responsible_name,responsible_document=excluded.responsible_document,
    responsible_phone=excluded.responsible_phone,responsible_address=excluded.responsible_address,notes=excluded.notes,active=excluded.active,
    emptying_days=case when p_data ? 'emptying_days' then excluded.emptying_days else pipa_tanks.emptying_days end,
    official_code=case when p_data ? 'official_code' then excluded.official_code else pipa_tanks.official_code end,
    updated_at=now() where pipa_tanks.channel_id=excluded.channel_id;
  if not found then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  return v_id;
end $$;

notify pgrst,'reload schema';
commit;
