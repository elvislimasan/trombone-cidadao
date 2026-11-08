begin;

-- {} identifica versões e solicitações legadas, que permanecem legíveis.
alter table public.editorial_generations add column brief jsonb not null default '{}' check(jsonb_typeof(brief)='object');
alter table public.editorial_contents add column brief jsonb not null default '{}' check(jsonb_typeof(brief)='object');

create function public.editorial_normalize_brief(p_brief jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare tone text; news_style text; video_style text; guidance text;
begin
  if jsonb_typeof(p_brief) is distinct from 'object' then raise exception 'Escolha um estilo editorial válido.'; end if;
  tone:=coalesce(p_brief->>'tone','informative'); news_style:=coalesce(p_brief->>'news_style','direct');
  video_style:=coalesce(p_brief->>'video_style','presenter'); guidance:=coalesce(p_brief->>'guidance','');
  if tone not in ('informative','conversational','light','humorous','critical') or news_style not in ('direct','explainer','story')
    or video_style not in ('presenter','voiceover','dialogue') or length(guidance)>1000 or guidance ~ '[<>]'
    or (p_brief ? 'guidance' and jsonb_typeof(p_brief->'guidance') is distinct from 'string') then
    raise exception 'Escolha um estilo válido e uma orientação de até 1000 caracteres em texto simples.';
  end if;
  return jsonb_build_object('schema_version',1,'tone',tone,'news_style',news_style,'video_style',video_style,'guidance',trim(guidance));
end $$;
create function public.editorial_brief_key(p_brief jsonb,p_format text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select md5(jsonb_build_object('tone',b->'tone','style',case when p_format='news' then b->'news_style' else b->'video_style' end,
    'guidance',b->'guidance','script_schema',case when p_format='news' then null when p_brief->>'schema_version'='1' then 1 else 0 end)::text)
    from (select public.editorial_normalize_brief(p_brief) as b) normalized;
$$;
revoke all on function public.editorial_normalize_brief(jsonb),public.editorial_brief_key(jsonb,text) from public,anon,authenticated;

create or replace function public.editorial_validate_content(p_content jsonb,p_snapshot jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare block jsonb; ref jsonb; evidence text; token text; allowed numeric[]; fact_count integer; field text; min_length integer; max_length integer;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'title') is distinct from 'string'
    or length(trim(p_content->>'title')) not between 5 and 200 or jsonb_typeof(p_content->'title_fact_ids') is distinct from 'array'
    or jsonb_typeof(p_content->'blocks') is distinct from 'array'
    or jsonb_array_length(p_content->'blocks') not between 1 and 20 then raise exception 'Conteúdo editorial incompleto.'; end if;
  for block in select value from jsonb_array_elements((p_content->'blocks')||jsonb_build_array(
    jsonb_build_object('text',p_content->>'title','fact_ids',p_content->'title_fact_ids'))) loop
    if jsonb_typeof(block->'text') is distinct from 'string' or length(trim(block->>'text')) not between 3 and 3000
      or jsonb_typeof(block->'fact_ids') is distinct from 'array' or jsonb_array_length(block->'fact_ids') not between 1 and 7 then
      raise exception 'Cada trecho precisa de texto simples e fontes.';
    end if;
    if block ? 'speaker' and (jsonb_typeof(block->'speaker') is distinct from 'string'
      or block->>'speaker' not in ('presenter','narrator','presenter_a','presenter_b')) then raise exception 'Papel de apresentação inválido.'; end if;
    evidence:='';
    for ref in select value from jsonb_array_elements(block->'fact_ids') loop
      select count(*),string_agg(f->>'text',' ') into fact_count,token from jsonb_array_elements(p_snapshot->'facts') f where f->'id'=ref;
      if fact_count<>1 then raise exception 'Referência factual inválida.'; end if;
      evidence:=evidence||' '||token;
    end loop;
    select array_agg(public.editorial_number(m[1])) into allowed from regexp_matches(evidence,'([0-9]+(?:[.,][0-9]+)*)','g') m;
    foreach field in array array['text','scene','screen_text'] loop
      if field<>'text' and not block ? field then continue; end if;
      min_length:=case field when 'screen_text' then 0 else 3 end;
      max_length:=case field when 'text' then 3000 when 'scene' then 600 else 240 end;
      if jsonb_typeof(block->field) is distinct from 'string' or length(trim(block->>field)) not between min_length and max_length
        or block->>field ~ '[<>]' then raise exception 'Texto, cena ou texto de tela inválido.'; end if;
      for token in select m[1] from regexp_matches(block->>field,'([0-9]+(?:[.,][0-9]+)*)','g') m loop
        if not coalesce(public.editorial_number(token)=any(allowed),false) then raise exception 'Número sem suporte nas fontes do trecho: %.',token; end if;
      end loop;
    end loop;
  end loop;
end $$;

create function public.editorial_validate_script(p_content jsonb,p_format text,p_brief jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare block jsonb; speakers text[]; profile jsonb;
begin
  if p_format='news' then
    if exists(select 1 from jsonb_array_elements(p_content->'blocks') b where b ?| array['speaker','scene','screen_text']) then
      raise exception 'Notícia não deve conter campos de roteiro.';
    end if;
    return;
  end if;
  -- Não converter silenciosamente versões antigas em roteiros estruturados.
  if p_brief='{}'::jsonb then return; end if;
  profile:=public.editorial_normalize_brief(p_brief);
  speakers:=case profile->>'video_style' when 'dialogue' then array['presenter_a','presenter_b']
    when 'voiceover' then array['narrator'] else array['presenter'] end;
  for block in select value from jsonb_array_elements(p_content->'blocks') loop
    if block->>'speaker' is null or not (block->>'speaker'=any(speakers))
      or not (block ? 'scene') or not (block ? 'screen_text') then raise exception 'O roteiro precisa de falas, cenas e texto de tela compatíveis com o estilo escolhido.'; end if;
  end loop;
  if exists(select 1 from unnest(speakers) role where not exists(
    select 1 from jsonb_array_elements(p_content->'blocks') b where b->>'speaker'=role)) then
    raise exception 'O diálogo precisa da participação dos dois apresentadores.';
  end if;
end $$;
revoke all on function public.editorial_validate_script(jsonb,text,jsonb) from public,anon,authenticated;

create function public.editorial_content_style_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and (new.brief is distinct from old.brief or new.content is distinct from old.content) then
    raise exception 'Texto e estilo são imutáveis por versão. Salve uma nova versão.';
  end if;
  if new.brief<>'{}'::jsonb then new.brief:=public.editorial_normalize_brief(new.brief); end if;
  perform public.editorial_validate_content(new.content,new.source_snapshot);
  perform public.editorial_validate_script(new.content,new.format,new.brief);
  return new;
end $$;
revoke all on function public.editorial_content_style_guard() from public,anon,authenticated;
create trigger editorial_content_style_guard before insert or update on public.editorial_contents
  for each row execute function public.editorial_content_style_guard();

create function public.editorial_reserve_generation_styled(p_candidate_id uuid,p_format text,p_request_id uuid,p_brief jsonb,
  p_instruction text default '',p_base_revision integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.editorial_candidates; g public.editorial_generations; latest public.editorial_contents;
  used integer; quota integer; profile jsonb;
begin
  select * into c from public.editorial_candidates where id=p_candidate_id for update;
  if c.id is null or not public.editorial_allowed(c.city_id,'write') then raise exception 'Pauta indisponível.' using errcode='42501'; end if;
  profile:=public.editorial_normalize_brief(p_brief);
  if p_format is null or p_format not in ('news','video_30','video_60','video_180') or p_instruction is null or length(p_instruction)>1000 then raise exception 'Formato ou ajuste inválido.'; end if;
  if c.status not in ('proposed','writing','approved','published') or (c.status='published' and p_format='news')
    or (c.assigned_to is not null and c.assigned_to<>auth.uid()) then raise exception 'Esta pauta não está disponível para produção.'; end if;
  perform public.editorial_assert_current(c.id);
  select * into g from public.editorial_generations where id=p_request_id;
  if g.id is not null then
    if g.candidate_id<>c.id or g.requested_by<>auth.uid() or g.format<>p_format or g.instruction<>p_instruction or g.brief<>profile then raise exception 'Solicitação inválida.'; end if;
    if g.status='completed' then return jsonb_build_object('cached_content_id',g.content_id); end if;
    raise exception 'Solicitação já recebida. Atualize a lista de conteúdos antes de tentar novamente.';
  end if;
  select * into latest from public.editorial_contents where candidate_id=c.id and format=p_format order by revision desc limit 1;
  if coalesce(latest.revision,0)<>p_base_revision then raise exception 'Existe uma versão mais recente. Atualize o conteúdo.'; end if;
  if latest.id is not null and trim(p_instruction)='' and latest.facts_hash=c.facts_hash
    and public.editorial_brief_key(latest.brief,p_format)=public.editorial_brief_key(profile,p_format) then
    return jsonb_build_object('cached_content_id',latest.id);
  end if;
  update public.editorial_generations set status='failed',error_code='lease_expired' where candidate_id=c.id and format=p_format and status='pending' and lease_until<now();
  if exists(select 1 from public.editorial_generations where candidate_id=c.id and format=p_format and status='pending') then raise exception 'Já existe uma geração em andamento para este formato.'; end if;
  insert into public.editorial_settings(city_id) values(c.city_id) on conflict do nothing;
  select daily_ai_limit into quota from public.editorial_settings where city_id=c.city_id for update;
  insert into public.editorial_ai_usage as u(city_id,usage_date,requests) values(c.city_id,(now() at time zone 'America/Fortaleza')::date,1)
    on conflict(city_id,usage_date) do update set requests=u.requests+1 where u.requests<quota returning requests into used;
  if used is null then raise exception 'Limite diário de IA da cidade atingido.'; end if;
  insert into public.editorial_generations(id,candidate_id,city_id,requested_by,format,base_revision,facts_hash,instruction,brief)
    values(p_request_id,c.id,c.city_id,auth.uid(),p_format,p_base_revision,c.facts_hash,p_instruction,profile);
  update public.editorial_candidates set assigned_to=auth.uid(),status=case when news_id is not null then 'published' else 'writing' end,updated_at=now() where id=c.id;
  return jsonb_build_object('generation_id',p_request_id,'snapshot',c.snapshot,'previous_content',latest.content,'format',p_format,'instruction',p_instruction,'brief',profile);
end $$;
revoke all on function public.editorial_reserve_generation_styled(uuid,text,uuid,jsonb,text,integer) from public,anon;
grant execute on function public.editorial_reserve_generation_styled(uuid,text,uuid,jsonb,text,integer) to authenticated;

create or replace function public.editorial_finish_generation(p_generation_id uuid,p_content jsonb,p_model text,p_usage jsonb default '{}',p_error_code text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.editorial_generations; c public.editorial_candidates; new_content_id uuid; current_revision integer;
begin
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
  perform public.editorial_validate_script(p_content,g.format,g.brief);
  insert into public.editorial_contents(candidate_id,city_id,format,revision,content,source_snapshot,facts_hash,origin,model,created_by,brief)
    values(c.id,c.city_id,g.format,current_revision+1,p_content,c.snapshot,g.facts_hash,'ai',left(p_model,160),g.requested_by,g.brief) returning id into new_content_id;
  update public.editorial_generations set status='completed',content_id=new_content_id,usage=p_usage where id=g.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,new_content_id,g.requested_by,'generate');
  return new_content_id;
end $$;

create or replace function public.editorial_save_content(p_content_id uuid,p_content jsonb) returns uuid
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
  perform public.editorial_validate_script(p_content,old.format,old.brief);
  if old.content=p_content and old.facts_hash=c.facts_hash then return old.id; end if;
  insert into public.editorial_contents(candidate_id,city_id,format,revision,content,source_snapshot,facts_hash,origin,created_by,brief)
    values(c.id,c.city_id,old.format,old.revision+1,p_content,c.snapshot,c.facts_hash,'human',auth.uid(),old.brief) returning id into new_id;
  update public.editorial_candidates set status=case when news_id is not null then 'published' else 'writing' end,updated_at=now() where id=c.id;
  insert into public.editorial_decisions(city_id,candidate_id,content_id,actor_id,action) values(c.city_id,c.id,new_id,auth.uid(),'edit');
  return new_id;
end $$;

notify pgrst,'reload schema';
commit;
