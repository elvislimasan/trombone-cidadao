begin;

-- Um vínculo representa o ciclo atual; os atendimentos anteriores são imutáveis.
create table public.demanda_atendimentos (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references public.demandas_municipais(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  atendida_em timestamptz not null,
  atendida_por uuid references public.profiles(id),
  pole_id bigint references public.poles(id),
  service_types text[] not null default '{}',
  resultado text,
  titulo text,
  bairro text,
  unique (demanda_id,report_id,atendida_em)
);
alter table public.demanda_atendimentos enable row level security;
create policy demanda_atendimentos_select on public.demanda_atendimentos for select to authenticated
  using (public.pode_ver_demanda(auth.uid(),demanda_id));
grant select on public.demanda_atendimentos to authenticated;
create index demanda_atendimentos_executor on public.demanda_atendimentos(atendida_por,atendida_em desc);

insert into public.demanda_atendimentos(demanda_id,report_id,atendida_em,atendida_por,pole_id,service_types,resultado,titulo,bairro)
select b.demanda_id,b.report_id,b.atendida_em,coalesce(b.atendida_por,d.atribuido_a),
  b.pole_id,b.service_types,b.resultado,r.title,r.neighborhood
from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
join public.reports r on r.id=b.report_id where b.atendida_em is not null;

alter table public.demandas_municipais add column executada_por uuid references public.profiles(id);
update public.demandas_municipais set executada_por=atribuido_a where status='concluida';
alter table public.demanda_anexos add column report_id uuid references public.reports(id) on delete set null;

create function public.guardar_atendimento_solicitacao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.atendida_em is not null then
    insert into public.demanda_atendimentos(demanda_id,report_id,atendida_em,atendida_por,pole_id,service_types,resultado,titulo,bairro)
    select new.demanda_id,new.report_id,new.atendida_em,new.atendida_por,new.pole_id,
      new.service_types,new.resultado,r.title,r.neighborhood from public.reports r where r.id=new.report_id
    on conflict (demanda_id,report_id,atendida_em) do nothing;
  end if;
  return new;
end $$;
create trigger guardar_atendimento_solicitacao after insert or update of atendida_em on public.demanda_broncas
for each row execute function public.guardar_atendimento_solicitacao();

create function public.registrar_executor_ordem()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='concluida' and (tg_op='INSERT' or old.status is distinct from 'concluida') then
    new.executada_por=coalesce(auth.uid(),new.atribuido_a);
  elsif tg_op='UPDATE' and old.status='concluida' and new.status<>'concluida' then
    new.executada_por=null;
  end if;
  return new;
end $$;
create trigger registrar_executor_ordem before insert or update of status on public.demandas_municipais
for each row execute function public.registrar_executor_ordem();

create function public.reabrir_vinculo_solicitacao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status='resolved' and new.status in ('pending','in-progress','pending_resolution') then
    update public.demanda_broncas set atendida_em=null,atendida_por=null,service_types='{}',resultado=null
    where report_id=new.id;
  end if;
  return new;
end $$;
create trigger reabrir_vinculo_solicitacao after update of status on public.reports
for each row execute function public.reabrir_vinculo_solicitacao();

create function public.reabrir_solicitacoes_ordem()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.category_id='iluminacao' and old.status in ('concluida','cancelada','recusada','aguardando_confirmacao')
    and new.status not in ('concluida','cancelada','recusada','aguardando_confirmacao') then
    -- Uma contestação reabre só os relatos pendentes. Uma nova vistoria explícita,
    -- sem relato pendente, reabre todos os relatos da ordem.
    if not exists(select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id
      where b.demanda_id=new.id and r.status is distinct from 'resolved') then
      update public.reports r set status='in-progress' where exists
        (select 1 from public.demanda_broncas b where b.demanda_id=new.id and b.report_id=r.id);
    end if;
    update public.demanda_broncas b set atendida_em=null,atendida_por=null,service_types='{}',resultado=null
    from public.reports r where b.demanda_id=new.id and r.id=b.report_id and r.status is distinct from 'resolved';
  end if;
  return new;
end $$;
create trigger reabrir_solicitacoes_ordem after update of status on public.demandas_municipais
for each row execute function public.reabrir_solicitacoes_ordem();

-- As funções existentes mantêm assinaturas e permissões. Cada alteração é verificada.
create function pg_temp.corrigir_fluxo(signature text, trecho text, substituto text)
returns void language plpgsql as $$
declare definition text;
begin
  definition=replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
  if position(trecho in definition)=0 then raise exception 'Definição inesperada: %',signature; end if;
  execute replace(definition,trecho,substituto);
end $$;

select pg_temp.corrigir_fluxo('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)',
  $old$  if d.report_id is null and cardinality(p_reports)>0 then$old$,
  $new$  if d.category_id='iluminacao' and exists(select 1 from public.reports r
    where r.id=any(p_reports) and r.category_id is distinct from 'iluminacao') then
    raise exception 'Ordens de iluminação só podem receber solicitações de iluminação'; end if;
  if d.report_id is null and cardinality(p_reports)>0 then$new$);

select pg_temp.corrigir_fluxo('public.listar_ofertas_eletricista(uuid,integer,integer,text,uuid,double precision,double precision)',
  $old$d.status in ('aberta', 'triagem', 'programada')$old$,
  $new$d.status in ('aberta', 'triagem', 'programada', 'em_andamento')$new$);
select pg_temp.corrigir_fluxo('public.aceitar_oferta_eletricista(uuid,text,uuid)',
  $old$v_demanda.status not in ('aberta', 'triagem', 'programada')$old$,
  $new$v_demanda.status not in ('aberta', 'triagem', 'programada', 'em_andamento')$new$);
select pg_temp.corrigir_fluxo('public.aviso_ordem_disponivel_eletricista()',
  $old$new.status not in ('aberta', 'triagem', 'programada')$old$,
  $new$new.status not in ('aberta', 'triagem', 'programada', 'em_andamento')$new$);
select pg_temp.corrigir_fluxo('public.aviso_ordem_disponivel_eletricista()',
  $old$old.status in ('aberta', 'triagem', 'programada')$old$,
  $new$old.status in ('aberta', 'triagem', 'programada', 'em_andamento')$new$);

select pg_temp.corrigir_fluxo('public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)',
  $old$  if r.id is null or r.status='resolved' then$old$,
  $new$  if r.category_id is distinct from 'iluminacao' or r.moderation_status='rejected'
    or r.status not in ('pending','in-progress','pending_approval','pending_resolution') then
    raise exception 'Solicitação de iluminação indisponível para atendimento'; end if;
  if r.id is null or r.status='resolved' then$new$);
select pg_temp.corrigir_fluxo('public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)',
  $old$demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,criado_por)$old$,
  $new$demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,tipo,report_id,criado_por)$new$);
