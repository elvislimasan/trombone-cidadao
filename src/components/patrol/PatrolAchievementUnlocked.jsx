import { useEffect, useState } from 'react';

// Tela de medalha desbloqueada.
//
// Aparece só quando algo REALMENTE mudou de estado nesta patrulha — a
// comparação é feita entre os totais de antes e de depois de gravar. Uma
// medalha que reaparece a cada patrulha deixa de ser recompensa e vira ruído.
//
// Quando cai mais de uma, elas passam uma por vez: duas medalhas empilhadas na
// mesma tela dividem a atenção e nenhuma das duas é lida.

export default function PatrolAchievementUnlocked({ conquistas, onFechar }) {
  const [indice, setIndice] = useState(0);
  const atual = conquistas[indice];
  const ultima = indice >= conquistas.length - 1;

  // Reinicia quando a lista muda, para a segunda patrulha da sessão não abrir
  // no índice em que a primeira parou.
  useEffect(() => { setIndice(0); }, [conquistas]);

  if (!atual) return null;

  return (
    <div className="fixed inset-0 z-[1006] flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-sm bg-surface-base rounded-3xl shadow-2xl px-6 py-8 text-center animate-in zoom-in-95 duration-200">
        <p className="text-xs font-bold uppercase tracking-widest text-brand mb-5">
          Conquista desbloqueada
        </p>

        <div className="w-28 h-28 mx-auto mb-5 rounded-full bg-brand-subtleBg border-4 border-brand/30 flex items-center justify-center">
          <span className="text-5xl leading-none" aria-hidden="true">{atual.emoji}</span>
        </div>

        <h2 className="text-2xl font-extrabold text-content-primary mb-1.5">
          {atual.nome}
        </h2>
        <p className="text-sm text-content-secondary mb-6">
          {atual.descricao}
        </p>

        {conquistas.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-5" aria-hidden="true">
            {conquistas.map((c, i) => (
              <span
                key={c.id}
                className={`w-1.5 h-1.5 rounded-full ${
                  i === indice ? 'bg-brand' : 'bg-edge-default'
                }`}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => (ultima ? onFechar() : setIndice((i) => i + 1))}
          className="w-full py-3.5 rounded-xl bg-brand text-content-onBrand font-bold text-sm active:bg-brand-hover transition-colors"
        >
          {ultima ? 'Continuar' : `Próxima (${indice + 2}/${conquistas.length})`}
        </button>
      </div>
    </div>
  );
}
