import { Flag } from 'lucide-react';

// Botão de sinalizar.
//
// Não se posiciona: entra como `acao` na faixa inferior do PatrolHud, que é um
// flex. Antes ele era absoluto e centralizado, e em telas estreitas alcançava o
// velocímetro — sobreposição que só não acontecia por sorte de largura. Sendo
// um filho comum do flex, a colisão deixa de ser possível.
//
// `w-full max-w-[220px]`: ocupa a faixa que sobra, sem esticar até virar uma
// barra em tablet.

export default function PatrolSignalButton({ onClick, desabilitado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label="Sinalizar um problema aqui"
      className="w-full max-w-[220px] h-14 inline-flex items-center justify-center gap-2.5 rounded-full bg-brand text-content-onBrand shadow-2xl font-bold text-base active:scale-95 transition-transform disabled:opacity-50"
    >
      <Flag size={20} className="shrink-0" />
      Sinalizar
    </button>
  );
}
