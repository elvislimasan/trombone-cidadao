begin;

-- Mantém os controles de cidade, vínculo ativo, secretaria, atribuição e
-- concorrência das RPCs existentes. A visibilidade da solicitação não muda.
create or replace function pg_temp.incluir_ofertas_internas(
  assinatura text, trecho text, substituto text
) returns void language plpgsql as $$
declare definicao text;
begin
  definicao := replace(pg_get_functiondef(assinatura::regprocedure), E'\r\n', E'\n');
  trecho := replace(trecho, E'\r\n', E'\n');
  substituto := replace(substituto, E'\r\n', E'\n');
  if position(trecho in definicao) = 0 then
    if position(substituto in definicao) > 0 then return; end if;
    raise exception 'Definição inesperada: %', assinatura;
  end if;
  execute replace(definicao, trecho, substituto);
end $$;

-- Lista paginada usada pelos cards de serviços disponíveis.
select pg_temp.incluir_ofertas_internas(
  'public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[])',
  $old$and r.status in ('pending','in-progress') and r.is_public
        and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false)$old$,
  $new$and r.status in ('pending','in-progress')
        and ((r.is_public and coalesce(r.moderation_status,'approved')='approved')
          or (not r.is_public and r.created_by_municipality=p_prefeitura and r.moderation_status='internal'))
        and not coalesce(r.is_petition,false)$new$
);

-- A prévia e a referência do poste usam esta outra consulta de ofertas.
select pg_temp.incluir_ofertas_internas(
  'public.listar_ofertas_eletricista(uuid,integer,integer,text,uuid,double precision,double precision)',
  $old$and r.is_public and coalesce(r.moderation_status, 'approved') = 'approved'$old$,
  $new$and ((r.is_public and coalesce(r.moderation_status, 'approved') = 'approved')
        or (not r.is_public and r.created_by_municipality=p_prefeitura and r.moderation_status='internal'))$new$
);

-- A busca de protocolos no mapa deve encontrar a mesma fila privada.
select pg_temp.incluir_ofertas_internas(
  'public.buscar_mapa_eletricista(uuid,text)',
  $old$and r.is_public and coalesce(r.moderation_status,'approved')='approved'$old$,
  $new$and ((r.is_public and coalesce(r.moderation_status,'approved')='approved')
        or (not r.is_public and r.created_by_municipality=p_prefeitura and r.moderation_status='internal'))$new$
);

-- NULL não pode liberar o aceite de um registro municipal inválido.
-- O aceite continua criando uma única ordem atribuída ao eletricista.
select pg_temp.incluir_ofertas_internas(
  'public.aceitar_oferta_eletricista(uuid,text,uuid)',
  $old$or not v_report.is_public
    or coalesce(v_report.moderation_status, 'approved') <> 'approved'$old$,
  $new$or not coalesce(
      (v_report.is_public and coalesce(v_report.moderation_status, 'approved') = 'approved')
      or (not v_report.is_public and v_report.created_by_municipality=p_prefeitura
        and v_report.moderation_status='internal'), false)$new$
);

-- Nenhuma política pública é ampliada e nenhum registro é publicado.
notify pgrst, 'reload schema';
commit;
