begin;

alter table public.legislative_annotations add column group_key text
  check(group_key in ('melhorias','cobrancas','homenagens','leis','outros'));
alter table public.legislative_annotations add column neighborhood text not null default '' check(length(neighborhood)<=120);

create function public.legislative_text(p_text text) returns text
language sql immutable parallel safe set search_path=public,pg_temp as $$
  select trim(regexp_replace(lower(translate(coalesce(p_text,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),'[^a-z0-9]+',' ','g'))
$$;

-- One exclusive, deterministic rule for every author and party. Documents that
-- repeat another proposition (opinions/autographs) stay in "other documents".
create function public.legislative_group(p_type text,p_summary text) returns text
language plpgsql immutable parallel safe set search_path=public,pg_temp as $$
declare t text=upper(coalesce(p_type,''));s text=public.legislative_text(p_summary);begin
  if t ~ '^PAR' or t in ('AUT','MSG','MVETO','VET','REC','PPTCE','REQU') then return 'outros';end if;
  if s ~ '\m(homenage[a-z]*|congratulac[a-z]*|aplaus[a-z]*|pesar|falecimento|paraben[a-z]*)\M'
    or s ~ 'titulo de cidada' or s ~ 'data comemorativa'
    or s ~ '(denomina|denominacao).*(rua|avenida|praca|escola|unidade|logradouro|via publica|quadra|posto|predio|ponte|cemiterio|bairro|biblioteca|creche|esf)'
    or s ~ '(institui|cria|inclui).*(dia|semana|mes).*(comemorativ|calendario)' then return 'homenagens';end if;
  if t in ('PLO','PLC','PELO','PLSUB','PRE','PRS','PDL','PEPC','EMEND','EMENS','EMENV','EMENM','EIMP','SUB') then return 'leis';end if;
  if t in ('REQ','PPROV','IND','ICD','MOC') and s ~ '\m(informacoes|esclarecimentos|fiscalizacao|convocacao|repudio|censura|protesto)\M|prestacao de contas|boletins de medicao' then return 'cobrancas';end if;
  if t in ('PPROV','IND','ICD','REQ') then return 'melhorias';end if;
  return 'outros';
end $$;

-- Conservative extraction: a single explicitly named street, no geocoding or
-- fuzzy address merging. Ambiguous/multiple streets remain searchable by text.
create function public.legislative_place(p_summary text) returns jsonb
language plpgsql immutable parallel safe set search_path=public,pg_temp as $$
declare street text;hood text;s text=public.legislative_text(p_summary);services text[];begin
  if (select count(*) from regexp_matches(p_summary,'\m(rua|avenida|travessa|praça|estrada|rodovia)\M','gi'))=1 then
    street=(regexp_match(p_summary,'\m((?:Rua|Avenida|Travessa|Praça|Estrada|Rodovia)\s+[^,;.\n()]{2,160})','i'))[1];
    street=trim(regexp_replace(coalesce(street,''),'\s+(localizad[ao]|situad[ao]|no bairro|na comunidade|nesta|neste|deste|desta|para|onde|que|bem como)\M.*$','','i'));
    street=trim(regexp_replace(street,'\s+no\s+(Bairro|Distrito|Centro)\M.*$','','i'));
    if length(street) not between 6 and 120 or public.legislative_text(street) ~ '\m(que|sejam|atraves|municipio|conforme|sentido|solicito)\M' then street=null;end if;
  end if;
  if (select count(*) from regexp_matches(p_summary,'\mbairro\M','gi'))=1 then
    hood=(regexp_match(p_summary,'\mbairro\s+(?:d[ao]\s+)?([^,;.\n–—()]{2,100})','i'))[1];
    hood=trim(regexp_replace(coalesce(hood,''),'\s+(nesta|neste|deste|desta|para|onde|que|bem como|no municipio|em Floresta)\M.*$','','i'));
    if length(hood) not between 2 and 90 then hood=null;end if;
  end if;
  services=array_remove(array[
    case when s ~ '\mpoda\M' then 'poda' end,
    case when s ~ '\m(limpeza|capinacao|rocagem|lixo|entulhos)\M' then 'limpeza' end,
    case when s ~ '\m(iluminacao|luminarias|lampadas)\M' then 'iluminacao' end,
    case when s ~ '\m(esgoto|esgotamento|saneamento)\M' then 'esgoto' end,
    case when s ~ '\m(calcamento|pavimentacao|asfalto|asfaltamento|buracos)\M|tapa buraco' then 'pavimentacao' end,
    case when s ~ 'abastecimento de agua|falta de agua|rede de agua|pocos artesianos' then 'agua' end
  ],null);
  return jsonb_build_object('street',nullif(street,''),'street_key',nullif(public.legislative_text(street),''),
    'neighborhood',nullif(hood,''),'services',to_jsonb(services),'method','texto-1');
end $$;
revoke all on function public.legislative_text(text),public.legislative_group(text,text),public.legislative_place(text) from public,anon,authenticated;

create or replace function public.legislative_matter_rows(p_run uuid,p_filters jsonb default '{}')
returns table(id bigint,data jsonb,source_url text,hash text,type_data jsonb,annotation jsonb,authors jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  with matters as materialized(select * from public.legislative_records(p_run,'matters')),
  author_records as materialized(select * from public.legislative_records(p_run,'authors')),
  edges as materialized(
    select m.external_id matter_id,a::bigint author_id from matters m cross join lateral jsonb_array_elements_text(m.payload->'author_ids') a
    union select (au.payload->>'matter_id')::bigint,(au.payload->>'author_id')::bigint
      from public.legislative_records(p_run,'authorships')au join matters m on m.external_id=(au.payload->>'matter_id')::bigint
  ),
  author_groups as materialized(
    select e.matter_id,jsonb_agg(distinct jsonb_build_object('id',a.external_id,'name',a.payload->>'name',
      'parliamentarian_id',a.payload->'parliamentarian_id','councilor_id',l.councilor_id,'slug',c.slug)) authors
    from edges e join author_records a on a.external_id=e.author_id join public.legislative_runs r on r.id=p_run
    left join public.legislative_identity_links l on l.source_id=r.source_id and l.parliamentarian_id=(a.payload->>'parliamentarian_id')::bigint
    left join public.councilors c on c.id=l.councilor_id group by e.matter_id
  ), enriched as materialized(
    select m.external_id id,m.payload||jsonb_build_object(
      'group_key',coalesce(an.group_key,case when an.topic='homenagem' then 'homenagens' end,public.legislative_group(t.payload->>'abbreviation',m.payload->>'summary')),
      'group_method',case when an.group_key is not null or an.topic='homenagem' then 'revisado' else 'regras-1' end,
      'territory',public.legislative_place(m.payload->>'summary')) data,m.source_url,m.hash,t.payload type_data,
      to_jsonb(an)-'reviewed_by' annotation,coalesce(ag.authors,'[]') authors
    from matters m join public.legislative_runs r on r.id=p_run
    join public.legislative_records(p_run,'matter_types')t on t.external_id=(m.payload->>'type_id')::bigint
    left join author_groups ag on ag.matter_id=m.external_id
    left join public.legislative_annotations an on an.source_id=r.source_id and an.matter_id=m.external_id and an.version_hash=m.hash
  )
  select * from enriched e
  where (not p_filters?'start' or e.data->>'presented_on'>=p_filters->>'start')
    and (not p_filters?'end' or e.data->>'presented_on'<=p_filters->>'end')
    and (coalesce(p_filters->>'search','')='' or strpos(public.legislative_text(e.data->>'summary'),public.legislative_text(left(p_filters->>'search',200)))>0
      or concat(e.data->>'number','/',e.data->>'year')=p_filters->>'search')
    and (nullif(p_filters->>'type_id','') is null or e.data->>'type_id'=p_filters->>'type_id')
    and (nullif(p_filters->>'topic','') is null or e.annotation->>'topic'=p_filters->>'topic')
    and (nullif(p_filters->>'group_key','') is null or e.data->>'group_key'=p_filters->>'group_key')
    and (nullif(p_filters->>'location','') is null or e.annotation->>'location_key'=p_filters->>'location')
    and (nullif(p_filters->>'territory','') is null or strpos(public.legislative_text(concat_ws(' ',e.data->>'summary',e.annotation->>'location_label',e.annotation->>'neighborhood')),public.legislative_text(left(p_filters->>'territory',200)))>0)
    and (nullif(p_filters->>'councilor_id','') is null or exists(select 1 from jsonb_array_elements(e.authors)a where a->>'councilor_id'=p_filters->>'councilor_id'))
    and (nullif(p_filters->>'parliamentarian_id','') is null or exists(select 1 from jsonb_array_elements(e.authors)a where a->>'parliamentarian_id'=p_filters->>'parliamentarian_id'))
$$;

alter function public.legislative_decide(bigint,text,jsonb) rename to legislative_decide_related;
revoke all on function public.legislative_decide_related(bigint,text,jsonb) from public,anon,authenticated,service_role;
create function public.legislative_decide(p_city bigint,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
  result=public.legislative_decide_related(p_city,p_action,p_data);
  if p_action='classify' then
    update public.legislative_annotations a set
      group_key=case when p_data?'group_key' then nullif(p_data->>'group_key','') else a.group_key end,
      neighborhood=case when p_data?'neighborhood' then trim(left(p_data->>'neighborhood',120)) else a.neighborhood end
      from public.legislative_sources s where s.city_id=p_city and a.source_id=s.id and a.matter_id=(p_data->>'matter_id')::bigint;
  end if;
  return result;
end $$;
revoke all on function public.legislative_decide(bigint,text,jsonb) from public,anon;
grant execute on function public.legislative_decide(bigint,text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
