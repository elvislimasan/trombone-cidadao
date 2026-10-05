begin;

alter table public.demanda_broncas
  add column if not exists atendida_em timestamptz,
  add column if not exists atendida_por uuid references public.profiles(id),
  add column if not exists pole_id bigint references public.poles(id),
  add column if not exists service_types text[] not null default '{}',
  add column if not exists resultado text;

-- Ordens antigas também podem guardar o vínculo somente em report_id.
insert into public.demanda_broncas(demanda_id,report_id,vinculado_por)
select d.id,d.report_id,d.criado_por from public.demandas_municipais d
where d.category_id='iluminacao' and d.report_id is not null
  and not exists(select 1 from public.demanda_broncas b where b.report_id=d.report_id)
on conflict (report_id) do nothing;

update public.demanda_broncas b
set atendida_em=coalesce(d.executada_em,d.concluida_em,d.updated_at),
    atendida_por=d.atribuido_a,
    pole_id=coalesce(r.pole_id,d.pole_id),
    service_types=coalesce(nullif(d.service_types,'{}'::text[]),case when d.service_type is null then '{}'::text[] else array[d.service_type] end),
    resultado=d.resultado
from public.demandas_municipais d join public.reports r on true
where b.demanda_id=d.id and b.report_id=r.id and d.category_id='iluminacao'
  and d.status='concluida' and r.status='resolved' and b.atendida_em is null;

