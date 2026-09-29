-- A secretaria pode concluir uma ordem sem preencher um relato técnico ou enviar arquivos.
-- A situação da bronca vinculada continua aguardando verificação da comunidade.
do $$
declare
  definition text;
  result_guard text := 'if length(btrim(coalesce(d.resultado,'''')))<10 then raise exception ''Descreva o resultado do atendimento''; end if;';
  evidence_guard text := 'if v_count+jsonb_array_length(p_anexos)=0 and length(btrim(coalesce(d.registro_execucao,'''')))<20 then raise exception ''Anexe evidência ou descreva um registro técnico com pelo menos 20 caracteres''; end if;';
  public_result text := 'when d.status in (''aguardando_confirmacao'',''concluida'') then d.resultado';
  public_fallback text := 'when d.status in (''aguardando_confirmacao'',''concluida'') then coalesce(nullif(btrim(d.resultado),''''),''A prefeitura informou que o serviço foi executado.'')';
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(result_guard in definition) > 0 and position(evidence_guard in definition) > 0 then
    execute replace(replace(definition, result_guard, ''), evidence_guard, '');
  elsif position(result_guard in definition) > 0 or position(evidence_guard in definition) > 0 then
    raise exception 'Validação de conclusão da ordem parcialmente alterada. Revise a função.';
  end if;

  definition := pg_get_functiondef('public.publicar_estado_demanda(uuid,uuid,text)'::regprocedure);
  if position(public_result in definition) > 0 then
    execute replace(definition, public_result, public_fallback);
  elsif position(public_fallback in definition) = 0 then
    raise exception 'Publicação do estado da ordem não reconhecida. Revise a função.';
  end if;
end;
$$;
