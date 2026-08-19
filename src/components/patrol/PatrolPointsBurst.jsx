import { useEffect, useState } from 'react';

// O "+5" que sobe quando uma confirmação é enviada.
//
// Aparece no centro-alto da tela, longe dos botões: o dedo acabou de tocar
// embaixo, e a recompensa precisa estar onde o olho já está — na via.
//
// Some sozinho em 1,2s. Nada aqui é clicável, nem intercepta toque: quem está
// patrulhando pode receber o próximo alerta durante a animação.

const DURACAO_MS = 1200;

export default function PatrolPointsBurst({ evento, pontos }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!evento) return;
    setVisivel(true);
    const t = setTimeout(() => setVisivel(false), DURACAO_MS);
    return () => clearTimeout(t);
  }, [evento]);

  if (!visivel) return null;

  return (
    <div
      key={evento}
      className="absolute inset-x-0 top-1/3 z-[1002] flex justify-center pointer-events-none"
      aria-hidden="true"
    >
      <span className="patrol-points-burst text-5xl font-extrabold text-brand drop-shadow-lg tabular-nums">
        +{pontos}
      </span>
    </div>
  );
}
