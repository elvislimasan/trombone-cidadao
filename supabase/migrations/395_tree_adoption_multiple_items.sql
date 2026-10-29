begin;

-- Os contatos são uma fotografia do pedido, protegida pela mesma RLS da fila.
alter table public.tree_adoption_requests
  add column requester_name text check(length(requester_name) between 3 and 160),
  add column requester_phone text check(length(requester_phone)<=30),
  add column requester_email text check(length(requester_email)<=254),
  add column items jsonb not null default '[]'::jsonb;

-- Pedidos antigos representam uma unidade; não inventa contatos históricos.
update public.tree_adoption_requests set items=jsonb_build_array(jsonb_build_object('species_id',species_id,'provider',provider,'quantity',1));
alter table public.tree_adoption_requests add constraint tree_adoption_items_shape check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50);

-- Liga todas as árvores do plantio ao pedido, além de tree_id (primeira árvore).
alter table public.city_trees add column adoption_request_id uuid references public.tree_adoption_requests(id) on delete set null;
create index city_trees_adoption_request on public.city_trees(adoption_request_id) where adoption_request_id is not null;
update public.city_trees t set adoption_request_id=r.id from public.tree_adoption_requests r where r.tree_id=t.id;

create or replace function public.submit_tree_adoption(p_request jsonb) returns public.tree_adoption_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_city bigint; v_species uuid; v_id uuid; v_items jsonb; v_item jsonb; v_total integer=0; v_name text; v_seen uuid[]=array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para enviar a solicitação.' using errcode='42501'; end if;
  if p_request->>'commitment' is distinct from 'true' then raise exception 'Confirme o compromisso de cuidado e a avaliação técnica.'; end if;
  v_city=(p_request->>'city_id')::bigint; v_species=(p_request->>'species_id')::uuid; v_id=(p_request->>'id')::uuid;
  -- A mesma chave pode ser reenviada após uma falha de conexão sem duplicar pedidos.
  perform pg_advisory_xact_lock(hashtext(v_id::text));
  select * into r from public.tree_adoption_requests where id=v_id;
  if found then
    if r.author_id<>auth.uid() then raise exception 'Solicitação indisponível.' using errcode='42501'; end if;
    return r;
  end if;
  if v_city is distinct from 64 then
    raise exception 'A prefeitura desta cidade ainda não tem convênio com a plataforma Trombone Cidadão para oferta de mudas ou plantio de árvores. Procure a prefeitura municipal da sua cidade e sugira essa ideia!' using errcode='23514';
  end if;
  if coalesce(length(trim(p_request->>'requester_name')),0) not between 3 and 160
    or coalesce(p_request->>'requester_phone','') !~ '^[+0-9 ().-]+$'
    or length(regexp_replace(coalesce(p_request->>'requester_phone',''),'[^0-9]','','g')) not between 10 and 15 then
    raise exception 'Informe o nome completo e um telefone de contato com DDD.' using errcode='23514';
  end if;
  if coalesce(p_request->>'requester_email','')<>'' and (length(p_request->>'requester_email')>254
    or trim(p_request->>'requester_email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'Informe um e-mail válido.' using errcode='23514';
  end if;
  v_items=p_request->'items';
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'Informe as espécies e quantidades.' using errcode='23514'; end if;
  if jsonb_array_length(v_items) not between 1 and 50 then raise exception 'Escolha entre 1 e 50 espécies.' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,4}$' then raise exception 'Informe quantidades inteiras positivas.' using errcode='23514'; end if;
    if (v_item->>'quantity')::integer not between 1 and 1000 then raise exception 'Quantidade deve ser de 1 a 1.000.' using errcode='23514'; end if;
    v_total=v_total+(v_item->>'quantity')::integer;
    if (v_item->>'species_id')::uuid=any(v_seen) then raise exception 'Espécie repetida no pedido.' using errcode='23514'; end if;
    v_seen=array_append(v_seen,(v_item->>'species_id')::uuid);
    select common_name into v_name from public.city_tree_species where id=(v_item->>'species_id')::uuid and city_id=v_city;
    if not found then raise exception 'Escolha espécies cadastradas nesta cidade.' using errcode='23514'; end if;
    perform 1 from public.tree_species_availability where species_id=(v_item->>'species_id')::uuid and provider=v_item->>'provider' and status='disponivel' for share;
    if not found then raise exception 'Uma das espécies não está disponível no viveiro escolhido. Atualize o catálogo.' using errcode='23514'; end if;
  end loop;
  if v_total>1000 then raise exception 'O pedido pode ter até 1.000 mudas ou árvores.' using errcode='23514'; end if;
  v_species=(v_items->0->>'species_id')::uuid;
  if not exists(select 1 from public.city_tree_species where id=v_species and city_id=v_city) then
    raise exception 'Escolha uma espécie cadastrada nesta cidade.'; end if;
  if exists(select 1 from public.tree_species_availability where species_id=v_species and provider=v_items->0->>'provider' and status='indisponivel') then
    raise exception 'Esta espécie está indisponível no local escolhido. Escolha outro fornecedor ou espécie.'; end if;
  insert into public.tree_adoption_requests(id,city_id,author_id,request_type,zone,planting_place,purpose,overhead_wiring,species_id,provider,address,neighborhood,latitude,longitude,notes,items,requester_name,requester_phone,requester_email)
  values(v_id,v_city,auth.uid(),p_request->>'request_type',p_request->>'zone',p_request->>'planting_place',p_request->>'purpose',p_request->>'overhead_wiring',
    v_species,v_items->0->>'provider',trim(p_request->>'address'),nullif(trim(p_request->>'neighborhood'),''),
    (p_request->>'latitude')::double precision,(p_request->>'longitude')::double precision,nullif(trim(p_request->>'notes'),''),v_items,trim(p_request->>'requester_name'),trim(p_request->>'requester_phone'),nullif(trim(p_request->>'requester_email'),'')) returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message)
    values(r.id,auth.uid(),r.status,'Solicitação recebida. Aguarde a avaliação técnica e a confirmação de disponibilidade pela equipe de arborização.');
  return r;
