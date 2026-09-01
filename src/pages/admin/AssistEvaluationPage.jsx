import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { ACERTO_MINIMO, AMOSTRA_MINIMA, painelDeAvaliacao } from '@/lib/iaAssistiva';

// A avaliação do assistente, por categoria.
//
// POR QUE ESTE PAINEL EXISTE
//
// "IA assistiva avaliada por categoria" (§36.14) só é verdade se alguém puder
// ver a avaliação. Sem esta tela, o portão de `habilitadaPara` funcionaria no
// escuro: uma categoria ficaria calada por meses e ninguém saberia se foi por
// falta de amostra ou por acerto ruim — que pedem ações opostas.
//
// AS CATEGORIAS SEM MEDIÇÃO APARECEM, E SÃO A INFORMAÇÃO PRINCIPAL
//
// É a linha que diz "aqui o assistente nunca falou". Esconder as sem dado
// deixaria o painel bonito e inútil — mostraria só onde já sabemos a resposta.
//
// NÃO HÁ BOTÃO DE LIGAR
//
// A habilitação é consequência da medição, não uma chave. Um botão de "ligar
// mesmo assim" existiria para ser usado numa sexta-feira, e a partir daí o
// número no painel deixaria de significar qualquer coisa.

const AssistEvaluationPage = () => {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.rpc('assist_avaliacao');
    setAvaliacoes(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const painel = painelDeAvaliacao(avaliacoes);

  return (
    <>
      <Helmet>
        <title>Assistente de categoria — Trombone Cidadão</title>
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        <PageHeader
          titulo="Assistente de categoria"
          subtitulo="Acerto por categoria nos últimos 180 dias"
          paraOnde="/admin"
        />

        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-3 mb-3">
          <p className="text-2xs text-content-tertiary leading-relaxed">
            A sugestão só aparece para o cidadão numa categoria com pelo menos{' '}
            {AMOSTRA_MINIMA} medições e {Math.round(ACERTO_MINIMO * 100)}% de
            acerto. Não há como ligar manualmente: a habilitação é consequência
            da medição.
          </p>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <ul className="space-y-2">
            {painel.map((c) => (
              <li
                key={c.categoriaId}
                className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-content-primary">{c.nome}</span>
                  <span
                    className={`text-2xs font-bold px-2 py-0.5 rounded-full ${
                      c.ok
                        ? 'bg-status-resolvedBg text-status-resolvedFg'
                        : 'bg-surface-subtle text-content-tertiary'
                    }`}
                  >
                    {c.ok ? 'sugerindo' : 'calado'}
                  </span>
                </div>

                <p className="text-2xs text-content-secondary mt-1">{c.rotulo}</p>

                {!c.ok && (
                  <p className="text-2xs text-content-tertiary mt-0.5 leading-relaxed">
                    {c.motivo === 'sem_avaliacao' &&
                      'Nunca sugeriu nada aqui — não há o que avaliar ainda.'}
                    {c.motivo === 'amostra_pequena' &&
                      `Poucas medições (${c.amostra} de ${AMOSTRA_MINIMA}). Uma sequência de sorte passaria do corte sem significar nada.`}
                    {c.motivo === 'acerto_baixo' &&
                      'Acerto abaixo do corte. Aqui a sugestão custaria mais do que rende — quem está com pressa aceita o que veio preenchido.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default AssistEvaluationPage;