create or replace function public.solicitacoes_ordem_eletricista(p_prefeitura uuid,p_ordem uuid)
returns table(report_id uuid,title text,address text,neighborhood text,status text,
  pole_id bigint,latitude double precision,longitude double precision,
  atendida_em timestamptz,service_types text[],resultado text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city
  from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
  where d.id=p_ordem and d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
    and d.atribuido_a=auth.uid() and p.status='ativa'
    and public.pode_operar_demanda(auth.uid(),d.id);
  if v_city is null then raise exception 'Sem acesso a esta ordem'; end if;
  return query
  select r.id,r.title::text,r.address::text,r.neighborhood::text,r.status::text,
    coalesce(r.pole_id,nearest.id,d.pole_id),
    case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end,
    case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end,
    b.atendida_em,b.service_types,b.resultado
  from public.demanda_broncas b
  join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id and r.city_id=v_city
  left join lateral (
    select p.id from public.poles p
    where r.location is not null and p.city_id=v_city and p.geom is not null
      and p.lighting_status is distinct from 'removido'
    order by p.geom <-> r.location::extensions.geography, p.id limit 1
  ) nearest on true
  where b.demanda_id=p_ordem
  order by b.created_at,r.id;
end $$;
revoke all on function public.solicitacoes_ordem_eletricista(uuid,uuid) from public,anon;
grant execute on function public.solicitacoes_ordem_eletricista(uuid,uuid) to authenticated;

-- Um aceite já inicia a execução. A operação também é segura para aceite repetido.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.aceitar_oferta_eletricista(uuid,text,uuid)'::regprocedure);
  if position($old$if v_demanda.atribuido_a = auth.uid() then return v_demanda.id; end if;$old$ in definition)=0
    or position($old$set atribuido_a = auth.uid(), updated_by = auth.uid()$old$ in definition)=0
    or position($old$'aberta', v_canal, auth.uid(), 'bronca'$old$ in definition)=0 then
    raise exception 'Definição inesperada de aceitar_oferta_eletricista'; end if;
  definition := replace(definition,
    $old$if v_demanda.atribuido_a = auth.uid() then return v_demanda.id; end if;$old$,
    $new$if v_demanda.atribuido_a = auth.uid() then
      if v_demanda.status in ('aberta','triagem','programada') then
        update public.demandas_municipais set status='em_andamento',updated_by=auth.uid()
        where id=v_demanda.id;
        perform public.publicar_estado_demanda(v_demanda.id,b.report_id,null)
        from public.demanda_broncas b where b.demanda_id=v_demanda.id;
      end if;
      return v_demanda.id;
    end if;$new$);
  definition := replace(definition,
    $old$set atribuido_a = auth.uid(), updated_by = auth.uid()
      where id = v_demanda.id;$old$,
    $new$set atribuido_a = auth.uid(), status='em_andamento', updated_by = auth.uid()
      where id = v_demanda.id;
    perform public.publicar_estado_demanda(v_demanda.id,b.report_id,null)
    from public.demanda_broncas b where b.demanda_id=v_demanda.id;$new$);
  definition := replace(definition,
    $old$'aberta', v_canal, auth.uid(), 'bronca'$old$,
    $new$'em_andamento', v_canal, auth.uid(), 'bronca'$new$);
  execute definition;
end $migration$;

-- A busca sem termo acompanha a próxima solicitação, que pode estar em outro poste.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.buscar_postes_ordem_eletricista(uuid,uuid,text)'::regprocedure);
  if position($old$select p.city_id, d.latitude, d.longitude into v_city, v_latitude, v_longitude$old$ in definition)=0 then
    raise exception 'Definição inesperada de buscar_postes_ordem_eletricista'; end if;
  definition := replace(definition,
    $old$select p.city_id, d.latitude, d.longitude into v_city, v_latitude, v_longitude$old$,
    $new$select p.city_id,
    coalesce((select extensions.st_y(r.location::extensions.geometry)
      from public.demanda_broncas b join public.reports r on r.id=b.report_id
      where b.demanda_id=d.id and r.status is distinct from 'resolved' and r.location is not null
      order by b.created_at,r.id limit 1),d.latitude),
    coalesce((select extensions.st_x(r.location::extensions.geometry)
      from public.demanda_broncas b join public.reports r on r.id=b.report_id
      where b.demanda_id=d.id and r.status is distinct from 'resolved' and r.location is not null
      order by b.created_at,r.id limit 1),d.longitude)
    into v_city, v_latitude, v_longitude$new$);
  execute definition;
end $migration$;

create or replace function public.impedir_conclusao_ordem_com_solicitacoes_abertas()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.category_id='iluminacao' and new.status='concluida'
    and old.status is distinct from 'concluida'
    and exists (
      select 1 from public.demanda_broncas b
      join public.reports r on r.id=b.report_id
      where b.demanda_id=new.id and r.status is distinct from 'resolved'
    ) then raise exception 'Atenda todas as solicitações vinculadas antes de concluir a ordem'; end if;
  return new;
end $$;
drop trigger if exists impedir_conclusao_ordem_com_solicitacoes_abertas on public.demandas_municipais;
create trigger impedir_conclusao_ordem_com_solicitacoes_abertas
before update of status on public.demandas_municipais for each row
execute function public.impedir_conclusao_ordem_com_solicitacoes_abertas();

-- Uma solicitação já resolvida não recebe aviso pedindo confirmação ao fechar a ordem.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.publicar_estado_demanda(uuid,uuid,text)'::regprocedure);
  if position($old$  select * into d from public.demandas_municipais where id=p_demanda;$old$ in definition)=0 then
    raise exception 'Definição inesperada de publicar_estado_demanda'; end if;
  definition := replace(definition,
    $old$  select * into d from public.demandas_municipais where id=p_demanda;$old$,
    $new$  select * into d from public.demandas_municipais where id=p_demanda;
  if d.category_id='iluminacao' and d.status='concluida'
    and exists(select 1 from public.reports r where r.id=p_report and r.status='resolved') then
    return;
  end if;$new$);
  execute definition;
end $migration$;

-- Impede que versões antigas do aplicativo fechem todas as broncas em uma chamada.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)'::regprocedure);
  if position($old$  select * into p from public.poles where id=p_poste_id and city_id=v_city for update;$old$ in definition)=0 then
    raise exception 'Definição inesperada de resolver_ordem_eletricista'; end if;
  definition := replace(definition,
    $old$  select * into p from public.poles where id=p_poste_id and city_id=v_city for update;$old$,
    $new$  if exists(select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id
      where b.demanda_id=d.id and r.status is distinct from 'resolved') then
    raise exception 'Atenda cada solicitação vinculada separadamente'; end if;
  select * into p from public.poles where id=p_poste_id and city_id=v_city for update;$new$);
  execute definition;
