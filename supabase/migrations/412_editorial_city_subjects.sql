begin;

-- Extensão aditiva do piloto 411. Preserva pautas, hashes e versões de obras.
alter table public.editorial_candidates add column module text not null default 'works'
  check(module in ('works','reports','streets','arborization'));
create index editorial_candidates_module_queue on public.editorial_candidates(city_id,module,status,created_at desc);
alter table public.editorial_settings add column last_analysis_modules jsonb not null default '{}';

create function public.editorial_source_href(p_type text,p_id uuid) returns text
language sql immutable set search_path=public,pg_temp as $$
  select case p_type when 'work' then '/obras-publicas/' when 'report' then '/bronca/'
    when 'street' then '/mapa-pavimentacao/rua/' when 'tree' then '/arborizacao/arvore/'
    when 'community_tree' then '/arvores-da-comunidade/' else null end || p_id::text;
$$;
revoke all on function public.editorial_source_href(text,uuid) from public,anon,authenticated;

-- Lista permitida de campos públicos. Não carregar texto livre de bronca,
-- autor, contato, endereço particular, notas técnicas ou coordenadas.
create function public.editorial_subject_rows(p_city_id bigint,p_module text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows jsonb;
begin
  if p_module='reports' then
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'source_type','report',
      'title','Bronca '||coalesce(nullif(r.protocol::text,''),r.id::text),'status',r.status,
      'category_id',r.category_id,'neighborhood',nullif(trim(r.neighborhood),''),
      'registered_on',(r.created_at at time zone 'America/Fortaleza')::date) order by r.id),'[]') into rows
    from public.reports r where r.city_id=p_city_id and r.is_public=true and r.moderation_status='approved'
      and r.status in ('pending','in-progress','pending_resolution','resolved')
      and (r.signal_status is null or r.signal_status='done');
  elsif p_module='streets' then
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'source_type','street','title',coalesce(nullif(left(s.name,200),''),'Rua sem nome informado'),
      'status',s.status,'pavement_type',s.pavement_type,'bairro_id',s.bairro_id,'neighborhood',b.name) order by s.id),'[]') into rows
    from public.pavement_streets s left join public.bairros b on b.id=s.bairro_id and b.city_id=s.city_id
    where s.city_id=p_city_id;
  elsif p_module='arborization' then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'source_type','tree',
      'title',concat_ws(' · ',t.public_code,t.common_name),'status',t.status,'species',t.common_name,
      'planted_at',t.planted_at,'planting_year',t.planting_year,'bairro_id',t.bairro_id,
      'neighborhood',coalesce(b.name,nullif(trim(t.neighborhood),''))) order by t.id),'[]') into rows
    from public.city_trees t left join public.bairros b on b.id=t.bairro_id and b.city_id=t.city_id
    where t.city_id=p_city_id and t.status in ('saudavel','atencao','risco','planejada');
  elsif p_module='community' then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'source_type','community_tree',
      'title','Árvore da comunidade','status',t.status,'planted_at',t.planted_on) order by t.id),'[]') into rows
    from public.community_trees t where t.city_id=p_city_id and t.status='approved' and t.public_profile=true;
  else raise exception 'Assunto editorial inválido.';
  end if;
  return rows;
end $$;
revoke all on function public.editorial_subject_rows(bigint,text) from public,anon,authenticated;

