begin;

-- Mantém a RPC anterior para clientes já publicados. A consulta filtrada
-- deriva da definição instalada, preservando acesso, ofertas internas e busca.
do $migration$
declare
  definition text;
  old_args text := $old$p_adiadas text[] DEFAULT '{}'::text[])$old$;
  old_where text := $old$where (p_aba='disponiveis' or o.etapa=p_etapa)$old$;
begin
  definition=replace(pg_get_functiondef('public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[])'::regprocedure),E'\r\n',E'\n');
  if position(old_args in definition)=0 or position(old_where in definition)=0 then
    raise exception 'Consulta do painel do eletricista incompatível.'; end if;
  definition=replace(definition,'FUNCTION public.listar_painel_eletricista(', 'FUNCTION public.listar_painel_eletricista_por_servico(');
  definition=replace(definition,old_args,$new$p_adiadas text[] DEFAULT '{}'::text[], p_tipo_servico text DEFAULT '')$new$);
  definition=replace(definition,old_where,$new$where (p_aba='disponiveis' or o.etapa=p_etapa)
        and (coalesce(p_tipo_servico,'')=''
          or (p_tipo_servico like 'problema:%' and (
            o.issue_type=substring(p_tipo_servico from 10)
            or (o.tipo='ordem' and exists(select 1 from public.demanda_broncas b
              join public.reports r on r.id=b.report_id
              where b.demanda_id=o.id and r.city_id=v_city and r.category_id='iluminacao'
                and r.issue_type=substring(p_tipo_servico from 10)))))
          or (p_tipo_servico like 'servico:%' and o.tipo='ordem' and exists(
            select 1 from public.demandas_municipais d where d.id=o.id and d.prefeitura_id=p_prefeitura
              and (d.service_type=substring(p_tipo_servico from 9)
                or substring(p_tipo_servico from 9)=any(d.service_types)))))$new$);
  execute definition;
end $migration$;
revoke all on function public.listar_painel_eletricista_por_servico(uuid,text,text,text,text,integer,integer,text[],text) from public,anon;
grant execute on function public.listar_painel_eletricista_por_servico(uuid,text,text,text,text,integer,integer,text[],text) to authenticated;

notify pgrst,'reload schema';
commit;
