begin;
alter table public.demandas_municipais
  add column execution_specialty text check(execution_specialty in ('eletricista','arborizacao','ruas','servicos_gerais')),
  add column asset_tree_id uuid references public.city_trees(id),
  add column asset_street_id text;

create function public.field_executor_order_access(p_user uuid,p_order uuid,p_specialty text default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d where d.id=p_order and d.status<>'rascunho'
    and d.atribuido_a=p_user and d.execution_specialty is not null and d.execution_specialty<>'eletricista'
    and (p_specialty is null or p_specialty=d.execution_specialty)
    and public.field_executor_can_work(p_user,d.canal_id,d.execution_specialty,d.category_id))
$$;
revoke all on function public.field_executor_order_access(uuid,uuid,text) from public,anon;
grant execute on function public.field_executor_order_access(uuid,uuid,text) to authenticated;

create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and p.status='ativa' and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id)
        or (public.municipal_channel_action(p_user,d.canal_id,'read') and (d.status<>'rascunho' or d.criado_por=p_user or public.municipal_channel_action(p_user,d.canal_id,'dispatch')))
        or (d.status<>'rascunho' and d.category_id='iluminacao' and d.atribuido_a=p_user and public.eletricista_ativo_municipio(p_user,p.city_id))
        or public.field_executor_order_access(p_user,d.id)))
$$;
create or replace function public.pode_operar_demanda(p_user uuid,p_demanda uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_ver_demanda(p_user,p_demanda) and
      (public.pode_administrar_prefeitura(p_user,p.city_id) or public.municipal_channel_action(p_user,d.canal_id,'dispatch')
        or (d.status='rascunho' and d.criado_por=p_user and public.municipal_channel_action(p_user,d.canal_id,'receive'))
        or (d.category_id='iluminacao' and d.atribuido_a=p_user and public.eletricista_ativo_municipio(p_user,p.city_id))
        or public.field_executor_order_access(p_user,d.id)))
$$;

create function public.validate_field_execution_order() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare choices text[]; v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id;
  if new.execution_specialty is null and new.category_id is not null and new.canal_id is not null then
    select array_agg(s) into choices from public.orgao_canais c cross join lateral unnest(c.execution_specialties) s
      where c.id=new.canal_id and new.category_id=any(public.department_execution_categories(c.id,s));
    if cardinality(choices)=1 then new.execution_specialty=choices[1]; end if;
  end if;
  if new.execution_specialty is not null and new.execution_specialty<>'eletricista' then
    if not(new.category_id=any(public.department_execution_categories(new.canal_id,new.execution_specialty))) then raise exception 'Atividade ou categoria fora da secretaria.'; end if;
    if tg_op='INSERT' or new.atribuido_a is distinct from old.atribuido_a or new.canal_id is distinct from old.canal_id or new.execution_specialty is distinct from old.execution_specialty then
      if new.atribuido_a is not null and not public.field_executor_can_work(new.atribuido_a,new.canal_id,new.execution_specialty,new.category_id) then raise exception 'Escolha um executor ativo desta atividade e secretaria.'; end if;
    end if;
    if new.category_id='iluminacao' or new.pole_id is not null then raise exception 'Use o fluxo do eletricista para iluminação.'; end if;
  end if;
  if new.asset_tree_id is not null and (new.execution_specialty is distinct from 'arborizacao' or not exists(select 1 from public.city_trees t where t.id=new.asset_tree_id and t.city_id=v_city)) then raise exception 'Árvore fora da atividade ou do município.'; end if;
  if new.asset_street_id is not null and (new.execution_specialty is distinct from 'ruas' or not exists(select 1 from public.pavement_streets s where s.id::text=new.asset_street_id and s.city_id=v_city)) then raise exception 'Rua fora da atividade ou do município.'; end if;
  return new;
end $$;
create trigger aaaa_validate_field_execution_order before insert or update on public.demandas_municipais for each row execute function public.validate_field_execution_order();