select pg_temp.corrigir_fluxo('public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)',
  $old$(v_file->>'tamanho')::bigint,'interna',auth.uid());$old$,
  $new$(v_file->>'tamanho')::bigint,'interna','conclusao',r.id,auth.uid());$new$);

-- Mesmo pelo mapa, resolver uma solicitação exige informar o serviço executado.
select pg_temp.corrigir_fluxo('public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid)',
  $old$if p_servicos is null or cardinality(p_servicos)>4$old$,
  $new$if p_servicos is null or cardinality(p_servicos) not between 1 and 4$new$);

create or replace function public.atendimento_publico_bronca(p_report uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('protocolo',d.protocolo,
    'status',case when d.category_id='iluminacao' and b.atendida_em is not null and r.status='resolved' then 'concluida' else d.status end,
    'orgao',coalesce(c.nome,p.nome),'previsto_em',d.previsto_em,
    'executada_em',case when d.category_id='iluminacao' then b.atendida_em else d.executada_em end,
    'resultado',case when d.category_id='iluminacao' then b.resultado else d.resultado end,
    'resolvida_pela_equipe',d.category_id='iluminacao' and b.atendida_em is not null and r.status='resolved',
    'revisao_pendente',d.revisao_pendente,'updated_at',d.updated_at,
    'anexos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'mime_type',a.mime_type,
      'storage_path',a.storage_path,'tipo',a.tipo,'visibilidade',a.visibilidade,'created_at',a.created_at) order by a.created_at desc)
      from public.demanda_anexos a where a.demanda_id=d.id and a.tipo='conclusao' and a.visibilidade='publica'
        and ((d.category_id='iluminacao' and b.atendida_em is not null and r.status='resolved')
          or (d.category_id is distinct from 'iluminacao' and d.status in ('aguardando_confirmacao','concluida')))
        and (a.report_id=b.report_id or (a.report_id is null and (d.category_id is distinct from 'iluminacao'
          or (select count(*) from public.demanda_broncas q where q.demanda_id=d.id)=1)))
        and a.created_at>=d.ciclo_iniciado_em),'[]'::jsonb))
  from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id join public.prefeituras p on p.id=d.prefeitura_id
  left join public.orgao_canais c on c.id=d.canal_id
  where b.report_id=p_report and coalesce(r.moderation_status,'approved')='approved'
    and r.is_public and not coalesce(r.is_petition,false)
