begin;

-- Mantém o serviço principal para telas antigas e guarda todos os serviços da visita.
alter table public.demandas_municipais add column if not exists service_types text[] not null default '{}';
alter table public.demandas_municipais drop constraint if exists demandas_municipais_service_type_check;
alter table public.demandas_municipais add constraint demandas_municipais_service_type_check
  check (service_type is null or (category_id = 'iluminacao' and service_type in
    ('lamp_replacement','arm_installation','relay_replacement','other')));
alter table public.demandas_municipais add constraint demandas_municipais_service_types_check
  check (service_types <@ array['lamp_replacement','arm_installation','relay_replacement','other']::text[]);
update public.demandas_municipais set service_types=array[service_type]
  where service_type is not null and cardinality(service_types)=0;

do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)'::regprocedure);
  if position($old$if d.pole_id is not null and d.pole_id is distinct from p_poste_id then raise exception 'Atualize somente o poste vinculado à ordem'; end if;$old$ in definition)=0
    or position($old$'company_number','service_type','resultado'$old$ in definition)=0
    or position($old$if p_poste->>'service_type' not in ('lamp_replacement','arm_installation','other')$old$ in definition)=0
    or position($old$'service_type',p_poste->>'service_type','resultado'$old$ in definition)=0
    or position('  if d.titulo = ' in definition)=0 then
    raise exception 'Definição inesperada de resolver_ordem_eletricista';
  end if;
  definition := replace(definition,
    $old$if d.pole_id is not null and d.pole_id is distinct from p_poste_id then raise exception 'Atualize somente o poste vinculado à ordem'; end if;$old$, '');
  definition := replace(definition, $old$'company_number','service_type','resultado'$old$,
    $new$'company_number','service_type','service_types','resultado'$new$);
  definition := replace(definition, $old$'lamp_type','lamp_power_w','service_type','resultado'$old$,
    $new$'lamp_type','lamp_power_w','service_type','service_types','resultado'$new$);
  definition := replace(definition,
    $old$'service_type',p_poste->>'service_type','resultado'$old$,
    $new$'service_type',p_poste->>'service_type','service_types',p_poste->'service_types','resultado'$new$);
  definition := replace(definition, $old$if p_poste->>'service_type' not in ('lamp_replacement','arm_installation','other')$old$,
    $new$if p_poste->>'service_type' not in ('lamp_replacement','arm_installation','relay_replacement','other')$new$);
  definition := replace(definition, $old$  v_type=nullif(btrim(p_poste->>'lamp_type'),'');$old$,
    $new$  if jsonb_typeof(p_poste->'service_types') is distinct from 'array' then
    raise exception 'Selecione os serviços executados';
  end if;
  if jsonb_array_length(p_poste->'service_types') < 1
    or jsonb_array_length(p_poste->'service_types') > 4
    or p_poste->'service_types'->>0 is distinct from p_poste->>'service_type'
    or exists (select 1 from jsonb_array_elements_text(p_poste->'service_types') as item(value)
      where item.value is null or item.value not in ('lamp_replacement','arm_installation','relay_replacement','other'))
    or (select count(distinct item.value) from jsonb_array_elements_text(p_poste->'service_types') as item(value))
      <> jsonb_array_length(p_poste->'service_types') then
    raise exception 'Selecione os serviços executados';
  end if;
  v_type=nullif(btrim(p_poste->>'lamp_type'),'');$new$);
  definition := replace(definition,
    $old$if d.pole_id is null then
    update public.demandas_municipais set pole_id=p.id,updated_by=auth.uid() where id=d.id returning * into d;
  end if;$old$,
    $new$if d.pole_id is distinct from p.id then
    update public.demandas_municipais set pole_id=p.id,updated_by=auth.uid() where id=d.id returning * into d;
  end if;$new$);
  execute definition;
end $migration$;

-- A conclusão pela tela municipal também aceita relé como serviço principal.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  definition := replace(definition, $old$'lamp_replacement','arm_installation','other'$old$,
    $new$'lamp_replacement','arm_installation','relay_replacement','other'$new$);
  execute definition;
