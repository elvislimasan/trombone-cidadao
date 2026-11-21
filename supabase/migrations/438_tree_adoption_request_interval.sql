begin;

create index tree_adoption_requests_author_created on public.tree_adoption_requests(author_id,created_at desc);

-- Uma janela móvel por usuário, contada do envio, independentemente do status
-- e da modalidade. Edição e reenvio idempotente do mesmo pedido permanecem livres.
create function public.check_tree_adoption_request_interval() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_next timestamptz;
begin
  perform pg_advisory_xact_lock(438,hashtext(new.author_id::text));
  select max(r.created_at)+interval '720 hours' into v_next
    from public.tree_adoption_requests r where r.author_id=new.author_id;
  if v_next>clock_timestamp() then
    raise exception 'Você pode enviar 1 pedido a cada 30 dias. Novo pedido disponível em % (horário de Brasília).',
      to_char(v_next at time zone 'America/Fortaleza','DD/MM/YYYY "às" HH24:MI') using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.check_tree_adoption_request_interval() from public,anon,authenticated;
create trigger tree_adoption_request_interval before insert on public.tree_adoption_requests
  for each row execute function public.check_tree_adoption_request_interval();

notify pgrst,'reload schema';
commit;
