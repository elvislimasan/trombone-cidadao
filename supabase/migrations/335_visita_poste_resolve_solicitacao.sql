begin;

-- A lista e a gravação usam o vínculo explícito com o poste: é o mesmo vínculo
-- que mantém o marcador vermelho no mapa.
create or replace function public.solicitacoes_ativas_poste_eletricista(p_prefeitura uuid,p_poste_id bigint)
returns table(report_id uuid,title text,ordem_id uuid,ordem_protocolo text,atribuida_a_mim boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city from public.prefeituras p
  where p.id=p_prefeitura and p.status='ativa' and 'iluminacao'=any(p.categorias_habilitadas)
    and public.pode_acessar_prefeitura(auth.uid(),p.city_id);
  if v_city is null or not exists(
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=v_city and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
      and c.city_id=v_city and c.ativo and not c.canal_triagem
  ) then raise exception 'Acesso reservado aos eletricistas de iluminação'; end if;
  return query
  select r.id,r.title::text,d.id,d.protocolo::text,d.atribuido_a=auth.uid()
  from public.reports r
  left join public.demanda_broncas b on b.report_id=r.id
  left join public.demandas_municipais d on d.id=b.demanda_id
  where r.city_id=v_city and r.pole_id=p_poste_id and r.category_id='iluminacao'
    and r.moderation_status is distinct from 'rejected'
    and r.status in ('pending','in-progress','pending_approval','pending_resolution')
  order by r.created_at,r.id;
end $$;
revoke all on function public.solicitacoes_ativas_poste_eletricista(uuid,bigint) from public,anon;
grant execute on function public.solicitacoes_ativas_poste_eletricista(uuid,bigint) to authenticated;

create or replace function public.registrar_visita_poste_eletricista_v2(
  p_prefeitura uuid,p_poste_id bigint,p_poste_atualizado_em timestamptz,
  p_status text,p_lamp_type text,p_power_w numeric,p_servicos text[],
  p_descricao text,p_visita_id uuid,p_report uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_city bigint; v_canal uuid; v_pole public.poles%rowtype; v_report public.reports%rowtype;
  v_order public.demandas_municipais%rowtype; v_order_id uuid; v_link public.demanda_broncas%rowtype;
  v_type text; v_power numeric; v_description text:=btrim(coalesce(p_descricao,''));
  v_remaining integer; v_status text; v_response jsonb;
begin
  if p_report is null then
    v_response:=public.registrar_visita_poste_eletricista(p_prefeitura,p_poste_id,
      p_poste_atualizado_em,p_status,p_lamp_type,p_power_w,p_servicos,p_descricao,p_visita_id);
    if p_status='aceso' then perform public.refresh_pole_broken_state(p_poste_id); end if;
    return v_response;
  end if;
  select city_id into v_city from public.prefeituras
  where id=p_prefeitura and status='ativa' and 'iluminacao'=any(categorias_habilitadas);
  select c.id into v_canal from public.orgao_membros m
  join public.orgao_canais c on c.id=m.canal_id
  join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=v_city and oc.category_id='iluminacao'
  where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
    and c.city_id=v_city and c.ativo and not c.canal_triagem limit 1;
  if v_city is null or v_canal is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Acesso reservado aos eletricistas de iluminação'; end if;
  if p_status<>'aceso' then raise exception 'Marque o poste como aceso para resolver a solicitação'; end if;
  if p_visita_id is null then raise exception 'Identificação da visita obrigatória'; end if;
  if p_servicos is null or cardinality(p_servicos)>4 or exists(
    select 1 from unnest(p_servicos) as item(value)
    where item.value is null or item.value not in ('lamp_replacement','arm_installation','relay_replacement','other')
  ) or (select count(distinct item.value) from unnest(p_servicos) as item(value))<>cardinality(p_servicos)
    then raise exception 'Selecione serviços válidos sem repetições'; end if;
  if length(v_description)>1000 then raise exception 'Descrição muito longa'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select b.demanda_id into v_order_id from public.demanda_broncas b where b.report_id=p_report;
  if v_order_id is not null then
    select * into v_order from public.demandas_municipais where id=v_order_id for update;
    select * into v_link from public.demanda_broncas
      where demanda_id=v_order_id and report_id=p_report for update;
    if v_link.report_id is null or v_order.id is null
      or v_order.prefeitura_id<>p_prefeitura or v_order.category_id<>'iluminacao'
      or v_order.atribuido_a is distinct from auth.uid()
      or v_order.status<>'em_andamento'
      or not public.pode_operar_demanda(auth.uid(),v_order.id) then
      raise exception 'Esta solicitação deve ser atendida pelo eletricista responsável pela ordem em execução'; end if;
  end if;
  select * into v_report from public.reports where id=p_report and city_id=v_city for update;
  if v_report.id is null or v_report.pole_id is distinct from p_poste_id
    or v_report.category_id<>'iluminacao' or v_report.moderation_status='rejected' then
    raise exception 'Solicitação não vinculada a este poste'; end if;
  if v_report.status='resolved' then
    return jsonb_build_object('id',p_poste_id,'report_id',p_report,'repeated',true); end if;
  if v_report.status not in ('pending','in-progress','pending_approval','pending_resolution') then
    raise exception 'Solicitação não está aberta'; end if;
  select * into v_pole from public.poles where id=p_poste_id and city_id=v_city for update;
  if v_pole.id is null or v_pole.lighting_status='removido' then raise exception 'Poste ativo não encontrado'; end if;
  if v_pole.updated_at is distinct from p_poste_atualizado_em then
    raise exception 'O poste mudou. Reabra os dados antes de salvar.' using errcode='40001'; end if;
  v_type=coalesce(nullif(btrim(p_lamp_type),''),v_pole.lamp_type);
  v_power=coalesce(p_power_w,v_pole.lamp_power_w);
  if v_type is distinct from v_pole.lamp_type and v_type is not null and v_type not in
    ('LED','Vapor de sódio','Vapor de mercúrio','Iodetos metálicos','Fluorescente',
     'Fluorescente compacta','Incandescente','Mista') then raise exception 'Tipo de lâmpada inválido'; end if;
  if v_power is not null and (v_power<=0 or v_power>999999.99) then raise exception 'Potência inválida'; end if;
  update public.poles set lighting_status='aceso',lamp_type=v_type,lamp_power_w=v_power,
    updated_at=clock_timestamp() where id=v_pole.id;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,
    new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by,descricao_servico)
  values(v_pole.id,v_city,coalesce(v_pole.identifier,v_pole.id::text),v_pole.address,
    v_pole.lamp_power_w,v_power,v_pole.lamp_type,v_type,v_pole.lighting_status,'aceso',
    'updated',auth.uid(),nullif(v_description,''));
  update public.reports set status='resolved' where id=v_report.id;
  update public.orgao_casos set status='encerrada',updated_at=now() where report_id=v_report.id;
  if v_order_id is not null then
    update public.demanda_broncas set atendida_em=now(),atendida_por=auth.uid(),
      pole_id=v_pole.id,service_types=p_servicos,resultado=nullif(v_description,'')
    where demanda_id=v_order_id and report_id=v_report.id;
    insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(v_order_id,'solicitacao_atendida',jsonb_build_object('report_id',v_report.id,
      'titulo',v_report.title,'poste_id',v_pole.id,'servicos',p_servicos,
      'resultado',nullif(v_description,'')),auth.uid());
    select count(*) into v_remaining from public.demanda_broncas b
    join public.reports r on r.id=b.report_id
    where b.demanda_id=v_order_id and r.status is distinct from 'resolved';
    v_status=case when v_remaining=0 then 'concluida' else 'em_andamento' end;
    update public.demandas_municipais set status=v_status,pole_id=v_pole.id,
      service_type=case when cardinality(p_servicos)>0 then p_servicos[1] else service_type end,
      service_types=case when cardinality(p_servicos)>0 then p_servicos else service_types end,
      resultado=coalesce(nullif(v_description,''),resultado),
      registro_execucao=coalesce(nullif(v_description,''),registro_execucao),
      executada_em=case when v_remaining=0 then now() else executada_em end,
      updated_by=auth.uid() where id=v_order_id;
  else
    if exists(select 1 from public.demandas_municipais where id=p_visita_id) then
      raise exception 'Identificação de visita já utilizada'; end if;
    insert into public.demandas_municipais(id,prefeitura_id,titulo,descricao,endereco,
      latitude,longitude,pole_id,category_id,prioridade,status,canal_id,atribuido_a,
      origem,resultado,registro_execucao,service_type,service_types,executada_em,concluida_em,criado_por)
    values(p_visita_id,p_prefeitura,'Atendimento no poste '||left(regexp_replace(coalesce(v_pole.identifier,v_pole.id::text),'^[0-9]+[[:space:]]*[-–—][[:space:]]*',''),150),
      coalesce(nullif(v_description,''),'Poste aceso / funcionando'),v_pole.address,
      v_pole.latitude,v_pole.longitude,v_pole.id,'iluminacao','normal','concluida',
      v_canal,auth.uid(),'vistoria',coalesce(nullif(v_description,''),'Poste aceso / funcionando'),
      coalesce(nullif(v_description,''),'Poste aceso / funcionando'),p_servicos[1],p_servicos,
      now(),now(),auth.uid());
    insert into public.demanda_broncas(demanda_id,report_id,vinculado_por,atendida_em,
      atendida_por,pole_id,service_types,resultado)
    values(p_visita_id,v_report.id,auth.uid(),now(),auth.uid(),v_pole.id,p_servicos,nullif(v_description,''));
    v_order_id=p_visita_id; v_status='concluida'; v_remaining=0;
  end if;
  perform public.refresh_pole_broken_state(v_pole.id);
  return jsonb_build_object('id',v_pole.id,'report_id',v_report.id,
    'ordem_id',v_order_id,'status',v_status,'restantes',v_remaining);
end $$;
revoke all on function public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid) from public,anon;
grant execute on function public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
