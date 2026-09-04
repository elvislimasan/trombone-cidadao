-- 225_relatorio_publico_com_foto_e_protocolo.sql
--
-- A pagina do orgao ganha filtro, paginacao e foto — e a RPC precisa alimentar
-- isso.
--
-- O QUE ENTRA
--
--   protocol            o numero que o morador ve no app (TROMB-...). E o que a
--                       secretaria tem como citar num oficio de volta.
--   foto                a imagem da demanda. Ja e publica em /bronca/<id>; aqui
--                       ela evita que a lista seja 219 linhas de texto onde
--                       nada se distingue.
--
-- DE ONDE VEM A FOTO — E POR QUE NAO E SO `featured_image_url`
--
-- `reports.featured_image_url` parece a resposta e nao e: neste banco ela esta
-- preenchida em 89 de 593 registros. A midia de verdade mora em `report_media`,
-- uma linha por arquivo. Ler so a coluna deixava 163 das 219 demandas de um
-- relatorio sem imagem — e a lista inteira parecia quebrada.
--
-- Entao: `featured_image_url` quando existir (e a escolha explicita de quem
-- destacou), senao a primeira foto de `report_media`.
--
-- `is_resolution_proof` FICA DE FORA, E ISSO IMPORTA
--
-- Foto de prova de resolucao mostra o problema JA CONSERTADO. Usa-la como
-- miniatura de uma demanda pendente faria o relatorio da secretaria exibir, ao
-- lado de "sem solucao", a imagem de uma obra pronta. Seria o mesmo erro que a
-- 222 evita no texto: afirmar com a imagem o que os dados nao dizem.
--   neighborhood        o bairro, para filtrar e para a coluna de endereco.
--   is_recurrent        o selo RECORRENTE.
--   status              a situacao, para a coluna e o filtro.
--
-- O QUE CONTINUA DE FORA, E POR QUE
--
-- Nada sobre quem registrou: nem autor, nem se foi anonimo. E a mesma linha da
-- 222 — esta pagina e alcancavel por qualquer pessoa que receba o e-mail
-- encaminhado, e a lista de demandas de uma cidade nao precisa dizer quem
-- reclamou de que para ser util a secretaria.
--
-- O token tambem nao volta. Ele autoriza confirmar recebimento; devolve-lo no
-- corpo do JSON seria distribui-lo para qualquer coisa que leia a resposta.

create or replace function public.relatorio_publico_do_orgao(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  v_envio  record;
  v_canal  record;
  v_cidade text;
  v_uf     text;
  v_itens  jsonb;
begin
  select * into v_envio from public.orgao_envios where token = p_token;
  if not found then
    return jsonb_build_object('encontrado', false);
  end if;

  select * into v_canal from public.orgao_canais where id = v_envio.canal_id;

  select ci.name, st.uf into v_cidade, v_uf
  from public.cities ci
  left join public.states st on st.id = ci.state_id
  where ci.id = v_canal.city_id;

  select coalesce(jsonb_agg(x order by x->>'criada_em' desc), '[]'::jsonb) into v_itens
  from (
    select jsonb_build_object(
      'report_id',   r.id,
      'protocolo',   r.protocol,
      'titulo',      coalesce(nullif(btrim(r.title), ''), 'Sem titulo'),
      'endereco',    coalesce(nullif(btrim(r.address), ''), 'Endereco nao informado'),
      'bairro',      nullif(btrim(r.neighborhood), ''),
      'foto',        coalesce(
                       r.featured_image_url,
                       (select m.url
                          from public.report_media m
                         where m.report_id = r.id
                           and m.type = 'photo'
                           and coalesce(m.is_resolution_proof, false) = false
                         order by m.created_at
                         limit 1)
                     ),
      'categoria',   coalesce(cat.name, r.category_id),
      'criada_em',   r.created_at,
      'dias_aberta', greatest(0, extract(day from now() - r.created_at)::integer),
      'status',      r.status,
      'resolvida',   r.status = 'resolved',
      'recorrente',  coalesce(r.is_recurrent, false),
      'primeira_vez', i.primeira_vez
    ) as x
    from public.orgao_envio_itens i
    join public.reports r on r.id = i.report_id
    left join public.categories cat on cat.id = r.category_id
    where i.envio_id = v_envio.id
  ) s;

  return jsonb_build_object(
    'encontrado',    true,
    'orgao',         v_canal.nome,
    'cidade',        v_cidade,
    'uf',            v_uf,
    'periodo',       v_envio.periodo,
    'referencia',    v_envio.referencia,
    'enviado_em',    v_envio.enviado_em,
    'confirmado_em', v_envio.confirmado_em,
    'protocolo',     v_envio.protocolo_informado,
    'total',         v_envio.total_broncas,
    'broncas',       v_itens
  );
end;
$fn$;

comment on function public.relatorio_publico_do_orgao(uuid) is
  'O relatorio como a secretaria o le, sem login: foto, protocolo, bairro e situacao de cada demanda. Nao devolve o token nem nada sobre quem registrou.';