do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.enforce_municipal_order_responsibility()'::regprocedure);
  if position('v_execute=new.category_id=' in definition)=0 then raise exception 'Contrato de autorização de ordens incompatível.'; end if;
  definition=replace(definition,
    'v_execute=new.category_id=''iluminacao'' and new.atribuido_a=auth.uid() and public.eletricista_ativo_municipio(auth.uid(),v_city);',
    'v_execute=new.atribuido_a=auth.uid() and ((new.category_id=''iluminacao'' and public.eletricista_ativo_municipio(auth.uid(),v_city)) or public.field_executor_can_work(auth.uid(),new.canal_id,new.execution_specialty,new.category_id));');
  execute definition;
  definition=pg_get_functiondef('public.validar_demanda_municipal()'::regprocedure);
  if position('if new.atribuido_a is not null' in definition)=0 then raise exception 'Validação de responsável incompatível.'; end if;
  execute replace(definition,'if new.atribuido_a is not null','if new.atribuido_a is not null and coalesce(new.execution_specialty,''eletricista'')=''eletricista''');
  definition=pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position('category_id=d.category_id,' in definition)=0 then raise exception 'Salvamento de ordens incompatível.'; end if;
  definition=replace(definition,'''titulo'',''descricao''','''execution_specialty'',''asset_tree_id'',''asset_street_id'',''titulo'',''descricao''');
  definition=replace(definition,'category_id=d.category_id,','category_id=d.category_id,execution_specialty=d.execution_specialty,asset_tree_id=d.asset_tree_id,asset_street_id=d.asset_street_id,');
  definition=replace(definition,'d=jsonb_populate_record(d,v_dados);',
    'd=jsonb_populate_record(d,v_dados); if d.execution_specialty is null then select min(s) into d.execution_specialty from public.orgao_canais c cross join lateral unnest(c.execution_specialties) s where c.id=d.canal_id and d.category_id=any(public.department_execution_categories(c.id,s)) having count(*)=1; end if;');
  definition=replace(definition,'if d.atribuido_a is not null and d.category_id is distinct from ''iluminacao''',
    'if d.atribuido_a is not null and coalesce(d.execution_specialty,''eletricista'')=''eletricista'' and d.category_id is distinct from ''iluminacao''');
  definition=replace(definition,'coalesce(q.moderation_status,''approved'')=''approved''',
    '(coalesce(q.moderation_status,''approved'')=''approved'' or (not q.is_public and q.moderation_status=''internal'' and q.created_by_municipality=p_prefeitura)) and public.municipal_report_access(auth.uid(),q.id) and (d.execution_specialty is null or d.category_id=q.category_id)');
  execute definition;
end $migration$;

-- Filas elegíveis nunca usam apenas nome da secretaria ou o papel legado.
create function public.field_executor_report_channel(p_user uuid,p_report uuid,p_specialty text) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id from public.reports r join public.orgao_categorias oc on oc.city_id=r.city_id and oc.category_id=r.category_id
    join public.orgao_canais c on c.id=oc.canal_id
    where r.id=p_report and p_specialty<>'eletricista' and r.status in ('pending','in-progress','pending_resolution','pending_approval')
      and coalesce(r.moderation_status,'approved') in ('approved','internal') and not coalesce(r.is_petition,false)
      and public.field_executor_can_work(p_user,c.id,p_specialty,r.category_id)
      and not exists(select 1 from public.orgao_casos o where o.report_id=r.id and o.canal_id<>c.id)
      and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
      and not exists(select 1 from public.demandas_municipais d where d.report_id=r.id)
    order by c.id limit 1
$$;
revoke all on function public.field_executor_report_channel(uuid,uuid,text) from public,anon,authenticated;

create function public.executor_work_items(p_prefeitura uuid,p_especialidade text,p_canal uuid default null)
returns table(tipo text,id uuid,titulo text,descricao text,endereco text,bairro text,latitude double precision,longitude double precision,
  category_id text,canal_id uuid,status text,prioridade text,protocolo text,prazo_em timestamptz,atribuido_a uuid,versao integer,updated_at timestamptz,tree_id uuid,street_id text)
language sql stable security definer set search_path=public,pg_temp as $$
  select 'ordem',d.id,d.titulo,d.descricao,d.endereco,d.bairro,d.latitude,d.longitude,d.category_id,d.canal_id,d.status,d.prioridade,d.protocolo,d.prazo_em,d.atribuido_a,d.versao,d.updated_at,d.asset_tree_id,d.asset_street_id
    from public.demandas_municipais d where d.prefeitura_id=p_prefeitura and d.execution_specialty=p_especialidade and p_especialidade<>'eletricista'
      and (p_canal is null or d.canal_id=p_canal) and d.status<>'rascunho'
      and public.field_executor_can_work(auth.uid(),d.canal_id,p_especialidade,d.category_id)
      and (d.atribuido_a=auth.uid() or (d.atribuido_a is null and d.status in ('aberta','triagem','programada','em_andamento')))
  union all
  select 'solicitacao',r.id,r.title,r.description,r.address,r.neighborhood,
    case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end,
    case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end,
    r.category_id,c.id,r.status,'normal',null,null,null,null,r.created_at,r.tree_id,null
    from public.reports r join public.prefeituras p on p.city_id=r.city_id and p.id=p_prefeitura
      join public.orgao_canais c on c.id=public.field_executor_report_channel(auth.uid(),r.id,p_especialidade)
    where p_canal is null or c.id=p_canal
