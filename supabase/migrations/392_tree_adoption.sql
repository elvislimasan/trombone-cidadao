begin;

-- Pedidos de muda e plantio têm etapas próprias, compartilhadas pelos painéis
-- de arborização e atendimento. Não cria uma bronca nem uma árvore antecipada.
create function public.can_manage_tree_adoption(p_city bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.pode_gerenciar_arborizacao(p_city)
    or public.pode_administrar_prefeitura(auth.uid(),p_city)
    or exists(select 1 from public.orgao_categorias c where c.city_id=p_city and c.category_id='poda'
      and public.municipal_channel_action(auth.uid(),c.canal_id,'receive')))
$$;
revoke all on function public.can_manage_tree_adoption(bigint) from public,anon;
grant execute on function public.can_manage_tree_adoption(bigint) to authenticated;

-- Atendentes recebem e respondem. Aprovação e confirmação da execução ficam
-- com o gestor/inventário de arborização ou o gestor municipal da categoria.
create function public.can_dispatch_tree_adoption(p_city bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.pode_gerenciar_arborizacao(p_city)
    or public.pode_administrar_prefeitura(auth.uid(),p_city)
    or exists(select 1 from public.orgao_categorias c where c.city_id=p_city and c.category_id='poda'
      and public.municipal_channel_action(auth.uid(),c.canal_id,'dispatch')))
$$;
revoke all on function public.can_dispatch_tree_adoption(bigint) from public,anon;
grant execute on function public.can_dispatch_tree_adoption(bigint) to authenticated;

create table public.tree_species_availability (
  species_id uuid not null references public.city_tree_species(id) on delete cascade,
  provider text not null check(provider in ('viveiro_municipal','instituto_florestar')),
  status text not null check(status in ('disponivel','indisponivel','sob_consulta')),
  instructions text check(length(instructions)<=1000),
  updated_at timestamptz not null default now(),
  primary key(species_id,provider)
);
alter table public.tree_species_availability enable row level security;
revoke all on public.tree_species_availability from public,anon,authenticated;
grant select on public.tree_species_availability to anon,authenticated;
grant insert,update on public.tree_species_availability to authenticated;
create policy adoption_availability_read on public.tree_species_availability for select using(true);
create policy adoption_availability_insert on public.tree_species_availability for insert to authenticated
  with check(exists(select 1 from public.city_tree_species s where s.id=species_id and public.can_manage_tree_adoption(s.city_id)));
create policy adoption_availability_update on public.tree_species_availability for update to authenticated
  using(exists(select 1 from public.city_tree_species s where s.id=species_id and public.can_manage_tree_adoption(s.city_id)))
  with check(exists(select 1 from public.city_tree_species s where s.id=species_id and public.can_manage_tree_adoption(s.city_id)));
create trigger adoption_availability_touch before update on public.tree_species_availability
  for each row execute function public.touch_city_tree();

create table public.tree_adoption_requests (
  id uuid primary key,
  city_id bigint not null references public.cities(id),
  author_id uuid not null references public.profiles(id),
  request_type text not null check(request_type in ('muda','plantio')),
  zone text not null check(zone in ('urbana','rural')),
  planting_place text not null check(planting_place in ('calcada','quintal','praca','avenida','outro')),
  purpose text not null check(purpose in ('sombra','ornamentacao','frutifera')),
  overhead_wiring text not null check(overhead_wiring in ('sim','nao','nao_sei')),
  species_id uuid not null references public.city_tree_species(id),
  provider text not null check(provider in ('viveiro_municipal','instituto_florestar')),
  address text not null check(length(trim(address)) between 5 and 300),
  neighborhood text check(length(neighborhood)<=160),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  notes text check(length(notes)<=3000),
  status text not null default 'solicitada' check(status in ('solicitada','em_analise','aguardando_informacao','aguardando_disponibilidade','aprovada','agendada','pronta_retirada','concluida','recusada','cancelada')),
  approved_species_id uuid references public.city_tree_species(id),
  confirmed_provider text check(confirmed_provider in ('viveiro_municipal','instituto_florestar')),
  scheduled_at timestamptz,
  fulfilled_on date,
  tree_id uuid references public.city_trees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index adoption_requests_city_status on public.tree_adoption_requests(city_id,status,created_at desc);
create index adoption_requests_author on public.tree_adoption_requests(author_id,created_at desc);
create table public.tree_adoption_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tree_adoption_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  status text not null,
  message text not null check(length(trim(message)) between 5 and 3000),
  created_at timestamptz not null default now()
);
create index adoption_events_request on public.tree_adoption_events(request_id,created_at);
alter table public.tree_adoption_requests enable row level security;
alter table public.tree_adoption_events enable row level security;
revoke all on public.tree_adoption_requests,public.tree_adoption_events from public,anon,authenticated;
grant select on public.tree_adoption_requests,public.tree_adoption_events to authenticated;
create policy adoption_requests_read on public.tree_adoption_requests for select to authenticated
  using(author_id=auth.uid() or public.can_manage_tree_adoption(city_id));
