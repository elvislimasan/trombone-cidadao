begin;

-- Piloto editorial: fontes públicas de obras, rascunhos privados e decisões
-- transacionais. is_complete indica cadastro publicável, NÃO obra concluída.
create table public.editorial_access (
  city_id bigint not null references public.cities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_approve boolean not null default false,
  can_publish boolean not null default false,
  primary key(city_id,user_id)
);
create table public.editorial_settings (
  city_id bigint primary key references public.cities(id) on delete cascade,
  daily_enabled boolean not null default false,
  daily_ai_limit integer not null default 30 check(daily_ai_limit between 1 and 100),
  last_analysis_at timestamptz,
  last_error text
);
create table public.editorial_candidates (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id) on delete cascade,
  topic_key text not null,
  title text not null,
  reason text not null,
  priority integer not null check(priority between 0 and 100),
  facts_hash text not null,
  snapshot jsonb not null,
  baseline_snapshot jsonb not null,
  status text not null default 'proposed' check(status in ('proposed','writing','approved','published','dismissed','superseded')),
  decision_reason text,
  assigned_to uuid references public.profiles(id) on delete set null,
  news_id uuid references public.news(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id,topic_key,facts_hash)
);
create index editorial_candidates_queue on public.editorial_candidates(city_id,status,priority desc,created_at desc);
create table public.editorial_contents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.editorial_candidates(id) on delete cascade,
  city_id bigint not null references public.cities(id) on delete cascade,
  format text not null check(format in ('news','video_30','video_60','video_180')),
  revision integer not null check(revision>0),
  content jsonb not null,
  source_snapshot jsonb not null,
  facts_hash text not null,
  origin text not null check(origin in ('ai','human')),
  model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  news_id uuid references public.news(id) on delete set null,
  unique(candidate_id,format,revision)
);
create index editorial_contents_city on public.editorial_contents(city_id,candidate_id,created_at desc);
create table public.editorial_generations (
  id uuid primary key,
  candidate_id uuid not null references public.editorial_candidates(id) on delete cascade,
  city_id bigint not null references public.cities(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  format text not null check(format in ('news','video_30','video_60','video_180')),
  base_revision integer not null,
  facts_hash text not null,
  instruction text not null default '',
  status text not null default 'pending' check(status in ('pending','completed','failed')),
  content_id uuid references public.editorial_contents(id),
  error_code text,
  usage jsonb,
  created_at timestamptz not null default now(),
  lease_until timestamptz not null default now()+interval '2 minutes'
);
create unique index editorial_generation_pending on public.editorial_generations(candidate_id,format) where status='pending';
create table public.editorial_ai_usage (
  city_id bigint not null references public.cities(id) on delete cascade,
  usage_date date not null,
  requests integer not null,
  primary key(city_id,usage_date)
);
create table public.editorial_decisions (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  candidate_id uuid references public.editorial_candidates(id) on delete set null,
  content_id uuid references public.editorial_contents(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create function public.editorial_allowed(p_city_id bigint,p_action text default 'write',p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_user_id is not null and p_action in ('read','write','approve','publish','configure') and exists(
    select 1 from public.profiles p where p.id=p_user_id and (
      coalesce(p.is_master,false) or (coalesce(p.is_admin,false) and exists(
        select 1 from public.editorial_access a where a.city_id=p_city_id and a.user_id=p.id
          and case p_action when 'approve' then a.can_approve when 'publish' then a.can_publish
            when 'configure' then false else true end
      ))
    )
  );
$$;
revoke all on function public.editorial_allowed(bigint,text,uuid) from public,anon;
grant execute on function public.editorial_allowed(bigint,text,uuid) to authenticated,service_role;

alter table public.editorial_access enable row level security;
alter table public.editorial_settings enable row level security;
alter table public.editorial_candidates enable row level security;
alter table public.editorial_contents enable row level security;
alter table public.editorial_generations enable row level security;
alter table public.editorial_ai_usage enable row level security;
alter table public.editorial_decisions enable row level security;
revoke all on public.editorial_access,public.editorial_settings,public.editorial_candidates,public.editorial_contents,
  public.editorial_generations,public.editorial_ai_usage,public.editorial_decisions from anon,authenticated;
grant select on public.editorial_settings,public.editorial_candidates,public.editorial_contents,public.editorial_decisions to authenticated;
create policy editorial_settings_read on public.editorial_settings for select to authenticated using(public.editorial_allowed(city_id,'read'));
create policy editorial_candidates_read on public.editorial_candidates for select to authenticated using(public.editorial_allowed(city_id,'read'));
create policy editorial_contents_read on public.editorial_contents for select to authenticated using(public.editorial_allowed(city_id,'read'));
create policy editorial_decisions_read on public.editorial_decisions for select to authenticated using(public.editorial_allowed(city_id,'read'));
create policy editorial_access_service on public.editorial_access to service_role using(true) with check(true);
grant all on public.editorial_access,public.editorial_settings,public.editorial_candidates,public.editorial_contents,
  public.editorial_generations,public.editorial_ai_usage,public.editorial_decisions to service_role;

create function public.editorial_permissions(p_city_id bigint) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('read',public.editorial_allowed(p_city_id,'read'),
    'write',public.editorial_allowed(p_city_id,'write'),'approve',public.editorial_allowed(p_city_id,'approve'),
    'publish',public.editorial_allowed(p_city_id,'publish'),'configure',public.editorial_allowed(p_city_id,'configure'));
$$;

-- Snapshot completo do universo publicável da cidade, sem filtros da lista/mapa,
-- sem descrições livres, contatos, CNPJ ou solicitações municipais internas.
create function public.editorial_works_snapshot(p_city_id bigint,p_topic text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; city_name text;
begin
  if p_topic not in ('works.stalled','works.unfinished','works.overdue','works.completed') then
    raise exception 'Tipo de levantamento inválido.';
  end if;
  select name into city_name from public.cities where id=p_city_id;
  if city_name is null then raise exception 'Cidade não encontrada.'; end if;
  with universe as (
    select w.id,w.title,w.status,w.total_value,w.amount_spent,w.stalled_date,w.expected_end_date,w.end_date,w.bairro_id,
      b.name as neighborhood from public.public_works w left join public.bairros b on b.id=w.bairro_id and b.city_id=w.city_id
    where w.city_id=p_city_id and w.is_complete=true
  ), selected as (
    select * from universe where case p_topic
      when 'works.stalled' then status='stalled'
      when 'works.unfinished' then status='unfinished'
      when 'works.completed' then status='completed'
      when 'works.overdue' then status in ('in-progress','stalled','unfinished')
        and expected_end_date<(now() at time zone 'America/Fortaleza')::date and end_date is null
      else false end
  ), stats as (
    select (select count(*) from universe) as total,count(*) as selected,
      round(count(*)*100.0/nullif((select count(*) from universe),0),1) as share,
      sum(total_value) filter(where total_value>=0) as contract_total,
      count(*) filter(where total_value is null or total_value<0) as missing_values,
      count(*) filter(where stalled_date is not null) as dated_stoppages from selected
  )
  select jsonb_build_object(
    'policy_version','works-v1','city_id',p_city_id,'city_name',city_name,'topic_key',p_topic,
    'captured_at',now(),'as_of',(now() at time zone 'America/Fortaleza')::date,
    'total',s.total,'selected',s.selected,'share',s.share,'contract_total',s.contract_total,'missing_values',s.missing_values,
    'facts',jsonb_build_array(
      jsonb_build_object('id','F1','text',format('%s obras com cadastro publicável na plataforma em %s. Inclui previstas, licitadas, em andamento, paralisadas, inacabadas e concluídas.',s.total,city_name)),
      jsonb_build_object('id','F2','text',format('%s obras %s, equivalentes a %s%% dos cadastros publicáveis da cidade.',s.selected,
        case p_topic when 'works.stalled' then 'registradas como paralisadas' when 'works.unfinished' then 'registradas como inacabadas'
        when 'works.completed' then 'registradas como concluídas' else 'com previsão de término vencida e sem data de conclusão cadastrada' end,
        replace(coalesce(s.share,0)::text,'.',','))),
      jsonb_build_object('id','F3','text',case when s.contract_total is null then 'Valores contratuais não informados para este conjunto.'
        else format('Soma dos valores contratuais informados para este conjunto: R$ %s. Valor contratado não representa gasto, prejuízo ou recurso perdido.',replace(s.contract_total::text,'.',',')) end),
      jsonb_build_object('id','F4','text',format('%s obras do conjunto sem valor contratual válido informado.',s.missing_values)),
      jsonb_build_object('id','F5','text',format('%s obras do conjunto possuem data de paralisação cadastrada. Isso não confirma tempo de paralisação das demais.',s.dated_stoppages)),
      jsonb_build_object('id','F6','text','Distribuição dos registros deste conjunto por bairro: '||coalesce((
        select string_agg(neighborhood_label||': '||quantity::text,'; ' order by quantity desc,neighborhood_label)
        from (select coalesce(neighborhood,'Não informado') as neighborhood_label,count(*) as quantity from selected
          group by neighborhood order by quantity desc,neighborhood_label limit 8) neighborhoods
      ),'sem registros')||'. Bairros não informados não podem ser atribuídos por inferência.'),
      jsonb_build_object('id','F7','text','Exemplos de obras deste conjunto: '||coalesce((
        select string_agg(left(title,160),'; ' order by id) from (select id,title from selected order by id limit 5) examples
      ),'sem registros')||'. Os títulos cadastrados não confirmam impacto ou número de beneficiários.')
    ),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',left(title,200),'status',status,
      'total_value',total_value,'stalled_date',stalled_date,'expected_end_date',expected_end_date,'end_date',end_date,
      'bairro_id',bairro_id,'neighborhood',neighborhood) order by id) from selected),'[]'::jsonb),
    'limitations',jsonb_build_array('O levantamento descreve os cadastros publicáveis da plataforma; não é um censo de todas as obras do município.',
      'Situação cadastrada não equivale a vistoria atual. Falta de atualização não comprova paralisação.',
      'Não há inferência automática de causa, culpa, prejuízo, número de beneficiários ou duração da paralisação.',
      case when p_topic='works.overdue' then 'A previsão pode ter sido alterada sem atualização do cadastro. Confirmar o cronograma antes de afirmar atraso.' else 'Conferir situação e documentos antes de publicar.' end)
  ) into result from stats s;
  return result;
end $$;
revoke all on function public.editorial_works_snapshot(bigint,text) from public,anon,authenticated;

create function public.editorial_snapshot_hash(p_snapshot jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
  -- Data de coleta e títulos não fazem reaparecer um fato já proposto.
  select md5(jsonb_build_object('policy',p_snapshot->'policy_version','topic',p_snapshot->'topic_key',
    'total',p_snapshot->'total','selected',p_snapshot->'selected','sources',coalesce((
      select jsonb_agg(value-'title'-'neighborhood' order by value->>'id') from jsonb_array_elements(p_snapshot->'sources')
    ),'[]'::jsonb))::text);
$$;
revoke all on function public.editorial_snapshot_hash(jsonb) from public,anon,authenticated;

create function public.editorial_analyze_internal(p_city_id bigint,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare topic text; snap jsonb; fingerprint text; existing uuid; latest public.editorial_candidates;
  created integer:=0; reused integer:=0; suppressed integer:=0; candidate_title text; ids jsonb:='[]'; material boolean;
begin
  perform pg_advisory_xact_lock(hashtext('editorial-works'),hashtext(p_city_id::text));
  insert into public.editorial_settings(city_id) values(p_city_id) on conflict do nothing;
  foreach topic in array array['works.stalled','works.unfinished','works.overdue','works.completed'] loop
    snap:=public.editorial_works_snapshot(p_city_id,topic);
    fingerprint:=public.editorial_snapshot_hash(snap);
    select id into existing from public.editorial_candidates where city_id=p_city_id and topic_key=topic and facts_hash=fingerprint;
    if existing is not null then
      update public.editorial_candidates set status='superseded',updated_at=now()
        where city_id=p_city_id and topic_key=topic and id<>existing and status in ('proposed','writing','approved');
      reused:=reused+1; continue;
    end if;
    select * into latest from public.editorial_candidates where city_id=p_city_id and topic_key=topic order by created_at desc,id desc limit 1;
    -- Materialidade comparada com a última proposta, não com o último clique.
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
    candidate_title:=format('%s: %s obras %s',snap->>'city_name',snap->>'selected',
      case topic when 'works.stalled' then 'registradas como paralisadas' when 'works.unfinished' then 'registradas como inacabadas'
        when 'works.completed' then 'registradas como concluídas' else 'com previsão de término vencida' end);
    if ((snap->>'selected')::int=0 and latest.id is null) or not material then
      -- Atualiza evidências de pauta aberta, preservando a linha de base e as
      -- versões imutáveis. Uma aprovação anterior não aprova a nova base.
      if latest.id is not null and latest.status in ('proposed','writing','approved') then
        update public.editorial_candidates set snapshot=snap,facts_hash=fingerprint,title=candidate_title,updated_at=now(),
          status=case when status='approved' then 'writing' else status end where id=latest.id;
      end if;
      suppressed:=suppressed+1; continue;
    end if;
    insert into public.editorial_candidates(city_id,topic_key,title,reason,priority,facts_hash,snapshot,baseline_snapshot)
      values(p_city_id,topic,candidate_title,
        case when latest.id is null then 'Primeiro levantamento deste assunto. Confirmar cobertura anterior e situação atual antes de publicar.'
          else format('Mudança desde a última proposta: %s → %s registros. A composição, a participação no total ou os valores também podem ter mudado. Conferir as fontes e o contexto.',latest.baseline_snapshot->>'selected',snap->>'selected') end,
        case topic when 'works.stalled' then 80 when 'works.overdue' then 75 when 'works.unfinished' then 70 else 60 end,
        fingerprint,snap,snap) returning id into existing;
    -- Pautas em produção/aprovadas não são sobrescritas; a UI confere a base.
    update public.editorial_candidates set status='superseded',updated_at=now()
      where city_id=p_city_id and topic_key=topic and id<>existing and status='proposed';
    ids:=ids||jsonb_build_array(existing); created:=created+1;
  end loop;
  update public.editorial_settings set last_analysis_at=now(),last_error=null where city_id=p_city_id;
  insert into public.editorial_decisions(city_id,actor_id,action,reason) values(p_city_id,p_actor,'analyze',format('%s novas; %s já conhecidas; %s sem novidade material.',created,reused,suppressed));
  return jsonb_build_object('created',created,'reused',reused,'suppressed',suppressed,'candidate_ids',ids);
end $$;
revoke all on function public.editorial_analyze_internal(bigint,uuid) from public,anon,authenticated;

create function public.editorial_analyze(p_city_id bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.editorial_allowed(p_city_id,'write') then raise exception 'Sem acesso editorial a esta cidade.' using errcode='42501'; end if;
  return public.editorial_analyze_internal(p_city_id,auth.uid());
end $$;

create function public.editorial_candidate_action(p_candidate_id uuid,p_action text,p_reason text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.editorial_candidates;
begin
  select * into c from public.editorial_candidates where id=p_candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'write') then raise exception 'Pauta indisponível.' using errcode='42501'; end if;
  if p_action not in ('claim','dismiss','release') or c.status not in ('proposed','writing','approved')
    or (c.status='approved' and p_action<>'release') then raise exception 'Ação indisponível para esta pauta.'; end if;
  if c.assigned_to is not null and c.assigned_to<>auth.uid()
    and not (p_action='release' and public.editorial_allowed(c.city_id,'configure')) then raise exception 'Esta pauta já está com outro editor.'; end if;
  if p_action='dismiss' and length(trim(p_reason)) not between 3 and 1000 then raise exception 'Informe o motivo do descarte.'; end if;
  update public.editorial_candidates set status=case p_action when 'claim' then 'writing' when 'release' then 'proposed' else 'dismissed' end,
    assigned_to=case when p_action='release' then null else auth.uid() end,
    decision_reason=case when p_action='dismiss' then trim(p_reason) else null end,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,actor_id,action,reason) values(c.city_id,c.id,auth.uid(),p_action,left(p_reason,1000));
end $$;

-- Validação compartilhada por gravação humana, resposta de IA e publicação.
-- Referências válidas e números permitidos são necessários; revisão humana
-- continua obrigatória para relações, atribuição e interpretação dos fatos.
create function public.editorial_number(p_value text) returns numeric
language sql immutable set search_path=public,pg_temp as $$
  select (case when strpos(p_value,',')>0 then replace(replace(p_value,'.',''),',','.')
    when p_value ~ '^[0-9]{1,3}(\.[0-9]{3})+$' then replace(p_value,'.','') else p_value end)::numeric;
$$;
create function public.editorial_validate_content(p_content jsonb,p_snapshot jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare block jsonb; ref jsonb; evidence text; token text; allowed numeric[]; fact_count integer;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'title') is distinct from 'string'
    or length(trim(p_content->>'title')) not between 5 and 200
    or jsonb_typeof(p_content->'title_fact_ids') is distinct from 'array'
    or jsonb_typeof(p_content->'blocks') is distinct from 'array'
    or jsonb_array_length(p_content->'blocks') not between 1 and 20 then raise exception 'Conteúdo editorial incompleto.'; end if;
  for block in select value from jsonb_array_elements((p_content->'blocks')||jsonb_build_array(
    jsonb_build_object('text',p_content->>'title','fact_ids',p_content->'title_fact_ids'))) loop
    if jsonb_typeof(block->'text') is distinct from 'string' or length(trim(block->>'text')) not between 3 and 3000
      or (block->>'text') ~ '[<>]' or jsonb_typeof(block->'fact_ids') is distinct from 'array'
      or jsonb_array_length(block->'fact_ids') not between 1 and 7 then raise exception 'Cada trecho precisa de texto simples e fontes.'; end if;
    evidence:='';
    for ref in select value from jsonb_array_elements(block->'fact_ids') loop
      select count(*),string_agg(f->>'text',' ') into fact_count,token from jsonb_array_elements(p_snapshot->'facts') f where f->'id'=ref;
      if fact_count<>1 then raise exception 'Referência factual inválida.'; end if;
      evidence:=evidence||' '||token;
    end loop;
    select array_agg(public.editorial_number(m[1])) into allowed from regexp_matches(evidence,'([0-9]+(?:[.,][0-9]+)*)','g') m;
    for token in select m[1] from regexp_matches(block->>'text','([0-9]+(?:[.,][0-9]+)*)','g') m loop
      if not coalesce(public.editorial_number(token)=any(allowed),false) then raise exception 'Número sem suporte nas fontes do trecho: %.',token; end if;
    end loop;
  end loop;
end $$;
revoke all on function public.editorial_number(text),public.editorial_validate_content(jsonb,jsonb) from public,anon,authenticated;

create function public.editorial_assert_current(p_candidate_id uuid) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.editorial_candidates;
begin
  select * into c from public.editorial_candidates where id=p_candidate_id;
  if c.id is null or c.facts_hash<>public.editorial_snapshot_hash(public.editorial_works_snapshot(c.city_id,c.topic_key)) then
    raise exception 'Os dados mudaram. Analise novamente e revise a pauta antes de continuar.';
  end if;
end $$;
revoke all on function public.editorial_assert_current(uuid) from public,anon,authenticated;

create function public.editorial_reserve_generation(p_candidate_id uuid,p_format text,p_request_id uuid,p_instruction text default '',p_base_revision integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.editorial_candidates; g public.editorial_generations; latest public.editorial_contents; used integer; quota integer;
begin
  select * into c from public.editorial_candidates where id=p_candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'write') then raise exception 'Pauta indisponível.' using errcode='42501'; end if;
  if p_format not in ('news','video_30','video_60','video_180') or length(p_instruction)>1000 then raise exception 'Formato ou ajuste inválido.'; end if;
  if c.status not in ('proposed','writing','approved','published') or (c.status='published' and p_format='news')
    or (c.assigned_to is not null and c.assigned_to<>auth.uid()) then raise exception 'Esta pauta não está disponível para produção.'; end if;
  perform public.editorial_assert_current(c.id);
  select * into g from public.editorial_generations where id=p_request_id;
  if g.id is not null then
    if g.candidate_id<>c.id or g.requested_by<>auth.uid() or g.format<>p_format or g.instruction<>p_instruction then raise exception 'Solicitação inválida.'; end if;
    if g.status='completed' then return jsonb_build_object('cached_content_id',g.content_id); end if;
    raise exception 'Solicitação já recebida. Atualize a lista de conteúdos antes de tentar novamente.';
  end if;
  select * into latest from public.editorial_contents where candidate_id=c.id and format=p_format order by revision desc limit 1;
  if coalesce(latest.revision,0)<>p_base_revision then raise exception 'Existe uma versão mais recente. Atualize o conteúdo.'; end if;
  if latest.id is not null and trim(p_instruction)='' then return jsonb_build_object('cached_content_id',latest.id); end if;
  update public.editorial_generations set status='failed',error_code='lease_expired' where candidate_id=c.id and format=p_format and status='pending' and lease_until<now();
  if exists(select 1 from public.editorial_generations where candidate_id=c.id and format=p_format and status='pending') then raise exception 'Já existe uma geração em andamento para este formato.'; end if;
  insert into public.editorial_settings(city_id) values(c.city_id) on conflict do nothing;
  select daily_ai_limit into quota from public.editorial_settings where city_id=c.city_id for update;
  insert into public.editorial_ai_usage as u(city_id,usage_date,requests) values(c.city_id,(now() at time zone 'America/Fortaleza')::date,1)
    on conflict(city_id,usage_date) do update set requests=u.requests+1 where u.requests<quota returning requests into used;
  if used is null then raise exception 'Limite diário de IA da cidade atingido.'; end if;
  insert into public.editorial_generations(id,candidate_id,city_id,requested_by,format,base_revision,facts_hash,instruction)
    values(p_request_id,c.id,c.city_id,auth.uid(),p_format,p_base_revision,c.facts_hash,p_instruction);
  update public.editorial_candidates set assigned_to=auth.uid(),status=case when news_id is not null then 'published' else 'writing' end,updated_at=now() where id=c.id;
  return jsonb_build_object('generation_id',p_request_id,'snapshot',c.snapshot,'previous_content',latest.content,'format',p_format,'instruction',p_instruction);
end $$;

-- Só o backend pode registrar resposta do provedor, modelo e consumo.
create function public.editorial_finish_generation(p_generation_id uuid,p_content jsonb,p_model text,p_usage jsonb default '{}',p_error_code text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.editorial_generations; c public.editorial_candidates; new_content_id uuid; current_revision integer;
begin
  -- A ordem dos locks segue as demais mutações: pauta, depois geração.
  select candidate_id into new_content_id from public.editorial_generations where id=p_generation_id;
  select * into c from public.editorial_candidates where id=new_content_id for update;
  select * into g from public.editorial_generations where id=p_generation_id for update;
  if g.id is null then raise exception 'Geração não encontrada.'; end if;
  if g.status='completed' then return g.content_id; end if;
  if g.status<>'pending' then raise exception 'Geração encerrada.'; end if;
  if p_error_code is not null or g.lease_until<now() or not public.editorial_allowed(g.city_id,'write',g.requested_by)
    or c.assigned_to is distinct from g.requested_by or c.status not in ('writing','published') or c.facts_hash<>g.facts_hash then
    update public.editorial_generations set status='failed',error_code=coalesce(p_error_code,'generation_invalidated'),usage=p_usage where id=g.id;
    return null;
  end if;
  perform public.editorial_assert_current(c.id);
  select coalesce(max(revision),0) into current_revision from public.editorial_contents where candidate_id=c.id and format=g.format;
  if current_revision<>g.base_revision then raise exception 'Uma edição mais recente foi preservada. Atualize o conteúdo.'; end if;
  perform public.editorial_validate_content(p_content,c.snapshot);
  insert into public.editorial_contents(candidate_id,city_id,format,revision,content,source_snapshot,facts_hash,origin,model,created_by)
    values(c.id,c.city_id,g.format,current_revision+1,p_content,c.snapshot,g.facts_hash,'ai',left(p_model,160),g.requested_by) returning id into new_content_id;
  update public.editorial_generations set status='completed',content_id=new_content_id,usage=p_usage where id=g.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,new_content_id,g.requested_by,'generate');
  return new_content_id;
end $$;
revoke all on function public.editorial_finish_generation(uuid,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.editorial_finish_generation(uuid,jsonb,text,jsonb,text) to service_role;

create function public.editorial_save_content(p_content_id uuid,p_content jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.editorial_contents; c public.editorial_candidates; new_id uuid;
begin
  select * into old from public.editorial_contents where id=p_content_id;
  select * into c from public.editorial_candidates where id=old.candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'write') then raise exception 'Conteúdo indisponível.' using errcode='42501'; end if;
  if c.status not in ('writing','approved','published') or old.news_id is not null or c.assigned_to is distinct from auth.uid() then raise exception 'Somente o editor responsável pode alterar este rascunho.'; end if;
  if exists(select 1 from public.editorial_contents where candidate_id=c.id and format=old.format and revision>old.revision) then raise exception 'Existe uma versão mais recente. Suas alterações não foram sobrescritas.'; end if;
  perform public.editorial_assert_current(c.id);
  perform public.editorial_validate_content(p_content,c.snapshot);
  if old.content=p_content and old.facts_hash=c.facts_hash then return old.id; end if;
  insert into public.editorial_contents(candidate_id,city_id,format,revision,content,source_snapshot,facts_hash,origin,created_by)
    values(c.id,c.city_id,old.format,old.revision+1,p_content,c.snapshot,c.facts_hash,'human',auth.uid()) returning id into new_id;
  update public.editorial_candidates set status=case when news_id is not null then 'published' else 'writing' end,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,new_id,auth.uid(),'edit');
  return new_id;
end $$;

create function public.editorial_approve(p_content_id uuid,p_verified boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.editorial_contents; c public.editorial_candidates;
begin
  select * into v from public.editorial_contents where id=p_content_id;
  select * into c from public.editorial_candidates where id=v.candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'approve') then raise exception 'Sem permissão para aprovar.' using errcode='42501'; end if;
  if p_verified is distinct from true then raise exception 'Confirme a conferência dos fatos e fontes.'; end if;
  if c.status not in ('writing','approved','published') or v.news_id is not null or v.facts_hash<>c.facts_hash
    or exists(select 1 from public.editorial_contents where candidate_id=c.id and format=v.format and revision>v.revision) then raise exception 'Aprove somente a versão atual em produção, com a base atualizada.'; end if;
  perform public.editorial_assert_current(c.id);
  perform public.editorial_validate_content(v.content,c.snapshot);
  update public.editorial_contents set approved_by=auth.uid(),approved_at=now() where id=v.id;
  update public.editorial_candidates set status=case when news_id is not null then 'published' else 'approved' end,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action,reason) values(c.city_id,c.id,v.id,auth.uid(),'approve','Fatos, fontes e contexto conferidos pelo editor.');
end $$;

create function public.editorial_escape(p_text text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select replace(replace(replace(replace(p_text,'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;');
$$;
revoke all on function public.editorial_escape(text) from public,anon,authenticated;

create function public.editorial_publish(p_content_id uuid) returns uuid
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
  select string_agg('<li><a href="/obras-publicas/'||(s->>'id')||'">'||public.editorial_escape(s->>'title')||'</a></li>','' order by s->>'id')
    into source_links from jsonb_array_elements(c.snapshot->'sources') s;
  body_html:=body_html||'<p>Levantamento dos cadastros publicáveis do Trombone Cidadão em '||public.editorial_escape(c.snapshot->>'as_of')||'. Não representa um censo de todas as obras do município.</p>'
    ||'<details><summary>Obras consultadas</summary><ul>'||coalesce(source_links,'')||'</ul></details><p>Produzido com assistência de IA e revisão editorial humana.</p>';
  insert into public.news(title,source,date,description,body,link,image_url,video_url)
    values(v.content->>'title','Trombone Cidadão',(now() at time zone 'America/Fortaleza')::date,
      left(v.content->'blocks'->0->>'text',500),body_html,'#','','') returning id into published_id;
  insert into public.news_public_works(news_id,work_id)
    select published_id,(s->>'id')::uuid from jsonb_array_elements(c.snapshot->'sources') s;
  update public.editorial_contents set news_id=published_id where id=v.id;
  update public.editorial_candidates set status='published',news_id=published_id,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,v.id,auth.uid(),'publish');
  return published_id;
end $$;

create function public.editorial_export(p_content_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.editorial_contents; c public.editorial_candidates;
begin
  select * into v from public.editorial_contents where id=p_content_id;
  select * into c from public.editorial_candidates where id=v.candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'read') then raise exception 'Conteúdo indisponível.' using errcode='42501'; end if;
  if v.approved_at is null or v.facts_hash<>c.facts_hash or exists(select 1 from public.editorial_contents where candidate_id=c.id and format=v.format and revision>v.revision) then
    raise exception 'Copie apenas a versão atual aprovada.';
  end if;
  perform public.editorial_assert_current(c.id);
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,v.id,auth.uid(),'export_requested');
  return to_jsonb(v);
end $$;

create function public.editorial_set_daily(p_city_id bigint,p_enabled boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.editorial_allowed(p_city_id,'configure') then raise exception 'Apenas master pode configurar a rotina editorial.' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Informe o estado da análise diária.'; end if;
  if p_enabled and not exists(select 1 from pg_extension where extname='pg_cron') then raise exception 'O agendador pg_cron precisa ser habilitado antes de ativar a análise diária.'; end if;
  if p_enabled then
    -- Também cobre pg_cron habilitado depois da aplicação desta migração.
    perform pg_advisory_xact_lock(hashtext('editorial-cron-install'));
    if not exists(select 1 from cron.job where jobname='editorial-works-daily') then
      perform cron.schedule('editorial-works-daily','0 9 * * *','select public.editorial_run_daily();');
    end if;
  end if;
  insert into public.editorial_settings(city_id,daily_enabled) values(p_city_id,p_enabled)
    on conflict(city_id) do update set daily_enabled=excluded.daily_enabled;
  insert into public.editorial_decisions(city_id,actor_id,action,reason) values(p_city_id,auth.uid(),'configure',case when p_enabled then 'Análise diária ativada.' else 'Análise diária desativada.' end);
end $$;

create function public.editorial_run_daily() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare setting record;
begin
  for setting in select city_id from public.editorial_settings where daily_enabled=true
    and (last_analysis_at is null or (last_analysis_at at time zone 'America/Fortaleza')::date<(now() at time zone 'America/Fortaleza')::date) loop
    begin
      perform public.editorial_analyze_internal(setting.city_id,null);
    exception when others then
      update public.editorial_settings set last_error='A análise diária falhou. Execute a análise manual ou verifique o banco.' where city_id=setting.city_id;
    end;
  end loop;
end $$;
revoke all on function public.editorial_run_daily() from public,anon,authenticated;

revoke all on function public.editorial_permissions(bigint),public.editorial_analyze(bigint),public.editorial_candidate_action(uuid,text,text),
  public.editorial_reserve_generation(uuid,text,uuid,text,integer),public.editorial_save_content(uuid,jsonb),public.editorial_approve(uuid,boolean),
  public.editorial_publish(uuid),public.editorial_export(uuid),public.editorial_set_daily(bigint,boolean) from public,anon;
grant execute on function public.editorial_permissions(bigint),public.editorial_analyze(bigint),public.editorial_candidate_action(uuid,text,text),
  public.editorial_reserve_generation(uuid,text,uuid,text,integer),public.editorial_save_content(uuid,jsonb),public.editorial_approve(uuid,boolean),
  public.editorial_publish(uuid),public.editorial_export(uuid),public.editorial_set_daily(bigint,boolean) to authenticated;

-- SQL diário não chama o provedor, não gera textos nem publica. Desativado por
-- cidade até uma ação explícita de master. Cron ausente: análise manual funciona.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='editorial-works-daily') then perform cron.unschedule('editorial-works-daily'); end if;
    perform cron.schedule('editorial-works-daily','0 9 * * *','select public.editorial_run_daily();');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
