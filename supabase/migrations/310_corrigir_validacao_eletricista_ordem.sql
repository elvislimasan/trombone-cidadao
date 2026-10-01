-- A validacao adicionada em 304 pertence a uma RPC, onde o registro e `d`.
-- Corrige tambem bancos que ja executaram a versao anterior da migracao.
begin;

do $migration$
declare
  v_definition text;
  v_references integer;
begin
  select pg_get_functiondef(
    'public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  v_references := (length(v_definition) - length(replace(v_definition, 'new.', ''))) / length('new.');
  if v_references = 0 and position('if d.atribuido_a is not null and d.category_id' in v_definition) > 0 then
    return;
  end if;
  if v_references <> 4 or position('if new.atribuido_a is not null and new.category_id' in v_definition) = 0 then
    raise exception 'Definicao inesperada de salvar_demanda_municipal; revise a validacao do eletricista';
  end if;

  v_definition := replace(v_definition, 'new.atribuido_a', 'd.atribuido_a');
  v_definition := replace(v_definition, 'new.category_id', 'd.category_id');
  v_definition := replace(v_definition, 'new.canal_id', 'd.canal_id');
  execute v_definition;
end $migration$;

commit;
