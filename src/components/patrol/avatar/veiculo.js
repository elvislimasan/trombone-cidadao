// O carro do modo "dirigindo", visto de trás no mapa e de frente na escolha.
//
// UM CONJUNTO DE MEDIDAS POR MODELO, E NÃO UM SVG POR MODELO
//
// A diferença entre um sedan e uma picape é altura de teto, comprimento e o que
// tem nas pontas — não um desenho inteiro novo. `janela` é separada do teto
// porque na van ela fica na porta traseira, abaixo da linha do teto.
//
// E A MESMA TABELA SERVE ÀS DUAS CÂMERAS
//
// De frente ou de trás, a silhueta de um carro é a mesma: largura, altura de
// teto, altura de vidro. O que muda é o que se pendura nela — lanterna vermelha
// atrás, farol quente e grade na frente, retrovisor só na frente. Fosse uma
// tabela por câmera, mexer na largura do SUV pediria duas edições, e um dia
// alguém faria só uma.
//
// AS MEDIDAS VIVEM NO QUADRO NOVO
//
// O quadro do avatar passou de 40x48 para 256x320 (ver `geometria.js`). O carro
// acompanhou: os números abaixo estão no espaço grande, e a base da lataria
// pousa em 265 — a mesma proporção de antes, para o disco luminoso do CSS
// continuar centrado onde estava.

import { MEIO } from './geometria';
import { marca, clarear, escurecer, montarDefs, montarPaleta } from './paleta';

const VEICULOS = {
  sedan: { largura: 179, corpoY: 131, corpoH: 134, corpoRx: 41, tetoW: 134, tetoY: 99, tetoRx: 33, janelaY: 109, janelaH: 42 },
  suv: { largura: 189, corpoY: 114, corpoH: 151, corpoRx: 33, tetoW: 150, tetoY: 76, tetoRx: 28, janelaY: 88, janelaH: 46, rack: true },
  picape: { largura: 186, corpoY: 121, corpoH: 145, corpoRx: 27, tetoW: 137, tetoY: 82, tetoRx: 24, janelaY: 93, janelaH: 41, cacamba: true },
  esportivo: { largura: 195, corpoY: 149, corpoH: 116, corpoRx: 46, tetoW: 131, tetoY: 118, tetoRx: 41, janelaY: 128, janelaH: 33, spoiler: true },
  utilitario: { largura: 182, corpoY: 98, corpoH: 168, corpoRx: 23, tetoW: 154, tetoY: 67, tetoRx: 20, janelaY: 111, janelaH: 55 },
};

/* --- O que só existe atrás --- */

const traseira = (v, g, p, s) => `
  ${v.cacamba
    ? `<rect x="${g.x + 17}" y="${v.corpoY + 12}" width="${v.largura - 33}" height="${v.corpoH * 0.4}" rx="15"
         fill="${escurecer(p.cor.base, 0.34)}" stroke="none" />`
    : marca(g.meio, v.corpoY + v.corpoH * 0.34, 1.15, clarear(p.cor.base, 0.55))}

  <g class="patrol-avatar__taillights" stroke="none">
    <rect x="${g.x + 12}" y="${g.base - 55}" width="45" height="23" rx="11" fill="url(#g-lanterna-${s})" />
    <rect x="${g.x + v.largura - 56}" y="${g.base - 55}" width="45" height="23" rx="11" fill="url(#g-lanterna-${s})" />
  </g>
  <rect x="${g.meio - 29}" y="${g.base - 31}" width="59" height="19" rx="8" fill="url(#g-metal-${s})" stroke="none" />
`;

/* --- O que só existe na frente --- */

// De frente o carro ganha o que faz um carro ser reconhecido de longe: dois
// faróis acesos, uma grade escura entre eles e o capô. É bem mais rosto do que
// uma traseira jamais teve — que é justamente o motivo de a escolha usar esta
// câmera.
const frente = (v, g, p, s) => `
  <path d="M${g.x + 15} ${v.corpoY + v.corpoH * 0.3} C${g.meio - 38} ${v.corpoY + v.corpoH * 0.24} ${g.meio + 38} ${v.corpoY + v.corpoH * 0.24} ${g.x + v.largura - 15} ${v.corpoY + v.corpoH * 0.3}"
    fill="none" stroke="${escurecer(p.cor.base, 0.34)}" stroke-width="3.5" opacity="0.7" stroke-linecap="round" />

  <g class="patrol-avatar__headlights" stroke="none">
    <path d="M${g.x + 10} ${g.base - 58} h35 c9 0 14 5 14 12 c0 7 -5 12 -14 12 h-35 c-6 0 -10 -4 -10 -12 c0 -8 4 -12 10 -12 Z"
      fill="url(#g-farol-${s})" />
    <path d="M${g.x + v.largura - 10} ${g.base - 58} h-35 c-9 0 -14 5 -14 12 c0 7 5 12 14 12 h35 c6 0 10 -4 10 -12 c0 -8 -4 -12 -10 -12 Z"
      fill="url(#g-farol-${s})" />
  </g>

  <!-- A grade e o para-choque. O vão escuro entre os faróis é o que impede a
       frente de virar uma parede lisa com dois adesivos. -->
  <rect x="${g.meio - 35}" y="${g.base - 54}" width="69" height="20" rx="7"
    fill="${escurecer(p.equipamento, 0.2)}" stroke="none" />
  <g stroke="${clarear(p.equipamento, 0.3)}" stroke-width="2.6" opacity="0.6">
    <path d="M${g.meio - 28} ${g.base - 48} h56" />
    <path d="M${g.meio - 28} ${g.base - 41} h56" />
  </g>
  <rect x="${g.meio - 29}" y="${g.base - 31}" width="59" height="19" rx="8" fill="url(#g-metal-${s})" stroke="none" />
  ${marca(g.meio, g.base - 44, 0.62, clarear(p.cor.base, 0.7))}
`;

