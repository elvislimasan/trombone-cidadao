import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { enviarAtualizacaoDeBronca } from '@/hooks/useReportUpdate';
import { cabeRevisita, convite, diasParada, envioDaRevisita } from '@/lib/reportRevisit';
import { showAppError, showAppNotice } from '@/lib/appError';

// A revisita de 28 dias, do lado da tela.
//
// O QUE ESTE HOOK DECIDE, E O QUE ELE NÃO DECIDE
//
// Ele decide se o convite aparece e o que acontece quando a pessoa responde.
// NÃO decide o que a resposta significa para a bronca: isso é
// `enviarAtualizacaoDeBronca`, com a moderação da 108, o limite semanal da 185 e
// o quórum da 199 inteiros. Uma resposta de revisita é uma observação de campo
// como qualquer outra — o que muda é só de onde veio o convite.
//
// POR QUE A REGRA É CHECADA NOS DOIS LADOS
//
// `revisitas_pendentes` (207) responde "quais broncas suas merecem convite" para
// a lista. A tela de detalhe precisa decidir sozinha, para uma bronca só, sem
// mais uma ida ao servidor — e é `cabeRevisita` quem responde. As duas espelham
// as mesmas exclusões de propósito; divergir faria o convite aparecer numa tela
// e não na outra, sem ninguém descobrir por quê.

export function useReportRevisit(report, atualizacoes = []) {
  const { user } = useAuth();
  const [convidado, setConvidado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [respondida, setRespondida] = useState(false);

  const dias = diasParada(report, atualizacoes);

  // Busca o convite já existente antes de decidir mostrar. Sem esta consulta, a
  // tela reabriria o convite de quem já respondeu — e o índice único da 207
  // recusaria o insert com um erro que a pessoa não tem como entender.
  useEffect(() => {
    let vivo = true;
    if (!user?.id || !report?.id) {
      setCarregando(false);
      return () => {};
    }

    (async () => {
      const { data } = await supabase
        .from('report_revisits')
        .select('id, respondida_em, quer_lembrete')
        .eq('report_id', report.id)
        .eq('user_id', user.id)
        .order('perguntada_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!vivo) return;
      setConvidado(data || null);
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [user?.id, report?.id]);

  const jaRespondeu = !!convidado?.respondida_em;
  const recusouLembrete = convidado?.quer_lembrete === false;

  const mostrar =
    !carregando &&
    !respondida &&
    !jaRespondeu &&
    cabeRevisita({
      report,
      atualizacoes,
      user,
      // Um convite ABERTO não bloqueia: ele é justamente o que a tela deve
      // mostrar. O que bloqueia é ter respondido, e isso está em `jaRespondeu`.
      jaConvidado: false,
      recusouLembrete,
    });

  /**
   * Registra a resposta.
   *
   * A ordem importa: a observação de campo vai primeiro. Se ela falhar (limite
   * semanal, rede), o convite continua aberto e a pessoa pode tentar de novo —
   * o contrário deixaria a revisita marcada como respondida sem nada ter
   * chegado à bronca.
   */
  const responder = useCallback(
    async ({ respostaId, mensagem = '', querLembrete = null }) => {
      if (!user?.id || !report?.id || enviando) return { ok: false };

      const envio = envioDaRevisita({ respostaId, report, mensagem });
      if (!envio) return { ok: false };

      setEnviando(true);
      try {
        let updateId = null;

        if (envio.atualizacao) {
          const r = await enviarAtualizacaoDeBronca({
            report,
            updateType: envio.atualizacao.update_type,
            user,
            message: envio.atualizacao.message || '',
          });

          if (!r.ok) {
            showAppError({
              title: r.isRateLimit
                ? 'Você já respondeu isso esta semana'
                : 'Não foi possível registrar sua resposta',
              description: r.isRateLimit
                ? 'Aguarde para enviar de novo o mesmo tipo de atualização nesta bronca.'
                : r.error?.message,
              variant: 'destructive',
            });
            return { ok: false };
          }
          updateId = r.update?.id?.startsWith?.('local-') ? null : r.update?.id ?? null;
        }

        const linha = {
          ...envio.revisita,
          user_id: user.id,
          quer_lembrete: querLembrete,
          report_update_id: updateId,
        };

        // Upsert pelo par (bronca, pessoa): o índice único da 207 só cobre
        // convite EM ABERTO, então uma inserção simples criaria uma segunda
        // linha se a pessoa já tivesse um convite pendente registrado.
        if (convidado?.id) {
          await supabase.from('report_revisits').update(linha).eq('id', convidado.id);
        } else {
          await supabase.from('report_revisits').insert(linha);
        }

        setRespondida(true);
        showAppNotice({
          title: 'Obrigado por voltar lá',
          description: envio.atualizacao
            ? 'Sua resposta entrou na bronca.'
            : 'Anotamos que você não conseguiu verificar.',
        });
        return { ok: true };
      } catch (error) {
        showAppError({
          title: 'Erro ao registrar sua resposta',
          description: error?.message,
          variant: 'destructive',
        });
        return { ok: false };
      } finally {
        setEnviando(false);
      }
    },
    [user, report, enviando, convidado?.id]
  );

  /**
   * "Não quero ser perguntado sobre esta bronca."
   *
   * Fecha o convite sem responder nada sobre a rua. É o que torna a revisita
   * opt-in de verdade: sem esta saída, a única forma de parar de ser perguntado
   * seria inventar uma resposta.
   */
  const dispensar = useCallback(async () => {
    if (!user?.id || !report?.id) return;
    setRespondida(true);

    const linha = {
      report_id: report.id,
      user_id: user.id,
      resposta: 'nao_consigo_verificar',
      respondida_em: new Date().toISOString(),
      quer_lembrete: false,
    };

    if (convidado?.id) {
      await supabase.from('report_revisits').update(linha).eq('id', convidado.id);
    } else {
      await supabase.from('report_revisits').insert(linha);
    }
  }, [user?.id, report?.id, convidado?.id]);

  return {
    mostrar,
    enviando,
    convite: convite(dias),
    dias,
    responder,
    dispensar,
  };
}
