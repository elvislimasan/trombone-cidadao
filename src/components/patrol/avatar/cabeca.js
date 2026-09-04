// A CABEÇA: crânio, pescoço, orelhas, rosto e capuz.
//
// É AQUI QUE O BONECO DEIXA DE SER UM ÍCONE
//
// A cabeça ocupa mais de um terço da figura, e isso é a decisão que carrega o
// desenho inteiro. Num marcador de 48x60px, um boneco de proporção realista
// entrega um rosto de dois pixels — ou seja, nenhum, e o olho lê "pino". Com a
// proporção chibi o rosto sobrevive, e rosto é o que faz o olho ler "pessoa".
//
// O CRÂNIO É UM PATH, NÃO UMA ELIPSE
//
// Elipse pura lê como bola: não tem para onde apontar. O crânio é largo em
// cima e afunila num queixo arredondado — é esse afunilamento que dá
// orientação à cabeça mesmo quando nenhuma feição é distinguível.
//
// AS FEIÇÕES SÃO POUCAS E GRANDES
//
// Olho é uma amêndoa escura com dois brilhos; nariz é uma sombra, não um
// traço; boca é uma curva. Qualquer detalhe menor que isso vira sujeira na
// escala do mapa, e sujeira custa mais legibilidade do que entrega.

import { CRANEO as C, MEIO, ORELHA, PESCOCO, ROSTO } from './geometria';
import { clarear, escurecer } from './paleta';
import { cabeloAtras, cabeloSobre } from './cabelo';
import { acessorioDaCabeca, escondeOrelha } from './acessorios';

/* --- Crânio --- */

const craneoPath = `M${C.cx - C.rx} ${C.cy + 4}
  C${C.cx - C.rx} ${C.topo + 12} ${C.cx - 34} ${C.topo} ${C.cx} ${C.topo}
  C${C.cx + 34} ${C.topo} ${C.cx + C.rx} ${C.topo + 12} ${C.cx + C.rx} ${C.cy + 4}
  C${C.cx + C.rx} ${C.queixo - 24} ${C.cx + 30} ${C.queixo} ${C.cx} ${C.queixo}
  C${C.cx - 30} ${C.queixo} ${C.cx - C.rx} ${C.queixo - 24} ${C.cx - C.rx} ${C.cy + 4} Z`;

const craneo = (s) => `
  <path class="patrol-avatar__skull" d="${craneoPath}" fill="url(#g-pele-${s})" />
  <!-- A luz de borda no lado que recebe o sol. É o que dá casca à cabeça sem
       um contorno grosso, que a esta escala engordaria o desenho. -->
  <path d="M${C.cx - C.rx + 4} ${C.cy - 6}
    C${C.cx - C.rx + 5} ${C.topo + 18} ${C.cx - 30} ${C.topo + 5} ${C.cx - 6} ${C.topo + 3}"
    fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.26" />
  <path d="${craneoPath}" fill="url(#g-interna-${s})" stroke="none" />
`;

const orelhas = (p, s) => `
  <g class="patrol-avatar__ears">
    <ellipse cx="${MEIO - ORELHA.dx}" cy="${ORELHA.cy}" rx="${ORELHA.rx}" ry="${ORELHA.ry}"
      fill="url(#g-pele-${s})" />
    <ellipse cx="${MEIO + ORELHA.dx}" cy="${ORELHA.cy}" rx="${ORELHA.rx}" ry="${ORELHA.ry}"
      fill="url(#g-pele-${s})" />
    <g fill="none" stroke="${escurecer(p.pele, 0.3)}" stroke-width="3.4"
       stroke-linecap="round" opacity="0.7">
      <path d="M${MEIO - ORELHA.dx - 2} ${ORELHA.cy - 5} C${MEIO - ORELHA.dx - 6} ${ORELHA.cy} ${MEIO - ORELHA.dx - 5} ${ORELHA.cy + 6} ${MEIO - ORELHA.dx - 1} ${ORELHA.cy + 9}" />
      <path d="M${MEIO + ORELHA.dx + 2} ${ORELHA.cy - 5} C${MEIO + ORELHA.dx + 6} ${ORELHA.cy} ${MEIO + ORELHA.dx + 5} ${ORELHA.cy + 6} ${MEIO + ORELHA.dx + 1} ${ORELHA.cy + 9}" />
    </g>
  </g>
`;