create function public.editorial_subject_snapshot(p_city_id bigint,p_topic text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare module_name text:=split_part(p_topic,'.',1); city_name text; universe jsonb; selected_rows jsonb;
  subject text; total_label text; domain_limit text; fact3 text; fact4 text; fact5 text; fact6 text; fact7 text;
  total_count integer; selected_count integer; share numeric; priority integer; module_label text;
begin
  select name into city_name from public.cities where id=p_city_id;
  if city_name is null then raise exception 'Cidade não encontrada.'; end if;
  if p_topic not in ('reports.registered','reports.active','reports.resolved','streets.unpaved','streets.partial','streets.paved',
    'arborization.attention','arborization.planned','arborization.planted','arborization.community') then raise exception 'Levantamento editorial inválido.'; end if;
  universe:=public.editorial_subject_rows(p_city_id,case when p_topic='arborization.community' then 'community' else module_name end);
  if p_topic in ('arborization.attention','arborization.planted') then
    select coalesce(jsonb_agg(value order by value->>'id'),'[]') into universe from jsonb_array_elements(universe) where value->>'status'<>'planejada';
  end if;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]') into selected_rows from jsonb_array_elements(universe)
    where case p_topic
      when 'reports.registered' then true
      when 'reports.active' then value->>'status' in ('pending','in-progress','pending_resolution')
      when 'reports.resolved' then value->>'status'='resolved'
      when 'streets.unpaved' then value->>'status'='unpaved'
      when 'streets.partial' then value->>'status'='partially_paved'
      when 'streets.paved' then value->>'status'='paved'
      when 'arborization.attention' then value->>'status' in ('atencao','risco')
      when 'arborization.planned' then value->>'status'='planejada'
      when 'arborization.planted' then value->>'planted_at' is not null and (value->>'planted_at')::date<=(now() at time zone 'America/Fortaleza')::date
      when 'arborization.community' then true else false end;
  total_count:=jsonb_array_length(universe); selected_count:=jsonb_array_length(selected_rows);
  share:=round(selected_count*100.0/nullif(total_count,0),1);
  subject:=case p_topic
    when 'reports.registered' then 'broncas públicas registradas' when 'reports.active' then 'broncas públicas ainda em acompanhamento'
    when 'reports.resolved' then 'broncas públicas registradas como resolvidas'
    when 'streets.unpaved' then 'ruas cadastradas sem pavimentação' when 'streets.partial' then 'ruas cadastradas parcialmente pavimentadas'
    when 'streets.paved' then 'ruas cadastradas como pavimentadas'
    when 'arborization.attention' then 'árvores sinalizadas para atenção ou avaliação técnica'
    when 'arborization.planned' then 'locais de plantio planejados no inventário'
    when 'arborization.planted' then 'árvores existentes com data de plantio registrada'
    else 'perfis públicos aprovados de árvores da comunidade' end;
  module_label:=case module_name when 'reports' then 'Broncas' when 'streets' then 'Ruas' else 'Arborização' end;
  priority:=case p_topic when 'reports.active' then 75 when 'reports.registered' then 65 when 'reports.resolved' then 60
    when 'streets.unpaved' then 75 when 'streets.partial' then 65 when 'streets.paved' then 60
    when 'arborization.attention' then 80 when 'arborization.planned' then 60 when 'arborization.planted' then 65 else 55 end;
  total_label:=case module_name when 'reports' then 'broncas públicas aprovadas, sem duplicatas e sem sinais incompletos'
    when 'streets' then 'ruas cadastradas na plataforma'
    else case when p_topic='arborization.planned' then 'registros do inventário, incluindo árvores existentes e locais planejados'
      when p_topic='arborization.community' then 'perfis públicos aprovados da comunidade' else 'árvores existentes no inventário ativo, sem locais planejados ou registros removidos' end end;
  domain_limit:=case module_name when 'reports' then 'Os números descrevem registros, não ocorrências únicas, qualidade geral do serviço ou população atingida. Relatos não comprovam causa ou culpa.'
    when 'streets' then 'Cada rua cadastrada conta uma vez. Percentual de cadastros não equivale a percentual de extensão viária, área pavimentada ou cobertura de toda a cidade.'
    else 'Inventário ampliado não comprova aumento da cobertura vegetal. Local planejado não é árvore plantada; data de plantio cadastrada não comprova sobrevivência ou execução pela prefeitura.' end;
  select string_agg(label||': '||quantity::text,'; ' order by quantity desc,label) into fact3 from (
    select case value->>'status' when 'pending' then 'Pendentes' when 'in-progress' then 'Em andamento'
      when 'pending_resolution' then 'Aguardando confirmação da resolução' when 'resolved' then 'Resolvidas'
      when 'unpaved' then 'Sem pavimentação' when 'partially_paved' then 'Parcialmente pavimentadas' when 'paved' then 'Pavimentadas'
      when 'saudavel' then 'Saudáveis no cadastro' when 'atencao' then 'Precisam de atenção' when 'risco' then 'Avaliação técnica necessária'
      when 'planejada' then 'Locais planejados' when 'approved' then 'Perfis públicos aprovados' else 'Situação não informada' end as label,
      count(*) as quantity from jsonb_array_elements(selected_rows) group by label
  ) statuses;
  fact3:='Situações registradas no conjunto: '||coalesce(fact3,'sem registros')||'.';
  select count(*)::text||' registros do conjunto sem bairro informado.' into fact4 from jsonb_array_elements(selected_rows) where nullif(value->>'neighborhood','') is null;
  if module_name='streets' then fact4:=replace(fact4,'sem bairro informado','sem bairro principal informado'); end if;
  if p_topic='arborization.community' then fact4:='Endereços, coordenadas, nomes de responsáveis e nomes livres dos perfis não são utilizados neste levantamento.'; end if;
  if module_name='reports' then
    select 'Distribuição por categoria: '||coalesce(string_agg(label||': '||quantity::text,'; ' order by quantity desc,label),'sem registros')||'.' into fact5 from (
      select case value->>'category_id' when 'iluminacao' then 'Iluminação' when 'buracos' then 'Buracos' when 'esgoto' then 'Esgoto'
        when 'limpeza' then 'Limpeza' when 'poda' then 'Arborização' when 'vazamento' then 'Vazamento de água' when 'outros' then 'Outros'
        else 'Categoria não identificada' end as label,count(*) as quantity from jsonb_array_elements(selected_rows) group by label
    ) categories;
  elsif module_name='streets' then
    select 'Tipos de pavimento informados nas ruas pavimentadas ou parciais do conjunto: '||coalesce(string_agg(label||': '||quantity::text,'; ' order by quantity desc,label),'não se aplica')||'.' into fact5 from (
      select case value->>'pavement_type' when 'asphalt' then 'Asfalto' when 'granite' then 'Paralelepípedo' when 'paving_stone' then 'Paralelepípedo'
        when 'concrete' then 'Concreto' when 'interlocking' then 'Intertravado' else 'Não informado' end as label,count(*) as quantity
      from jsonb_array_elements(selected_rows) where value->>'status' in ('paved','partially_paved') group by label
    ) pavement;
  elsif p_topic='arborization.community' then
    select count(*)::text||' perfis públicos do conjunto possuem data de plantio informada pelo cadastro. Não somar estes perfis ao inventário municipal sem confirmar duplicidades.'
      into fact5 from jsonb_array_elements(selected_rows) where value->>'planted_at' is not null;
  elsif p_topic='arborization.planned' then
    select 'Distribuição dos locais planejados por ano previsto: '||coalesce(string_agg(label||': '||quantity::text,'; ' order by label),'sem registros')||'. Previsão não comprova execução.' into fact5 from (
      select coalesce(value->>'planting_year','Não informado') as label,count(*) as quantity from jsonb_array_elements(selected_rows) group by label
    ) years;
  else
    select 'Espécies mais frequentes no conjunto: '||coalesce(string_agg(label||': '||quantity::text,'; ' order by quantity desc,label),'sem registros')||'. Identificações não confirmadas devem permanecer como não identificadas.' into fact5 from (
      select coalesce(nullif(value->>'species',''),'Não identificada') as label,count(*) as quantity from jsonb_array_elements(selected_rows) group by label order by quantity desc,label limit 8
    ) species;
  end if;
  select case when module_name='streets' then 'Bairros principais cadastrados, por frequência: ' else 'Principais bairros do conjunto: ' end
    ||coalesce(string_agg(label||': '||quantity::text,'; ' order by quantity desc,label),'sem registros')||'. Não inferir bairros ausentes.' into fact6 from (
    select coalesce(nullif(value->>'neighborhood',''),'Não informado') as label,count(*) as quantity
    from jsonb_array_elements(selected_rows) group by label order by quantity desc,label limit 8
  ) neighborhoods;
  if p_topic='arborization.community' then fact6:='A localização residencial dos perfis não é incluída na análise nem enviada ao provedor.'; end if;
  if module_name='reports' then fact7:='As fontes identificam somente broncas públicas aprovadas. Títulos e descrições livres foram omitidos para reduzir exposição de dados pessoais.';
  elsif p_topic='arborization.community' then fact7:='Somente perfis aprovados e públicos são considerados. Perfis pendentes, rejeitados ou privados não entram sequer nas contagens.';
  else
    select 'Exemplos do conjunto: '||coalesce(string_agg(value->>'title','; ' order by value->>'id'),'sem registros')||'. Consultar os cadastros e confirmar sua atualidade.'
      into fact7 from (select value from jsonb_array_elements(selected_rows) order by value->>'id' limit 5) examples;
  end if;
  return jsonb_build_object('policy_version','subjects-v1','module',module_name,'module_label',module_label,
    'city_id',p_city_id,'city_name',city_name,'topic_key',p_topic,'title',format('%s: %s %s',city_name,selected_count,subject),
    'priority',priority,'captured_at',now(),'as_of',(now() at time zone 'America/Fortaleza')::date,
    'total',total_count,'selected',selected_count,'share',share,'sources',selected_rows,
    'facts',jsonb_build_array(
      jsonb_build_object('id','F1','text',format('Universo do levantamento em %s: %s %s.',city_name,total_count,total_label)),
      jsonb_build_object('id','F2','text',format('%s %s. Participação de %s%% no universo cadastrado definido neste levantamento.',selected_count,subject,replace(coalesce(share,0)::text,'.',','))),
      jsonb_build_object('id','F3','text',fact3),jsonb_build_object('id','F4','text',fact4),jsonb_build_object('id','F5','text',fact5),
      jsonb_build_object('id','F6','text',fact6),jsonb_build_object('id','F7','text',fact7)),
    'limitations',jsonb_build_array('O levantamento descreve os dados públicos cadastrados na plataforma; não é um censo de toda a cidade.',domain_limit,
      'Não inventar causas, entrevistas, serviços afetados, datas de resolução, população atingida ou comparação histórica sem evidência.',
      'Situação cadastrada não substitui vistoria atual nem avaliação técnica. Conferir os registros antes de publicar.'));
