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

import { marca, clarear, escurecer, montarDefs, montarPaleta } from './paleta';

const VEICULOS = {
  sedan: { largura: 28, corpoY: 18.6, corpoH: 21, corpoRx: 6.4, tetoW: 21, tetoY: 13.6, tetoRx: 5.2, janelaY: 15.2, janelaH: 6.6 },
  suv: { largura: 29.6, corpoY: 16, corpoH: 23.6, corpoRx: 5.2, tetoW: 23.4, tetoY: 10, tetoRx: 4.4, janelaY: 11.8, janelaH: 7.2, rack: true },
  picape: { largura: 29, corpoY: 17, corpoH: 22.6, corpoRx: 4.2, tetoW: 21.4, tetoY: 11, tetoRx: 3.8, janelaY: 12.6, janelaH: 6.4, cacamba: true },
  esportivo: { largura: 30.4, corpoY: 21.4, corpoH: 18.2, corpoRx: 7.2, tetoW: 20.4, tetoY: 16.6, tetoRx: 6.4, janelaY: 18.2, janelaH: 5.2, spoiler: true },
  utilitario: { largura: 28.4, corpoY: 13.4, corpoH: 26.2, corpoRx: 3.6, tetoW: 24, tetoY: 8.6, tetoRx: 3.2, janelaY: 15.4, janelaH: 8.6 },
};

/* --- O que só existe atrás --- */

const traseira = (v, g, p, s) => `
  ${v.cacamba
    ? `<rect x="${g.x + 2.6}" y="${v.corpoY + 1.8}" width="${v.largura - 5.2}" height="${v.corpoH * 0.4}" rx="2.4"
         fill="${escurecer(p.cor.base, 0.34)}" stroke="none" />`
    : marca(g.meio, v.corpoY + v.corpoH * 0.34, 1.15, clarear(p.cor.base, 0.55))}

  <g class="patrol-avatar__taillights" stroke="none">
    <rect x="${g.x + 1.8}" y="${g.base - 8.6}" width="7" height="3.6" rx="1.7" fill="url(#g-lanterna-${s})" />
    <rect x="${g.x + v.largura - 8.8}" y="${g.base - 8.6}" width="7" height="3.6" rx="1.7" fill="url(#g-lanterna-${s})" />
  </g>
  <rect x="${g.meio - 4.6}" y="${g.base - 4.8}" width="9.2" height="3" rx="1.3" fill="url(#g-metal-${s})" stroke="none" />
`;

/* --- O que só existe na frente --- */

// De frente o carro ganha o que faz um carro ser reconhecido de longe: dois
// faróis acesos, uma grade escura entre eles e o capô. É bem mais rosto do que
// uma traseira jamais teve — que é justamente o motivo de a escolha usar esta
// câmera.
const frente = (v, g, p, s) => `
  <path d="M${g.x + 2.4} ${v.corpoY + v.corpoH * 0.3} C${g.meio - 6} ${v.corpoY + v.corpoH * 0.24} ${g.meio + 6} ${v.corpoY + v.corpoH * 0.24} ${g.x + v.largura - 2.4} ${v.corpoY + v.corpoH * 0.3}"
    fill="none" stroke="${escurecer(p.cor.base, 0.34)}" stroke-width="0.55" opacity="0.7" stroke-linecap="round" />

  <g class="patrol-avatar__headlights" stroke="none">
    <path d="M${g.x + 1.6} ${g.base - 9} h5.4 c1.4 0 2.2 0.8 2.2 1.9 c0 1.1 -0.8 1.9 -2.2 1.9 h-5.4 c-1 0 -1.5 -0.7 -1.5 -1.9 c0 -1.2 0.5 -1.9 1.5 -1.9 Z"
      fill="url(#g-farol-${s})" />
    <path d="M${g.x + v.largura - 1.6} ${g.base - 9} h-5.4 c-1.4 0 -2.2 0.8 -2.2 1.9 c0 1.1 0.8 1.9 2.2 1.9 h5.4 c1 0 1.5 -0.7 1.5 -1.9 c0 -1.2 -0.5 -1.9 -1.5 -1.9 Z"
      fill="url(#g-farol-${s})" />
  </g>

  <!-- A grade e o para-choque. O vão escuro entre os faróis é o que impede a
       frente de virar uma parede lisa com dois adesivos. -->
  <rect x="${g.meio - 5.4}" y="${g.base - 8.4}" width="10.8" height="3.2" rx="1.1"
    fill="${escurecer(p.equipamento, 0.2)}" stroke="none" />
  <g stroke="${clarear(p.equipamento, 0.3)}" stroke-width="0.4" opacity="0.6">
    <path d="M${g.meio - 4.4} ${g.base - 7.5} h8.8" />
    <path d="M${g.meio - 4.4} ${g.base - 6.4} h8.8" />
  </g>
  <rect x="${g.meio - 4.6}" y="${g.base - 4.8}" width="9.2" height="3" rx="1.3" fill="url(#g-metal-${s})" stroke="none" />
  ${marca(g.meio, g.base - 6.9, 0.62, clarear(p.cor.base, 0.7))}
`;

