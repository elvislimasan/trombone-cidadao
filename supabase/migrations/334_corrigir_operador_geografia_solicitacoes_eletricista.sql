begin;

-- O PostGIS fica em extensions; a funcao usa search_path=public,pg_temp.
-- Qualificar o operador permite localizar o poste mais proximo da solicitacao.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.solicitacoes_ordem_eletricista(uuid,uuid)'::regprocedure);
  if position('p.geom <-> r.location::extensions.geography' in definition)=0 then
    raise exception 'Definicao inesperada de solicitacoes_ordem_eletricista';
  end if;
  definition := replace(definition,
    'p.geom <-> r.location::extensions.geography',
    'p.geom operator(extensions.<->) r.location::extensions.geography');
  execute definition;
end $migration$;

commit;
