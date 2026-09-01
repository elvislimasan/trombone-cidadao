import { Lock } from 'lucide-react';
import { marcosDe } from '@/lib/marcosCosmeticos';

// O que uma medalha abre.
//
// POR QUE ISTO NÃO É UMA LOJA, E A TELA PRECISA MOSTRAR ISSO
//
// Não há preço, não há saldo, não há "faltam 200 moedas". Cada peça mostra a
// medalha que a abre e o que falta para ela — e o que falta é sempre uma ação
// cívica, porque não existe outro caminho.
//
// A diferença aparece no que a pessoa pergunta. Numa loja ela pergunta "quanto
// custa"; aqui ela pergunta "o que eu preciso fazer". A segunda pergunta tem uma
// resposta que serve à cidade.
//
// PEÇA FECHADA CONTINUA VISÍVEL
//
// Esconder o que ainda não abriu tornaria a tela inútil justamente para quem
// está começando — que é quem mais precisa de um motivo concreto. O que se
// esconde é o número de quem não tem: não há contagem de quantas peças faltam,
// porque isso vira coleção, e coleção vira o inventário que a §36.14 excluiu.

const MarcosCosmeticos = ({ conquistas = [] }) => {
  const marcos = marcosDe(conquistas);
  if (marcos.length === 0) return null;

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <p className="text-xs font-bold text-content-primary">O que suas medalhas abrem</p>
      <p className="text-2xs text-content-tertiary mt-0.5 leading-relaxed">
        Peças do avatar. Nenhuma dá vantagem no jogo — e não há moeda nem loja:
        cada uma abre com uma medalha.
      </p>

      <ul className="mt-3 space-y-2">
        {marcos.map((m) => (
          <li key={m.id} className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                m.aberto
                  ? 'bg-status-resolvedBg text-status-resolvedFg'
                  : 'bg-surface-subtle text-content-tertiary'
              }`}
            >
              {m.aberto ? (
                <span className="text-xs font-bold">✓</span>
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className={`text-xs font-bold leading-tight ${
                  m.aberto ? 'text-content-primary' : 'text-content-secondary'
                }`}
              >
                {m.rotulo}
              </p>
              <p className="text-2xs text-content-tertiary leading-relaxed">
                {m.descricao}
              </p>
              {!m.aberto && m.comoAbrir && (
                <p className="text-2xs text-content-secondary mt-0.5">
                  {m.comoAbrir}
                  {m.falta ? ` · ${m.falta}` : ''}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MarcosCosmeticos;
