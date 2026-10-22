-- Resultado, nota técnica e anexos são opcionais na conclusão dos executores.
-- Preserva atribuição, atividade, serviços executados, versão e auditoria.
begin;
do $migration$
declare
  definition text;
  result_guard text := $guard$if d.status<>'em_andamento' or length(v_result)<10 then raise exception 'Inicie o serviço e descreva o resultado com pelo menos 10 caracteres.'; end if;$guard$;
  evidence_guard text := $guard$if jsonb_array_length(p_anexos)=0 and length(coalesce(v_note,''))<20 then raise exception 'Anexe evidência ou registre uma nota técnica com pelo menos 20 caracteres.'; end if;$guard$;
begin
  definition := pg_get_functiondef('public.registrar_execucao_executor(uuid,uuid,text,integer,uuid,text,uuid,jsonb,jsonb)'::regprocedure);
  if position(result_guard in definition)=0 or position(evidence_guard in definition)=0 then
    raise exception 'Contrato inesperado de registrar_execucao_executor. Confira as migrações anteriores.';
  end if;
  definition := replace(definition, result_guard, $guard$if d.status<>'em_andamento' then raise exception 'Inicie o serviço antes de registrar a execução.'; end if;$guard$);
  definition := replace(definition, evidence_guard, '');
  execute definition;
end $migration$;
notify pgrst, 'reload schema';
commit;
