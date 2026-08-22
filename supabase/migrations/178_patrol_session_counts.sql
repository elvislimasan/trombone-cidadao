-- 178_patrol_session_counts.sql
--
-- O que a patrulha PRODUZIU, e nao so por onde ela passou.
--
-- A 172 gravava quantas broncas o usuario passou e quantas confirmou. Faltava o
-- resto: quantas broncas ele registrou do zero, quantas missoes cumpriu e
-- quantos sinais deixou. Esses numeros existiam so em memoria, durante a
-- sessao, e morriam ao fechar a tela de resumo.
--
-- Sem eles, o card de story nao pode ser refeito a partir do historico: ele
-- mostra "2 broncas registradas / 3 sinalizacoes feitas", e uma patrulha antiga
-- so poderia exibir zero nos dois — mentindo sobre uma saida que rendeu.
--
-- NULO NAO E ZERO
--
-- As colunas nascem SEM default. As linhas que ja existiam ficam nulas, e nulo
-- aqui quer dizer "app antigo, nao sabemos" — diferente de zero, que quer dizer
-- "essa patrulha nao produziu nada".
--
-- A distincao paga a si mesma na tela: o botao de gerar o card so aparece onde
-- o dado e real. Um default de 0 teria apagado essa diferenca para sempre, e o
-- card de uma patrulha de 2025 sairia afirmando que ela nao rendeu nada.
--
-- OS IDS VAO JUNTO
--
-- Mesma escolha da 172, pela mesma razao: "sem eles nao ha como auditar depois
-- se um numero foi inflado, e os checks nao teriam contra o que validar". O
-- cliente e quem envia esses totais.

alter table public.patrols
  -- Broncas completas nascidas nesta patrulha: as criadas direto e as missoes
  -- cumpridas. As duas produzem uma bronca com foto, e e isso que o numero diz.
  add column if not exists reports_count integer,
  add column if not exists registered_report_ids uuid[],
  -- Sinais deixados no caminho, que viraram missao para outra pessoa.
  add column if not exists signals_count integer,
  add column if not exists signaled_report_ids uuid[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'patrols_producao_bate'
  ) then
    alter table public.patrols
      add constraint patrols_producao_bate check (
        -- Contador e lista aparecem e somem juntos: um sem o outro seria um
        -- numero sem como conferir, ou uma lista que nada declara.
        (reports_count is null) = (registered_report_ids is null)
        and (signals_count is null) = (signaled_report_ids is null)
        -- E quando existem, batem. O cliente nao consegue mandar
        -- reports_count = 50 com a lista vazia.
        and (reports_count is null or reports_count = cardinality(registered_report_ids))
        and (signals_count is null or signals_count = cardinality(signaled_report_ids))
      );
  end if;
end $$;

comment on column public.patrols.reports_count is
  'Broncas completas registradas nesta patrulha (criadas + missoes cumpridas). NULO = patrulha gravada por versao anterior a esta coluna.';
comment on column public.patrols.signals_count is
  'Sinais deixados nesta patrulha. NULO = patrulha gravada por versao anterior a esta coluna.';