// O pescoço entra depois do tronco para caber dentro da gola, e leva por cima a
// sombra do queixo: é ela que o encaixa no corpo em vez de encostá-lo.
const pescoco = (p, s) => `
  <g class="patrol-avatar__neck">
    <path d="M${PESCOCO.x} ${PESCOCO.topo}
      h${PESCOCO.largura}
      v${PESCOCO.base - PESCOCO.topo - 14}
      c0 14 -${PESCOCO.largura} 14 -${PESCOCO.largura} 0 Z"
      fill="url(#g-membro-${s})" />
    <ellipse cx="${MEIO}" cy="${PESCOCO.topo + 14}" rx="21" ry="10"
      fill="${escurecer(p.pele, 0.36)}" stroke="none" opacity="0.6" />
  </g>
`;

/* --- Rosto --- */

// Um olho é a amêndoa mais dois brilhos. O brilho grande fora de centro é o
// que separa "olhar" de "furo preto"; o pequeno, embaixo, é o que dá a
// curvatura molhada do 2.5D. A esta escala são dois pixels que carregam a
// expressão inteira.
const olho = (cx, p) => `
  <ellipse cx="${cx}" cy="${ROSTO.olhoY}" rx="${ROSTO.olhoRx}" ry="${ROSTO.olhoRy}"
    fill="${p.olho}" stroke="none" />
  <ellipse cx="${cx}" cy="${ROSTO.olhoY + ROSTO.olhoRy - 5}" rx="${ROSTO.olhoRx - 2}" ry="5"
    fill="${clarear(p.olho, 0.28)}" stroke="none" opacity="0.75" />
  <circle cx="${cx - 4}" cy="${ROSTO.olhoY - 5}" r="4.4" fill="#ffffff" stroke="none" opacity="0.95" />
  <circle cx="${cx + 4}" cy="${ROSTO.olhoY + 5}" r="2.1" fill="#ffffff" stroke="none" opacity="0.6" />
`;

const rosto = (p) => {
  const e = MEIO - ROSTO.olhoDx;
  const d = MEIO + ROSTO.olhoDx;

  return `
    <g class="patrol-avatar__face" stroke="none">
      ${p.sexo === 'feminino'
        ? `<g fill="none" stroke="${escurecer(p.cabelo, 0.1)}" stroke-width="4.6"
             stroke-linecap="round" opacity="0.9">
             <path d="M${e - 13} ${ROSTO.sobrancelhaY + 2} C${e - 5} ${ROSTO.sobrancelhaY - 4} ${e + 6} ${ROSTO.sobrancelhaY - 5} ${e + 13} ${ROSTO.sobrancelhaY}" />
             <path d="M${d - 13} ${ROSTO.sobrancelhaY} C${d - 6} ${ROSTO.sobrancelhaY - 5} ${d + 5} ${ROSTO.sobrancelhaY - 4} ${d + 13} ${ROSTO.sobrancelhaY + 2}" />
           </g>`
        : `<g fill="${escurecer(p.cabelo, 0.1)}" opacity="0.92">
             <rect x="${e - 14}" y="${ROSTO.sobrancelhaY - 3}" width="27" height="6" rx="3" />
             <rect x="${d - 13}" y="${ROSTO.sobrancelhaY - 3}" width="27" height="6" rx="3" />
           </g>`}

      ${olho(e, p)}
      ${olho(d, p)}

      ${p.sexo === 'feminino'
        ? `<g fill="none" stroke="${p.olho}" stroke-width="3" stroke-linecap="round" opacity="0.85">
             <path d="M${e - 12} ${ROSTO.olhoY - 8} l-6 -4" />
             <path d="M${e - 14} ${ROSTO.olhoY - 1} l-7 -1" />
             <path d="M${d + 12} ${ROSTO.olhoY - 8} l6 -4" />
             <path d="M${d + 14} ${ROSTO.olhoY - 1} l7 -1" />
           </g>`
        : ''}

      <!-- O nariz é sombra, não linha: um traço nesta escala vira um risco no
           meio do rosto. -->
      <ellipse cx="${MEIO}" cy="${ROSTO.narizY}" rx="6" ry="4"
        fill="${escurecer(p.pele, 0.26)}" opacity="0.72" />
      <path d="M${MEIO - 14} ${ROSTO.bocaY} C${MEIO - 7} ${ROSTO.bocaY + 9} ${MEIO + 7} ${ROSTO.bocaY + 9} ${MEIO + 14} ${ROSTO.bocaY}"
        fill="none" stroke="${escurecer(p.pele, 0.44)}" stroke-width="4" stroke-linecap="round" />

      <!-- Um pouco de cor nas maçãs. Sem isso a pele fica de manequim. -->
      <g fill="${escurecer(p.pele, 0.12)}" opacity="0.42">
        <ellipse cx="${MEIO - ROSTO.ruborDx}" cy="${ROSTO.ruborY}" rx="13" ry="8" />
        <ellipse cx="${MEIO + ROSTO.ruborDx}" cy="${ROSTO.ruborY}" rx="13" ry="8" />
      </g>
    </g>
  `;
};

