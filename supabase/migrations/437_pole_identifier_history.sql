begin;

-- A renumeração preserva o ID usado por visitas, ordens e solicitações.
alter table public.poles add column previous_identifiers text[] not null default '{}';
alter table public.pole_lighting_changes
  add column old_identifier text,
  add column new_identifier text,
  add column pole_version_before timestamptz,
  add column pole_version_after timestamptz,
  add column renumber_only boolean not null default false;
create index pole_renumber_versions on public.pole_lighting_changes(pole_id,pole_version_before)
  where renumber_only;

-- Recupera códigos antigos que ainda constam no histórico do mesmo ID.
-- O preenchimento não altera a versão dos registros preparados offline.
alter table public.poles disable trigger update_poles_updated_at;
update public.poles p set previous_identifiers=coalesce((
  select array_agg(distinct btrim(h.pole_number) order by btrim(h.pole_number))
  from public.pole_lighting_changes h where h.pole_id=p.id and h.city_id=p.city_id
    and nullif(btrim(h.pole_number),'') is not null
    and btrim(h.pole_number) is distinct from btrim(p.identifier)
),'{}');
alter table public.poles enable trigger update_poles_updated_at;

-- Cada gravação precisa de sua própria versão, inclusive dentro da mesma
-- transação (now() compartilharia a versão entre renumeração e reparo).
create function public.touch_pole_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
drop trigger update_poles_updated_at on public.poles;
create trigger update_poles_updated_at before update on public.poles
  for each row execute function public.touch_pole_version();

create function public.preserve_pole_identifiers() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.previous_identifiers='{}'; return new; end if;
  -- O histórico é derivado pelo banco; clientes não podem apagá-lo ou forjá-lo.
  new.previous_identifiers=old.previous_identifiers;
  if old.identifier is distinct from new.identifier and nullif(btrim(old.identifier),'') is not null
    and not (btrim(old.identifier)=any(new.previous_identifiers)) then
    new.previous_identifiers=array_append(new.previous_identifiers,btrim(old.identifier));
  end if;
  return new;
end $$;
create trigger preserve_pole_identifiers before insert or update on public.poles
  for each row execute function public.preserve_pole_identifiers();

create function public.record_pole_renumber() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.identifier is not distinct from new.identifier or new.city_id is null then return new; end if;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,
    old_power_w,new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,
    action,changed_by,descricao_servico,old_identifier,new_identifier,
    pole_version_before,pole_version_after,renumber_only)
  values(new.id,new.city_id,coalesce(new.identifier,new.id::text),new.address,
    old.lamp_power_w,new.lamp_power_w,old.lamp_type,new.lamp_type,old.lighting_status,new.lighting_status,
    'updated',auth.uid(),'Numeração: '||coalesce(old.identifier,'Sem número')||' → '||coalesce(new.identifier,'Sem número'),
    old.identifier,new.identifier,old.updated_at,new.updated_at,
    (to_jsonb(old)-array['identifier','previous_identifiers','updated_at'])=
      (to_jsonb(new)-array['identifier','previous_identifiers','updated_at']));
  return new;
end $$;
create trigger record_pole_renumber after update of identifier on public.poles
  for each row execute function public.record_pole_renumber();

-- Avança a versão de visitas pendentes somente por renumerações comprovadas.
-- Alteração técnica, remoção, mudança de cidade ou outro ID exigem revisão.
create function public.pole_version_after_renumber(p_pole bigint,p_expected timestamptz)
returns timestamptz language sql stable security definer set search_path=public,pg_temp as $$
  with recursive versions(version) as (
    select p_expected
    union
    select h.pole_version_after from versions v
    join public.pole_lighting_changes h on h.pole_id=p_pole and h.renumber_only
      and h.pole_version_before=v.version
  )
  select coalesce((select p.updated_at from public.poles p where p.id=p_pole
    and p.updated_at in (select version from versions)),p_expected)
$$;
revoke all on function public.touch_pole_version(),public.preserve_pole_identifiers(),public.record_pole_renumber(),
  public.pole_version_after_renumber(bigint,timestamptz) from public,anon,authenticated;

-- Conserva todas as verificações de autoria, município e resolução das RPCs.
do $migration$
declare signature text; definition text; old_check text;
begin
  foreach signature in array array[
    'public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid)',
    'public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid)'
  ] loop
    definition=pg_get_functiondef(signature::regprocedure);
    old_check='v_pole.updated_at is distinct from p_poste_atualizado_em';
    if position(old_check in definition)=0 then raise exception 'Validação de versão incompatível: %',signature; end if;
    execute replace(definition,old_check,
      'v_pole.updated_at is distinct from public.pole_version_after_renumber(v_pole.id,p_poste_atualizado_em)');
  end loop;
  definition=pg_get_functiondef('public.buscar_mapa_eletricista(uuid,text)'::regprocedure);
  old_check='p.identifier ilike v_term or p.plate ilike v_term or p.address ilike v_term';
  if position(old_check in definition)=0 then raise exception 'Busca do mapa incompatível'; end if;
  execute replace(definition,old_check,old_check||
    ' or exists(select 1 from unnest(p.previous_identifiers) as previous(code) where previous.code ilike v_term)');

  definition=pg_get_functiondef('public.buscar_postes_ordem_eletricista(uuid,uuid,text)'::regprocedure);
  old_check=$old$p.identifier ilike '%'||left(v_busca,120)||'%'$old$;
  if position(old_check in definition)=0 then raise exception 'Busca de postes da ordem incompatível'; end if;
  execute replace(definition,old_check,old_check||
    $new$ or exists(select 1 from unnest(p.previous_identifiers) as previous(code)
      where previous.code ilike '%'||left(v_busca,120)||'%')$new$);
end $migration$;

notify pgrst,'reload schema';
commit;
