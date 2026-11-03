begin;

-- Citizen receipt is separate from the municipal status-management RPC.
-- It confirms delivery of seedlings; it never creates a planted inventory tree.
create function public.confirm_tree_adoption_receipt(p_id uuid)
returns public.tree_adoption_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para confirmar o recebimento.' using errcode='42501'; end if;
  select * into r from public.tree_adoption_requests where id=p_id for update;
  if not found or r.author_id<>auth.uid() then
    raise exception 'Solicitação indisponível para esta conta.' using errcode='42501';
  end if;
  if r.request_type<>'muda' then
    raise exception 'A confirmação de recebimento é exclusiva para retirada de mudas.' using errcode='23514';
  end if;
  -- A repeated click or a retry after a lost response must not duplicate history.
  if r.status='concluida' then return r; end if;
  if r.status<>'pronta_retirada' then
    raise exception 'O pedido precisa estar pronto para retirada. Atualize a lista para conferir o andamento.' using errcode='40001';
  end if;
  update public.tree_adoption_requests
    set status='concluida',fulfilled_on=(now() at time zone 'America/Fortaleza')::date,updated_at=now()
    where id=r.id returning * into r;
  insert into public.tree_adoption_events(request_id,author_id,status,message)
    values(r.id,auth.uid(),'concluida','O solicitante confirmou o recebimento de todas as mudas do pedido. Atendimento encerrado.');
  return r;
end $$;
revoke all on function public.confirm_tree_adoption_receipt(uuid) from public,anon;
grant execute on function public.confirm_tree_adoption_receipt(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
