-- Correção incremental: preserva 369–375 e os cargos já concedidos.
begin;

-- RENAME conserva o OID: policies antigas continuaram apontando para o helper
-- revogado em 374. Reanalisar as expressões liga as policies à autoridade atual.
-- Não devolver EXECUTE ao helper antigo: isso reabriria a regra anterior.
do $migration$
declare p record; statement text;
begin
  for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
    where schemaname in ('public','storage')
      and (coalesce(qual,'') ~ '\mcan_write_before_departments\M'
        or coalesce(with_check,'') ~ '\mcan_write_before_departments\M') loop
    statement=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
    if p.qual is not null then statement=statement||format(' using (%s)',regexp_replace(p.qual,'\mcan_write_before_departments\M','can_write','g')); end if;
    if p.with_check is not null then statement=statement||format(' with check (%s)',regexp_replace(p.with_check,'\mcan_write_before_departments\M','can_write','g')); end if;
    execute statement;
  end loop;
end $migration$;

-- Policies de leitura pública também chamam esse avaliador. O helper apenas
-- calcula a autorização; escrita continua sujeita às policies e ao usuário.
grant execute on function public.can_write(uuid,text) to anon,authenticated;

-- Identificar a sessão na mesma consulta que entrega o workspace permite ao
-- cliente rejeitar respostas anônimas ou de uma conta anterior, sem confundir
-- falha de sessão com inexistência de vínculo municipal.
do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.municipal_workspace_access()'::regprocedure);
  if position('''actor_user_id''' in definition)=0 then
    if position('select base.value||jsonb_build_object(' in definition)=0 then
      raise exception 'Workspace incompatível: aplique a migração 374 antes da 376.';
    end if;
    execute replace(definition,'select base.value||jsonb_build_object(',
      'select base.value||jsonb_build_object(''actor_user_id'',auth.uid(),');
  end if;
end $migration$;

notify pgrst,'reload schema';
commit;
