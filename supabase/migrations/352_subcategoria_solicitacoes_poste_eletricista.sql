begin;

-- A subcategoria pertence à solicitação, não ao estado genérico do poste.
-- O PostgreSQL exige recriar a função para acrescentar uma coluna no retorno.
-- Sem CASCADE: uma dependência inesperada aborta a migração inteira.
drop function public.solicitacoes_ativas_poste_eletricista(uuid,bigint);

create function public.solicitacoes_ativas_poste_eletricista(p_prefeitura uuid,p_poste_id bigint)
returns table(report_id uuid,title text,ordem_id uuid,ordem_protocolo text,atribuida_a_mim boolean,issue_type text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select p.city_id into v_city from public.prefeituras p
  where p.id=p_prefeitura and p.status='ativa' and 'iluminacao'=any(p.categorias_habilitadas)
    and public.pode_acessar_prefeitura(auth.uid(),p.city_id);
  if v_city is null or not exists(
    select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=v_city and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
      and c.city_id=v_city and c.ativo and not c.canal_triagem
  ) then raise exception 'Acesso reservado aos eletricistas de iluminação'; end if;
  return query
  select r.id,r.title::text,d.id,d.protocolo::text,d.atribuido_a=auth.uid(),r.issue_type::text
  from public.reports r
  left join public.demanda_broncas b on b.report_id=r.id
  left join public.demandas_municipais d on d.id=b.demanda_id
  where r.city_id=v_city and r.pole_id=p_poste_id and r.category_id='iluminacao'
    and r.moderation_status is distinct from 'rejected'
    and r.status in ('pending','in-progress','pending_approval','pending_resolution')
  order by r.created_at,r.id;
end $$;
revoke all on function public.solicitacoes_ativas_poste_eletricista(uuid,bigint) from public,anon;
grant execute on function public.solicitacoes_ativas_poste_eletricista(uuid,bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
