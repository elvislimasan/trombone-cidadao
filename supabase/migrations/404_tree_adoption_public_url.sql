begin;

-- Atualiza links futuros; os links antigos continuam atendidos pelo redirecionamento.
create or replace function public.notify_tree_adoption_availability() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_name text;
begin
  if new.status<>'disponivel' then return new; end if;
  if tg_op='UPDATE' and old.status='disponivel' then return new; end if;
  select city_id into v_city from public.city_tree_species where id=new.species_id;
  select name into v_name from public.cities where id=v_city for update;
  with recipients as (
    update public.tree_adoption_availability_alerts set notified_at=now()
    where city_id=v_city and notified_at is null returning user_id
  )
  insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    select user_id,'system','Mudas disponíveis para adoção',
      'Há mudas disponíveis em '||coalesce(v_name,'sua cidade')||'. Consulte as espécies e os fornecedores no programa Adote uma árvore.',
      '/adoteumaarvore?cidade='||v_city,false,now() from recipients;
  return new;
end $$;

create or replace function public.notify_tree_adoption_update() returns trigger
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
      '/adoteumaarvore?cidade='||r.city_id||'&aba=minhas&pedido='||r.id,false,now());
  return new;
end $$;

create or replace function public.is_username_reserved(p_username text)
returns boolean language sql immutable set search_path=public as $$
  select lower(trim(p_username)) in (
    'admin','administrator','suporte','support','trombone','trombonecidadao',
    'prefeitura','vereador','vereadores','mandato','oficial','governo','camara',
    'feed','mapa','bronca','broncas','obras','obras-publicas','estatisticas',
    'sobre','contato','noticia','noticias','servicos','guiadacidade','guia-da-cidade','perfil','login','cadastro',
    'entrar','sair','ajuda','termos','privacidade','patrulha','missoes',
    'agora','radar','pavimentacao','mapa-pavimentacao','arborizacao','mapa-arborizacao','adote-uma-arvore','adoteumaarvore','arvores-da-comunidade','abaixo-assinado',
    'abaixo-assinados','peticoes','favoritos','salvos-outros','obras-favoritas',
    'settings','configuracoes','explorar','seguindo','api','auth','share','u',
    'root','moderador','moderacao','sistema','ouvidoria','denuncia','relatorio',
    'buscar','app','convite','imoveis-alugados','meta','embaixador',
    'painel-usuario','alterar-senha','excluir-conta','minhas-peticoes'
  )
$$;

notify pgrst,'reload schema';
commit;