$$;
revoke all on function public.executor_work_items(uuid,text,uuid) from public,anon,authenticated;

create function public.listar_painel_executor(p_prefeitura uuid,p_especialidade text,p_canal uuid default null,p_aba text default 'minhas',p_etapa text default 'fazer',p_busca text default '',p_ordem text default 'priority',p_adiadas text[] default '{}',p_pagina integer default 1,p_tamanho integer default 20) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with eligible as (select w.*,case when w.status in ('concluida','cancelada','recusada') then 'historico' when w.status='aguardando_confirmacao' then 'conferencia' when w.status='em_andamento' then 'execucao' else 'fazer' end stage
    from public.executor_work_items(p_prefeitura,p_especialidade,p_canal) w
    where ((p_aba='minhas' and w.atribuido_a=auth.uid()) or (p_aba='disponiveis' and w.atribuido_a is null))
      and (nullif(btrim(p_busca),'') is null or position(lower(btrim(left(p_busca,160))) in lower(concat_ws(' ',w.titulo,w.descricao,w.protocolo,w.endereco,w.bairro)))>0)
      and not((w.tipo||':'||w.id::text)=any(coalesce(p_adiadas,'{}')))),
  filtered as (select * from eligible where p_aba='disponiveis' or stage=p_etapa),
  page as (select * from filtered order by
    case when p_ordem='priority' then case prioridade when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end end,
    case when p_ordem='deadline' then prazo_em end nulls last,updated_at desc,id
    limit least(greatest(coalesce(p_tamanho,20),1),100) offset (greatest(coalesce(p_pagina,1),1)-1)*least(greatest(coalesce(p_tamanho,20),1),100))
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from filtered),
    'page',greatest(coalesce(p_pagina,1),1),'stage_counts',jsonb_build_object('fazer',(select count(*) from eligible where stage='fazer'),
      'execucao',(select count(*) from eligible where stage='execucao'),'conferencia',(select count(*) from eligible where stage='conferencia'),'historico',(select count(*) from eligible where stage='historico')))
$$;
revoke all on function public.listar_painel_executor(uuid,text,uuid,text,text,text,text,text[],integer,integer) from public,anon;
grant execute on function public.listar_painel_executor(uuid,text,uuid,text,text,text,text,text[],integer,integer) to authenticated;

create function public.aceitar_servico_executor(p_prefeitura uuid,p_especialidade text,p_tipo text,p_id uuid,p_canal uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; r public.reports%rowtype; v_channel uuid;
begin
  if auth.uid() is null or p_especialidade not in ('arborizacao','ruas','servicos_gerais') then raise exception 'Atividade indisponível.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  if p_tipo='ordem' then
    select * into d from public.demandas_municipais where id=p_id and prefeitura_id=p_prefeitura for update;
    if d.id is null or d.execution_specialty is distinct from p_especialidade or (p_canal is not null and d.canal_id<>p_canal)
      or not public.field_executor_can_work(auth.uid(),d.canal_id,p_especialidade,d.category_id) then raise exception 'Sem acesso ao serviço.' using errcode='42501'; end if;
    if d.atribuido_a=auth.uid() then return d.id; end if;
    if d.atribuido_a is not null or d.status not in ('aberta','triagem','programada','em_andamento') then raise exception 'Serviço já assumido ou indisponível.' using errcode='23505'; end if;
    update public.demandas_municipais set atribuido_a=auth.uid(),status='em_andamento',updated_by=auth.uid() where id=d.id;
  elsif p_tipo='solicitacao' then
    select * into r from public.reports where id=p_id for update;
    if not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and p.city_id=r.city_id and p.status='ativa') then raise exception 'Solicitação fora do município.' using errcode='42501'; end if;
    select q.* into d from public.demandas_municipais q join public.demanda_broncas b on b.demanda_id=q.id where b.report_id=p_id;
    if d.id is not null then
      if d.atribuido_a=auth.uid() and public.field_executor_order_access(auth.uid(),d.id,p_especialidade) then return d.id; end if;
      raise exception 'Solicitação já assumida.' using errcode='23505';
    end if;
    v_channel=public.field_executor_report_channel(auth.uid(),p_id,p_especialidade);
    if v_channel is null or (p_canal is not null and v_channel<>p_canal) then raise exception 'Solicitação fora da atividade.' using errcode='42501'; end if;
    insert into public.demandas_municipais(prefeitura_id,titulo,descricao,category_id,canal_id,status,atribuido_a,criado_por,updated_by,origem,report_id,endereco,bairro,latitude,longitude,execution_specialty,asset_tree_id)
      values(p_prefeitura,left(r.title,180),r.description,r.category_id,v_channel,'em_andamento',auth.uid(),auth.uid(),auth.uid(),'bronca',r.id,r.address,r.neighborhood,
        case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end,case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end,p_especialidade,case when p_especialidade='arborizacao' then r.tree_id end)
      returning * into d;
    insert into public.demanda_broncas(demanda_id,report_id,vinculado_por) values(d.id,r.id,auth.uid());
  else raise exception 'Tipo de serviço inválido.'; end if;
  update public.reports set status='in-progress' where id in(select report_id from public.demanda_broncas where demanda_id=d.id) and status in ('pending','pending_approval');
  insert into public.demanda_eventos(demanda_id,tipo,criado_por,detalhes) values(d.id,'aceita',auth.uid(),jsonb_build_object('mensagem','Serviço assumido pelo executor.','atividade',p_especialidade));
  return d.id;