end $migration$;

create or replace function public.atender_solicitacao_ordem_eletricista(
  p_prefeitura uuid,p_ordem uuid,p_report uuid,p_versao integer,p_poste_id bigint,
  p_poste_atualizado_em timestamptz,p_poste jsonb,p_anexos jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.demandas_municipais%rowtype; p public.poles%rowtype; r public.reports%rowtype;
  v_city bigint; v_link public.demanda_broncas%rowtype; v_type text; v_power numeric; v_count numeric;
  v_details jsonb; v_services text[]; v_result text; v_last boolean; v_file jsonb; v_path text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta institucional'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem for update;
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if d.id is null or v_city is null or d.prefeitura_id<>p_prefeitura
    or d.category_id is distinct from 'iluminacao' or d.atribuido_a is distinct from auth.uid()
    or not public.pode_operar_demanda(auth.uid(),d.id) then raise exception 'Ordem não atribuída a você'; end if;
  select * into v_link from public.demanda_broncas
  where demanda_id=d.id and report_id=p_report for update;
  if v_link.report_id is null then raise exception 'Solicitação não vinculada a esta ordem'; end if;
  if v_link.atendida_em is not null then
    return jsonb_build_object('id',d.id,'report_id',p_report,'status',d.status,'versao',d.versao,'repeated',true);
  end if;
  if d.status <> 'em_andamento' then raise exception 'Inicie a execução da ordem antes de atender a solicitação'; end if;
  if p_versao is distinct from d.versao then
    raise exception 'A ordem mudou. Recarregue antes de atender.' using errcode='40001'; end if;
  select * into r from public.reports where id=p_report and city_id=v_city for update;
  if r.id is null or r.status='resolved' then raise exception 'Solicitação já resolvida ou indisponível'; end if;
  select * into p from public.poles where id=p_poste_id and city_id=v_city for update;
  if p.id is null or p.lighting_status='removido' then raise exception 'Selecione um poste ativo desta prefeitura'; end if;
  if p.updated_at is distinct from p_poste_atualizado_em then
    raise exception 'O cadastro do poste mudou. Recarregue antes de atender.' using errcode='40001'; end if;
  if p_poste is null or jsonb_typeof(p_poste)<>'object' or octet_length(p_poste::text)>32768
    or not (p_poste ?& array['identifier','lamp_type','lamp_power_w','lamp_count','service_type','service_types','resultado'])
    or exists(select 1 from jsonb_object_keys(p_poste) k where k not in
      ('identifier','lamp_type','lamp_power_w','lamp_count','source_plate','point_type','network_type',
       'feeder','transformer_code','switch_code','company_number','service_type','service_types','resultado'))
    then raise exception 'Confira os dados do poste e do atendimento'; end if;
  if nullif(btrim(p_poste->>'identifier'),'') is null
    or length(btrim(p_poste->>'identifier'))>200 then raise exception 'Identificador do poste inválido'; end if;
  if jsonb_typeof(p_poste->'service_types') is distinct from 'array' then
    raise exception 'Selecione os serviços executados'; end if;
  if jsonb_array_length(p_poste->'service_types') not between 1 and 4
    or p_poste->'service_types'->>0 is distinct from p_poste->>'service_type'
    or exists(select 1 from jsonb_array_elements_text(p_poste->'service_types') as item(value)
      where item.value is null or item.value not in ('lamp_replacement','arm_installation','relay_replacement','other'))
    or (select count(distinct item.value) from jsonb_array_elements_text(p_poste->'service_types') as item(value))
      <> jsonb_array_length(p_poste->'service_types') then
    raise exception 'Selecione serviços válidos sem repetições'; end if;
  v_services=array(select jsonb_array_elements_text(p_poste->'service_types'));
  v_result=btrim(coalesce(p_poste->>'resultado',''));
  if length(v_result)>4000 or length(v_result) between 1 and 9 then
    raise exception 'Descreva o resultado com pelo menos 10 caracteres ou deixe em branco'; end if;
  v_type=nullif(btrim(p_poste->>'lamp_type'),'');
  if v_type is not null and v_type not in ('LED','Vapor de sódio','Vapor de mercúrio',
    'Iodetos metálicos','Fluorescente','Fluorescente compacta','Incandescente','Mista') then
    raise exception 'Tipo de lâmpada inválido'; end if;
  v_power=(p_poste->>'lamp_power_w')::numeric; v_count=(p_poste->>'lamp_count')::numeric;
  if v_power is not null and not (v_power>0 and v_power<=999999.99) then raise exception 'Potência inválida'; end if;
  if v_count is not null and not (v_count between 1 and 100 and v_count=trunc(v_count)) then
    raise exception 'Informe de 1 a 100 pontos de luz'; end if;
  p_anexos=coalesce(p_anexos,'[]'::jsonb);
  if jsonb_typeof(p_anexos)<>'array' or jsonb_array_length(p_anexos)>10 then
    raise exception 'Envie no máximo 10 fotos por atualização'; end if;
  for v_file in select value from jsonb_array_elements(p_anexos) loop
    v_path=v_file->>'storage_path';
    if split_part(v_path,'/',1)<>p_prefeitura::text or split_part(v_path,'/',2)<>auth.uid()::text
      or v_file->>'mime_type' not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Arquivo fora do seu atendimento'; end if;
    if not exists(select 1 from storage.objects where bucket_id='municipal-demand-files' and name=v_path
      and coalesce((metadata->>'size')::bigint,0) between 1 and 10485760
      and (metadata->>'size')::bigint=(v_file->>'tamanho')::bigint
      and metadata->>'mimetype'=v_file->>'mime_type') then
      raise exception 'Foto não encontrada ou inválida'; end if;
  end loop;
  v_details=coalesce(p.raw_properties->'municipal','{}'::jsonb)
    ||(p_poste-array['identifier','lamp_type','lamp_power_w','source_plate','service_type','service_types','resultado']);
  update public.poles set identifier=btrim(p_poste->>'identifier'),lamp_type=v_type,lamp_power_w=v_power,
    lighting_status='aceso',raw_properties=jsonb_set(coalesce(raw_properties,'{}'::jsonb),'{municipal}',v_details,true),
    updated_at=clock_timestamp() where id=p.id;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,new_power_w,
    old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by,descricao_servico)
  values(p.id,v_city,coalesce(p.identifier,p.id::text),p.address,p.lamp_power_w,v_power,
    p.lamp_type,v_type,p.lighting_status,'aceso','updated',auth.uid(),nullif(v_result,''));
  for v_file in select value from jsonb_array_elements(p_anexos) loop
    insert into public.demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,criado_por)
    values(d.id,v_file->>'storage_path',left(v_file->>'nome',200),v_file->>'mime_type',
      (v_file->>'tamanho')::bigint,'interna',auth.uid());
  end loop;
  update public.demanda_broncas set atendida_em=now(),atendida_por=auth.uid(),
    pole_id=p.id,service_types=v_services,resultado=nullif(v_result,'')
  where demanda_id=d.id and report_id=r.id;
  update public.reports set pole_id=p.id,status='resolved' where id=r.id;
  update public.orgao_casos set status='encerrada',updated_at=now() where report_id=r.id;
  insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
  values(d.id,'solicitacao_atendida',jsonb_build_object('report_id',r.id,'titulo',r.title,'poste_id',p.id,
    'servicos',v_services,'resultado',nullif(v_result,''),'anexos',p_anexos),auth.uid());
  select not exists(
    select 1 from public.demanda_broncas b join public.reports q on q.id=b.report_id
    where b.demanda_id=d.id and q.status is distinct from 'resolved'
  ) into v_last;
  update public.demandas_municipais set
    pole_id=p.id,service_type=v_services[1],service_types=v_services,
    resultado=coalesce(nullif(v_result,''),resultado),
    registro_execucao=coalesce(nullif(v_result,''),registro_execucao),
    status=case when v_last then 'concluida' else 'em_andamento' end,
    executada_em=case when v_last then now() else executada_em end,
    updated_by=auth.uid()
  where id=d.id returning * into d;
  perform public.refresh_pole_broken_state(p.id);
  return jsonb_build_object('id',d.id,'report_id',r.id,'status',d.status,'versao',d.versao,
    'restantes',(select count(*) from public.demanda_broncas b join public.reports q on q.id=b.report_id
      where b.demanda_id=d.id and q.status is distinct from 'resolved'));
