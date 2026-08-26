// OS ACESSÓRIOS: o que se veste na cabeça e o que se pendura no equipamento.
//
// UM ACESSÓRIO NÃO PODE CUSTAR A MOCHILA
//
// Óculos e fone moram no rosto, garrafa e rádio moram na lateral da carga —
// mas todos saem da MESMA escolha na tela de personalização. Se escolher
// "óculos" apagasse a mochila, a pessoa perderia uma peça sem ter pedido. Por
// isso a tabela abaixo diz, para cada acessório, qual pacote ele mantém: só
// "sem mochila" fica realmente sem nada nas costas.
//
// CADA UM SABE DAS DUAS CÂMERAS
//
// De frente o óculos é a lente; de costas é a haste que passa pela orelha. O
// fone tem concha nos dois lados, mas o arco muda de curva. Não desenhar o
// lado de trás faria o acessório sumir exatamente onde ele mais aparece — o
// mapa é a câmera traseira.

import { CRANEO as C, MEIO, MOCHILA, ORELHA } from './geometria';
import { clarear, escurecer } from './paleta';

/* --- Qual carga cada acessório mantém --- */

const PACOTES = {
  mochila: 'padrao',
  tatica: 'tatica',
  nenhuma: null,
  garrafa: 'padrao',
  radio: 'padrao',
  oculos: 'padrao',
  fone: 'padrao',
};

export const pacoteDoAcessorio = (id) =>
  (Object.prototype.hasOwnProperty.call(PACOTES, id) ? PACOTES[id] : PACOTES.mochila);

// Com fone a orelha some debaixo da concha. Sem ele a orelha fica: é ela que
// faz a cabeça deixar de ser uma bola.
export const escondeOrelha = (id) => id === 'fone';

/* --- O que se veste na cabeça --- */

