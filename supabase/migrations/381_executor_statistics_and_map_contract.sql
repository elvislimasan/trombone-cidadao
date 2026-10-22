-- Contrato das estatísticas e locais dos painéis de execução.
begin;
create or replace function public.executor_work_items(p_prefeitura uuid,p_especialidade text,p_canal uuid default null)
returns table(tipo text,id uuid,titulo text,descricao text,endereco text,bairro text,latitude double precision,longitude double precision,
  category_id text,canal_id uuid,status text,prioridade text,protocolo text,prazo_em timestamptz,atribuido_a uuid,versao integer,updated_at timestamptz,tree_id uuid,street_id text)
language sql stable security definer set search_path=public,pg_temp as $$
  select 'ordem',d.id,d.titulo,d.descricao,coalesce(d.endereco,linked.address),coalesce(d.bairro,linked.neighborhood),coalesce(d.latitude,linked.latitude),coalesce(d.longitude,linked.longitude),d.category_id,d.canal_id,d.status,d.prioridade,d.protocolo,d.prazo_em,d.atribuido_a,d.versao,d.updated_at,d.asset_tree_id,d.asset_street_id
    from public.demandas_municipais d left join lateral (
      select r.address,r.neighborhood,case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end latitude,
        case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end longitude
      from public.demanda_broncas b join public.reports r on r.id=b.report_id where b.demanda_id=d.id
      order by (r.status='resolved'),(r.location is null),b.report_id limit 1
    ) linked on true where d.prefeitura_id=p_prefeitura and d.execution_specialty=p_especialidade and p_especialidade<>'eletricista'
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
create or replace function public.detalhar_ordem_executor(p_prefeitura uuid,p_ordem uuid,p_especialidade text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype;
begin
  select * into d from public.demandas_municipais where id=p_ordem and prefeitura_id=p_prefeitura;
  if d.id is null or not public.field_executor_order_access(auth.uid(),d.id,p_especialidade) then raise exception 'Ordem fora da sua atividade ou atribuição.' using errcode='42501'; end if;
  return jsonb_build_object('order',to_jsonb(d),'reports',coalesce((select jsonb_agg(jsonb_build_object('report_id',r.id,'title',r.title,'description',r.description,'address',r.address,'neighborhood',r.neighborhood,'featured_image_url',to_jsonb(r)->>'featured_image_url','latitude',case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end,'longitude',case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end,'status',r.status,'tree_id',r.tree_id,'tree_service',r.tree_service,'atendida_em',b.atendida_em,'resultado',b.resultado))
    from public.demanda_broncas b join public.reports r on r.id=b.report_id where b.demanda_id=d.id),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.demanda_anexos a where a.demanda_id=d.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.demanda_eventos e where e.demanda_id=d.id),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.municipal_execution_results e where e.demanda_id=d.id),'[]'::jsonb));
end $$;
create or replace function public.listar_painel_executor(p_prefeitura uuid,p_especialidade text,p_canal uuid default null,p_aba text default 'minhas',p_etapa text default 'fazer',p_busca text default '',p_ordem text default 'priority',p_adiadas text[] default '{}',p_pagina integer default 1,p_tamanho integer default 20) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with eligible as (select w.*,case when w.status in ('concluida','cancelada','recusada') then 'historico' when w.status='aguardando_confirmacao' then 'conferencia' when w.status='em_andamento' then 'execucao' else 'fazer' end stage
    from public.executor_work_items(p_prefeitura,p_especialidade,p_canal) w
    where ((p_aba='minhas' and w.atribuido_a=auth.uid()) or (p_aba='disponiveis' and w.atribuido_a is null))
      and (nullif(btrim(p_busca),'') is null or position(lower(btrim(left(p_busca,160))) in lower(concat_ws(' ',w.titulo,w.descricao,w.protocolo,w.endereco,w.bairro)))>0)
      and not((w.tipo||':'||w.id::text)=any(coalesce(p_adiadas,'{}')))),
  filtered as (select * from eligible where p_aba='disponiveis' or p_etapa='todas' or stage=p_etapa),
  page as (select * from filtered order by
    case when p_ordem='priority' then case prioridade when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end end,
    case when p_ordem='deadline' then prazo_em end nulls last,case when p_ordem='oldest' then updated_at end asc,case when p_ordem<>'oldest' then updated_at end desc,id
    limit least(greatest(coalesce(p_tamanho,20),1),100) offset (greatest(coalesce(p_pagina,1),1)-1)*least(greatest(coalesce(p_tamanho,20),1),100))
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from filtered),
    'page',greatest(coalesce(p_pagina,1),1),'stage_counts',jsonb_build_object('fazer',(select count(*) from eligible where stage='fazer'),
      'execucao',(select count(*) from eligible where stage='execucao'),'conferencia',(select count(*) from eligible where stage='conferencia'),'historico',(select count(*) from eligible where stage='historico')))
$$;

create or replace function public.estatisticas_executor(p_prefeitura uuid,p_especialidade text,p_canal uuid default null) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with own as(select r.*,d.titulo,coalesce(nullif(btrim(q.neighborhood),''),nullif(btrim(d.bairro),'')) bairro,
      coalesce(r.tree_id::text,r.street_id,nullif(btrim(q.address),''),nullif(btrim(d.endereco),''),case when d.latitude is not null and d.longitude is not null then d.latitude::text||','||d.longitude::text end) asset
    from public.municipal_execution_results r join public.demandas_municipais d on d.id=r.demanda_id left join public.reports q on q.id=r.report_id
    where r.executor_id=auth.uid() and r.specialty=p_especialidade and d.prefeitura_id=p_prefeitura and (p_canal is null or d.canal_id=p_canal)
      and public.field_executor_can_work(auth.uid(),d.canal_id,p_especialidade,d.category_id)),
  completed as(select * from own where action='concluir'),
  neighborhoods as(select bairro name,count(*)::integer count from completed where bairro is not null group by bairro)
  select jsonb_build_object('completed',(select count(*) from completed),'impediments',(select count(*) from own where action='impedimento'),
    'assets',(select count(distinct asset) from completed),'this_month',(select count(*) from completed where date_trunc('month',created_at)=date_trunc('month',now())),
    'neighborhoods',(select count(*) from neighborhoods),
    'services',coalesce((select jsonb_agg(jsonb_build_object('service',service,'total',total)) from(select service,count(distinct c.id) total from completed c cross join lateral unnest(service_types) service group by service) counts),'[]'::jsonb),
    'top_neighborhoods',coalesce((select jsonb_agg(to_jsonb(row)) from(select * from neighborhoods order by count desc,name limit 5) row),'[]'::jsonb),
    'ranking',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'nome',p.name,'servicos',(select count(*) from completed))) from public.profiles p where p.id=auth.uid() and exists(select 1 from completed)),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(to_jsonb(row)) from(select id,demanda_id,demanda_id order_id,titulo,bairro,result,created_at concluida_em from completed order by created_at desc,id limit 20) row),'[]'::jsonb))
$$;
revoke all on function public.estatisticas_executor(uuid,text,uuid) from public,anon;
grant execute on function public.estatisticas_executor(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
