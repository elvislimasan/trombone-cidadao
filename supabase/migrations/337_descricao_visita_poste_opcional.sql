begin;

-- Atualiza também bancos que já executaram as migrações 331 e 335.
-- A descrição da visita é opcional; quando preenchida, segue limitada a 1.000 caracteres.
do $migration$
declare
  signature text;
  definition text;
  old_check text := $old$  if cardinality(p_servicos)>0 and length(v_description) not between 5 and 1000 then
    raise exception 'Descreva o serviço com 5 a 1000 caracteres'; end if;$old$;
begin
  foreach signature in array array[
    'public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid)',
    'public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Função de visita não encontrada: %', signature;
    end if;
    definition := replace(pg_get_functiondef(to_regprocedure(signature)), E'\r\n', E'\n');
    if position(old_check in definition) > 0 then
      execute replace(definition, old_check, '');
    elsif position('Descreva o serviço com 5 a 1000 caracteres' in definition) > 0 then
      raise exception 'Validação inesperada na função: %', signature;
    end if;
  end loop;
end $migration$;

notify pgrst, 'reload schema';
commit;