$$;

create or replace function public.atendimentos_eletricista_iluminacao(p_prefeitura uuid)
returns table(id uuid,order_id uuid,protocolo text,titulo text,bairro text,status text,
  pole_id bigint,service_type text,service_types text[],concluida_em timestamptz,executada_em timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and p.status='ativa'
    and public.pode_acessar_prefeitura(auth.uid(),p.city_id)) then raise exception 'Sem acesso a esta prefeitura'; end if;
  return query
  select a.id,d.id,d.protocolo,a.titulo,a.bairro,'concluida'::text,a.pole_id,
    a.service_types[1],a.service_types,a.atendida_em,a.atendida_em
  from public.demanda_atendimentos a join public.demandas_municipais d on d.id=a.demanda_id
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao' and a.atendida_por=auth.uid()
  union all
  select d.id,d.id,d.protocolo,d.titulo,d.bairro,d.status,d.pole_id,d.service_type,
    d.service_types,d.concluida_em,d.executada_em from public.demandas_municipais d
  where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao' and d.executada_por=auth.uid()
    and d.status='concluida' and not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)
  order by 1;
end $$;

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
    where m.user_id=auth.uid() and m.ativo and m.papel in ('eletricista','gestor','operador') and c.city_id=v_city
  ) then raise exception 'Sem acesso às estatísticas de iluminação'; end if;
  return query
  with trabalho as (
    select a.atendida_por as executor,cardinality(a.service_types) as quantidade
    from public.demanda_atendimentos a join public.demandas_municipais d on d.id=a.demanda_id
    where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao' and a.atendida_por is not null
    union all
    select d.executada_por,greatest(cardinality(d.service_types),case when d.service_type is null then 0 else 1 end)
    from public.demandas_municipais d where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
      and d.status='concluida' and d.executada_por is not null
      and not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)
  ) select t.executor,coalesce(nullif(p.name,''),'Eletricista'),sum(t.quantidade)::bigint
  from trabalho t left join public.profiles p on p.id=t.executor where t.quantidade>0
  group by t.executor,p.name order by 3 desc,2 limit 50;
end $$;

