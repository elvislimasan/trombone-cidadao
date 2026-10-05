begin;

-- Atualiza bancos que já executaram as migrações 331 e 335.
-- Visitas antigas são normalizadas na interface, preservando o histórico gravado.
do $migration$
declare
  signature text;
  definition text;
  old_service text := $old$'Serviço no poste '||left(coalesce(v_pole.identifier,v_pole.id::text),150)$old$;
  old_visit text := $old$'Atendimento no poste '||left(coalesce(v_pole.identifier,v_pole.id::text),150)$old$;
  new_visit text := $new$'Atendimento no poste '||left(regexp_replace(coalesce(v_pole.identifier,v_pole.id::text),'^[0-9]+[[:space:]]*[-–—][[:space:]]*',''),150)$new$;
begin
  foreach signature in array array[
    'public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid)',
    'public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Função de visita não encontrada: %', signature;
    end if;
    definition := pg_get_functiondef(to_regprocedure(signature));
    if position(old_service in definition) > 0 then
      execute replace(definition, old_service, new_visit);
    elsif position(old_visit in definition) > 0 then
      execute replace(definition, old_visit, new_visit);
    elsif position(new_visit in definition) = 0 then
      raise exception 'Formato inesperado do título na função: %', signature;
    end if;
  end loop;
end $migration$;

notify pgrst, 'reload schema';
commit;