end $migration$;

-- Só associa automaticamente ordens novas ou sem vínculo; a escolha manual prevalece.
create or replace function public.vincular_poste_proximo_ordem()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  if new.category_id <> 'iluminacao' or new.pole_id is not null
    or new.latitude is null or new.longitude is null
    or new.latitude not between -90 and 90 or new.longitude not between -180 and 180 then return new; end if;
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id;
  select p.id into new.pole_id from public.poles p
  where p.city_id=v_city and p.lighting_status is distinct from 'removido' and p.geom is not null
  order by p.geom operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(new.longitude,new.latitude),4326)::extensions.geography, p.id
  limit 1;
  return new;
end $$;
drop trigger if exists vincular_poste_proximo_ordem on public.demandas_municipais;
create trigger vincular_poste_proximo_ordem before insert or update of latitude,longitude,category_id,pole_id
on public.demandas_municipais for each row execute function public.vincular_poste_proximo_ordem();

update public.demandas_municipais d set pole_id=(
  select p.id from public.poles p join public.prefeituras city on city.city_id=p.city_id
  where city.id=d.prefeitura_id and p.lighting_status is distinct from 'removido' and p.geom is not null
  order by p.geom operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(d.longitude,d.latitude),4326)::extensions.geography, p.id
  limit 1
)
where d.category_id='iluminacao' and d.pole_id is null
  and d.status in ('aberta','triagem','programada','em_andamento','aguardando_confirmacao')
  and d.latitude between -90 and 90 and d.longitude between -180 and 180;

-- Uma ordem urgente atribuída também avisa diretamente o eletricista responsável.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.notificar_oferta_eletricista(bigint,uuid,text,uuid,text,text)'::regprocedure);
  if position($old$else 'Serviço de iluminação disponível' end$old$ in definition)=0
    or position($old$and (p_prioridade <> 'urgente' or n.title = 'Serviço urgente disponível')$old$ in definition)=0 then
    raise exception 'Definição inesperada de notificar_oferta_eletricista'; end if;
  definition := replace(definition,
    $old$else 'Serviço de iluminação disponível' end$old$,
    $new$when p_prioridade = 'alta' then 'Serviço prioritário disponível'
      else 'Serviço de iluminação disponível' end$new$);
  definition := replace(definition,
    $old$and (p_prioridade <> 'urgente' or n.title = 'Serviço urgente disponível')$old$,
    $new$and (p_prioridade not in ('urgente','alta') or n.title = case
          when p_prioridade='urgente' then 'Serviço urgente disponível'
          else 'Serviço prioritário disponível' end)$new$);
  execute definition;
end $migration$;

create or replace function public.notificar_ordem_prioritaria_atribuida()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_changed boolean;
begin
  if tg_op='INSERT' then
    v_changed := true;
  else
    v_changed := old.atribuido_a is distinct from new.atribuido_a
      or old.prioridade is distinct from new.prioridade;
  end if;
  if new.category_id='iluminacao' and new.atribuido_a is not null
    and new.prioridade in ('alta','urgente') and new.status not in ('concluida','cancelada','recusada')
    and v_changed then
    insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    values (new.atribuido_a,'agency_case',
      case when new.prioridade='urgente' then 'Ordem urgente atribuída' else 'Ordem prioritária atribuída' end,
      left(coalesce(new.protocolo || ' · ','') || coalesce(new.titulo,'Serviço de iluminação'),180),
      '/prefeitura/eletricista/ordem/' || new.id,false,now());
  end if;
  return new;
end $$;
drop trigger if exists notificar_ordem_prioritaria_atribuida on public.demandas_municipais;
create trigger notificar_ordem_prioritaria_atribuida after insert or update of atribuido_a,prioridade
on public.demandas_municipais for each row execute function public.notificar_ordem_prioritaria_atribuida();

notify pgrst,'reload schema';
commit;
