-- A secretaria pode executar o serviço antes de cadastrar uma pessoa na plataforma.
-- Atribuição a usuários, permissões, prazos e comprovação continuam validados.
do $$
declare
  definition text;
  previous_guard text := 'if d.canal_id is null or d.atribuido_a is null then raise exception ''Defina secretaria e responsável pelo atendimento''; end if;';
  next_guard text := 'if d.canal_id is null then raise exception ''Defina a secretaria responsável pelo atendimento''; end if;';
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(previous_guard in definition) > 0 then
    execute replace(definition, previous_guard, next_guard);
  elsif position(next_guard in definition) = 0 then
    raise exception 'Validação da ordem não reconhecida. Revise a função antes de aplicar esta alteração.';
  end if;
end;
$$;
