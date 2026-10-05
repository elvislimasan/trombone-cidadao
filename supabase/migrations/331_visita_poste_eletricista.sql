begin;

create or replace function public.registrar_visita_poste_eletricista(
  p_prefeitura uuid, p_poste_id bigint, p_poste_atualizado_em timestamptz,
  p_status text, p_lamp_type text, p_power_w numeric,
  p_servicos text[], p_descricao text, p_visita_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_city bigint; v_canal uuid; v_pole public.poles%rowtype;
  v_type text; v_power numeric; v_description text := btrim(coalesce(p_descricao,''));
  v_service text; v_count integer; v_existing public.demandas_municipais%rowtype;
begin
  select city_id into v_city from public.prefeituras
  where id=p_prefeitura and status='ativa' and 'iluminacao'=any(categorias_habilitadas);
  select c.id into v_canal from public.orgao_membros m
  join public.orgao_canais c on c.id=m.canal_id
  join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=v_city and oc.category_id='iluminacao'
  where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
    and c.city_id=v_city and c.ativo and not c.canal_triagem limit 1;
  if v_city is null or v_canal is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Acesso reservado aos eletricistas de iluminação'; end if;
  if p_status not in ('aceso','apagado') then raise exception 'Situação inválida'; end if;
  if p_visita_id is null then raise exception 'Identificação da visita obrigatória'; end if;
  if coalesce(cardinality(p_servicos),0)>4 or p_servicos is null then raise exception 'Serviços inválidos'; end if;
  if exists(select 1 from unnest(p_servicos) as item(value)
    where item.value is null or item.value not in ('lamp_replacement','arm_installation','relay_replacement','other'))
    or (select count(distinct item.value) from unnest(p_servicos) as item(value))<>cardinality(p_servicos) then
    raise exception 'Selecione serviços válidos sem repetições'; end if;
  if length(v_description)>1000 then raise exception 'Descrição muito longa'; end if;
  select * into v_existing from public.demandas_municipais where id=p_visita_id;
  if found then
    if v_existing.prefeitura_id=p_prefeitura and v_existing.pole_id=p_poste_id
      and v_existing.criado_por=auth.uid() then
      return jsonb_build_object('id',p_poste_id,'ordem_id',p_visita_id,'repeated',true);
    end if;
    raise exception 'Identificação de visita já utilizada';
  end if;
  select * into v_pole from public.poles where id=p_poste_id and city_id=v_city for update;
  if v_pole.id is null or v_pole.lighting_status='removido' then raise exception 'Poste ativo não encontrado'; end if;
  if v_pole.updated_at is distinct from p_poste_atualizado_em then
    raise exception 'O poste mudou. Reabra os dados antes de salvar.' using errcode='40001'; end if;
  v_type=coalesce(nullif(btrim(p_lamp_type),''),v_pole.lamp_type);
  v_power=coalesce(p_power_w,v_pole.lamp_power_w);
  if v_type is distinct from v_pole.lamp_type and v_type is not null and v_type not in ('LED','Vapor de sódio','Vapor de mercúrio',
    'Iodetos metálicos','Fluorescente','Fluorescente compacta','Incandescente','Mista') then
    raise exception 'Tipo de lâmpada inválido'; end if;
  if v_power is not null and (v_power<=0 or v_power>999999.99) then raise exception 'Potência inválida'; end if;
  if cardinality(p_servicos)=0 and p_status is not distinct from v_pole.lighting_status
    and v_type is not distinct from v_pole.lamp_type
    and v_power is not distinct from v_pole.lamp_power_w then
    raise exception 'Altere a situação, o tipo ou a potência, ou registre um serviço'; end if;
  update public.poles set lighting_status=p_status,lamp_type=v_type,lamp_power_w=v_power,
    updated_at=clock_timestamp() where id=v_pole.id;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,
    new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by,descricao_servico)
  values(v_pole.id,v_city,coalesce(v_pole.identifier,v_pole.id::text),v_pole.address,
    v_pole.lamp_power_w,v_power,v_pole.lamp_type,v_type,v_pole.lighting_status,p_status,
    'updated',auth.uid(),nullif(v_description,''));
  if cardinality(p_servicos)>0 then
    v_service=p_servicos[1];
    insert into public.demandas_municipais(id,prefeitura_id,titulo,descricao,endereco,
      latitude,longitude,pole_id,category_id,prioridade,status,canal_id,atribuido_a,
      origem,resultado,registro_execucao,service_type,service_types,executada_em,concluida_em,criado_por)
    values(p_visita_id,p_prefeitura,'Atendimento no poste '||left(regexp_replace(coalesce(v_pole.identifier,v_pole.id::text),'^[0-9]+[[:space:]]*[-–—][[:space:]]*',''),150),
      v_description,v_pole.address,v_pole.latitude,v_pole.longitude,v_pole.id,'iluminacao',
      'normal','concluida',v_canal,auth.uid(),'vistoria',v_description,v_description,
      v_service,p_servicos,now(),now(),auth.uid());
  end if;
  return jsonb_build_object('id',v_pole.id,'ordem_id',case when cardinality(p_servicos)>0 then p_visita_id end);
end $$;
revoke all on function public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid) from public,anon;
grant execute on function public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
