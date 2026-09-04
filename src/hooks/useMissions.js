import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { missoesPorTrilha, etapasConcluidas } from '@/lib/missions';
import { placar } from '@/lib/scoring';
import { placarDeImpacto } from '@/lib/impact';
import { calcularSequencia, avaliarConquistas, chaveDoDia } from '@/lib/patrolGame';
import { diariasDeHoje, resumoDoDia, restaDoDia } from '@/lib/dailies';
import { normalizarContadoresDeMissao } from '@/lib/missionCounters';

/**
 * Meia-noite de hoje, no relógio de quem está olhando.
 *
 * É o `p_desde` das diárias. Precisa ser o dia LOCAL e não UTC: às 21h de
 * Floresta já é o dia seguinte em Londres, e o recorte devolveria os contadores
 * de amanhã — zerando o progresso da pessoa três horas antes da hora.
 */
const meiaNoiteLocal = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Progresso das missões, pontos e conquistas.
//
// Uma mesma RPC fornece os contadores brutos de vida inteira e de hoje.
// Catálogo, escadas, progresso, pontuação, nível e conquistas são função pura —
// nada disso vem pronto do servidor, e é o que permite mudar uma meta sem
// migração.
//
// Os nomes das colunas mudam de `snake_case` para o que o catálogo espera num
// lugar só, em `missionCounters.js`. Espalhar essa tradução pelas funções
// `valor` obrigaria cada missão nova a lembrar do formato do banco.

/**
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.temBroncas=true]  há bronca aberta ao alcance hoje?
 * @param {boolean} [opcoes.temSinais=true]   há sinal pendente ao alcance hoje?
 * @param {boolean} [opcoes.temAlvos]         atalho antigo: falso zera as duas
 *
 * Quem sabe disso é a tela, que tem a posição; o hook não vai descobrir
 * sozinho. Falso faz a diária correspondente sair do sorteio em vez de mandar a
 * pessoa procurar o que não existe — ver `useAlvosPorPerto`.
 */
