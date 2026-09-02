import { Card, CardContent } from '@/components/ui/card';

// A faixa de números do topo de uma tela de mapa.
//
// O DESENHO VEM DA TELA DE IMÓVEIS
//
// Ele já existia lá — quadrado colorido com o ícone em branco, rótulo pequeno
// acima e o valor em negrito abaixo — e era o único lugar do app onde a faixa
// de números tinha forma própria. As outras telas de mapa ou não tinham faixa,
// ou tinham uma versão pálida dela. Agora é uma definição só, e a de imóveis
// passou a usar esta.
//
// A COR DO QUADRADO NÃO É DECORAÇÃO
//
// Onde a tela tem legenda, a cor do cartão é a MESMA do pino daquela situação —
// é o que faz "17 em andamento" e o ponto azul do mapa se reconhecerem sem
// ninguém explicar. Por isso `cor` é uma classe de fundo escolhida pela página,
// e não um tom fixo daqui: quem conhece as cores dos pinos é a tela.
//
// O QUE ELA NÃO É
//
// Não é um filtro. Um cartão com `aoClicar` vira botão — e no mapa de
// pavimentação eles abrem a lista daquela situação —, mas sem ele continua
// sendo só um número. Cartão que parece botão e não faz nada ensina que os
// outros também não fazem.

// Tailwind precisa da classe escrita por extenso para incluí-la no CSS final:
// `md:grid-cols-${n}` não sobrevive à varredura.
const COLUNAS = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
};

export const CartaoDeNumero = ({ Icone, cor = 'bg-tc-red', rotulo, valor, aoClicar }) => {
  const conteudo = (
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cor}`}>
        {Icone && <Icone className="h-5 w-5 text-white" />}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-content-secondary">{rotulo}</p>
        <p className="truncate text-sm font-bold text-content-primary tabular-nums">{valor}</p>
      </div>
    </CardContent>
  );

  if (!aoClicar) return <Card className="border-border">{conteudo}</Card>;

  return (
    <Card className="border-border">
      <button
        type="button"
        onClick={aoClicar}
        className="w-full text-left transition-colors hover:bg-surface-subtle"
      >
        {conteudo}
      </button>
    </Card>
  );
};

export default function CartoesDeMapa({ cartoes, rodape = null }) {
  const visiveis = (cartoes || []).filter(Boolean);
  if (visiveis.length === 0) return null;

  return (
    <div>
      <div className={`grid grid-cols-2 gap-3 ${COLUNAS[visiveis.length] || 'md:grid-cols-4'}`}>
        {visiveis.map((cartao) => (
          <CartaoDeNumero key={cartao.id} {...cartao} />
        ))}
      </div>
      {/* A RESSALVA FICA JUNTO DOS NÚMEROS
          "48 broncas" pode ser da cidade ou do recorte visível do mapa, e as
          duas leituras levam a conclusões diferentes sobre o mesmo bairro. */}
      {rodape && (
        <p className="mt-2 text-center text-[11px] text-content-tertiary">{rodape}</p>
      )}
    </div>
  );
}