end $$;
revoke all on function public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) to authenticated;

create or replace function public.atendimentos_eletricista_iluminacao(p_prefeitura uuid)
returns table(id uuid,order_id uuid,protocolo text,titulo text,bairro text,status text,
  pole_id bigint,service_type text,service_types text[],concluida_em timestamptz,executada_em timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city from public.prefeituras p
  where p.id=p_prefeitura and p.status='ativa'
    and public.pode_acessar_prefeitura(auth.uid(),p.city_id);
  if v_city is null then raise exception 'Sem acesso a esta prefeitura'; end if;
  return query
  select b.report_id,d.id,d.protocolo,r.title,r.neighborhood,'concluida'::text,
    b.pole_id,b.service_types[1],b.service_types,b.atendida_em,b.atendida_em
  from public.demanda_broncas b
  join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
    and d.atribuido_a=auth.uid() and b.atendida_em is not null
  union all
  select d.id,d.id,d.protocolo,d.titulo,d.bairro,d.status,
    d.pole_id,d.service_type,d.service_types,d.concluida_em,d.executada_em
  from public.demandas_municipais d
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
    and d.atribuido_a=auth.uid() and d.status='concluida'
    and not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)
  order by 1;
end $$;
revoke all on function public.atendimentos_eletricista_iluminacao(uuid) from public,anon;
grant execute on function public.atendimentos_eletricista_iluminacao(uuid) to authenticated;