// O retrovisor não existe atrás e é o detalhe que mais rápido diz "estou vendo
// a frente deste carro".
const retrovisores = (v, g, p, s) => `
  <g class="patrol-avatar__mirrors">
    <path d="M${g.tetoX - 3} ${v.janelaY + 9} h-15 c-6 0 -9 4 -9 8 c0 5 3 8 9 8 h15 Z"
      fill="url(#g-teto-${s})" />
    <path d="M${g.tetoX + v.tetoW + 3} ${v.janelaY + 9} h15 c6 0 9 4 9 8 c0 5 -3 8 -9 8 h-15 Z"
      fill="url(#g-teto-${s})" />
  </g>
`;

export const figuraDirigindo = (camera, avatar, s) => {
  // O carro não veste o estilo de quem dirige: quem aparece é o veículo, e o
  // colete tático não muda a lataria.
  const p = montarPaleta({ ...avatar, estilo: 'classico' });
  const v = VEICULOS[avatar.veiculo] || VEICULOS.sedan;
  const meio = MEIO;
  const x = meio - v.largura / 2;
  const tetoX = meio - v.tetoW / 2;
  const base = v.corpoY + v.corpoH;
  const g = { x, tetoX, meio, base };

  return `
    ${montarDefs(p, s)}

    <ellipse class="patrol-avatar__ground" cx="${meio}" cy="${base + 6}"
      rx="${v.largura * 0.55}" ry="11" fill="url(#g-oc-${s})" stroke="none" />

    <g class="patrol-avatar__figure">
      <rect x="${x - 9}" y="${base - 58}" width="23" height="49" rx="10" fill="url(#g-equip-${s})" />
      <rect x="${x + v.largura - 14}" y="${base - 58}" width="23" height="49" rx="10" fill="url(#g-equip-${s})" />

      ${v.spoiler && camera === 'costas'
        ? `<rect x="${x + 6}" y="${v.corpoY - 17}" width="${v.largura - 13}" height="17" rx="8" fill="url(#g-teto-${s})" />`
        : ''}
      ${v.rack
        ? `<g stroke="none">
             <rect x="${tetoX + 10}" y="${v.tetoY - 9}" width="13" height="${v.corpoY - v.tetoY + 19}" rx="6" fill="${p.equipamento}" />
             <rect x="${tetoX + v.tetoW - 23}" y="${v.tetoY - 9}" width="13" height="${v.corpoY - v.tetoY + 19}" rx="6" fill="${p.equipamento}" />
           </g>`
        : ''}

      ${camera === 'frente' ? retrovisores(v, g, p, s) : ''}

      <rect x="${tetoX}" y="${v.tetoY}" width="${v.tetoW}" height="${v.corpoY - v.tetoY + 51}" rx="${v.tetoRx}" fill="url(#g-teto-${s})" />
      <rect x="${x}" y="${v.corpoY}" width="${v.largura}" height="${v.corpoH}" rx="${v.corpoRx}" fill="url(#g-corpo-${s})" />

      ${camera === 'frente' ? frente(v, g, p, s) : traseira(v, g, p, s)}

      <!-- O vidro entra por último: na van ele fica na porta, abaixo do teto. -->
      <g class="patrol-avatar__glass">
        <rect x="${tetoX + 14}" y="${v.janelaY}" width="${v.tetoW - 28}" height="${v.janelaH}" rx="15" fill="url(#g-vidro-${s})" />
        <path d="M${tetoX + 22} ${v.janelaY + v.janelaH - 5} L${tetoX + 49} ${v.janelaY + 5} L${tetoX + 70} ${v.janelaY + 5} L${tetoX + 44} ${v.janelaY + v.janelaH - 5} Z"
          fill="#fff" opacity="0.14" stroke="none" />
      </g>

      <rect x="${x}" y="${v.corpoY}" width="${v.largura}" height="${v.corpoH}" rx="${v.corpoRx}" fill="url(#g-vol-${s})" stroke="none" />
      <rect x="${x + 19}" y="${v.corpoY + 4}" width="${v.largura - 38}" height="13" rx="6" fill="url(#g-luz-${s})" stroke="none" />
    </g>
  `;
};