export function useMissions({ temAlvos, temBroncas = true, temSinais = true } = {}) {
  const { user } = useAuth();

  const [contadores, setContadores] = useState(null);
  const [contadoresHoje, setContadoresHoje] = useState(null);
  const [concluidasHoje, setConcluidasHoje] = useState([]);
  const [carregando, setCarregando] = useState(true);
  // Impede loop de tentativas se a migração/RPC estiver indisponível. Uma nova
  // montagem pode tentar de novo; um render não.
  const tentativasDiariasRef = useRef(new Set());

  const buscar = useCallback(async () => {
    if (!user) {
      setCarregando(false);
      return;
    }
    try {
      // O nível saiu do `get_user_level` e passou a ser calculado aqui
      // (src/lib/scoring.js) porque as missões valem pontos — e o catálogo delas
      // é JavaScript. Buscar o nível no banco daria um total menor que o
      // mostrado, e duas verdades para o mesmo usuário.
      //
      // TRÊS IDAS, EM PARALELO — não em série.
      //
      // As diárias precisam do que a pessoa fez HOJE, que é a mesma função com
      // `p_desde` (migração 200), mais as conclusões já gravadas. O que a 180
      // evitou — cinco consultas em sequência para pintar uma tela — continua
      // evitado: são três, e elas partem juntas.
      const desde = meiaNoiteLocal();

      const [tudo, hoje, feitas, qualidade] = await Promise.all([
        supabase.rpc('get_mission_counters', { target_user_id: user.id }),
        supabase.rpc('get_mission_counters', {
          target_user_id: user.id,
          p_desde: desde.toISOString(),
        }),
        supabase
          .from('daily_completions')
          .select('daily_id')
          .eq('user_id', user.id)
          .eq('dia', chaveDoDia(desde)),
        // Qualidade e mentoria (fase 4). RPC separada, e não mais colunas na de
        // sempre: `get_mission_counters` precisa de drop+create para mudar de
        // assinatura, e reescrever 250 linhas de CTE para acrescentar quatro
        // números é risco sem ganho. A quarta chamada parte junto das outras.
        supabase.rpc('get_quality_counters', { target_user_id: user.id }),
      ]);

      if (tudo.error) throw tudo.error;
      // As medalhas de qualidade leem daqui. Se a 214 ainda não estiver
      // aplicada, os contadores ficam zerados e elas aparecem bloqueadas — que é
      // o certo: melhor uma medalha inalcançável hoje do que a central inteira
      // sumir por causa de uma RPC que não existe.
      setContadores({
        ...normalizarContadoresDeMissao(tudo.data?.[0]),
        ...(qualidade.error ? {} : qualidade.data?.[0] || {}),
      });

      // As diárias não derrubam a central: se a 200 ainda não estiver aplicada,
      // `p_desde` não existe e a chamada falha. O resto da tela — nível,
      // missões, medalhas, impacto — não tem nada a ver com isso e continua.
      if (hoje.error) {
        console.warn('[useMissions] contadores de hoje indisponíveis:', hoje.error);
        setContadoresHoje(null);
      } else {
        setContadoresHoje(normalizarContadoresDeMissao(hoje.data?.[0]));
      }

      setConcluidasHoje(
        feitas.error ? [] : (feitas.data || []).map((l) => l.daily_id)
      );
    } catch (err) {
      console.error('[useMissions] falha ao carregar:', err);
    } finally {
      setCarregando(false);
    }
  }, [user]);

  useEffect(() => { buscar(); }, [buscar]);

  // Ações + bônus das etapas vencidas.
  const pontuacao = useMemo(() => placar(contadores), [contadores]);
  const nivel = pontuacao;
  const nivelAtual = pontuacao.level;

  // A SEGUNDA MOEDA.
  //
  // Sai dos MESMOS contadores e da mesma consulta — não há ida extra ao
  // servidor. Vem separada de `pontuacao` de propósito: XP responde "quanto
  // você trabalhou", Impacto responde "quanto mudou", e juntá-las num total só
  // apagaria justamente a distinção que a moeda nova existe para criar.
  const impacto = useMemo(() => placarDeImpacto(contadores), [contadores]);

  // ── As diárias ────────────────────────────────────────────────────────────
  //
  // Sorteadas, não consultadas: mesma pessoa, mesmo dia, mesmo resultado
  // (src/lib/dailies.js). O servidor só devolve o que ela FEZ hoje.
  //
  // `contadoresHoje` nulo significa que a 200 ainda não foi aplicada. Nesse
  // caso as diárias não aparecem — melhor não mostrá-las do que mostrá-las
  // todas em 0/3 sem nunca andar.
  const diarias = useMemo(() => {
    if (!user || !contadoresHoje) return [];
    return diariasDeHoje(user.id, contadoresHoje, concluidasHoje, new Date(), {
      temAlvos,
      temBroncas,
      temSinais,
    });
  }, [user, contadoresHoje, concluidasHoje, temAlvos, temBroncas, temSinais]);

  const resumoDiarias = useMemo(() => resumoDoDia(diarias), [diarias]);

  // Sem memo de propósito: lê o relógio, então não há entrada de que dependa.
  // Memoizá-lo em `diarias` congelaria "4h restantes" até o próximo recarregar.
  const tempoRestante = restaDoDia();

  /**
   * Pede ao servidor para confirmar que uma diária foi fechada.
   *
   * O cliente mostra progresso, mas não concede XP: `complete_daily` recalcula
   * os contadores, aceita somente ids do catálogo e limita uma conclusão de
   * cada tipo por dia. Isso impede fabricar bônus alterando a requisição.
   */
  const marcarDiaria = useCallback(
    async (dailyId) => {
      if (!user || !dailyId) return;
      if (concluidasHoje.includes(dailyId)) return;
      if (tentativasDiariasRef.current.has(dailyId)) return;
      tentativasDiariasRef.current.add(dailyId);

      // Otimista: a tela marca na hora. Uma diária que fecha meio segundo
      // depois do toque não parece ter fechado por causa do toque.
      setConcluidasHoje((atual) =>
        atual.includes(dailyId) ? atual : [...atual, dailyId]
      );

      const { data, error } = await supabase.rpc('complete_daily', {
        p_daily_id: dailyId,
      });

      if (error) {
        // Desfaz o otimismo: sem confirmação do servidor não existe bônus.
        setConcluidasHoje((atual) => atual.filter((id) => id !== dailyId));
        console.error('[useMissions] falha ao gravar diária:', error);
        return;
      }

      // Em mudança de catálogo, o servidor pode devolver a diária antiga já
      // concluída para este tipo. Guardar os dois ids é inofensivo e permite que
      // `diariasDeHoje` reconheça a conclusão pelo tipo.
      if (data && data !== dailyId) {
        setConcluidasHoje((atual) =>
          atual.includes(data) ? atual : [...atual, data]
        );
      }
    },
    [user, concluidasHoje]
  );

  // Fecha sozinha o que os contadores do dia já mostram cumprido.
  //
  // Sem isto, a diária ficaria em 3/3 sem nunca virar "concluída" — e o bônus,
  // que sai da linha gravada, nunca seria pago. Roda a cada recarga; o guarda
  // acima impede insert repetido.
  useEffect(() => {
    diarias
      .filter((d) => d.completa && !d.gravada)
      .forEach((d) => marcarDiaria(d.id));
  }, [diarias, concluidasHoje, marcarDiaria]);

  // Conquistas usam os mesmos contadores, mais a sequência de dias — que é
  // função pura sobre as datas que a RPC devolve.
  const conquistas = useMemo(() => {
    if (!contadores) return [];
    return avaliarConquistas({
      ...contadores,
      sequencia: calcularSequencia(contadores.patrol_days || []),
    });
  }, [contadores]);

  const trilhas = useMemo(
    () => missoesPorTrilha(contadores, nivelAtual),
    [contadores, nivelAtual]
  );

  const concluidas = useMemo(
    () => etapasConcluidas(contadores, nivelAtual),
    [contadores, nivelAtual]
  );

  // Quantas estão ao alcance agora — é o número que diz se a central tem o que
  // oferecer, e o que a tela mostra no topo.
  const disponiveis = useMemo(
    () =>
      trilhas.reduce(
        (n, t) => n + t.missoes.filter((m) => !m.bloqueada && !m.completa).length,
        0
      ),
    [trilhas]
  );

  return {
    trilhas, nivel, pontuacao, impacto, conquistas, contadores,
    concluidas, disponiveis, carregando, recarregar: buscar,
    diarias, resumoDiarias, tempoRestante, marcarDiaria,
  };
}