// O retrovisor não existe atrás e é o detalhe que mais rápido diz "estou vendo
// a frente deste carro".
const retrovisores = (v, g, p, s) => `
  <g class="patrol-avatar__mirrors">
    <path d="M${g.tetoX - 0.4} ${v.janelaY + 1.4} h-2.4 c-0.9 0 -1.4 0.6 -1.4 1.3 c0 0.8 0.5 1.3 1.4 1.3 h2.4 Z"
      fill="url(#g-teto-${s})" />
    <path d="M${g.tetoX + v.tetoW + 0.4} ${v.janelaY + 1.4} h2.4 c0.9 0 1.4 0.6 1.4 1.3 c0 0.8 -0.5 1.3 -1.4 1.3 h-2.4 Z"
      fill="url(#g-teto-${s})" />
  </g>
`;

export const figuraDirigindo = (camera, avatar, s) => {
  // O carro não veste o estilo de quem dirige: quem aparece é o veículo, e o
  // colete tático não muda a lataria.
  const p = montarPaleta({ ...avatar, estilo: 'classico' });
  const v = VEICULOS[avatar.veiculo] || VEICULOS.sedan;
  const meio = 20;
  const x = meio - v.largura / 2;
  const tetoX = meio - v.tetoW / 2;
  const base = v.corpoY + v.corpoH;
  const g = { x, tetoX, meio, base };

  return `
    ${montarDefs(p, s)}
    <g class="patrol-avatar__figure">
      <rect x="${x - 1.4}" y="${base - 9}" width="3.6" height="7.6" rx="1.6" fill="url(#g-equip-${s})" />
      <rect x="${x + v.largura - 2.2}" y="${base - 9}" width="3.6" height="7.6" rx="1.6" fill="url(#g-equip-${s})" />

      ${v.spoiler && camera === 'costas'
        ? `<rect x="${x + 1}" y="${v.corpoY - 2.6}" width="${v.largura - 2}" height="2.6" rx="1.3" fill="url(#g-teto-${s})" />`
        : ''}
      ${v.rack
        ? `<g stroke="none">
             <rect x="${tetoX + 1.6}" y="${v.tetoY - 1.4}" width="2" height="${v.corpoY - v.tetoY + 3}" rx="1" fill="${p.equipamento}" />
             <rect x="${tetoX + v.tetoW - 3.6}" y="${v.tetoY - 1.4}" width="2" height="${v.corpoY - v.tetoY + 3}" rx="1" fill="${p.equipamento}" />
           </g>`
        : ''}

      ${camera === 'frente' ? retrovisores(v, g, p, s) : ''}

      <rect x="${tetoX}" y="${v.tetoY}" width="${v.tetoW}" height="${v.corpoY - v.tetoY + 8}" rx="${v.tetoRx}" fill="url(#g-teto-${s})" />
      <rect x="${x}" y="${v.corpoY}" width="${v.largura}" height="${v.corpoH}" rx="${v.corpoRx}" fill="url(#g-corpo-${s})" />

      ${camera === 'frente' ? frente(v, g, p, s) : traseira(v, g, p, s)}

      <!-- O vidro entra por último: na van ele fica na porta, abaixo do teto. -->
      <g class="patrol-avatar__glass">
        <rect x="${tetoX + 2.2}" y="${v.janelaY}" width="${v.tetoW - 4.4}" height="${v.janelaH}" rx="2.4" fill="url(#g-vidro-${s})" />
        <path d="M${tetoX + 3.4} ${v.janelaY + v.janelaH - 0.8} L${tetoX + 7.6} ${v.janelaY + 0.8} L${tetoX + 11} ${v.janelaY + 0.8} L${tetoX + 6.8} ${v.janelaY + v.janelaH - 0.8} Z"
          fill="#fff" opacity="0.14" stroke="none" />
      </g>

      <rect x="${x}" y="${v.corpoY}" width="${v.largura}" height="${v.corpoH}" rx="${v.corpoRx}" fill="url(#g-vol-${s})" stroke="none" />
      <rect x="${x + 3}" y="${v.corpoY + 0.6}" width="${v.largura - 6}" height="2" rx="1" fill="url(#g-luz-${s})" stroke="none" />
    </g>
  `;
};
