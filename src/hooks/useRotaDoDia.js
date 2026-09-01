import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { enviarAtualizacaoDeBronca } from '@/hooks/useReportUpdate';
import { estadoDaRota, montarRota, podeIniciarRota, PILOTO } from '@/lib/rotaDoDia';
import { envioDoPulo, retornoDoPulo } from '@/lib/pularAlvo';
import { showAppError, showAppNotice } from '@/lib/appError';

// A Rota do Dia, do lado da tela.
//
// MONTADA AO ABRIR, NUNCA DE VÉSPERA
//
// As paradas são o estado do mundo AGORA. Uma rota montada às 6h manda a pessoa
// a broncas que outro patrulheiro já confirmou às 10h — e a segunda visita não
// produz nada além da sensação de ter sido mandado ao lugar errado.
//
// É por isso que não existe tabela de rotas: não há o que guardar quando a
// resposta certa muda a cada hora. O que se guarda é o que ACONTECEU nela — a
// contribuição (em `report_updates`) e o pulo (em `route_skips`).
//
// O PROGRESSO VIVE NA MEMÓRIA DA TELA, E ISSO É UMA ESCOLHA
//
// Recarregar a página remonta a rota com o mundo de agora, e as paradas já
// resolvidas somem sozinhas: uma bronca que a pessoa acabou de confirmar deixa
// de ter valor de visita (`recencia.js` a promove para "uma observação"), e
// `montarRota` não a escolhe de novo. O estado se reconstrói do dado real em
// vez de ser restaurado de uma cópia que pode divergir dele.

export function useRotaDoDia(posicao) {
  const { user } = useAuth();

  const [candidatos, setCandidatos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [concluidas, setConcluidas] = useState([]);
  const [puladas, setPuladas] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const permissao = useMemo(
    () => podeIniciarRota({ agora: new Date(), posicao }),
    [posicao]
  );

  useEffect(() => {
    let vivo = true;
    if (!user?.id || !permissao.ok) {
      setCarregando(false);
      return () => {};
    }

    (async () => {
      setCarregando(true);
      const { data, error } = await supabase.rpc('rota_do_dia_alvos', {
        p_lat: posicao.lat,
        p_lng: posicao.lng,
        p_raio_m: PILOTO.RAIO_M,
      });

      if (!vivo) return;
      if (error) {
        setErro(error);
        setCandidatos([]);
      } else {
        setErro(null);
        setCandidatos(
          (data || []).map((linha) => ({
            ...linha,
            // A RPC devolve as observações como jsonb; `estadoDeRecencia`
            // espera a mesma forma de `report_updates`, e é o que ela é.
            atualizacoes: Array.isArray(linha.observacoes) ? linha.observacoes : [],
            report: linha,
          }))
        );
      }
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [user?.id, posicao?.lat, posicao?.lng, permissao.ok]);

  const rota = useMemo(
    () => montarRota({ posicao, candidatos, agora: new Date() }),
    [posicao, candidatos]
  );

  const estado = useMemo(
    () => estadoDaRota(rota.paradas, { concluidas, puladas }),
    [rota.paradas, concluidas, puladas]
  );

  /**
   * Marca uma parada como cumprida.
   *
   * Só é chamada DEPOIS de a contribuição chegar ao banco — nunca por
   * proximidade. Conclusão por passagem transformaria a rota num passeio com o
   * app aberto, e ela deixaria de produzir qualquer coisa.
   */
  const registrarContribuicao = useCallback((paradaId) => {
    setConcluidas((atual) =>
      atual.includes(String(paradaId)) ? atual : [...atual, String(paradaId)]
    );
  }, []);

  /**
   * Pula a parada atual, com motivo.
   *
   * A ordem importa: primeiro o que é informação (atualização de campo, pedido
   * de auditoria), depois o registro do pulo. Se a informação falhar, a parada
   * continua no caminho — o contrário consumiria um dos dois pulos sem ter
   * gravado nada.
   */
  const pular = useCallback(
    async ({ parada, motivoId, observacao = '' }) => {
      if (!user?.id || !parada || enviando) return { ok: false };
      if (!estado.podePular) {
        showAppError({
          title: 'Você já usou os dois pulos desta rota',
          description:
            'As paradas que restam saem do caminho respondendo o que você viu.',
          variant: 'destructive',
        });
        return { ok: false };
      }

      const envio = envioDoPulo({ motivoId, alvo: parada, observacao });
      if (!envio) return { ok: false };

      setEnviando(true);
      try {
        if (envio.atualizacao) {
          const r = await enviarAtualizacaoDeBronca({
            report: parada.report ?? parada,
            updateType: envio.atualizacao.update_type,
            user,
            message: envio.atualizacao.message,
          });
          // Limite semanal não impede o pulo: a pessoa está na rua, e travar a
          // rota por causa da política de reenvio seria punir quem foi.
          if (!r.ok && !r.isRateLimit) throw r.error || new Error('falha ao registrar');
        }

        if (envio.auditoria) {
          await supabase.from('report_audit_requests').insert({
            report_id: envio.auditoria.report_id,
            user_id: user.id,
            motivo: envio.auditoria.motivo,
            observacao: envio.auditoria.observacao,
          });
        }

        await supabase.from('route_skips').insert({
          user_id: user.id,
          report_id: String(parada.id),
          motivo: motivoId,
          observacao: observacao?.trim() || null,
        });

        setPuladas((atual) =>
          atual.includes(String(parada.id)) ? atual : [...atual, String(parada.id)]
        );

        showAppNotice({ title: 'Parada pulada', description: retornoDoPulo(motivoId) });
        return { ok: true };
      } catch (error) {
        showAppError({
          title: 'Não foi possível registrar o pulo',
          description: error?.message,
          variant: 'destructive',
        });
        return { ok: false };
      } finally {
        setEnviando(false);
      }
    },
    [user, enviando, estado.podePular]
  );

  return {
    permissao,
    carregando,
    erro,
    rota,
    estado,
    enviando,
    // As listas saem junto do estado agregado porque a tela precisa saber o que
    // aconteceu com CADA parada, e não só quantas fecharam.
    concluidas,
    puladas,
    registrarContribuicao,
    pular,
  };
}
