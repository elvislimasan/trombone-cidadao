begin;

do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position($old$'issue_type','service_type','prioridade'$old$ in definition)=0
    or position('issue_type=d.issue_type,service_type=d.service_type,prioridade=d.prioridade' in definition)=0
    or position($old$  v_execucao=d.status in ('aguardando_confirmacao','concluida')$old$ in definition)=0 then
    raise exception 'Definição inesperada de salvar_demanda_municipal'; end if;
  definition := replace(definition,
    $old$'issue_type','service_type','prioridade'$old$,
    $new$'issue_type','service_type','service_types','prioridade'$new$);
  definition := replace(definition,
    'issue_type=d.issue_type,service_type=d.service_type,prioridade=d.prioridade',
    'issue_type=d.issue_type,service_type=d.service_type,service_types=d.service_types,prioridade=d.prioridade');
  definition := replace(definition,
    $old$  v_execucao=d.status in ('aguardando_confirmacao','concluida')$old$,
    $new$  d.service_types=coalesce(d.service_types,'{}'::text[]);
  if d.service_type is not null and cardinality(d.service_types)=0 then
    d.service_types=array[d.service_type];
  end if;
  if cardinality(d.service_types)>0 and d.service_type is distinct from d.service_types[1] then
    raise exception 'Confira os serviços executados'; end if;
  v_execucao=d.status in ('aguardando_confirmacao','concluida')$new$);
  execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