end $$;
revoke all on function public.aceitar_servico_executor(uuid,text,text,uuid,uuid) from public,anon;
grant execute on function public.aceitar_servico_executor(uuid,text,text,uuid,uuid) to authenticated;

create table public.municipal_execution_results(
  id uuid primary key,demanda_id uuid not null references public.demandas_municipais(id),report_id uuid references public.reports(id),
  executor_id uuid not null references public.profiles(id),specialty text not null,action text not null check(action in ('iniciar','impedimento','concluir')),
  cycle_started_at timestamptz not null,service_types text[] not null default '{}',result text not null,technical_note text,
  tree_id uuid references public.city_trees(id),street_id text,created_at timestamptz not null default now());
create unique index field_result_once_per_cycle on public.municipal_execution_results(demanda_id,report_id,cycle_started_at) nulls not distinct where action='concluir';
alter table public.municipal_execution_results enable row level security;
create policy field_results_read on public.municipal_execution_results for select to authenticated using(public.pode_ver_demanda(auth.uid(),demanda_id));
grant select on public.municipal_execution_results to authenticated;
revoke insert,update,delete on public.municipal_execution_results from public,anon,authenticated;
alter table public.city_tree_care add column execution_result_id uuid references public.municipal_execution_results(id);
create unique index tree_care_execution_once on public.city_tree_care(execution_result_id,service_type) where execution_result_id is not null;

create function public.detalhar_ordem_executor(p_prefeitura uuid,p_ordem uuid,p_especialidade text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype;
begin
  select * into d from public.demandas_municipais where id=p_ordem and prefeitura_id=p_prefeitura;
  if d.id is null or not public.field_executor_order_access(auth.uid(),d.id,p_especialidade) then raise exception 'Ordem fora da sua atividade ou atribuição.' using errcode='42501'; end if;
  return jsonb_build_object('order',to_jsonb(d),'reports',coalesce((select jsonb_agg(jsonb_build_object('report_id',r.id,'title',r.title,'status',r.status,'tree_id',r.tree_id,'tree_service',r.tree_service,'atendida_em',b.atendida_em,'resultado',b.resultado))
    from public.demanda_broncas b join public.reports r on r.id=b.report_id where b.demanda_id=d.id),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.demanda_anexos a where a.demanda_id=d.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.demanda_eventos e where e.demanda_id=d.id),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.municipal_execution_results e where e.demanda_id=d.id),'[]'::jsonb));
end $$;
revoke all on function public.detalhar_ordem_executor(uuid,uuid,text) from public,anon;
grant execute on function public.detalhar_ordem_executor(uuid,uuid,text) to authenticated;