/* --- Capuz --- */
// Ele é peça de roupa, mas mora aqui: é a cabeça que ele veste, e é junto dela
// que precisa balançar. De frente emoldura o rosto com duas abas; de costas é
// uma cúpula com a costura da nuca.

const CAPUZ = `M${MEIO - 58} 92
  C${MEIO - 58} 34 ${MEIO - 32} 8 ${MEIO} 8
  C${MEIO + 32} 8 ${MEIO + 58} 34 ${MEIO + 58} 92
  C${MEIO + 58} 118 ${MEIO + 46} 134 ${MEIO + 38} 134
  H${MEIO - 38}
  C${MEIO - 46} 134 ${MEIO - 58} 118 ${MEIO - 58} 92 Z`;

const capuzAtras = (p, s) => (p.estilo.capuz
  ? `<g class="patrol-avatar__hood patrol-avatar__hood--shell">
       <path d="${CAPUZ}" fill="url(#g-roupa-${s})" />
       <path d="${CAPUZ}" fill="url(#g-vol-${s})" stroke="none" />
     </g>`
  : '');

const capuzFrente = (camera, p) => {
  if (!p.estilo.capuz) return '';

  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__hood">
        <path d="M${MEIO - 42} 116 C${MEIO - 20} 132 ${MEIO + 20} 132 ${MEIO + 42} 116"
          fill="none" stroke="${escurecer(p.roupa, 0.36)}" stroke-width="4.6"
          stroke-linecap="round" opacity="0.72" />
        <path d="M${MEIO} 14 C${MEIO - 4} 54 ${MEIO - 4} 92 ${MEIO} 126"
          fill="none" stroke="${escurecer(p.roupa, 0.3)}" stroke-width="4"
          stroke-linecap="round" opacity="0.5" />
      </g>
    `;
  }

  // As duas abas caem por cima do cabelo e o interior fica na sombra. É a
  // sombra que diz que existe um vão entre o tecido e a cabeça.
  return `
    <g class="patrol-avatar__hood">
      <path d="M${MEIO - 58} 86 C${MEIO - 58} 52 ${MEIO - 47} 30 ${MEIO - 33} 20
        C${MEIO - 45} 42 ${MEIO - 49} 66 ${MEIO - 46} 96
        C${MEIO - 45} 114 ${MEIO - 40} 126 ${MEIO - 35} 132
        H${MEIO - 38} C${MEIO - 46} 132 ${MEIO - 58} 116 ${MEIO - 58} 86 Z"
        fill="${escurecer(p.roupa, 0.36)}" stroke="none" />
      <path d="M${MEIO + 58} 86 C${MEIO + 58} 52 ${MEIO + 47} 30 ${MEIO + 33} 20
        C${MEIO + 45} 42 ${MEIO + 49} 66 ${MEIO + 46} 96
        C${MEIO + 45} 114 ${MEIO + 40} 126 ${MEIO + 35} 132
        H${MEIO + 38} C${MEIO + 46} 132 ${MEIO + 58} 116 ${MEIO + 58} 86 Z"
        fill="${escurecer(p.roupa, 0.36)}" stroke="none" />
      <path d="M${MEIO - 48} 46 C${MEIO - 26} 26 ${MEIO + 26} 26 ${MEIO + 48} 46"
        fill="none" stroke="${clarear(p.roupa, 0.3)}" stroke-width="5"
        stroke-linecap="round" opacity="0.4" />
    </g>
  `;
};

/**
 * @param {'frente'|'costas'} camera
 * @param {object} p         paleta já montada
 * @param {string} s         sufixo dos gradientes
 * @param {string} acessorio id do acessório escolhido
 */
export const cabeca = (camera, p, s, acessorio) => `
  <g class="patrol-avatar__head">
    ${capuzAtras(p, s)}
    ${cabeloAtras(camera, p, s)}
    ${pescoco(p, s)}
    ${craneo(s)}
    ${escondeOrelha(acessorio) ? '' : orelhas(p, s)}
    ${cabeloSobre(camera, p, s)}
    ${capuzFrente(camera, p)}
    ${camera === 'frente'
      ? rosto(p)
      : `<!-- De costas não há rosto: o que orienta a cabeça é a nuca, e o que a
              encaixa no tronco é a sombra que ela projeta na gola. -->
         <ellipse cx="${MEIO}" cy="${C.queixo - 4}" rx="30" ry="12"
           fill="url(#g-oc-${s})" stroke="none" />`}
    ${acessorioDaCabeca(acessorio, camera, p, s)}
  </g>
`;
