-- 224_relatorio_do_orgao_so_pendentes.sql
--
-- O relatorio para a secretaria leva so o que esta pendente.
--
-- O QUE ESTAVA ERRADO
--
-- A 222 escreveu `r.status in ('pending', 'in-progress')`. A ideia era que
-- 'in-progress' significa "aberta, ainda nao resolvida", e portanto ainda e
-- cobranca legitima.
--
-- Na pratica diz outra coisa para quem le. 'in-progress' e o estado de uma
-- bronca que a propria prefeitura ja assumiu — ela aparece no app como "em
-- andamento". Manda-la de volta na caixa de entrada da secretaria, junto das
-- que ela nunca viu, e cobrar de novo algo que ja foi aceito. Some ao fato de
-- que o relatorio semanal se apresenta como "chegou isto", e o e-mail passa a
-- afirmar novidade sobre demanda que a secretaria ja esta tratando.
--
-- 'resolved' nunca entrou, e continua fora.
--
-- O QUE ISTO NAO DESFAZ
--
-- `orgao_envio_itens` de envios ja feitos esta congelado, e as etapas
-- `encaminhada` ja gravadas sao append-only (207). Uma bronca em andamento que
-- ja saiu num relatorio continua tendo a etapa. Isto muda os proximos envios.
--
-- Efeito colateral, e ele e desejado: uma bronca que era 'pending' e virou
-- 'in-progress' entre dois relatorios mensais simplesmente para de ser cobrada.
-- E o comportamento certo — o mensal existe para cobrar o que ninguem assumiu.

create or replace function public.relatorio_do_orgao(
  p_canal   uuid,
  p_periodo text
)
returns table (
  report_id    uuid,
  titulo       text,
  endereco     text,
  categoria    text,
  criada_em    timestamptz,
  dias_aberta  integer,
  apoios       integer,
  primeira_vez boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with candidatas as (
    select
      r.id, r.title, r.address, r.category_id, r.created_at,
      not exists (
        select 1
        from public.orgao_envio_itens i
        join public.orgao_envios e on e.id = i.envio_id
        where i.report_id = r.id and e.canal_id = p_canal
      ) as nunca_enviada
    from public.reports r
    join public.orgao_canais c
      on c.id = p_canal and c.city_id = r.city_id
    join public.orgao_categorias oc
      on oc.canal_id = c.id and oc.category_id = r.category_id
    where coalesce(r.moderation_status, 'approved') = 'approved'
      -- SO 'pending'. Ver o cabecalho deste arquivo: 'in-progress' e demanda
      -- que o orgao ja assumiu, e recobrar o que foi aceito desgasta o canal.
      and r.status = 'pending'
      and coalesce(r.is_petition, false) = false
  )
  select
    cd.id,
    coalesce(nullif(btrim(cd.title), ''), 'Sem titulo'),
    coalesce(nullif(btrim(cd.address), ''), 'Endereco nao informado'),
    coalesce(cat.name, cd.category_id),
    cd.created_at,
    greatest(0, extract(day from now() - cd.created_at)::integer),
    (select count(*)::integer from public.signatures s where s.report_id = cd.id),
    cd.nunca_enviada
  from candidatas cd
  left join public.categories cat on cat.id = cd.category_id
  where p_periodo <> 'semanal' or cd.nunca_enviada
  order by cd.created_at;
$fn$;

comment on function public.relatorio_do_orgao(uuid, text) is
  'As broncas de um relatorio: so as pendentes. Semanal: as que esta secretaria ainda nao viu. Mensal: todas as pendentes daquelas categorias. Em andamento e resolvida ficam de fora.';
