-- O tipo operacional da bronca de iluminação passa a viajar com o lote. Assim
-- o PDF separa lâmpada apagada, fiação exposta, poste inclinado etc., em vez de
-- entregar uma única lista de "Iluminação" para a equipe de campo.

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
      'report_id',       r.id,
      'protocolo',       r.protocol,
      'titulo',          coalesce(nullif(btrim(r.title), ''), 'Sem titulo'),
      'endereco',        coalesce(nullif(btrim(r.address), ''), 'Endereco nao informado'),
      'bairro',          nullif(btrim(r.neighborhood), ''),
      'foto',            coalesce(
                           r.featured_image_url,
                           (select m.url
                              from public.report_media m
                             where m.report_id = r.id
                               and m.type = 'photo'
                               and coalesce(m.is_resolution_proof, false) = false
                             order by m.created_at
                             limit 1)
                         ),
      'categoria',       coalesce(cat.name, r.category_id),
      'tipo_problema',   case when r.category_id = 'iluminacao' then r.issue_type else null end,
      'criada_em',       r.created_at,
      'dias_aberta',     greatest(0, extract(day from now() - r.created_at)::integer),
      'status',          r.status,
      'resolvida',       r.status = 'resolved',
      'recorrente',      coalesce(r.is_recurrent, false),
      'primeira_vez',    i.primeira_vez
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
  'Relatorio publico do lote, incluindo tipo do problema de iluminacao para agrupamento operacional no PDF.';
