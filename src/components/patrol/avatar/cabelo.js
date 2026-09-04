// O CABELO, QUE AGORA É UMA PEÇA COM VIDA PRÓPRIA.
//
// POR QUE ELE SAIU DE DENTRO DO ESTILO DE ROUPA
//
// Antes existia um estilo chamado "cabelo longo" na mesma lista do colete
// tático. Isso obrigava a escolher entre um corte e um traje, e escondia a
// única escolha que muda a leitura da cabeça na miniatura. Corte e cor agora
// são eixos próprios: qualquer cabelo com qualquer roupa.
//
// TODO CORTE TEM DUAS CAMADAS, E A ORDEM É O DESENHO INTEIRO
//
//   `atras` — a massa que fica ATRÁS do crânio: rabo, cachos, cortina longa,
//             coque. Entra antes da cabeça e por isso cai por cima do tronco e
//             da mochila, que é onde cabelo comprido de verdade fica.
//   `sobre` — o que COBRE o crânio: calota, franja, nuca. Entra depois, e é o
//             que decide onde o rosto começa.
//
// Separar as duas é o que permite um corte volumoso não engolir o rosto: a
// massa cresce para trás enquanto a franja continua parando na testa.
//
// A FRANJA É RECORTADA, E ISSO NÃO É ENFEITE
//
// Calota com borda inferior lisa lê como CAPACETE, não como cabelo — foi o que
// mais fez o boneco antigo parecer um brinquedo de plástico. O recorte
// irregular na linha da testa custa três curvas e resolve.

import { CRANEO as C, MEIO, ROSTO } from './geometria';
import { clarear, escurecer } from './paleta';

const x = (lado, distancia) => MEIO + lado * distancia;

/* --- Primitivas compartilhadas --- */

// A calota da câmera frontal: cobre o alto do crânio, desce pelas laterais e
// para na testa com um recorte de franja.
const calota = (p, s, { franja = ROSTO.franjaY, alturaExtra = 8 } = {}) => `
  <path d="M${C.cx - C.rx - 3} ${C.cy + 14}
    C${C.cx - C.rx - 3} ${C.topo - alturaExtra + 12} ${C.cx - 36} ${C.topo - alturaExtra} ${C.cx} ${C.topo - alturaExtra}
    C${C.cx + 36} ${C.topo - alturaExtra} ${C.cx + C.rx + 3} ${C.topo - alturaExtra + 12} ${C.cx + C.rx + 3} ${C.cy + 14}
    C${C.cx + C.rx} ${franja + 18} ${C.cx + 32} ${franja - 6} ${C.cx + 14} ${franja + 4}
    C${C.cx + 3} ${franja + 9} ${C.cx - 11} ${franja + 8} ${C.cx - 23} ${franja - 1}
    C${C.cx - 38} ${franja - 10} ${C.cx - C.rx + 2} ${franja + 4} ${C.cx - C.rx - 3} ${C.cy + 14} Z"
    fill="url(#g-cabelo-${s})" />
`;

// A capa da câmera traseira: o mesmo crânio, coberto até onde o corte mandar.
const capaTraseira = (p, s, ate, { largura = C.rx + 3, alturaExtra = 10 } = {}) => `
  <path d="M${C.cx - largura} ${C.cy + 10}
    C${C.cx - largura} ${C.topo - alturaExtra + 10} ${C.cx - 36} ${C.topo - alturaExtra} ${C.cx} ${C.topo - alturaExtra}
    C${C.cx + 36} ${C.topo - alturaExtra} ${C.cx + largura} ${C.topo - alturaExtra + 10} ${C.cx + largura} ${C.cy + 10}
    C${C.cx + largura} ${ate - 22} ${C.cx + largura - 10} ${ate} ${C.cx} ${ate}
    C${C.cx - largura + 10} ${ate} ${C.cx - largura} ${ate - 22} ${C.cx - largura} ${C.cy + 10} Z"
    fill="url(#g-cabelo-${s})" />
`;

// O brilho da coroa. Um arco só, deslocado para a esquerda como toda luz deste
// boneco — é ele que impede o cabelo escuro de virar um buraco no desenho.
const brilhoCoroa = (p, deslocamentoY = 0) => `
  <path d="M${C.cx - 38} ${C.cy - 32 + deslocamentoY}
    C${C.cx - 24} ${C.cy - 52 + deslocamentoY} ${C.cx + 18} ${C.cy - 54 + deslocamentoY} ${C.cx + 34} ${C.cy - 38 + deslocamentoY}"
    fill="none" stroke="${clarear(p.cabelo, 0.4)}" stroke-width="7"
    stroke-linecap="round" opacity="0.45" />
`;