create function public.registrar_execucao_executor(p_prefeitura uuid,p_ordem uuid,p_especialidade text,p_versao integer,p_operacao uuid,p_acao text,p_report uuid default null,p_dados jsonb default '{}',p_anexos jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; previous public.municipal_execution_results%rowtype;
  r public.reports%rowtype; file jsonb; v_city bigint; v_tree uuid; v_services text[]; v_pending integer; v_result text; v_note text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem and prefeitura_id=p_prefeitura for update;
  if d.id is null or not public.field_executor_order_access(auth.uid(),d.id,p_especialidade) then raise exception 'Ordem não atribuída a você nesta atividade.' using errcode='42501'; end if;
  if p_operacao is null or p_acao is null or p_acao not in ('iniciar','impedimento','concluir') then raise exception 'Operação inválida.'; end if;
  select * into previous from public.municipal_execution_results where id=p_operacao;
  if previous.id is not null then
    if previous.demanda_id<>d.id or previous.executor_id<>auth.uid() or previous.action<>p_acao or previous.report_id is distinct from p_report then raise exception 'Identificador de operação já utilizado.' using errcode='23505'; end if;
    return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao,'repeated',true);
  end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Atualize antes de registrar.' using errcode='40001'; end if;
  if d.status in ('rascunho','concluida','aguardando_confirmacao','cancelada','recusada') then raise exception 'Esta ordem não permite execução.'; end if;
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>20000 then raise exception 'Dados de execução inválidos.'; end if;
  v_result=btrim(coalesce(p_dados->>'resultado','')); v_note=nullif(btrim(p_dados->>'registro_execucao'),'');
  if length(v_result)>4000 or length(coalesce(v_note,''))>5000 then raise exception 'Texto muito longo.'; end if;
  v_services=array(select jsonb_array_elements_text(coalesce(p_dados->'service_types','[]')));
  if p_acao='concluir' then
    if d.status<>'em_andamento' or length(v_result)<10 then raise exception 'Inicie o serviço e descreva o resultado com pelo menos 10 caracteres.'; end if;
    if cardinality(v_services)=0 or cardinality(v_services)>5 or not(v_services <@ case p_especialidade when 'arborizacao' then array['poda','remocao','vistoria','tratamento','plantio'] when 'ruas' then array['reparo','pavimentacao','vistoria','sinalizacao','outro'] else array['manutencao','limpeza','vistoria','outro'] end) then raise exception 'Selecione serviços válidos para sua atividade.'; end if;
    if p_report is not null then
      select r0.* into r from public.reports r0 join public.demanda_broncas b on b.report_id=r0.id where b.demanda_id=d.id and r0.id=p_report for update of r0;
      if r.id is null or r.city_id<>v_city or r.category_id<>d.category_id or r.status='resolved' then raise exception 'Solicitação inválida ou já atendida.'; end if;
      if p_especialidade='arborizacao' then v_tree=r.tree_id; end if;
    elsif exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id) then raise exception 'Selecione uma solicitação vinculada para registrar a execução.';
    else v_tree=d.asset_tree_id; end if;
    if v_tree is not null and not exists(select 1 from public.city_trees t where t.id=v_tree and t.city_id=v_city) then raise exception 'Árvore fora do município.'; end if;
    if p_anexos is null or jsonb_typeof(p_anexos)<>'array' or jsonb_array_length(p_anexos)>5 then raise exception 'Use até cinco evidências.'; end if;
    if jsonb_array_length(p_anexos)=0 and length(coalesce(v_note,''))<20 then raise exception 'Anexe evidência ou registre uma nota técnica com pelo menos 20 caracteres.'; end if;
  elsif p_acao='impedimento' and length(v_result)<5 then raise exception 'Descreva o impedimento.';
  elsif p_acao='iniciar' and d.status not in ('aberta','triagem','programada','em_andamento') then raise exception 'Serviço indisponível para início.'; end if;
  insert into public.municipal_execution_results(id,demanda_id,report_id,executor_id,specialty,action,cycle_started_at,service_types,result,technical_note,tree_id,street_id)
    values(p_operacao,d.id,p_report,auth.uid(),p_especialidade,p_acao,d.ciclo_iniciado_em,v_services,v_result,v_note,v_tree,d.asset_street_id);
  if p_acao='concluir' then
    for file in select value from jsonb_array_elements(p_anexos) loop
      if file->>'mime_type' not in ('image/jpeg','image/png','image/webp','application/pdf') or coalesce((file->>'tamanho')::bigint,0) not between 1 and 10485760
        or position(p_prefeitura::text||'/'||auth.uid()::text||'/'||p_operacao::text||'/' in coalesce(file->>'storage_path',''))<>1
        or not exists(select 1 from storage.objects o where o.bucket_id='municipal-demand-files' and o.name=file->>'storage_path') then raise exception 'Evidência inválida ou fora desta execução.'; end if;
      insert into public.demanda_anexos(demanda_id,report_id,storage_path,nome,mime_type,tamanho,visibilidade,tipo,criado_por)
        values(d.id,p_report,file->>'storage_path',left(coalesce(file->>'nome','Evidência'),180),file->>'mime_type',(file->>'tamanho')::bigint,'interna','conclusao',auth.uid());
    end loop;
    if v_tree is not null then
      insert into public.city_tree_care(tree_id,service_type,performed_on,notes,recorded_by,execution_result_id)
        select v_tree,s,current_date,'Manejo registrado em execução municipal vinculada.',auth.uid(),p_operacao from unnest(v_services) s on conflict do nothing;
    end if;
    if p_report is not null then
      update public.reports set status='resolved' where id=p_report;
      update public.demanda_broncas set atendida_em=now(),atendida_por=auth.uid(),service_types=v_services,resultado=v_result where demanda_id=d.id and report_id=p_report;
      update public.orgao_casos set status='encerrada',updated_at=now() where report_id=p_report;
    end if;
    select count(*) into v_pending from public.demanda_broncas b join public.reports r0 on r0.id=b.report_id where b.demanda_id=d.id and r0.status is distinct from 'resolved';
    update public.demandas_municipais set status=case when v_pending>0 then 'em_andamento' else 'concluida' end,resultado=v_result,registro_execucao=v_note,executada_em=now(),updated_by=auth.uid() where id=d.id returning * into d;
  elsif p_acao='iniciar' then
    update public.demandas_municipais set status='em_andamento',updated_by=auth.uid() where id=d.id returning * into d;
  else
    update public.demandas_municipais set registro_execucao=v_result,updated_by=auth.uid() where id=d.id returning * into d;
  end if;
  insert into public.demanda_eventos(demanda_id,tipo,criado_por,detalhes) values(d.id,case p_acao when 'concluir' then 'solicitacao_atendida' when 'impedimento' then 'impedimento' else 'execucao_iniciada' end,
    auth.uid(),jsonb_build_object('mensagem',v_result,'atividade',p_especialidade,'operacao',p_operacao,'report_id',p_report,'resultado',v_result));
  return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
