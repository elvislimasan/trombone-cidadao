begin;

-- O inventário do Exército informa pessoas atendidas e coordenadas, mas não
-- capacidade nem dados pessoais do responsável. Ausência não vira dado fictício.
alter table public.pipa_tanks
  alter column capacity_liters drop not null,
  alter column responsible_document drop not null,
  alter column responsible_phone drop not null,
  alter column responsible_address drop not null,
  alter column responsible_name set default 'Não informado',
  add column people_served integer check (people_served > 0);

alter table public.pipa_tanks drop constraint pipa_tanks_responsible_document_check;
alter table public.pipa_tanks add constraint pipa_tanks_responsible_document_check
  check (responsible_document is null or public.pipa_valid_cpf(responsible_document));

comment on column public.pipa_tanks.people_served is 'Número de pessoas atendidas informado pelo órgão; NULL quando não informado.';
comment on column public.pipa_tanks.capacity_liters is 'Capacidade em litros; NULL quando o órgão não informou.';

create or replace function public.pipa_save_tank(p_data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_id uuid=coalesce((p_data->>'id')::uuid,gen_random_uuid());
  v_channel uuid=(p_data->>'channel_id')::uuid;
  v_days integer;
  v_code text;
begin
  if not public.pipa_can(v_channel,'manage') then
    raise exception 'Sem permissão para cadastrar caixas nesta secretaria.' using errcode='42501';
  end if;
  if exists(select 1 from public.pipa_tanks where id=v_id and channel_id<>v_channel) then
    raise exception 'Caixa de outra secretaria.' using errcode='42501';
  end if;
  if p_data ? 'emptying_days' then v_days=nullif(p_data->>'emptying_days','')::integer;
  else select emptying_days into v_days from public.pipa_tanks where id=v_id; end if;
  if v_days is not null and v_days not between 1 and 365 then
    raise exception 'Informe uma média entre 1 e 365 dias.';
  end if;
  select system_code into v_code from public.pipa_tanks where id=v_id;
  insert into public.pipa_tanks(
    id,channel_id,name,locality,address,latitude,longitude,capacity_liters,provider,
    responsible_name,responsible_document,responsible_phone,responsible_address,
    notes,active,emptying_days,official_code,system_code,people_served
  ) values (
    v_id,v_channel,btrim(p_data->>'name'),btrim(p_data->>'locality'),coalesce(p_data->>'address',''),
    (p_data->>'latitude')::float8,(p_data->>'longitude')::float8,
    nullif(p_data->>'capacity_liters','')::integer,p_data->>'provider',
    coalesce(nullif(btrim(p_data->>'responsible_name'),''),'Não informado'),
    nullif(regexp_replace(coalesce(p_data->>'responsible_document',''),'\D','','g'),''),
    nullif(btrim(p_data->>'responsible_phone'),''),nullif(btrim(p_data->>'responsible_address'),''),
    coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true),
    v_days,nullif(btrim(p_data->>'official_code'),''),
    coalesce(v_code,'CX'||nextval('public.pipa_tank_code_seq'::regclass)::text),
    nullif(p_data->>'people_served','')::integer
  )
  on conflict(id) do update set
    name=excluded.name,locality=excluded.locality,address=excluded.address,
    latitude=excluded.latitude,longitude=excluded.longitude,capacity_liters=excluded.capacity_liters,
    provider=excluded.provider,responsible_name=excluded.responsible_name,
    responsible_document=excluded.responsible_document,responsible_phone=excluded.responsible_phone,
    responsible_address=excluded.responsible_address,notes=excluded.notes,active=excluded.active,
    emptying_days=case when p_data ? 'emptying_days' then excluded.emptying_days else pipa_tanks.emptying_days end,
    official_code=case when p_data ? 'official_code' then excluded.official_code else pipa_tanks.official_code end,
    people_served=case when p_data ? 'people_served' then excluded.people_served else pipa_tanks.people_served end,
    updated_at=now()
  where pipa_tanks.channel_id=excluded.channel_id;
  if not found then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  return v_id;
end $$;

notify pgrst,'reload schema';
commit;
