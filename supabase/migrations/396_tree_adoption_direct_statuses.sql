begin;

-- O status descreve o atendimento, sem exigir uma sequencia de etapas.
-- Preserva escopo municipal, concorrencia, confirmacoes e inventario.
create or replace function public.update_tree_adoption(p_id uuid,p_expected_status text,p_status text,p_message text,p_details jsonb default '{}')
returns public.tree_adoption_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_staff boolean; v_tree uuid; v_item jsonb; v_index integer; v_species uuid; v_provider text;
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
    if p_status not in ('solicitada','em_analise','aguardando_informacao','aguardando_disponibilidade','aprovada','agendada','pronta_retirada','concluida','recusada','cancelada') then
      raise exception 'Status invalido.' using errcode='23514';
    end if;
    if (p_status='agendada' and r.request_type<>'plantio') or (p_status='pronta_retirada' and r.request_type<>'muda') then
      raise exception 'Status incompativel com o tipo de atendimento.' using errcode='23514';
    end if;
    if p_status<>'agendada' then r.scheduled_at=null; end if;
    if p_status='aprovada' or (p_status in ('agendada','pronta_retirada','concluida') and r.approved_species_id is null) then
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
