begin;
alter table public.pipa_tanks add column emptying_days integer check(emptying_days between 1 and 365);
comment on column public.pipa_tanks.emptying_days is 'Média em dias para consumir a capacidade cheia. NULL mantém a caixa sem previsão de consumo.';
alter table public.pipa_deliveries add column level_after_percent integer check(level_after_percent between 0 and 100);
comment on column public.pipa_deliveries.level_after_percent is 'Nível observado após a descarga. 100 significa caixa completada, independentemente do volume entregue.';

create or replace function public.pipa_save_tank(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid=coalesce((p_data->>'id')::uuid,gen_random_uuid()); v_channel uuid=(p_data->>'channel_id')::uuid; v_days integer;
begin
  if not public.pipa_can(v_channel,'manage') then raise exception 'Sem permissão para cadastrar caixas nesta secretaria.' using errcode='42501'; end if;
  if exists(select 1 from public.pipa_tanks where id=v_id and channel_id<>v_channel) then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  -- Clientes anteriores preservam a configuração existente ao omitir o campo.
  if p_data ? 'emptying_days' then v_days=nullif(p_data->>'emptying_days','')::integer;
  else select emptying_days into v_days from public.pipa_tanks where id=v_id; end if;
  if v_days is not null and v_days not between 1 and 365 then raise exception 'Informe uma média entre 1 e 365 dias.'; end if;
  insert into public.pipa_tanks(id,channel_id,name,locality,address,latitude,longitude,capacity_liters,provider,responsible_name,responsible_document,responsible_phone,responsible_address,notes,active,emptying_days)
  values(v_id,v_channel,btrim(p_data->>'name'),btrim(p_data->>'locality'),coalesce(p_data->>'address',''),(p_data->>'latitude')::float8,(p_data->>'longitude')::float8,
    (p_data->>'capacity_liters')::integer,p_data->>'provider',btrim(p_data->>'responsible_name'),regexp_replace(p_data->>'responsible_document','\D','','g'),p_data->>'responsible_phone',p_data->>'responsible_address',coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true),v_days)
  on conflict(id) do update set name=excluded.name,locality=excluded.locality,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
    capacity_liters=excluded.capacity_liters,provider=excluded.provider,responsible_name=excluded.responsible_name,responsible_document=excluded.responsible_document,
    responsible_phone=excluded.responsible_phone,responsible_address=excluded.responsible_address,notes=excluded.notes,active=excluded.active,emptying_days=case when p_data ? 'emptying_days' then excluded.emptying_days else pipa_tanks.emptying_days end,updated_at=now()
    where pipa_tanks.channel_id=excluded.channel_id;
  if not found then raise exception 'Caixa de outra secretaria.' using errcode='42501'; end if;
  return v_id;
end $$;
revoke all on function public.pipa_save_tank(jsonb) from public,anon;
grant execute on function public.pipa_save_tank(jsonb) to authenticated;

-- A observação integra o INSERT imutável, preservando os controles originais.
do $migration$
declare definition text; original text; replacement text; patch text[];
begin
  definition=pg_get_functiondef('public.pipa_record_delivery(jsonb)'::regprocedure);
  foreach patch slice 1 in array array[
    array['v_accuracy float8; v_distance float8;', 'v_accuracy float8; v_distance float8; v_observed integer;'],
    array['  v_liters=(p_data->>''liters'')::integer;', '  v_observed=nullif(p_data->>''level_after_percent'','''')::integer;
  if v_observed is not null and (v_observed not between 0 and 100 or t.id is null) then raise exception ''Informe um nível de 0 a 100%% para uma caixa cadastrada.''; end if;
  v_liters=(p_data->>''liters'')::integer;'],
    array['accuracy_m,notes)', 'accuracy_m,notes,level_after_percent)'],
    array['v_accuracy,coalesce(p_data->>''notes'',''''));', 'v_accuracy,coalesce(p_data->>''notes'',''''),v_observed);']
  ] loop
    original=patch[1]; replacement=patch[2];
    if position(original in definition)=0 then raise exception 'Contrato inesperado em pipa_record_delivery: %',original; end if;
    definition=replace(definition,original,replacement);
  end loop;
  execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
