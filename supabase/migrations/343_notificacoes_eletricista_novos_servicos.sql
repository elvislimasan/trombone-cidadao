-- O eletricista recebe ofertas e novas ordens atribuídas pela gestão.
-- Aceitar uma oferta ou registrar a própria visita não gera aviso nem push.
begin;

create or replace function public.filtrar_notificacao_atendimento_eletricista()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_ordem public.demandas_municipais%rowtype;
  v_ordem_id text;
begin
  if new.type is distinct from 'agency_case' then return new; end if;

  if new.link like '/prefeitura/demandas/%' then
    v_ordem_id := substr(new.link,length('/prefeitura/demandas/')+1);
  elsif new.link like '/prefeitura/eletricista/ordem/%' then
    v_ordem_id := substr(new.link,length('/prefeitura/eletricista/ordem/')+1);
  else
    return new; -- As ofertas de novas solicitações/broncas continuam sendo enviadas.
  end if;

  select * into v_ordem from public.demandas_municipais d
  where d.id::text=v_ordem_id and d.category_id='iluminacao';
  if not found then return new; end if;

  if not exists (
    select 1 from public.orgao_membros m
    join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
    join public.prefeituras p on p.city_id=c.city_id and p.id=v_ordem.prefeitura_id
    where m.user_id=new.user_id and m.ativo and m.papel='eletricista'
      and c.ativo and oc.city_id=p.city_id
      and (v_ordem.canal_id is null or m.canal_id=v_ordem.canal_id)
  ) then return new; end if;

  -- Filtrar antes do INSERT também impede o webhook de enviar o push.
  if new.user_id=auth.uid()
    or v_ordem.status not in ('aberta','triagem','programada','em_andamento')
    or new.title not in ('Atendimento atribuído a você','Ordem urgente atribuída','Ordem prioritária atribuída')
    or new.title is null then
    return null;
  end if;

  -- A ordem prioritária já tem seu aviso específico; não duplicar o genérico.
  if new.title='Atendimento atribuído a você' and v_ordem.prioridade in ('alta','urgente') then
    return null;
  end if;
  new.link := '/prefeitura/eletricista/ordem/'||v_ordem.id;
  return new;
end $$;

revoke all on function public.filtrar_notificacao_atendimento_eletricista() from public,anon,authenticated;
drop trigger if exists filtrar_notificacao_atendimento_eletricista on public.notifications;
create trigger filtrar_notificacao_atendimento_eletricista
before insert on public.notifications for each row
execute function public.filtrar_notificacao_atendimento_eletricista();

commit;
