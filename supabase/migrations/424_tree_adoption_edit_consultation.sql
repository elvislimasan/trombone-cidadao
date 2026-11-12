begin;

-- Edição registra uma preferência pendente. A aprovação continua exigindo
-- disponibilidade confirmada em update_tree_adoption e no gatilho existente.
create or replace function public.edit_tree_adoption(p_id uuid,p_expected_updated_at timestamptz,p_changes jsonb)
returns public.tree_adoption_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.tree_adoption_requests; v_staff boolean; v_items jsonb; v_item jsonb;
  v_seen uuid[]=array[]::uuid[]; v_species uuid; v_provider text; v_total integer=0;
  v_name text; v_phone text; v_email text; v_address text; v_reference text;
  v_lat double precision; v_lng double precision;
begin
  select * into r from public.tree_adoption_requests where id=p_id for update;
  if not found or auth.uid() is null then raise exception 'Solicitação indisponível.' using errcode='42501'; end if;
  v_staff=coalesce(public.can_dispatch_tree_adoption(r.city_id),false);
  if not v_staff and r.author_id<>auth.uid() then raise exception 'Sem permissão para alterar este pedido.' using errcode='42501'; end if;
  if r.status in ('concluida','recusada','cancelada') then raise exception 'Este pedido já foi encerrado.' using errcode='23514'; end if;
  if p_expected_updated_at is null or r.updated_at is distinct from p_expected_updated_at then
    raise exception 'O pedido foi atualizado por outra pessoa. Atualize a lista antes de editar.' using errcode='40001';
  end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or octet_length(p_changes::text)>20000 then
    raise exception 'Dados de edição inválidos.' using errcode='23514';
  end if;
  if p_changes->>'request_type' is distinct from r.request_type then
    raise exception 'O tipo do pedido não pode ser alterado. Faça uma nova solicitação.' using errcode='23514';
  end if;
  if p_changes->>'zone' not in ('urbana','rural')
    or p_changes->>'planting_place' not in ('calcada','quintal','praca','avenida','outro')
    or p_changes->>'purpose' not in ('sombra','ornamentacao','frutifera')
    or p_changes->>'overhead_wiring' not in ('sim','nao','nao_sei') then
    raise exception 'Confira os dados do local e a finalidade.' using errcode='23514';
  end if;
  v_name=btrim(p_changes->>'requester_name');
  v_phone=btrim(p_changes->>'requester_phone');
  v_email=nullif(btrim(p_changes->>'requester_email'),'');
  v_address=btrim(p_changes->>'address');
  v_reference=nullif(btrim(p_changes->>'reference_point'),'');
  if coalesce(length(v_name),0) not between 3 and 160
    or coalesce(v_phone,'') !~ '^[+0-9 ().-]+$'
    or length(regexp_replace(coalesce(v_phone,''),'[^0-9]','','g')) not between 10 and 15
    or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) then
    raise exception 'Confira o nome, telefone e e-mail de contato.' using errcode='23514';
  end if;
  if coalesce(length(v_address),0) not between 5 and 300
    or length(coalesce(v_reference,''))>300
    or length(coalesce(p_changes->>'neighborhood',''))>160
    or length(coalesce(p_changes->>'notes',''))>3000 then
    raise exception 'Confira o endereço, o ponto de referência e as observações.' using errcode='23514';
  end if;
  v_lat=(p_changes->>'latitude')::double precision;
  v_lng=(p_changes->>'longitude')::double precision;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Marque um ponto válido no mapa.' using errcode='23514';
  end if;
  v_items=p_changes->'items';
  if jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'Escolha as espécies e quantidades do pedido.' using errcode='23514';
  end if;
  if jsonb_array_length(v_items) not between 1 and 50 then
    raise exception 'Escolha as espécies e quantidades do pedido.' using errcode='23514';
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,4}$' then
      raise exception 'Informe quantidades inteiras positivas.' using errcode='23514';
    end if;
    if (v_item->>'quantity')::integer not between 1 and 1000 then
      raise exception 'A quantidade por espécie deve ser de 1 a 1.000.' using errcode='23514';
    end if;
    v_total=v_total+(v_item->>'quantity')::integer;
    v_species=(v_item->>'species_id')::uuid;
    v_provider=v_item->>'provider';
    if v_species=any(v_seen) then raise exception 'Espécie repetida no pedido.' using errcode='23514'; end if;
    v_seen=array_append(v_seen,v_species);
    if not exists(select 1 from public.city_tree_species where id=v_species and city_id=r.city_id) then
      raise exception 'Escolha espécies cadastradas nesta cidade.' using errcode='23514';
    end if;
    perform 1 from public.tree_species_availability
      where species_id=v_species and provider=v_provider and status in ('disponivel','sob_consulta') for share;
    if not found then
      raise exception 'Uma espécie não está disponível nem sob consulta neste viveiro. Escolha outra espécie ou fornecedor.' using errcode='23514';
    end if;
  end loop;
  if v_total>1000 or (r.request_type='muda' and v_total>6) then
    raise exception 'A quantidade ultrapassa o limite do pedido.' using errcode='23514';
  end if;
  update public.tree_adoption_requests set
    zone=p_changes->>'zone',planting_place=p_changes->>'planting_place',purpose=p_changes->>'purpose',
    overhead_wiring=p_changes->>'overhead_wiring',items=v_items,
    species_id=(v_items->0->>'species_id')::uuid,provider=v_items->0->>'provider',
    requester_name=v_name,requester_phone=v_phone,requester_email=v_email,
    address=v_address,reference_point=v_reference,
    neighborhood=nullif(btrim(p_changes->>'neighborhood'),''),latitude=v_lat,longitude=v_lng,
    notes=nullif(btrim(p_changes->>'notes'),''),status='em_analise',
    approved_species_id=null,confirmed_provider=null,scheduled_at=null,
    updated_at=greatest(clock_timestamp(),r.updated_at+interval '1 microsecond')
    where id=r.id returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message)
    values(r.id,auth.uid(),r.status,case when v_staff then
      'Pedido ajustado pelo gestor. Espécies e local aguardam nova avaliação.'
      else 'Pedido alterado pelo solicitante. Espécies e local aguardam nova avaliação.' end);
  return r;
end $$;

revoke all on function public.edit_tree_adoption(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.edit_tree_adoption(uuid,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
