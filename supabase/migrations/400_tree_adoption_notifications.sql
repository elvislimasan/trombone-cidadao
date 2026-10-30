begin;

-- Cada atualização confirmada do histórico gera uma única linha na central.
-- O Database Webhook de notifications usa essa mesma linha para o push FCM/Web.
-- Não depende de o solicitante estar com o aplicativo aberto.
create function public.notify_tree_adoption_update() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.tree_adoption_requests; v_status text; v_subject text;
begin
  select * into r from public.tree_adoption_requests where id=new.request_id;
  -- O envio inicial, respostas e cancelamentos do próprio cidadão já são
  -- confirmados na tela. O aviso é para atualizações recebidas da equipe.
  if not found or new.author_id=r.author_id then return new; end if;

  v_status=case new.status
    when 'solicitada' then 'Solicitação enviada'
    when 'em_analise' then 'Em análise técnica'
    when 'aguardando_informacao' then 'Aguardando informação'
    when 'aguardando_disponibilidade' then 'Aguardando disponibilidade'
    when 'aprovada' then 'Aprovada'
    when 'agendada' then 'Plantio agendado'
    when 'pronta_retirada' then 'Muda pronta para retirada'
    when 'concluida' then 'Solicitação atendida'
    when 'recusada' then 'Recusada'
    when 'cancelada' then 'Cancelada'
    else 'Nova orientação da equipe'
  end;
  v_subject=case r.request_type when 'plantio' then 'plantio' else 'mudas' end;
  insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    values(r.author_id,'tree_adoption_update','Atualização no pedido de '||v_subject,
      'ARV-'||upper(left(r.id::text,8))||': '||v_status||'. Confira as orientações da equipe.',
      '/adote-uma-arvore?cidade='||r.city_id||'&aba=minhas&pedido='||r.id,false,now());
  return new;
end $$;
revoke all on function public.notify_tree_adoption_update() from public,anon,authenticated;
create trigger tree_adoption_notify_update after insert on public.tree_adoption_events
  for each row execute function public.notify_tree_adoption_update();

notify pgrst,'reload schema';
commit;