create or replace function public.ranking_eletricistas_iluminacao(p_prefeitura uuid)
returns table(user_id uuid,nome text,servicos bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city from public.prefeituras p where p.id=p_prefeitura and p.status='ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso às estatísticas desta prefeitura'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) and not exists(
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel in ('eletricista','gestor','operador')
      and c.city_id=v_city) then raise exception 'Sem acesso às estatísticas de iluminação'; end if;
  return query
  with trabalho as (
    select d.atribuido_a as electrician, cardinality(b.service_types) as quantidade
    from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
    where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
      and d.atribuido_a is not null and b.atendida_em is not null
      and cardinality(b.service_types)>0
    union all
    select d.atribuido_a,greatest(cardinality(d.service_types),
      case when d.service_type is null then 0 else 1 end)
    from public.demandas_municipais d
    where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
      and d.status='concluida' and d.atribuido_a is not null
      and (cardinality(d.service_types)>0 or d.service_type is not null)
      and not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)
  )
  select t.electrician,coalesce(nullif(p.name,''),'Eletricista'),
    sum(t.quantidade)::bigint
  from trabalho t left join public.profiles p on p.id=t.electrician
  group by t.electrician,p.name order by 3 desc,2 limit 50;
end $$;
revoke all on function public.ranking_eletricistas_iluminacao(uuid) from public,anon;
grant execute on function public.ranking_eletricistas_iluminacao(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
