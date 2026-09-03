import { X } from 'lucide-react';

// O botão que desfaz o recorte inteiro de uma tela de mapa.
//
// POR QUE ELE PRECISA EXISTIR
//
// Filtrar é fácil; desfiltrar não era. Com quatro seletores independentes, sair
// de um recorte errado custava reabrir cada um e desmarcar item por item — e
// quem não fazia isso lia meia cidade achando que era a cidade inteira. É o
// mesmo engano que a contagem de filtros da coluna recolhida já tentava evitar:
// aquela avisa que o recorte existe, este dá a saída.
//
// SÓ APARECE QUANDO HÁ O QUE LIMPAR
//
// Zero filtros ligados, nenhum botão. Um "Limpar" permanentemente apagado
// ocuparia uma linha da coluna para não fazer nada, e ainda daria a entender que
// há um recorte quando não há. O número no rótulo é o MESMO da pílula "Filtros"
// — se os dois discordarem, é a contagem da página que está errada.
export default function LimparFiltros({ ligados = 0, aoLimpar, className = '' }) {
  if (!ligados) return null;

  return (
    <button
      type="button"
      onClick={aoLimpar}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-edge-subtle px-2.5 py-2 text-xs font-bold text-content-secondary transition-colors hover:bg-surface-subtle ${className}`}
    >
      <X className="h-3.5 w-3.5" />
      Limpar filtros ({ligados})
    </button>
  );
}