end $$;

create or replace function public.update_tree_adoption(p_id uuid,p_expected_status text,p_status text,p_message text,p_details jsonb default '{}')
returns public.tree_adoption_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_staff boolean; v_allowed text[]; v_tree uuid; v_item jsonb; v_index integer; v_species uuid; v_provider text;
begin
  select * into r from public.tree_adoption_requests where id=p_id for update;
  if not found or auth.uid() is null then raise exception 'Solicitação indisponível.' using errcode='42501'; end if;
  v_staff=public.can_manage_tree_adoption(r.city_id);
  if not v_staff and r.author_id<>auth.uid() then raise exception 'Sem permissão nesta cidade.' using errcode='42501'; end if;
  if r.status is distinct from p_expected_status then raise exception 'O pedido foi atualizado por outra pessoa. Atualize a lista antes de continuar.'; end if;
  if r.status in ('concluida','recusada','cancelada') then raise exception 'Este pedido já foi encerrado.'; end if;
  if p_status is null or p_message is null or length(trim(p_message)) not between 5 and 3000 then raise exception 'Descreva a atualização (5 a 3000 caracteres).'; end if;
  if not v_staff then
    if p_status<>'cancelada' and not(p_status=r.status and r.status='aguardando_informacao') then
      raise exception 'Você pode cancelar o pedido ou responder à equipe quando houver informação pendente.' using errcode='42501'; end if;
  else
    if p_status=r.status then
      update public.tree_adoption_requests set updated_at=now() where id=r.id returning * into r;
      insert into public.tree_adoption_events(request_id,author_id,status,message) values(r.id,auth.uid(),r.status,trim(p_message));
      return r;
    end if;
    if p_status in ('aprovada','agendada','pronta_retirada','concluida','recusada','cancelada')
      and not public.can_dispatch_tree_adoption(r.city_id)
      and not(p_status='cancelada' and r.author_id=auth.uid()) then
      raise exception 'Esta etapa exige um gestor de arborização ou da secretaria responsável.' using errcode='42501'; end if;
    v_allowed=case r.status
      when 'solicitada' then array['em_analise','recusada']
      when 'em_analise' then array['aprovada','aguardando_informacao','aguardando_disponibilidade','recusada']
      when 'aguardando_informacao' then array['em_analise','aprovada','aguardando_disponibilidade','recusada']
      when 'aguardando_disponibilidade' then array['em_analise','aprovada','aguardando_informacao','recusada']
      when 'aprovada' then array[case when r.request_type='muda' then 'pronta_retirada' else 'agendada' end,'aguardando_informacao','aguardando_disponibilidade','recusada']
      when 'agendada' then array['concluida','aguardando_informacao','aguardando_disponibilidade','recusada']
      when 'pronta_retirada' then array['concluida','aguardando_informacao','aguardando_disponibilidade','recusada'] end;
    if not(p_status=any(v_allowed)) and p_status not in ('cancelada','concluida') then raise exception 'Etapa incompatível com o fluxo do pedido.'; end if;
    if p_status='aprovada' or (p_status='concluida' and r.approved_species_id is null) then
      r.approved_species_id=coalesce(nullif(p_details->>'species_id','')::uuid,r.species_id);
      if jsonb_array_length(r.items)>1 then r.approved_species_id=r.species_id; end if;
      r.confirmed_provider=coalesce(nullif(p_details->>'provider',''),r.provider);
      if jsonb_array_length(r.items)>1 then r.confirmed_provider=r.provider; end if;
      if not exists(select 1 from public.city_tree_species where id=r.approved_species_id and city_id=r.city_id)
        or r.confirmed_provider is null or r.confirmed_provider not in ('viveiro_municipal','instituto_florestar') then
        raise exception 'Confirme a espécie e o fornecedor para aprovar.'; end if;
      for v_item in select value from jsonb_array_elements(r.items) loop
        v_species=case when jsonb_array_length(r.items)=1 then r.approved_species_id else (v_item->>'species_id')::uuid end;
        v_provider=case when jsonb_array_length(r.items)=1 then r.confirmed_provider else v_item->>'provider' end;
        perform 1 from public.city_tree_species where id=v_species and city_id=r.city_id;
        if not found then raise exception 'Espécie fora do catálogo desta cidade.' using errcode='23514'; end if;
        perform 1 from public.tree_species_availability where species_id=v_species and provider=v_provider and status='disponivel' for share;
        if not found then raise exception 'Confirme a disponibilidade de todas as espécies nos viveiros escolhidos.' using errcode='23514'; end if;
      end loop;
      if exists(select 1 from public.tree_species_availability where species_id=r.approved_species_id and provider=r.confirmed_provider and status='indisponivel') then
        raise exception 'A espécie confirmada está indisponível neste fornecedor.'; end if;
    end if;
    if p_status='agendada' then
      r.scheduled_at=nullif(p_details->>'scheduled_at','')::timestamptz;
      if r.scheduled_at is null or r.scheduled_at<=now() then raise exception 'Informe uma data futura para o plantio.'; end if;
    end if;
    if p_status in ('agendada','pronta_retirada','concluida') and (r.approved_species_id is null or r.confirmed_provider is null) then
      raise exception 'A espécie e o fornecedor precisam estar confirmados.'; end if;
    if p_status='concluida' then
      r.fulfilled_on=nullif(p_details->>'fulfilled_on','')::date;
      if r.fulfilled_on is null or r.fulfilled_on>(now() at time zone 'America/Fortaleza')::date
        or r.fulfilled_on<(r.created_at at time zone 'America/Fortaleza')::date then
        raise exception 'Informe a data real do atendimento, entre a solicitação e hoje.'; end if;
      if r.request_type='plantio' then
        for v_item in select value from jsonb_array_elements(r.items) loop
        v_species=case when jsonb_array_length(r.items)=1 then r.approved_species_id else (v_item->>'species_id')::uuid end;
        for v_index in 1..(v_item->>'quantity')::integer loop
        insert into public.city_trees(city_id,species_id,bairro_id,common_name,latitude,longitude,address,planted_at,planted_by,notes,adoption_request_id)
          values(r.city_id,v_species,(select id from public.bairros where city_id=r.city_id
            and public.tree_catalog_key(name)=public.tree_catalog_key(r.neighborhood) order by id limit 1),
            'Não identificada',r.latitude,r.longitude,r.address,r.fulfilled_on,'prefeitura',
            'Plantio realizado pelo programa Adote uma árvore. Pedido '||r.id::text,r.id) returning id into v_tree;
        r.tree_id=coalesce(r.tree_id,v_tree);
        end loop;
        end loop;
      end if;
    end if;
  end if;
  update public.tree_adoption_requests set status=p_status,approved_species_id=r.approved_species_id,confirmed_provider=r.confirmed_provider,
    scheduled_at=r.scheduled_at,fulfilled_on=r.fulfilled_on,tree_id=r.tree_id,updated_at=now() where id=r.id returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message) values(r.id,auth.uid(),r.status,trim(p_message));
  return r;
end $$;
notify pgrst,'reload schema';
commit;