create function public.concluir_ordem_eletricista(p_prefeitura uuid,p_ordem uuid,p_versao integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem for update;
  if d.id is null or d.prefeitura_id<>p_prefeitura or d.category_id is distinct from 'iluminacao'
    or d.atribuido_a is distinct from auth.uid() or not public.pode_operar_demanda(auth.uid(),d.id)
    or not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and p.status='ativa') then
    raise exception 'Ordem não atribuída a você'; end if;
  if d.status='concluida' then return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao); end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Recarregue antes de concluir.' using errcode='40001'; end if;
  if d.status<>'em_andamento' or not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)
    or exists(select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id
      where b.demanda_id=d.id and r.status is distinct from 'resolved') then
    raise exception 'Atenda todas as solicitações vinculadas antes de concluir a ordem'; end if;
  update public.demandas_municipais set status='concluida',executada_em=coalesce(executada_em,now()),updated_by=auth.uid()
    where id=d.id returning * into d;
  return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
end $$;
revoke all on function public.concluir_ordem_eletricista(uuid,uuid,integer) from public,anon;
grant execute on function public.concluir_ordem_eletricista(uuid,uuid,integer) to authenticated;

create function public.registrar_resolucao_solicitacao_municipal(
  p_prefeitura uuid,p_ordem uuid,p_report uuid,p_versao integer,p_resultado text default null,p_servicos text[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; r public.reports%rowtype; v_last boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem for update;
  if d.id is null or d.prefeitura_id<>p_prefeitura or d.category_id is distinct from 'iluminacao'
    or not public.pode_operar_demanda(auth.uid(),d.id)
    or not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and p.status='ativa'
      and (public.pode_administrar_prefeitura(auth.uid(),p.city_id) or public.papel_no_orgao(auth.uid(),d.canal_id) in ('gestor','operador'))) then
    raise exception 'Sem permissão para registrar a resolução'; end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Recarregue antes de registrar.' using errcode='40001'; end if;
  if d.status in ('concluida','cancelada','recusada') then raise exception 'Reabra a ordem antes de registrar a resolução'; end if;
  if d.canal_id is null then raise exception 'Defina a secretaria responsável antes de registrar a resolução'; end if;
  select q.* into r from public.reports q join public.demanda_broncas b on b.report_id=q.id
    where q.id=p_report and b.demanda_id=d.id for update of q;
  if r.id is null or r.category_id is distinct from 'iluminacao' or r.moderation_status='rejected'
    or r.status not in ('pending','in-progress','pending_approval','pending_resolution') then
    raise exception 'Solicitação de iluminação indisponível para atendimento'; end if;
  if length(coalesce(p_resultado,''))>4000 or p_servicos is null or not
    (p_servicos<@array['lamp_replacement','arm_installation','relay_replacement','other']::text[])
    or cardinality(p_servicos)>4 or array_position(p_servicos,null) is not null
    or cardinality(p_servicos)<>(select count(distinct value) from unnest(p_servicos) value) then
    raise exception 'Confira o resultado e os serviços executados'; end if;
  update public.demanda_broncas set atendida_em=clock_timestamp(),atendida_por=auth.uid(),pole_id=r.pole_id,
    service_types=p_servicos,resultado=nullif(btrim(p_resultado),'') where demanda_id=d.id and report_id=r.id;
  update public.reports set status='resolved' where id=r.id;
  update public.orgao_casos set status='encerrada',updated_at=now() where report_id=r.id;
  insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
  values(d.id,'solicitacao_atendida',jsonb_build_object('report_id',r.id,'titulo',r.title,
    'resultado',nullif(btrim(p_resultado),''),'servicos',p_servicos,'origem','gestao'),auth.uid());
  select not exists(select 1 from public.demanda_broncas b join public.reports q on q.id=b.report_id
    where b.demanda_id=d.id and q.status is distinct from 'resolved') into v_last;
  update public.demandas_municipais set status=case when v_last then 'concluida'
      when status in ('aberta','triagem','programada') then 'em_andamento' else status end,
    executada_em=case when v_last then now() else executada_em end,updated_by=auth.uid()
    where id=d.id returning * into d;
  return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
end $$;
revoke all on function public.registrar_resolucao_solicitacao_municipal(uuid,uuid,uuid,integer,text,text[]) from public,anon;
grant execute on function public.registrar_resolucao_solicitacao_municipal(uuid,uuid,uuid,integer,text,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
