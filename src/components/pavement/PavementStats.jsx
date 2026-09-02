import { Route as Road, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

import CartoesDeMapa from '@/components/map/CartoesDeMapa';
import { SITUACOES, percentual } from '@/lib/pavementLength';

// A faixa de números do mapa de pavimentação.
//
// O DESENHO É O DE TODAS AS TELAS DE MAPA
//
// Ela tinha o próprio cartão, parecido com os das outras telas mas não igual —
// e "parecido mas não igual" é o que faz quatro telas do mesmo app parecerem
// quatro produtos. Agora a moldura é a de `CartoesDeMapa`, e o que sobra aqui é
// só o que é de pavimentação: quais situações existem, em que cor, e o que
// acontece ao clicar.
//
// A COR DO QUADRADO É A DO PINO
//
// `ponto-legenda-pav--*` já pintava as bolinhas da legenda com os tokens dos
// pinos (`--pin-pav-*-bg`). Reusá-las aqui é o que faz o cartão "Sem
// pavimentação" e a linha vermelha do mapa serem visivelmente a mesma coisa —
// e garante que trocar a cor do pino troque a do cartão junto, porque é uma
// definição só.
//
// O TOTAL NÃO ESTÁ AQUI
//
// Ele é o selo do cabeçalho da página. Repetido como cartão, seria o mesmo
// número dito duas vezes a dois centímetros de distância.

const CARTOES = [
  { id: 'paved', Icone: CheckCircle2, cor: 'ponto-legenda-pav--paved' },
  { id: 'partially_paved', Icone: Road, cor: 'ponto-legenda-pav--partial' },
  { id: 'unpaved', Icone: AlertTriangle, cor: 'ponto-legenda-pav--unpaved' },
];

export default function PavementStats({ resumo, onSelecionar }) {
  const rotuloDe = (id) => SITUACOES.find((s) => s.id === id)?.rotulo || id;

  // O valor carrega a fatia junto: "120 ruas · 38%". A porcentagem sozinha não
  // diz o tamanho do problema, e a contagem sozinha não diz o tamanho da
  // cidade — quem cobra a prefeitura precisa das duas na mesma linha.
  const valorDe = (id) => {
    const quantidade = resumo.ruasPorSituacao[id] || 0;
    const parte = percentual(quantidade, resumo.ruas);
    return `${quantidade} ${quantidade === 1 ? 'rua' : 'ruas'}${parte != null ? ` · ${parte}%` : ''}`;
  };

  const cartoes = CARTOES.map(({ id, Icone, cor }) => ({
    id,
    Icone,
    cor,
    rotulo: rotuloDe(id),
    valor: valorDe(id),
    aoClicar: onSelecionar ? () => onSelecionar(id, rotuloDe(id)) : null,
  }));

  // "Sem informação" só existe quando há o que informar. Um zero permanente
  // ocuparia um quarto da faixa para não dizer nada.
  if (resumo.ruasPorSituacao.unknown > 0) {
    cartoes.push({
      id: 'unknown',
      Icone: HelpCircle,
      cor: 'ponto-legenda-pav--unknown',
      rotulo: 'Sem informação',
      valor: valorDe('unknown'),
    });
  }

  return <CartoesDeMapa cartoes={cartoes} />;
}
