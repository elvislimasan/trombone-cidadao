begin;

-- Uma linha por destinatário no envio inicial. O webhook de notifications
-- entrega o push FCM/Web, respeitando permissões do aparelho e preferências.
-- Reenvios idempotentes não inserem pedidos nem disparam este trigger.
create function public.notify_tree_adoption_new_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    select p.id,'tree_adoption_new_request','Novo pedido de arborização',
      'ARV-'||upper(left(new.id::text,8))||': '||
        case new.request_type when 'plantio' then 'Solicitação de plantio' else 'Solicitação de mudas' end||
        ' em '||coalesce((select name from public.cities where id=new.city_id),'sua cidade')||'.',
      -- Admins sem atribuição operacional são avisados na central, sem lhes
      -- conceder acesso aos dados privados de atendimento da prefeitura.
      case when public.is_admin(p.id) and not public.is_master(p.id) then '/notificacoes'
        else '/prefeitura/adote-uma-arvore/solicitacoes?cidade='||new.city_id end,
      false,now()
    from public.profiles p
    where p.id<>new.author_id and (
      public.is_admin(p.id) or public.is_master(p.id)
      or public.pode_administrar_prefeitura(p.id,new.city_id)
      -- Mesmos critérios de pode_gerenciar_arborizacao, avaliados para o
      -- destinatário: auth.uid() aqui ainda é o cidadão que enviou o pedido.
      or public.municipal_inventory_action(p.id,new.city_id,'arborization')
      or exists(select 1 from public.tree_manager_cities a
        where a.user_id=p.id and a.city_id=new.city_id and not a.municipal_enabled
          and public.tree_management_membership(a.user_id,a.city_id,a.canal_id)
          and public.territorial_rule_allows(p.id,'arborization',false))
      or exists(select 1 from public.orgao_categorias c
        where c.city_id=new.city_id and c.category_id='poda'
          and public.municipal_channel_action(p.id,c.canal_id,'receive'))
    );
  return new;
end $$;
revoke all on function public.notify_tree_adoption_new_request() from public,anon,authenticated;
create trigger tree_adoption_notify_new_request after insert on public.tree_adoption_requests
  for each row execute function public.notify_tree_adoption_new_request();

notify pgrst,'reload schema';
commit;
