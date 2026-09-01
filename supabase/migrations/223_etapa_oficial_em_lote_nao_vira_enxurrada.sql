-- 223_etapa_oficial_em_lote_nao_vira_enxurrada.sql
--
-- Uma notificacao por pessoa, e nao uma por bronca.
--
-- O QUE ACONTECEU
--
-- A 207 criou `notificar_etapa_oficial` como gatilho FOR EACH ROW, e estava
-- certo para o mundo dela: um embaixador abre uma bronca e registra que o
-- oficio saiu. Uma etapa, uma bronca, uma notificacao com o endereco dentro.
--
-- A 222 criou um segundo caminho para a mesma tabela — `registrar_entrega_do_envio`
-- grava a etapa `encaminhada` de TODAS as broncas do relatorio numa tacada so,
-- quando o provedor confirma a entrega. No primeiro envio de um canal isso sao
-- centenas de linhas num unico INSERT. O gatilho por linha disparou uma vez para
-- cada uma, e quem participa de tres broncas recebeu tres avisos identicos
-- seguidos, com tres pushes no aparelho.
--
-- E o mesmo erro que a 222 tomou o cuidado de nao cometer com a cobranca mensal
-- ("um aviso mensal, para todos os participantes de toda bronca aberta, sem
-- noticia nenhuma dentro" — cabecalho da 222). So que ali a decisao foi nao
-- notificar; aqui a notificacao e legitima, o que sobra e a repeticao.
--
-- POR QUE STATEMENT E NAO UM `if` NO CAMINHO DO LOTE
--
-- A alternativa era o gatilho ignorar `registrado_por_papel = 'sistema'` e a
-- 222 inserir a notificacao agregada ela mesma. Funciona, e deixa o texto de
-- cada caminho ao lado de quem o dispara — mas cria duas copias da regra de
-- notificacao, e o dia em que existir um terceiro caminho em lote que nao seja
-- 'sistema' a enxurrada volta sem ninguem ter mudado nada.
--
-- Com gatilho por comando, a regra e uma so e o criterio deixa de ser "quem
-- inseriu" para ser "quantas broncas desta pessoa entraram neste comando" — que
-- e exatamente a pergunta que decide se o aviso deve ser especifico ou resumido.
-- O insert manual da 207 e um comando de uma linha, entao ele continua caindo no
-- ramo especifico por construcao, e nao por uma excecao que alguem precisa
-- lembrar de manter.
--
-- O TEXTO DO RESUMO CONTINUA DIZENDO QUE ENCAMINHAR NAO E RESOLVER
--
-- A 207 escreveu essa frase para "Encaminhada ao orgao" nao chegar no aparelho
-- parecendo "resolvido". Ela vale mais ainda no resumo, que ja perdeu o endereco
-- e poderia soar como um balanco de conquistas.

create or replace function public.notificar_etapa_oficial()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  with participacoes as (
    -- Uma linha por (pessoa, etapa, bronca) deste comando. O left join preserva
    -- o comportamento da 207 para bronca que sumiu no meio: cai no texto
    -- generico em vez de a pessoa nao ser avisada.
    select
      p.user_id,
      e.etapa,
      e.report_id,
      e.observacao,
      coalesce(nullif(btrim(r.address), ''), nullif(btrim(r.title), ''),
               'Uma bronca que voce acompanha') as onde
    from etapas_novas e
    left join public.reports r on r.id = e.report_id
    cross join lateral public.report_participants(e.report_id) p
  ),
  agregado as (
    -- Agrupa por etapa tambem, e nao so por pessoa: um comando que misturasse
    -- etapas diferentes nao pode virar um aviso so dizendo as duas coisas.
    select
      user_id,
      etapa,
      count(distinct report_id) as quantas,
      (array_agg(report_id  order by report_id))[1] as report_id,
      (array_agg(onde       order by report_id))[1] as onde,
      (array_agg(observacao order by report_id))[1] as observacao
    from participacoes
    group by user_id, etapa
  )
  insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
  select
    a.user_id,
    'status_update',

    case when a.quantas > 1 then
      case a.etapa
        when 'encaminhada' then 'Suas broncas foram encaminhadas ao orgao'
        when 'recebida'    then 'O orgao confirmou o recebimento de varias broncas'
        when 'programada'  then 'Varias broncas entraram na programacao do orgao'
        when 'executada'   then 'O orgao informou execucao em varias broncas'
        when 'recusada'    then 'O orgao recusou varias solicitacoes'
      end
    else
      -- Identico a 207. Este e o ramo do registro manual, que nao mudou.
      case a.etapa
        when 'encaminhada' then 'Encaminhada ao orgao responsavel'
        when 'recebida'    then 'O orgao confirmou o recebimento'
        when 'programada'  then 'Entrou na programacao do orgao'
        when 'executada'   then 'O orgao informou execucao'
        when 'recusada'    then 'O orgao recusou a solicitacao'
      end
    end,

    case when a.quantas > 1 then
      a.quantas || ' broncas que voce acompanha ' ||
      case a.etapa
        when 'encaminhada' then 'foram encaminhadas ao orgao responsavel.'
        when 'recebida'    then 'tiveram o recebimento confirmado pelo orgao.'
        when 'programada'  then 'entraram na programacao do orgao.'
        when 'executada'   then 'foram informadas como executadas pelo orgao.'
        when 'recusada'    then 'foram recusadas pelo orgao.'
      end ||
      case a.etapa
        when 'executada' then ' Ninguem confirmou no local ainda — se voce passar por la, diga como esta.'
        when 'recusada'  then ' Abra o painel para ver os motivos.'
        else ' Encaminhar nao e resolver: a execucao depende do orgao publico.'
      end
    else
      case a.etapa
        when 'executada'
          then left(a.onde, 80) || '. Ninguem confirmou no local ainda — se voce passar por la, diga como esta.'
        when 'recusada'
          then left(a.onde, 80) || '. Motivo: ' || coalesce(nullif(btrim(a.observacao), ''), 'nao informado') || '.'
        else
          left(a.onde, 80) || '. Encaminhar nao e resolver: a execucao depende do orgao publico.'
      end
    end,

    -- O resumo nao tem uma bronca para abrir. Vai para o painel do usuario, que
    -- ja abre na aba de broncas — a unica tela que mostra o conjunto.
    case when a.quantas > 1 then '/painel-usuario'
         else '/bronca/' || a.report_id end,
    case when a.quantas > 1 then null
         else a.report_id end,
    false,
    now()
  from agregado a;

  return null;
end;
$fn$;

comment on function public.notificar_etapa_oficial() is
  'Avisa os participantes quando o orgao mexe, uma vez por pessoa por comando. Uma bronca: o aviso especifico da 207. Varias: um resumo que leva ao painel. O texto nunca deixa "encaminhada" soar como "resolvida".';

-- `referencing new table` exige recriar o gatilho: nao da para trocar FOR EACH
-- ROW por FOR EACH STATEMENT com `create or replace`.
drop trigger if exists on_etapa_oficial_notify on public.report_official_steps;
create trigger on_etapa_oficial_notify
after insert on public.report_official_steps
referencing new table as etapas_novas
for each statement execute function public.notificar_etapa_oficial();
