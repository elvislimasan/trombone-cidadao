import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { assistencia, medicaoDaSugestao, sugerirCategoria } from '@/lib/iaAssistiva';

// A sugestão de categoria, e a medição dela.
//
// ELA NÃO PREENCHE NADA SOZINHA
//
// O componente mostra um botão. A pessoa toca se concordar, ignora se não — e é
// justamente a existência dessa escolha que torna a avaliação possível: sem
// escolha não há o que comparar, e sem comparação "avaliada por categoria" é
// uma frase.
//
// Um assistente que preenchesse o campo mediria a inércia de quem está com
// pressa, não o acerto do palpite.
//
// A MEDIÇÃO É GRAVADA NO ENVIO, NÃO NO TOQUE
//
// O que interessa é o que a pessoa ESCOLHEU no fim, não o que ela tocou no meio
// do caminho. Alguém pode aceitar a sugestão e trocar depois de ver a foto — e
// contar isso como acerto inflaria a avaliação exatamente onde ela deve ser
// severa.
//
// Por isso `registrarEscolha` é exportada e chamada por quem submete o
// formulário, com a categoria final.
//
// O PALPITE DIZ DE ONDE VEIO
//
// "8 das 8 broncas registradas por aqui são desta categoria" é verificável. Um
// ícone de cérebro com uma porcentagem inventada não é — e é o que
// `AIReports.jsx` faz hoje, três telas ao lado.

/**
 * Grava o que foi sugerido e o que a pessoa escolheu.
 *
 * Falha em silêncio de propósito: a medição do assistente não pode impedir o
 * cadastro de uma bronca. Se a 215 não estiver aplicada, o insert erra e a
 * bronca segue.
 */
export const registrarEscolha = async ({ sugerida, escolhida, userId }) => {
  const medicao = medicaoDaSugestao({ sugerida, escolhida });
  if (!medicao) return;

  try {
    await supabase.from('assist_suggestions').insert({ ...medicao, user_id: userId });
  } catch {
    /* medir é secundário; registrar a bronca não é */
  }
};

const SugestaoDeCategoria = ({ posicao, categoriaEscolhida, onAceitar, onSugestao }) => {
  const { user } = useAuth();
  const [sugestao, setSugestao] = useState(null);

  useEffect(() => {
    let vivo = true;
    setSugestao(null);
    onSugestao?.(null);

    if (!posicao?.lat || !posicao?.lng) return () => {};

    (async () => {
      const [proximas, avaliacao] = await Promise.all([
        supabase.rpc('rota_do_dia_alvos', {
          p_lat: posicao.lat,
          p_lng: posicao.lng,
          p_raio_m: 200,
          p_limite: 30,
        }),
        supabase.rpc('assist_avaliacao'),
      ]);

      if (!vivo || proximas.error || avaliacao.error) return;

      const broncasProximas = (proximas.data || []).filter((b) => b.tipo === 'bronca');

      // MODO SOMBRA — e sem ele a fase 5 nunca sairia do lugar.
      //
      // A habilitação exige 30 medições com 70% de acerto. Mas medição só
      // existe quando houve sugestão, e sugestão só aparece quando habilitada:
      // zero sugestões → zero medições → nunca habilita. Um impasse perfeito,
      // e eu o construí sem perceber.
      //
      // A saída é a que a §36.5 já prescreve para pontuação nova: rodar em modo
      // sombra primeiro — "calcular o que cada conta ganharia sem exibir ou
      // pagar". Aqui é o mesmo: o palpite é calculado e MEDIDO sempre; o que o
      // portão controla é só se ele aparece.
      //
      // Na prática, uma categoria passa semanas sendo avaliada em silêncio, e
      // só fala quando os dados dizem que vale. É mais honesto que estrear
      // falando e medir depois.
      const bruta = sugerirCategoria(broncasProximas);
      onSugestao?.(bruta?.categoriaId ?? null);

      // O que a pessoa vê passa pelo portão por categoria.
      setSugestao(
        assistencia({ broncasProximas, avaliacoes: avaliacao.data || [] })
      );
    })();

    return () => {
      vivo = false;
    };
    // `onSugestao` fora das deps: é um callback do pai, recriado a cada render,
    // e incluí-lo refaria a consulta a cada tecla digitada no formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao?.lat, posicao?.lng]);

  if (!sugestao || !user) return null;

  const jaEscolhida = categoriaEscolhida === sugestao.categoriaId;

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-subtle px-3.5 py-3">
      <p className="text-2xs font-bold text-content-secondary flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-brand" />
        Talvez seja {sugestao.rotulo}
      </p>
      <p className="text-2xs text-content-tertiary mt-1 leading-relaxed">
        {sugestao.porque}. {sugestao.aviso}
      </p>

      {!jaEscolhida && (
        <button
          type="button"
          onClick={() => onAceitar?.(sugestao.categoriaId)}
          className="mt-2 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
        >
          Usar {sugestao.rotulo}
        </button>
      )}
    </div>
  );
};

export default SugestaoDeCategoria;
