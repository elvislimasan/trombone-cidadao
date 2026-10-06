begin;

-- Permite corrigir o identificador durante a conclusão da ordem.
create or replace function public.resolver_ordem_eletricista(
  p_prefeitura uuid, p_ordem uuid, p_versao integer, p_poste_id bigint,
  p_poste_atualizado_em timestamptz, p_poste jsonb, p_anexos jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.demandas_municipais%rowtype; p public.poles%rowtype;
  v_city bigint; v_result jsonb; v_details jsonb; v_power numeric; v_count numeric; v_type text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta institucional'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem for update;
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if d.id is null or v_city is null or d.prefeitura_id<>p_prefeitura
    or d.category_id is distinct from 'iluminacao' or d.atribuido_a is distinct from auth.uid()
    or not public.pode_operar_demanda(auth.uid(),d.id) then raise exception 'Ordem não atribuída a você'; end if;
  -- Repetir a mesma conclusão após uma falha de conexão não aplica a reforma novamente.
  if d.status='concluida' and not d.revisao_pendente then
    return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
  end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Recarregue antes de resolver.' using errcode='40001'; end if;
  if d.status not in ('aberta','triagem','programada','em_andamento','aguardando_confirmacao') then raise exception 'Esta ordem não pode ser resolvida'; end if;
  if d.pole_id is not null and d.pole_id is distinct from p_poste_id then raise exception 'Atualize somente o poste vinculado à ordem'; end if;
  select * into p from public.poles where id=p_poste_id and city_id=v_city for update;
  if p.id is null or p.lighting_status='removido' then raise exception 'Selecione um poste ativo desta prefeitura'; end if;
  if p.updated_at is distinct from p_poste_atualizado_em then raise exception 'O cadastro do poste mudou. Recarregue os dados antes de resolver.' using errcode='40001'; end if;
  if p_poste is null or jsonb_typeof(p_poste)<>'object' or octet_length(p_poste::text)>8192
    or not (p_poste ?& array['identifier','lamp_type','lamp_power_w','lamp_count']) then raise exception 'Confira os dados do poste'; end if;
  if exists(select 1 from jsonb_object_keys(p_poste) k where k not in
    ('identifier','lamp_type','lamp_power_w','lamp_count','source_plate','point_type','network_type','feeder','transformer_code','switch_code','company_number')) then raise exception 'Campo de poste não permitido'; end if;
  if nullif(btrim(p_poste->>'identifier'),'') is null or length(btrim(p_poste->>'identifier'))>200 then raise exception 'Identificador do poste inválido'; end if;
  v_type=nullif(btrim(p_poste->>'lamp_type'),'');
  if v_type is not null and v_type not in ('LED','Vapor de sódio','Vapor de mercúrio','Iodetos metálicos','Fluorescente','Fluorescente compacta','Incandescente','Mista') then raise exception 'Tipo de lâmpada inválido'; end if;
  v_power=(p_poste->>'lamp_power_w')::numeric; v_count=(p_poste->>'lamp_count')::numeric;
  if v_power is not null and not (v_power>0 and v_power<=999999.99) then raise exception 'Potência inválida'; end if;
  if v_count is not null and not (v_count between 1 and 100 and v_count=trunc(v_count)) then raise exception 'Informe de 1 a 100 pontos de luz'; end if;
  v_details=coalesce(p.raw_properties->'municipal','{}'::jsonb)||(p_poste-array['lamp_type','lamp_power_w']);
  update public.poles set identifier=btrim(p_poste->>'identifier'),lamp_type=v_type,lamp_power_w=v_power,lighting_status='aceso',
    plate=case when p_poste ? 'source_plate' then nullif(btrim(p_poste->>'source_plate'),'') else plate end,
    raw_properties=jsonb_set(coalesce(raw_properties,'{}'::jsonb),'{municipal}',v_details,true),
    updated_at=clock_timestamp() where id=p.id;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,new_power_w,
    old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by)
  values(p.id,v_city,coalesce(p.identifier,p.plate,p.id::text),p.address,p.lamp_power_w,v_power,
    p.lamp_type,v_type,p.lighting_status,'aceso','updated',auth.uid());
  if d.pole_id is null then
    update public.demandas_municipais set pole_id=p.id,updated_by=auth.uid() where id=d.id returning * into d;
  end if;
  v_result=public.salvar_demanda_municipal(p_prefeitura,d.id,
    jsonb_build_object('status','concluida','executada_em',now()),d.versao,'{}',null,null,null,p_anexos);
  if d.titulo = 'Manutenção do poste ' || coalesce(p.identifier,p.plate,p.id::text)
    and length('Manutenção do poste ' || btrim(p_poste->>'identifier')) <= 180 then
    update public.demandas_municipais set titulo='Manutenção do poste ' || btrim(p_poste->>'identifier') where id=d.id;
  end if;
  update public.reports r set status='resolved'
  where r.city_id=v_city and r.status in ('pending','in-progress','pending_resolution','pending_approval')
    and (r.id=d.report_id or exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id and b.report_id=r.id));
  update public.orgao_casos c set status='encerrada',updated_at=now()
  where exists(select 1 from public.reports r where r.id=c.report_id and r.city_id=v_city and r.status='resolved'
    and (r.id=d.report_id or exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id and b.report_id=r.id)));
  perform public.refresh_pole_broken_state(p.id);
  update public.demandas_municipais set revisao_pendente=false where id=d.id and revisao_pendente;
  insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
  values(d.id,'atualizada',jsonb_build_object('alteracoes',jsonb_build_object('poste',jsonb_build_object(
    'antes',jsonb_build_object('identifier',p.identifier,'lamp_type',p.lamp_type,'lamp_power_w',p.lamp_power_w,'raw_properties',p.raw_properties),
    'depois',p_poste)),'mensagem','Poste atualizado e atendimento resolvido pelo eletricista.'),auth.uid());
  select jsonb_build_object('id',id,'status',status,'versao',versao) into v_result from public.demandas_municipais where id=d.id;
  return v_result;