end $$;
revoke all on function public.registrar_execucao_executor(uuid,uuid,text,integer,uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.registrar_execucao_executor(uuid,uuid,text,integer,uuid,text,uuid,jsonb,jsonb) to authenticated;

create policy field_executor_files_insert on storage.objects for insert to authenticated with check(bucket_id='municipal-demand-files' and split_part(name,'/',2)=auth.uid()::text
  and exists(select 1 from public.demandas_municipais d where d.prefeitura_id::text=split_part(name,'/',1) and public.field_executor_order_access(auth.uid(),d.id)));

create function public.estatisticas_executor(p_prefeitura uuid,p_especialidade text,p_canal uuid default null) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with own as(select r.* from public.municipal_execution_results r join public.demandas_municipais d on d.id=r.demanda_id
    where r.executor_id=auth.uid() and r.specialty=p_especialidade and d.prefeitura_id=p_prefeitura and (p_canal is null or d.canal_id=p_canal)
      and public.field_executor_can_work(auth.uid(),d.canal_id,p_especialidade,d.category_id))
  select jsonb_build_object('completed',(select count(*) from own where action='concluir'),'impediments',(select count(*) from own where action='impedimento'),
    'assets',(select count(distinct coalesce(tree_id::text,street_id)) from own where action='concluir'),
    'services',coalesce((select jsonb_agg(jsonb_build_object('service',service,'total',total)) from(select service,count(*) total from own cross join lateral unnest(service_types) service where action='concluir' group by service) counts),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(row) from(select r.id,r.demanda_id,r.action,r.result,r.created_at,d.titulo from own r join public.demandas_municipais d on d.id=r.demanda_id order by r.created_at desc limit 20) row),'[]'::jsonb))
$$;
revoke all on function public.estatisticas_executor(uuid,text,uuid) from public,anon;
grant execute on function public.estatisticas_executor(uuid,text,uuid) to authenticated;

do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.auditar_demanda_municipal()'::regprocedure);
  definition=replace(definition,'''/prefeitura/demandas/''||new.id',
    'case when new.execution_specialty in (''arborizacao'',''ruas'',''servicos_gerais'') then ''/prefeitura/executor/''||new.execution_specialty||''/ordem/''||new.id else ''/prefeitura/demandas/''||new.id end');
  execute definition;

end $migration$;
notify pgrst,'reload schema';
commit;