const oculos = (camera, p) => {
  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__gear patrol-avatar__gear--oculos" stroke="none">
        <rect x="${MEIO - ORELHA.dx - 12}" y="${ORELHA.cy - 9}" width="17" height="15" rx="6"
          fill="${escurecer(p.equipamento, 0.15)}" />
        <rect x="${MEIO + ORELHA.dx - 5}" y="${ORELHA.cy - 9}" width="17" height="15" rx="6"
          fill="${escurecer(p.equipamento, 0.15)}" />
      </g>
    `;
  }

  return `
    <g class="patrol-avatar__gear patrol-avatar__gear--oculos">
      <g fill="${p.vidro}" stroke="${escurecer(p.equipamento, 0.1)}" stroke-width="3.4" opacity="0.94">
        <rect x="${MEIO - 46}" y="${C.cy - 3}" width="40" height="30" rx="12" />
        <rect x="${MEIO + 6}" y="${C.cy - 3}" width="40" height="30" rx="12" />
      </g>
      <g stroke="none">
        <rect x="${MEIO - 8}" y="${C.cy + 8}" width="16" height="6" rx="3"
          fill="${escurecer(p.equipamento, 0.1)}" />
        <!-- O reflexo diagonal: sem ele a lente lê como buraco, não como vidro. -->
        <path d="M${MEIO - 42} ${C.cy + 3} L${MEIO - 26} ${C.cy + 22}"
          stroke="#ffffff" stroke-width="5" opacity="0.32" stroke-linecap="round" />
        <path d="M${MEIO + 10} ${C.cy + 3} L${MEIO + 26} ${C.cy + 22}"
          stroke="#ffffff" stroke-width="5" opacity="0.32" stroke-linecap="round" />
      </g>
    </g>
  `;
};

const fone = (camera, p, s) => `
  <g class="patrol-avatar__gear patrol-avatar__gear--fone">
    <path d="M${MEIO - 46} ${C.topo + 22} A54 54 0 0 1 ${MEIO + 46} ${C.topo + 22}"
      fill="none" stroke="${p.equipamento}" stroke-width="14" stroke-linecap="round" />
    <path d="M${MEIO - 38} ${C.topo + 20} A46 46 0 0 1 ${MEIO + 10} ${C.topo + 6}"
      fill="none" stroke="${clarear(p.equipamento, 0.4)}" stroke-width="4"
      stroke-linecap="round" opacity="0.5" />
    <rect x="${MEIO - ORELHA.dx - 15}" y="${ORELHA.cy - 21}" width="30" height="42" rx="14"
      fill="url(#g-equip-${s})" />
    <rect x="${MEIO + ORELHA.dx - 15}" y="${ORELHA.cy - 21}" width="30" height="42" rx="14"
      fill="url(#g-equip-${s})" />
    <rect x="${MEIO - ORELHA.dx - 9}" y="${ORELHA.cy - 12}" width="18" height="24" rx="9"
      fill="${p.acento}" stroke="none" />
    <rect x="${MEIO + ORELHA.dx - 9}" y="${ORELHA.cy - 12}" width="18" height="24" rx="9"
      fill="${p.acento}" stroke="none" />
    ${camera === 'frente'
      ? `<!-- O microfone de haste só existe de frente: de costas ele estaria
              escondido pela própria cabeça. -->
         <path d="M${MEIO - ORELHA.dx - 4} ${ORELHA.cy + 16} C${MEIO - 44} ${ORELHA.cy + 34} ${MEIO - 30} ${ORELHA.cy + 38} ${MEIO - 22} ${ORELHA.cy + 36}"
           fill="none" stroke="${p.equipamento}" stroke-width="6" stroke-linecap="round" />
         <circle cx="${MEIO - 20}" cy="${ORELHA.cy + 36}" r="5.5" fill="${p.acento}" stroke="none" />`
      : ''}
  </g>
`;

export const acessorioDaCabeca = (id, camera, p, s) => {
  if (id === 'oculos') return oculos(camera, p);
  if (id === 'fone') return fone(camera, p, s);
  return '';
};

/* --- O que se pendura na carga --- */
// Ficam na lateral direita, na altura do bolso da mochila. Entram sempre no
// mesmo lugar, com pacote ou sem: quem escolheu "garrafa" precisa vê-la.

const garrafa = (p, s) => `
  <g class="patrol-avatar__gear patrol-avatar__gear--garrafa">
    <rect x="${MOCHILA.x + MOCHILA.largura - 12}" y="${MOCHILA.base - 62}" width="24" height="52" rx="11"
      fill="url(#g-acento-${s})" />
    <rect x="${MOCHILA.x + MOCHILA.largura - 7}" y="${MOCHILA.base - 74}" width="14" height="16" rx="6"
      fill="url(#g-equip-${s})" />
    <rect x="${MOCHILA.x + MOCHILA.largura - 12}" y="${MOCHILA.base - 40}" width="24" height="7"
      fill="${escurecer(p.acento, 0.3)}" stroke="none" opacity="0.7" />
    <rect x="${MOCHILA.x + MOCHILA.largura - 12}" y="${MOCHILA.base - 62}" width="24" height="52" rx="11"
      fill="url(#g-vol-${s})" stroke="none" />
  </g>
`;

const radio = (p, s) => `
  <g class="patrol-avatar__gear patrol-avatar__gear--radio">
    <rect x="${MOCHILA.x + MOCHILA.largura - 10}" y="${MOCHILA.base - 68}" width="22" height="42" rx="8"
      fill="url(#g-equip-${s})" />
    <rect x="${MOCHILA.x + MOCHILA.largura - 3}" y="${MOCHILA.base - 106}" width="7" height="40" rx="3.5"
      fill="url(#g-metal-${s})" />
    <rect x="${MOCHILA.x + MOCHILA.largura - 6}" y="${MOCHILA.base - 60}" width="14" height="10" rx="4"
      fill="${p.acento}" stroke="none" />
    <g stroke="${clarear(p.equipamento, 0.35)}" stroke-width="2.6" opacity="0.6">
      <path d="M${MOCHILA.x + MOCHILA.largura - 5} ${MOCHILA.base - 42} h13" />
      <path d="M${MOCHILA.x + MOCHILA.largura - 5} ${MOCHILA.base - 36} h13" />
    </g>
  </g>
`;

export const acessorioDoCorpo = (id, camera, p, s) => {
  if (id === 'garrafa') return garrafa(p, s);
  if (id === 'radio') return radio(p, s);
  return '';
};