end $$;

revoke all on function public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) to authenticated;

-- Conserva títulos personalizados e atualiza somente os gerados a partir do identificador.
create or replace function public.gerir_iluminacao_municipal_detalhado(
  p_city_id bigint, p_action text, p_pole_id bigint, p_number text,
  p_address text, p_lat double precision, p_lng double precision,
  p_lamp_type text, p_power_w numeric, p_status text, p_details jsonb
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint; v_old_identifier text; v_new_identifier text;
begin
  if p_action <> 'removed' then
    if p_details is null or jsonb_typeof(p_details) <> 'object'
      or octet_length(p_details::text) > 16384 then
      raise exception 'Dados técnicos inválidos';
    end if;
    if p_details ? 'luminaires' and jsonb_typeof(p_details->'luminaires') <> 'array' then
      raise exception 'Luminárias inválidas';
    end if;
  end if;

  if p_action = 'updated' then
    select identifier into v_old_identifier from public.poles
    where id = p_pole_id and city_id = p_city_id;
  end if;
  v_id := public.gerir_iluminacao_municipal(
    p_city_id, p_action, p_pole_id, p_number, p_address, p_lat, p_lng,
    p_lamp_type, p_power_w, p_status
  );

  if p_action <> 'removed' then
    update public.poles
    set plate = nullif(btrim(p_details->>'source_plate'), ''),
      raw_properties = jsonb_set(
        coalesce(raw_properties, '{}'::jsonb), '{municipal}', p_details, true
      )
    where id = v_id and city_id = p_city_id;
  end if;
  if p_action = 'updated' then
    select identifier into v_new_identifier from public.poles where id = v_id;
    if v_old_identifier is distinct from v_new_identifier and v_old_identifier is not null
      and length('Manutenção do poste ' || v_new_identifier) <= 180 then
      update public.demandas_municipais
      set titulo = 'Manutenção do poste ' || v_new_identifier
      where pole_id = v_id and titulo = 'Manutenção do poste ' || v_old_identifier;
    end if;
  end if;
  return v_id;
end $$;

revoke all on function public.gerir_iluminacao_municipal_detalhado(
  bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb
) from public, anon;
grant execute on function public.gerir_iluminacao_municipal_detalhado(
  bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb
) to authenticated;

notify pgrst,'reload schema';
commit;