// Uma mecha lateral que desce até `ate`. Serve à cortina longa e à mecha média.
const mecha = (lado, p, s, ate, { espessura = 20 } = {}) => `
  <path d="M${x(lado, 56)} ${C.cy - 12}
    C${x(lado, 64)} ${C.cy + 26} ${x(lado, 62)} ${ate - 46} ${x(lado, 54)} ${ate}
    C${x(lado, 54 - espessura - 12)} ${ate + 9} ${x(lado, 54 - espessura - 22)} ${ate - 6} ${x(lado, 54 - espessura - 16)} ${ate - 22}
    C${x(lado, 44)} ${ate - 66} ${x(lado, 44)} ${C.cy + 22} ${x(lado, 40)} ${C.cy - 6} Z"
    fill="url(#g-cabelo-${s})" />
`;

// O rabo de cavalo, visto de trás: preso na altura da coroa e caindo até a
// linha da cintura. De frente sobra só o que escapa ao lado do pescoço.
const raboAtras = (p, s) => `
  <path d="M${MEIO - 17} 92
    C${MEIO - 17} 128 ${MEIO - 34} 150 ${MEIO - 33} 184
    C${MEIO - 33} 208 ${MEIO - 16} 224 ${MEIO} 224
    C${MEIO + 16} 224 ${MEIO + 33} 208 ${MEIO + 33} 184
    C${MEIO + 34} 150 ${MEIO + 17} 128 ${MEIO + 17} 92 Z"
    fill="url(#g-cabelo-${s})" />
  <path d="M${MEIO - 12} 132 C${MEIO - 22} 164 ${MEIO - 24} 192 ${MEIO - 20} 214"
    fill="none" stroke="${clarear(p.cabelo, 0.3)}" stroke-width="5"
    stroke-linecap="round" opacity="0.42" />
  <path d="M${MEIO + 10} 134 C${MEIO + 20} 166 ${MEIO + 22} 192 ${MEIO + 18} 214"
    fill="none" stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="4.5"
    stroke-linecap="round" opacity="0.5" />
`;

const elastico = (p, y) => `
  <ellipse cx="${MEIO}" cy="${y}" rx="18" ry="9" fill="${p.acento}" stroke="none" />
  <ellipse cx="${MEIO - 5}" cy="${y - 2.5}" rx="7" ry="3" fill="${clarear(p.acento, 0.45)}"
    stroke="none" opacity="0.7" />
`;

const coque = (p, s, cy) => `
  <circle cx="${MEIO}" cy="${cy}" r="27" fill="url(#g-cabelo-${s})" />
  <path d="M${MEIO - 17} ${cy - 8} C${MEIO - 8} ${cy - 20} ${MEIO + 10} ${cy - 20} ${MEIO + 18} ${cy - 9}"
    fill="none" stroke="${clarear(p.cabelo, 0.36)}" stroke-width="5.5"
    stroke-linecap="round" opacity="0.45" />
`;

// O volume crespo: uma silhueta de bordas onduladas, e não um círculo. O
// ondulado é o que faz o olho ler textura numa forma que, a 48px, tem doze
// pixels de raio.
const nuvem = (p, s, { escala = 1 } = {}) => {
  const r = 70 * escala;
  const b = 66 * escala;
  return `
    <path d="M${C.cx - r} ${C.cy + 4}
      C${C.cx - r - 4} ${C.cy - 34} ${C.cx - 50} ${C.cy - 62} ${C.cx - 24} ${C.cy - 66}
      C${C.cx - 10} ${C.cy - 80} ${C.cx + 14} ${C.cy - 80} ${C.cx + 26} ${C.cy - 65}
      C${C.cx + 52} ${C.cy - 60} ${C.cx + r + 4} ${C.cy - 32} ${C.cx + r} ${C.cy + 6}
      C${C.cx + r + 2} ${C.cy + 30} ${C.cx + 46} ${C.cy + b - 12} ${C.cx + 18} ${C.cy + b - 8}
      C${C.cx + 4} ${C.cy + b} ${C.cx - 10} ${C.cy + b} ${C.cx - 22} ${C.cy + b - 10}
      C${C.cx - 48} ${C.cy + b - 14} ${C.cx - r - 2} ${C.cy + 30} ${C.cx - r} ${C.cy + 4} Z"
      fill="url(#g-cabelo-${s})" />
    <g fill="${clarear(p.cabelo, 0.26)}" stroke="none" opacity="0.4">
      <ellipse cx="${C.cx - 34}" cy="${C.cy - 40}" rx="18" ry="13" />
      <ellipse cx="${C.cx + 6}" cy="${C.cy - 54}" rx="15" ry="10" />
    </g>
  `;
};

