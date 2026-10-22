begin;

-- INSERT ... RETURNING aplica a policy SELECT à linha recém-criada. Uma
-- função STABLE que busca reports pelo ID ainda não enxerga essa linha no
-- snapshot do comando. Avaliar os campos da linha mantém o mesmo escopo de
-- cidade/secretaria, inclusive antes da criação do caso de atendimento.
create or replace function public.municipal_report_row_access(
  p_user uuid, p_report uuid, p_city bigint, p_category text, p_action text default 'read'
)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and (
    public.pode_administrar_prefeitura(p_user,p_city)
    or exists(select 1 from public.orgao_casos c where c.report_id=p_report
      and public.municipal_channel_action(p_user,c.canal_id,p_action))
    or (p_action='read' and exists(select 1 from public.demanda_broncas b
      where b.report_id=p_report and public.pode_ver_demanda(p_user,b.demanda_id)))
    or (not exists(select 1 from public.orgao_casos c where c.report_id=p_report)
      and exists(select 1 from public.orgao_categorias oc
        where oc.city_id=p_city and oc.category_id=p_category
          and public.municipal_channel_action(p_user,oc.canal_id,p_action))))
$$;
revoke all on function public.municipal_report_row_access(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.municipal_report_row_access(uuid,uuid,bigint,text,text) to authenticated;

-- Os chamadores que recebem somente um ID conservam a exigência de o
-- registro existir e compartilham a mesma regra usada pela policy.
create or replace function public.municipal_report_access(p_user uuid,p_report uuid,p_action text default 'read')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reports r where r.id=p_report
    and public.municipal_report_row_access(p_user,r.id,r.city_id,r.category_id,p_action))
$$;

alter policy reports_responsibility_scope on public.reports
  using(is_public or public.is_admin(auth.uid()) or public.is_master(auth.uid())
    or public.municipal_report_row_access(auth.uid(),id,city_id,category_id));

notify pgrst,'reload schema';
commit;
