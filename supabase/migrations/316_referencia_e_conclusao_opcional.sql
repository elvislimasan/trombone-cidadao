begin;

alter table public.reports add column if not exists reference_point text;
alter table public.reports drop constraint if exists reports_reference_point_length;
alter table public.reports add constraint reports_reference_point_length check (char_length(reference_point) <= 240);

alter table public.demandas_municipais add column if not exists service_type text;
alter table public.demandas_municipais drop constraint if exists demandas_municipais_service_type_check;
alter table public.demandas_municipais add constraint demandas_municipais_service_type_check
  check (service_type is null or (category_id = 'iluminacao' and service_type in ('lamp_replacement', 'arm_installation', 'other')));

-- A versão 304 da RPC substituiu a versão 281 e restaurou estas duas exigências.
-- Removemos somente as guardas de resultado/evidência, preservando as demais validações.
do $migration$
declare
  definition text;
  result_guard text := 'if length(btrim(coalesce(d.resultado,'''')))<10 then raise exception ''Descreva o resultado do atendimento''; end if;';
  evidence_guard text := 'if v_count+jsonb_array_length(p_anexos)=0 and length(btrim(coalesce(d.registro_execucao,'''')))<20 then raise exception ''Anexe evidência ou descreva um registro técnico com pelo menos 20 caracteres''; end if;';
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(result_guard in definition) > 0 and position(evidence_guard in definition) > 0 then
    definition := replace(replace(definition, result_guard, ''), evidence_guard, '');
  elsif position(result_guard in definition) > 0 or position(evidence_guard in definition) > 0 then
    raise exception 'Validação parcial da conclusão da ordem; revise a função';
  end if;
  if position('''issue_type'',''service_type'',''prioridade''' in definition) = 0 then
    if position('''issue_type'',''prioridade''' in definition) = 0
      or position('issue_type=d.issue_type,prioridade=d.prioridade' in definition) = 0 then
      raise exception 'Definição inesperada da ordem para adicionar tipo de serviço';
    end if;
    definition := replace(definition, '''issue_type'',''prioridade''', '''issue_type'',''service_type'',''prioridade''');
    definition := replace(definition, 'issue_type=d.issue_type,prioridade=d.prioridade', 'issue_type=d.issue_type,service_type=d.service_type,prioridade=d.prioridade');
    definition := replace(definition, '''status'',''resultado'',''registro_execucao''', '''status'',''service_type'',''resultado'',''registro_execucao''');
  end if;
  execute definition;
end $migration$;

notify pgrst, 'reload schema';
commit;
