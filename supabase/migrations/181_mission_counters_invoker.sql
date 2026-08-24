-- 181_mission_counters_invoker.sql
--
-- Fecha um vazamento que a 180 abriu.
--
-- O PROBLEMA
--
-- A 180 marcou `get_mission_counters` como `security definer`, e a razao era
-- legitima: ela chama `get_neighborhood_standing`, que precisa ser definer para
-- o placar de bairro nao mudar conforme quem consulta (a 174 explica).
--
-- Mas definer suspende a RLS da funcao INTEIRA, nao so da parte que precisava.
-- E a funcao recebe o id do usuario por parametro. Resultado: qualquer pessoa
-- autenticada podia pedir os contadores de outra e receber
--
--   • patrol_days  — em que dias aquela pessoa saiu patrulhando, inclusive nas
--                    patrulhas que ela manteve privadas;
--   • shares_count — quantos conteudos ela compartilhou, apesar de a policy de
--                    `share_events` liberar leitura apenas do proprio.
--
-- A 172 ja tinha decidido o contrario disso, com todas as letras: "um ranking
-- sobre todas as patrulhas revelaria que alguem saiu patrulhando mesmo tendo
-- mantido tudo privado". A 180 desfez a decisao sem querer.
--
-- A CORRECAO
--
-- Invoker. Uma linha, sem recriar o corpo — duplicar noventa linhas de SQL
-- entre duas migracoes so criaria duas versoes para manter em sincronia.
--
-- Nao e preciso recusar a chamada com id alheio: com a RLS de volta, ela passa
-- a devolver exatamente o que aquele usuario ja tornou publico, e nada alem.
-- Broncas aprovadas contam; patrulha privada nao aparece; share_events do outro
-- devolve zero, porque a policy so libera o proprio.
--
-- E o placar de bairro continua igual para todo mundo: `get_neighborhood_standing`
-- e definer por conta propria, e roda como dona independentemente de quem chama.
--
-- Para o unico caso de uso real — a pessoa consultando os proprios numeros — nada
-- muda: a RLS de cada tabela ja libera tudo que e dela.

alter function public.get_mission_counters(uuid) security invoker;

comment on function public.get_mission_counters(uuid) is
  'Contadores da central de missoes. SECURITY INVOKER: pedir o id de outra pessoa devolve so o que a RLS dela ja tornaria publico. O catalogo, as escadas, os pontos e o nivel vivem no cliente (src/lib/missions.js e src/lib/scoring.js).';