end $$;
revoke all on function public.editorial_subject_snapshot(bigint,text) from public,anon,authenticated;

create function public.editorial_snapshot(p_city_id bigint,p_topic text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select case when split_part(p_topic,'.',1)='works' then public.editorial_works_snapshot(p_city_id,p_topic)
    else public.editorial_subject_snapshot(p_city_id,p_topic) end;
$$;
revoke all on function public.editorial_snapshot(bigint,text) from public,anon,authenticated;

create or replace function public.editorial_snapshot_hash(p_snapshot jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
  -- Preserva o hash legado de obras. Nos demais assuntos, bairro é informação
  -- factual: sua correção invalida o conteúdo, mesmo mantendo a contagem.
  select md5(jsonb_build_object('policy',p_snapshot->'policy_version','topic',p_snapshot->'topic_key',
    'total',p_snapshot->'total','selected',p_snapshot->'selected','sources',coalesce((
      select jsonb_agg(case when p_snapshot->>'policy_version'='works-v1' then value-'title'-'neighborhood' else value-'title' end
        order by value->>'id') from jsonb_array_elements(p_snapshot->'sources')
    ),'[]'::jsonb))::text);
$$;

create function public.editorial_analyze_topics(p_city_id bigint,p_actor uuid,p_module text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare topic text; module_name text; snap jsonb; fingerprint text; existing uuid; latest public.editorial_candidates;
  created integer:=0; reused integer:=0; suppressed integer:=0; candidate_title text; ids jsonb:='[]'; material boolean;
begin
  if p_module is null or p_module not in ('all','works','reports','streets','arborization') then raise exception 'Assunto editorial inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('editorial-works'),hashtext(p_city_id::text));
  insert into public.editorial_settings(city_id) values(p_city_id) on conflict do nothing;
  foreach topic in array array['works.stalled','works.unfinished','works.overdue','works.completed',
    'reports.registered','reports.active','reports.resolved','streets.unpaved','streets.partial','streets.paved',
    'arborization.attention','arborization.planned','arborization.planted','arborization.community'] loop
    module_name:=split_part(topic,'.',1);
    if p_module<>'all' and module_name<>p_module then continue; end if;
    snap:=public.editorial_snapshot(p_city_id,topic);
    fingerprint:=public.editorial_snapshot_hash(snap);
    select id into existing from public.editorial_candidates where city_id=p_city_id and topic_key=topic and facts_hash=fingerprint;
    if existing is not null then
      update public.editorial_candidates set status='superseded',updated_at=now()
        where city_id=p_city_id and topic_key=topic and id<>existing and status in ('proposed','writing','approved');
      reused:=reused+1; continue;
    end if;
    select * into latest from public.editorial_candidates where city_id=p_city_id and topic_key=topic order by created_at desc,id desc limit 1;
    material:=latest.id is null or abs((snap->>'selected')::int-(latest.baseline_snapshot->>'selected')::int)>=2
      or abs((snap->>'selected')::int-(latest.baseline_snapshot->>'selected')::int)>=greatest(1,ceil((latest.baseline_snapshot->>'selected')::numeric*0.1))
      or abs(coalesce((snap->>'share')::numeric,0)-coalesce((latest.baseline_snapshot->>'share')::numeric,0))>=5
      or abs(coalesce((snap->>'contract_total')::numeric,0)-coalesce((latest.baseline_snapshot->>'contract_total')::numeric,0))
        >=greatest(1,abs(coalesce((latest.baseline_snapshot->>'contract_total')::numeric,0))*0.05)
      or (select count(*)>=2 from (
        (select value->>'id' as id from jsonb_array_elements(snap->'sources') except select value->>'id' from jsonb_array_elements(latest.baseline_snapshot->'sources'))
        union all
        (select value->>'id' from jsonb_array_elements(latest.baseline_snapshot->'sources') except select value->>'id' from jsonb_array_elements(snap->'sources'))
      ) membership_changes);
    candidate_title:=coalesce(snap->>'title',format('%s: %s obras %s',snap->>'city_name',snap->>'selected',
      case topic when 'works.stalled' then 'registradas como paralisadas' when 'works.unfinished' then 'registradas como inacabadas'
        when 'works.completed' then 'registradas como concluídas' else 'com previsão de término vencida' end));
    if ((snap->>'selected')::int=0 and latest.id is null) or not material then
      if latest.id is not null and latest.status in ('proposed','writing','approved') then
        update public.editorial_candidates set snapshot=snap,facts_hash=fingerprint,title=candidate_title,updated_at=now(),
          status=case when status='approved' then 'writing' else status end where id=latest.id;
      end if;
      suppressed:=suppressed+1; continue;
    end if;
    insert into public.editorial_candidates(city_id,module,topic_key,title,reason,priority,facts_hash,snapshot,baseline_snapshot)
      values(p_city_id,module_name,topic,candidate_title,
        case when latest.id is null then 'Primeiro levantamento deste assunto. Confirmar cobertura anterior e situação atual antes de publicar.'
          else format('Mudança desde a última proposta: %s → %s registros. A composição, a participação no total ou os valores também podem ter mudado. Conferir as fontes e o contexto.',latest.baseline_snapshot->>'selected',snap->>'selected') end,
        coalesce((snap->>'priority')::int,case topic when 'works.stalled' then 80 when 'works.overdue' then 75 when 'works.unfinished' then 70 else 60 end),
        fingerprint,snap,snap) returning id into existing;
    update public.editorial_candidates set status='superseded',updated_at=now()
      where city_id=p_city_id and topic_key=topic and id<>existing and status='proposed';
    ids:=ids||jsonb_build_array(existing); created:=created+1;
  end loop;
  update public.editorial_settings set last_analysis_at=case when p_module='all' then now() else last_analysis_at end,
    last_analysis_modules=last_analysis_modules||jsonb_build_object(p_module,now()),
    last_error=case when p_module='all' then null else last_error end where city_id=p_city_id;
  insert into public.editorial_decisions(city_id,actor_id,action,reason)
    values(p_city_id,p_actor,'analyze',format('%s: %s novas; %s já conhecidas; %s sem novidade material.',p_module,created,reused,suppressed));
  return jsonb_build_object('module',p_module,'created',created,'reused',reused,'suppressed',suppressed,'candidate_ids',ids);
end $$;
revoke all on function public.editorial_analyze_topics(bigint,uuid,text) from public,anon,authenticated;

create or replace function public.editorial_analyze_internal(p_city_id bigint,p_actor uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.editorial_analyze_topics(p_city_id,p_actor,'all');
$$;
create function public.editorial_analyze_module(p_city_id bigint,p_module text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.editorial_allowed(p_city_id,'write') then raise exception 'Sem acesso editorial a esta cidade.' using errcode='42501'; end if;
  return public.editorial_analyze_topics(p_city_id,auth.uid(),p_module);
end $$;
revoke all on function public.editorial_analyze_module(bigint,text) from public,anon;
grant execute on function public.editorial_analyze_module(bigint,text) to authenticated;

create or replace function public.editorial_assert_current(p_candidate_id uuid) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.editorial_candidates;
begin
  select * into c from public.editorial_candidates where id=p_candidate_id;
  if c.id is null or c.facts_hash<>public.editorial_snapshot_hash(public.editorial_snapshot(c.city_id,c.topic_key)) then
    raise exception 'Os dados mudaram. Analise novamente e revise a pauta antes de continuar.';
  end if;
end $$;

-- Vínculos uniformes, sem nomes/endereços de fontes no índice público.
create table public.news_editorial_sources (
  news_id uuid not null references public.news(id) on delete cascade,
  city_id bigint not null references public.cities(id),
  source_type text not null check(source_type in ('work','report','street','tree','community_tree')),
  source_id uuid not null,
  primary key(news_id,source_type,source_id)
);
alter table public.news_editorial_sources enable row level security;
revoke all on public.news_editorial_sources from public,anon,authenticated;
grant select on public.news_editorial_sources to anon,authenticated;
grant all on public.news_editorial_sources to service_role;
create function public.editorial_source_visible(p_city_id bigint,p_type text,p_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select case p_type
    when 'work' then exists(select 1 from public.public_works where id=p_id and city_id=p_city_id and is_complete=true)
    when 'report' then exists(select 1 from public.reports where id=p_id and city_id=p_city_id and is_public=true and moderation_status='approved'
      and status in ('pending','in-progress','pending_resolution','resolved') and (signal_status is null or signal_status='done'))
    when 'street' then exists(select 1 from public.pavement_streets where id=p_id and city_id=p_city_id)
    when 'tree' then exists(select 1 from public.city_trees where id=p_id and city_id=p_city_id)
    when 'community_tree' then exists(select 1 from public.community_trees where id=p_id and city_id=p_city_id and status='approved' and public_profile=true)
    else false end;
$$;
revoke all on function public.editorial_source_visible(bigint,text,uuid) from public;
grant execute on function public.editorial_source_visible(bigint,text,uuid) to anon,authenticated;
create policy news_editorial_sources_public on public.news_editorial_sources for select to anon,authenticated
  using(public.editorial_source_visible(city_id,source_type,source_id));

-- O vínculo legado de bronca também respeita a retirada de visibilidade de
-- notícias editoriais, sem alterar a leitura das associações manuais antigas.
create function public.editorial_report_link_visible(p_news_id uuid,p_report_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from public.news_editorial_sources where news_id=p_news_id)
    or exists(select 1 from public.news_editorial_sources s where s.news_id=p_news_id and s.source_type='report' and s.source_id=p_report_id
      and public.editorial_source_visible(s.city_id,'report',p_report_id));
$$;
revoke all on function public.editorial_report_link_visible(uuid,uuid) from public;
grant execute on function public.editorial_report_link_visible(uuid,uuid) to anon,authenticated;
create policy news_reports_editorial_visibility on public.news_reports as restrictive for select to anon,authenticated
  using(public.editorial_report_link_visible(news_id,report_id));

create or replace function public.editorial_publish(p_content_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.editorial_contents; c public.editorial_candidates; published_id uuid; body_html text; source_links text;
begin
  select * into v from public.editorial_contents where id=p_content_id;
  select * into c from public.editorial_candidates where id=v.candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'publish') then raise exception 'Sem permissão para publicar.' using errcode='42501'; end if;
  if v.news_id is not null then return v.news_id; end if;
  if c.news_id is not null then raise exception 'Esta pauta já possui uma notícia publicada.'; end if;
  if v.format<>'news' or v.approved_at is null or c.status not in ('writing','approved') or v.facts_hash<>c.facts_hash
    or exists(select 1 from public.editorial_contents where candidate_id=c.id and format=v.format and revision>v.revision) then raise exception 'Publique apenas a versão atual de uma notícia aprovada.'; end if;
  perform public.editorial_assert_current(c.id);
  perform public.editorial_validate_content(v.content,c.snapshot);
  select string_agg('<p>'||public.editorial_escape(b->>'text')||'</p>','' order by n) into body_html
    from jsonb_array_elements(v.content->'blocks') with ordinality as blocks(b,n);
  select string_agg('<li><a href="'||public.editorial_source_href(coalesce(s->>'source_type','work'),(s->>'id')::uuid)||'">'
      ||public.editorial_escape(s->>'title')||'</a></li>','' order by s->>'id') into source_links from jsonb_array_elements(c.snapshot->'sources') s;
  body_html:=body_html||'<p>Levantamento dos dados públicos cadastrados no Trombone Cidadão em '||public.editorial_escape(c.snapshot->>'as_of')
    ||'. Não representa um censo de toda a cidade.</p><p>'||public.editorial_escape(c.snapshot->'limitations'->>1)
    ||'</p><details><summary>Registros consultados</summary><ul>'||coalesce(source_links,'')
    ||'</ul></details><p>Produzido com assistência de IA e revisão editorial humana.</p>';
  insert into public.news(title,source,date,description,body,link,image_url,video_url)
    values(v.content->>'title','Trombone Cidadão',(now() at time zone 'America/Fortaleza')::date,
      left(v.content->'blocks'->0->>'text',500),body_html,'#','','') returning id into published_id;
  insert into public.news_editorial_sources(news_id,city_id,source_type,source_id)
    select published_id,c.city_id,coalesce(s->>'source_type','work'),(s->>'id')::uuid from jsonb_array_elements(c.snapshot->'sources') s;
  if c.module='works' then
    insert into public.news_public_works(news_id,work_id) select published_id,(s->>'id')::uuid from jsonb_array_elements(c.snapshot->'sources') s;
  elsif c.module='reports' then
    insert into public.news_reports(news_id,report_id) select published_id,(s->>'id')::uuid from jsonb_array_elements(c.snapshot->'sources') s;
  end if;
  update public.editorial_contents set news_id=published_id where id=v.id;
  update public.editorial_candidates set status='published',news_id=published_id,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,v.id,auth.uid(),'publish');
  return published_id;
end $$;

notify pgrst,'reload schema';
commit;
