begin;

-- Torna o campo "resultado" opcional em salvar_demanda_municipal.
-- Mantém a validação de 10 caracteres somente quando o campo é preenchido.
do $migration$
declare
  definition text;
  old_check text := $old$if length(btrim(coalesce(d.resultado,'')))<10 then
      raise exception 'Descreva o resultado do serviço com pelo menos 10 caracteres';
    end if;$old$;
  new_check text := $new$if length(btrim(coalesce(d.resultado,''))) between 1 and 9 then
      raise exception 'Se informado, o resultado do serviço deve ter pelo menos 10 caracteres';
    end if;$new$;
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(old_check in definition) = 0 then
    raise notice 'salvar_demanda_municipal: check de resultado obrigatório não encontrado, pulando';
  else
    definition := replace(definition, old_check, new_check);
    execute definition;
  end if;
end $migration$;

-- Torna o campo "resultado" opcional em resolver_ordem_eletricista.
-- Mantém a validação de comprimento somente quando preenchido.
do $migration$
declare
  definition text;
  old_check text := $old$if length(btrim(coalesce(p_poste->>'resultado','')))<10
    or length(btrim(p_poste->>'resultado'))>4000 then
    raise exception 'Descreva o resultado do serviço com 10 a 4000 caracteres';
  end if;$old$;
  new_check text := $new$if length(btrim(coalesce(p_poste->>'resultado',''))) between 1 and 9 then
    raise exception 'Se informado, o resultado do serviço deve ter pelo menos 10 caracteres';
  end if;
  if length(btrim(coalesce(p_poste->>'resultado','')))>4000 then
    raise exception 'O resultado do serviço deve ter no máximo 4000 caracteres';
  end if;$new$;
begin
  definition := pg_get_functiondef('public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)'::regprocedure);
  if position(old_check in definition) = 0 then
    raise exception 'Definição inesperada de resolver_ordem_eletricista';
  end if;
  definition := replace(definition, old_check, new_check);
  execute definition;
end $migration$;

notify pgrst, 'reload schema';
commit;
