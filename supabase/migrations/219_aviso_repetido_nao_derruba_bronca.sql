-- 219_aviso_repetido_nao_derruba_bronca.sql
--
-- A protecao muda de lugar: sai de dentro das funcoes e vai para a TABELA.
--
-- POR QUE A 218 NAO BASTOU
--
-- A 218 pos `on conflict do nothing` em `notify_admins_new_report`, e o erro
-- voltou — com um `report_id` NOVO (422acc89..., depois de e9a973db...). Duas
-- conclusoes seguem disso:
--
--   1. nao e reuso de id nem notificacao orfa;
--   2. quem insere a segunda linha NAO e a `notify_admins_new_report`.
--
-- E uma varredura das migracoes confirma: entre tudo que esta versionado, so ela
-- insere `moderation_required` com `report_id`. Logo o segundo inserter existe
-- apenas no painel do Supabase — como boa parte dos gatilhos deste projeto (ver
-- a nota das migracoes 202 e 203).
--
-- O CUSTO DE CONTINUAR CACANDO FUNCAO
--
-- Da para achar a culpada com uma consulta ao catalogo, e vale achar. Mas
-- consertar UMA funcao invisivel de cada vez e um jogo que nao termina: a
-- proxima que alguem criar no painel derruba o cadastro de bronca de novo, e o
-- sintoma so aparece em producao.
--
-- A regra "no maximo um aviso de moderacao por bronca por pessoa" e da TABELA.
-- Entao ela e imposta na tabela, e passa a valer para qualquer inserter —
-- versionado, do painel, ou escrito amanha.
--
-- POR QUE UM GATILHO BEFORE, E NAO SO O INDICE
--
-- O indice da 195 expressa a regra certa e a impoe da pior forma possivel: ele
-- ABORTA. Como o gatilho roda dentro da transacao do insert da bronca, abortar
-- derruba a bronca inteira — a pessoa tirou a foto, escreveu, enviou, e perdeu
-- tudo por causa de um aviso interno que nem era para ela.
--
-- Um gatilho BEFORE que devolve NULL descarta a linha repetida em silencio, que
-- e exatamente o que "no maximo um" deveria significar aqui. O indice fica como
-- rede de seguranca.
--
-- A CORRIDA QUE SOBRA E TEORICA
--
-- Duas transacoes simultaneas inserindo o MESMO par (pessoa, bronca) nao veriam
-- uma a outra, e o indice abortaria. Para acontecer, dois gatilhos sobre a mesma
-- bronca teriam que rodar em transacoes concorrentes — e os avisos de uma bronca
-- nascem em sequencia, dentro do fluxo de criacao dela. O caso real deste erro
-- (dois inserts em sequencia) o gatilho resolve, porque um comando enxerga o que
-- os anteriores da mesma transacao gravaram.

create or replace function public.aviso_de_moderacao_no_maximo_um()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'moderation_required'
     and new.report_id is not null
     and exists (
       select 1
       from public.notifications n
       where n.user_id   = new.user_id
         and n.report_id = new.report_id
         and n.type      = 'moderation_required'
     )
  then
    -- Descarta a linha. O aviso que importa ja esta na caixa da pessoa.
    return null;
  end if;

  return new;
end;
$$;

comment on function public.aviso_de_moderacao_no_maximo_um() is
  'Descarta aviso de moderacao repetido em vez de abortar. Impede que um segundo inserter derrube o insert da bronca.';

-- O prefixo `a_` segue a convencao ja usada em `a_reports_created_at` (194):
-- gatilhos BEFORE que precisam rodar antes dos outros sao nomeados para vencer
-- a ordenacao alfabetica que o Postgres usa.
drop trigger if exists a_aviso_de_moderacao_no_maximo_um on public.notifications;

create trigger a_aviso_de_moderacao_no_maximo_um
  before insert on public.notifications
  for each row
  execute function public.aviso_de_moderacao_no_maximo_um();

notify pgrst, 'reload schema';