/* --- Os cortes --- */
//
// Cada corte é uma dupla de funções. Nenhum deles conhece o outro, e nenhum
// conhece o rosto: quem monta a cabeça chama `atras` antes do crânio e `sobre`
// depois. Um corte novo é uma entrada nesta tabela.

const CORTES = {
  // Quase rente. Existe para quem não quer cabelo nenhum na silhueta, e para
  // deixar o formato da cabeça aparecer.
  raspado: {
    atras: () => '',
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        ${capaTraseira(p, s, 104, { largura: C.rx, alturaExtra: 4 })}
        <path d="M${C.cx - 40} 96 C${C.cx - 18} 108 ${C.cx + 18} 108 ${C.cx + 40} 96"
          fill="none" stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="5"
          stroke-linecap="round" opacity="0.55" />
        ${brilhoCoroa(p, -4)}
      `
      : `
        ${calota(p, s, { franja: ROSTO.franjaY - 12, alturaExtra: 2 })}
        ${brilhoCoroa(p, -2)}
      `),
  },

  curto: {
    atras: () => '',
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        <!-- A nuca aparece entre duas costeletas: é esse recorte em V que
             impede a parte de trás da cabeça de ser uma bola lisa. -->
        <path d="M${C.cx - C.rx - 2} ${C.cy + 12}
          C${C.cx - C.rx - 2} 22 ${C.cx - 36} 6 ${C.cx} 6
          C${C.cx + 36} 6 ${C.cx + C.rx + 2} 22 ${C.cx + C.rx + 2} ${C.cy + 12}
          C${C.cx + C.rx} 108 ${C.cx + 40} 124 ${C.cx + 22} 130
          L${C.cx + 12} 106
          C${C.cx + 4} 111 ${C.cx - 4} 111 ${C.cx - 12} 106
          L${C.cx - 22} 130
          C${C.cx - 40} 124 ${C.cx - C.rx} 108 ${C.cx - C.rx - 2} ${C.cy + 12} Z"
          fill="url(#g-cabelo-${s})" />
        <path d="M${C.cx - 26} 104 C${C.cx - 12} 116 ${C.cx + 12} 116 ${C.cx + 26} 104"
          fill="none" stroke="${escurecer(p.cabelo, 0.34)}" stroke-width="5.5"
          stroke-linecap="round" opacity="0.65" />
        ${brilhoCoroa(p)}
      `
      : `
        ${calota(p, s)}
        ${brilhoCoroa(p)}
        <!-- A risca lateral. Uma linha só, e é o que dá lado à cabeça. -->
        <path d="M${C.cx - 30} ${ROSTO.franjaY + 2} C${C.cx - 26} ${C.cy - 44} ${C.cx - 6} ${C.cy - 54} ${C.cx + 16} ${C.cy - 50}"
          fill="none" stroke="${escurecer(p.cabelo, 0.32)}" stroke-width="4"
          stroke-linecap="round" opacity="0.5" />
      `),
  },

  medio: {
    atras: (camera, p, s) => (camera === 'costas' ? '' : `${mecha(-1, p, s, 138)}${mecha(1, p, s, 138)}`),
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        ${capaTraseira(p, s, 142)}
        <path d="M${C.cx - 48} 128 C${C.cx - 22} 142 ${C.cx + 22} 142 ${C.cx + 48} 128"
          fill="none" stroke="${escurecer(p.cabelo, 0.32)}" stroke-width="5"
          stroke-linecap="round" opacity="0.55" />
        <path d="M${C.cx - 6} 20 C${C.cx - 16} 60 ${C.cx - 14} 100 ${C.cx - 16} 132"
          fill="none" stroke="${clarear(p.cabelo, 0.28)}" stroke-width="5"
          stroke-linecap="round" opacity="0.4" />
        ${brilhoCoroa(p)}
      `
      : `
        ${calota(p, s)}
        ${brilhoCoroa(p)}
      `),
  },

  rabo: {
    atras: (camera, p, s) => (camera === 'costas'
      ? raboAtras(p, s)
      : `
        <!-- De frente o rabo não aparece: escapa só o que passa do contorno da
             cabeça, de cada lado do pescoço. -->
        <path d="M${x(-1, 54)} ${C.cy - 4} C${x(-1, 66)} ${C.cy + 34} ${x(-1, 62)} ${C.cy + 62} ${x(-1, 48)} ${C.cy + 70}
          C${x(-1, 38)} ${C.cy + 72} ${x(-1, 36)} ${C.cy + 50} ${x(-1, 40)} ${C.cy + 10} Z"
          fill="url(#g-cabelo-${s})" />
        <path d="M${x(1, 54)} ${C.cy - 4} C${x(1, 66)} ${C.cy + 34} ${x(1, 62)} ${C.cy + 62} ${x(1, 48)} ${C.cy + 70}
          C${x(1, 38)} ${C.cy + 72} ${x(1, 36)} ${C.cy + 50} ${x(1, 40)} ${C.cy + 10} Z"
          fill="url(#g-cabelo-${s})" />
      `),
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        ${capaTraseira(p, s, 108, { largura: C.rx + 1 })}
        <!-- O cabelo puxado: as linhas convergem para onde o elástico prende.
             Sem elas a capa lia como touca. -->
        <g fill="none" stroke="${clarear(p.cabelo, 0.3)}" stroke-width="4.5"
           stroke-linecap="round" opacity="0.45">
          <path d="M${C.cx - 44} 40 C${C.cx - 34} 66 ${C.cx - 20} 82 ${C.cx - 8} 90" />
          <path d="M${C.cx + 44} 40 C${C.cx + 34} 66 ${C.cx + 20} 82 ${C.cx + 8} 90" />
          <path d="M${C.cx} 22 C${C.cx - 2} 52 ${C.cx - 2} 74 ${C.cx} 88" />
        </g>
        ${elastico(p, 96)}
      `
      : `
        ${calota(p, s, { franja: ROSTO.franjaY - 4 })}
        ${brilhoCoroa(p)}
        <g fill="none" stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="4"
           stroke-linecap="round" opacity="0.48">
          <path d="M${C.cx - 34} ${ROSTO.franjaY + 4} C${C.cx - 30} ${C.cy - 46} ${C.cx - 12} ${C.cy - 56} ${C.cx} ${C.cy - 56}" />
          <path d="M${C.cx + 34} ${ROSTO.franjaY + 4} C${C.cx + 30} ${C.cy - 46} ${C.cx + 12} ${C.cy - 56} ${C.cx} ${C.cy - 56}" />
        </g>
      `),
  },

  longo: {
    atras: (camera, p, s) => (camera === 'costas'
      ? `
        <path d="M${C.cx - C.rx - 6} ${C.cy}
          C${C.cx - C.rx - 6} 20 ${C.cx - 36} 4 ${C.cx} 4
          C${C.cx + 36} 4 ${C.cx + C.rx + 6} 20 ${C.cx + C.rx + 6} ${C.cy}
          C${C.cx + 74} 128 ${C.cx + 70} 186 ${C.cx + 58} 222
          C${C.cx + 30} 236 ${C.cx - 30} 236 ${C.cx - 58} 222
          C${C.cx - 70} 186 ${C.cx - 74} 128 ${C.cx - C.rx - 6} ${C.cy} Z"
          fill="url(#g-cabelo-${s})" />
      `
      : `${mecha(-1, p, s, 206, { espessura: 26 })}${mecha(1, p, s, 206, { espessura: 26 })}`),
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        <g fill="none" stroke-linecap="round">
          <path d="M${C.cx - 8} 16 C${C.cx - 26} 76 ${C.cx - 30} 152 ${C.cx - 26} 214"
            stroke="${clarear(p.cabelo, 0.3)}" stroke-width="5" opacity="0.42" />
          <path d="M${C.cx + 10} 18 C${C.cx + 26} 78 ${C.cx + 30} 152 ${C.cx + 26} 214"
            stroke="${escurecer(p.cabelo, 0.28)}" stroke-width="4.5" opacity="0.5" />
          <path d="M${C.cx - 56} 172 C${C.cx - 24} 192 ${C.cx + 24} 192 ${C.cx + 56} 172"
            stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="5" opacity="0.4" />
        </g>
        ${brilhoCoroa(p, -6)}
      `
      : `
        ${calota(p, s)}
        ${brilhoCoroa(p)}
      `),
  },

  coque: {
    atras: (camera, p, s) => coque(p, s, camera === 'costas' ? 22 : 12),
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        ${capaTraseira(p, s, 118, { largura: C.rx + 1, alturaExtra: 4 })}
        <g fill="none" stroke="${clarear(p.cabelo, 0.3)}" stroke-width="4.5"
           stroke-linecap="round" opacity="0.45">
          <path d="M${C.cx - 46} 60 C${C.cx - 32} 46 ${C.cx - 14} 38 ${C.cx} 36" />
          <path d="M${C.cx + 46} 60 C${C.cx + 32} 46 ${C.cx + 14} 38 ${C.cx} 36" />
        </g>
        ${elastico(p, 40)}
      `
      : `
        <!-- Puxado para trás: a franja sobe e a testa fica inteira à mostra. É
             o que diferencia o coque do rabo nesta escala. -->
        ${calota(p, s, { franja: ROSTO.franjaY - 16, alturaExtra: 4 })}
        ${brilhoCoroa(p, -6)}
        <g fill="none" stroke="${escurecer(p.cabelo, 0.28)}" stroke-width="4"
           stroke-linecap="round" opacity="0.45">
          <path d="M${C.cx - 40} ${ROSTO.franjaY - 12} C${C.cx - 32} ${C.cy - 56} ${C.cx - 14} ${C.cy - 62} ${C.cx} ${C.cy - 62}" />
          <path d="M${C.cx + 40} ${ROSTO.franjaY - 12} C${C.cx + 32} ${C.cy - 56} ${C.cx + 14} ${C.cy - 62} ${C.cx} ${C.cy - 62}" />
        </g>
      `),
  },

  crespo: {
    atras: (camera, p, s) => nuvem(p, s, { escala: camera === 'costas' ? 1.04 : 1 }),
    sobre: (camera, p, s) => (camera === 'costas'
      ? `
        <g fill="${escurecer(p.cabelo, 0.26)}" stroke="none" opacity="0.45">
          <ellipse cx="${C.cx - 20}" cy="${C.cy + 34}" rx="22" ry="15" />
          <ellipse cx="${C.cx + 24}" cy="${C.cy + 30}" rx="19" ry="13" />
        </g>
        ${brilhoCoroa(p, -12)}
      `
      : `
        <!-- Sobre o rosto entra só a borda de baixo do volume, na linha da
             testa. O resto do cacho já está atrás da cabeça. -->
        <path d="M${C.cx - C.rx - 2} ${C.cy - 6}
          C${C.cx - C.rx - 6} ${C.cy - 40} ${C.cx - 34} ${C.cy - 58} ${C.cx} ${C.cy - 58}
          C${C.cx + 34} ${C.cy - 58} ${C.cx + C.rx + 6} ${C.cy - 40} ${C.cx + C.rx + 2} ${C.cy - 6}
          C${C.cx + 40} ${ROSTO.franjaY - 14} ${C.cx + 18} ${ROSTO.franjaY + 2} ${C.cx + 6} ${ROSTO.franjaY - 2}
          C${C.cx - 8} ${ROSTO.franjaY - 6} ${C.cx - 26} ${ROSTO.franjaY + 2} ${C.cx - 40} ${ROSTO.franjaY - 10} Z"
          fill="url(#g-cabelo-${s})" />
        ${brilhoCoroa(p, -8)}
      `),
  },
};

const escolher = (id) => CORTES[id] || CORTES.curto;

// As duas classes que o CSS e os testes conhecem. O corte é uma escolha de
// sete valores, mas o que importa para quem lê a silhueta é se sobra cabelo
// abaixo da orelha — é isso que muda a mancha do boneco no mapa.
const VOLUMOSOS = new Set(['longo', 'medio', 'rabo', 'crespo', 'coque']);

const classe = (id) =>
  `patrol-avatar__hair patrol-avatar__hair--${VOLUMOSOS.has(id) ? 'long' : 'short'} patrol-avatar__hair--${id}`;

/** A massa que fica ATRÁS do crânio. Entra antes da cabeça. */
export const cabeloAtras = (camera, p, s) => {
  const corte = escolher(p.cabeloId);
  const desenho = corte.atras(camera, p, s);
  return desenho.trim()
    ? `<g class="${classe(p.cabeloId)} patrol-avatar__hair--behind">${desenho}</g>`
    : '';
};

/** O que COBRE o crânio. Entra depois da cabeça e decide onde o rosto começa. */
export const cabeloSobre = (camera, p, s) =>
  `<g class="${classe(p.cabeloId)}">${escolher(p.cabeloId).sobre(camera, p, s)}</g>`;