create policy adoption_events_read on public.tree_adoption_events for select to authenticated
  using(exists(select 1 from public.tree_adoption_requests r where r.id=request_id));

create function public.submit_tree_adoption(p_request jsonb) returns public.tree_adoption_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_city bigint; v_species uuid; v_id uuid;
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
  if not exists(select 1 from public.city_tree_species where id=v_species and city_id=v_city) then
    raise exception 'Escolha uma espécie cadastrada nesta cidade.'; end if;
  if exists(select 1 from public.tree_species_availability where species_id=v_species and provider=p_request->>'provider' and status='indisponivel') then
    raise exception 'Esta espécie está indisponível no local escolhido. Escolha outro fornecedor ou espécie.'; end if;
  insert into public.tree_adoption_requests(id,city_id,author_id,request_type,zone,planting_place,purpose,overhead_wiring,species_id,provider,address,neighborhood,latitude,longitude,notes)
  values(v_id,v_city,auth.uid(),p_request->>'request_type',p_request->>'zone',p_request->>'planting_place',p_request->>'purpose',p_request->>'overhead_wiring',
    v_species,p_request->>'provider',trim(p_request->>'address'),nullif(trim(p_request->>'neighborhood'),''),
    (p_request->>'latitude')::double precision,(p_request->>'longitude')::double precision,nullif(trim(p_request->>'notes'),'')) returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message)
    values(r.id,auth.uid(),r.status,'Solicitação recebida. Aguarde a avaliação técnica e a confirmação de disponibilidade pela equipe de arborização.');
  return r;
end $$;

create function public.update_tree_adoption(p_id uuid,p_expected_status text,p_status text,p_message text,p_details jsonb default '{}')
returns public.tree_adoption_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_staff boolean; v_allowed text[]; v_tree uuid;
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
    if not(p_status=any(v_allowed)) and p_status<>'cancelada' then raise exception 'Etapa incompatível com o fluxo do pedido.'; end if;
    if p_status='aprovada' then
      r.approved_species_id=nullif(p_details->>'species_id','')::uuid;
      r.confirmed_provider=p_details->>'provider';
      if not exists(select 1 from public.city_tree_species where id=r.approved_species_id and city_id=r.city_id)
        or r.confirmed_provider is null or r.confirmed_provider not in ('viveiro_municipal','instituto_florestar') then
        raise exception 'Confirme a espécie e o fornecedor para aprovar.'; end if;
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
        insert into public.city_trees(city_id,species_id,bairro_id,common_name,latitude,longitude,address,planted_at,planted_by,notes)
          values(r.city_id,r.approved_species_id,(select id from public.bairros where city_id=r.city_id
            and public.tree_catalog_key(name)=public.tree_catalog_key(r.neighborhood) order by id limit 1),
            'Não identificada',r.latitude,r.longitude,r.address,r.fulfilled_on,'prefeitura',
            'Plantio realizado pelo programa Adote uma árvore. Pedido '||r.id::text) returning id into v_tree;
        r.tree_id=v_tree;
      end if;
    end if;
  end if;
  update public.tree_adoption_requests set status=p_status,approved_species_id=r.approved_species_id,confirmed_provider=r.confirmed_provider,
    scheduled_at=r.scheduled_at,fulfilled_on=r.fulfilled_on,tree_id=r.tree_id,updated_at=now() where id=r.id returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message) values(r.id,auth.uid(),r.status,trim(p_message));
  return r;
end $$;
revoke all on function public.submit_tree_adoption(jsonb),public.update_tree_adoption(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_tree_adoption(jsonb),public.update_tree_adoption(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.is_username_reserved(p_username text)
returns boolean language sql immutable set search_path=public as $$
  select lower(trim(p_username)) in (
    'admin','administrator','suporte','support','trombone','trombonecidadao',
    'prefeitura','vereador','vereadores','mandato','oficial','governo','camara',
    'feed','mapa','bronca','broncas','obras','obras-publicas','estatisticas',
    'sobre','contato','noticia','noticias','servicos','guiadacidade','guia-da-cidade','perfil','login','cadastro',
    'entrar','sair','ajuda','termos','privacidade','patrulha','missoes',
    'agora','radar','pavimentacao','mapa-pavimentacao','arborizacao','mapa-arborizacao','adote-uma-arvore','abaixo-assinado',
    'abaixo-assinados','peticoes','favoritos','salvos-outros','obras-favoritas',
    'settings','configuracoes','explorar','seguindo','api','auth','share','u',
    'root','moderador','moderacao','sistema','ouvidoria','denuncia','relatorio',
    'buscar','app','convite','imoveis-alugados','meta','embaixador',
    'painel-usuario','alterar-senha','excluir-conta','minhas-peticoes'
  )
$$;
notify pgrst,'reload schema';
commit;
