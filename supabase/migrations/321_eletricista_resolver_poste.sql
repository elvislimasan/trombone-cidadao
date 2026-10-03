begin;

-- A busca é restrita à cidade e a uma ordem atribuída ao profissional.
create or replace function public.buscar_postes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid, p_busca text default '')
returns table(id bigint, identifier text, plate text, address text, latitude double precision,
  longitude double precision, lamp_type text, lamp_power_w numeric, raw_properties jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city from public.demandas_municipais d
  join public.prefeituras p on p.id=d.prefeitura_id
  where d.id=p_ordem and d.prefeitura_id=p_prefeitura and p.status='ativa'
    and d.category_id='iluminacao' and d.atribuido_a=auth.uid()
    and public.pode_operar_demanda(auth.uid(),d.id);
  if v_city is null then raise exception 'Sem acesso a esta ordem'; end if;
  if length(btrim(coalesce(p_busca,'')))<2 then return; end if;
  return query select p.id,p.identifier,p.plate,p.address,p.latitude,p.longitude,
    p.lamp_type,p.lamp_power_w,p.raw_properties,p.updated_at
  from public.poles p where p.city_id=v_city and p.lighting_status is distinct from 'removido'
    and (p.identifier ilike '%'||left(btrim(p_busca),120)||'%'
      or p.plate ilike '%'||left(btrim(p_busca),120)||'%'
      or p.address ilike '%'||left(btrim(p_busca),120)||'%')
  order by (p.identifier=btrim(p_busca)) desc nulls last,p.identifier,p.id limit 30;
end $$;

-- Uma única transação: cadastro do poste, ordem, broncas e solicitações.
-- Não concede ao eletricista permissão geral de edição do inventário.
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
    or not (p_poste ?& array['lamp_type','lamp_power_w','lamp_count']) then raise exception 'Confira os dados do poste'; end if;
  if exists(select 1 from jsonb_object_keys(p_poste) k where k not in
    ('lamp_type','lamp_power_w','lamp_count','source_plate','point_type','network_type','feeder','transformer_code','switch_code','company_number')) then raise exception 'Campo de poste não permitido'; end if;
  v_type=nullif(btrim(p_poste->>'lamp_type'),'');
  if v_type is not null and v_type not in ('LED','Vapor de sódio','Vapor de mercúrio','Iodetos metálicos','Fluorescente','Fluorescente compacta','Incandescente','Mista') then raise exception 'Tipo de lâmpada inválido'; end if;
  v_power=(p_poste->>'lamp_power_w')::numeric; v_count=(p_poste->>'lamp_count')::numeric;
  if v_power is not null and not (v_power>0 and v_power<=999999.99) then raise exception 'Potência inválida'; end if;
  if v_count is not null and not (v_count between 1 and 100 and v_count=trunc(v_count)) then raise exception 'Informe de 1 a 100 pontos de luz'; end if;
  v_details=coalesce(p.raw_properties->'municipal','{}'::jsonb)||(p_poste-array['lamp_type','lamp_power_w']);
  update public.poles set lamp_type=v_type,lamp_power_w=v_power,lighting_status='aceso',
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
    'antes',jsonb_build_object('lamp_type',p.lamp_type,'lamp_power_w',p.lamp_power_w,'raw_properties',p.raw_properties),
    'depois',p_poste)),'mensagem','Poste atualizado e atendimento resolvido pelo eletricista.'),auth.uid());
  select jsonb_build_object('id',id,'status',status,'versao',versao) into v_result from public.demandas_municipais where id=d.id;
  return v_result;
end $$;

revoke all on function public.buscar_postes_ordem_eletricista(uuid,uuid,text) from public,anon;
revoke all on function public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.buscar_postes_ordem_eletricista(uuid,uuid,text) to authenticated;
grant execute on function public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
