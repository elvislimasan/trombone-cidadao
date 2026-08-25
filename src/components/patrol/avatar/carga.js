// Mochilas, alças e o que se pendura nelas.
//
// A CÂMERA AQUI MUDA A ORDEM, NÃO SÓ O DESENHO
//
// De costas a mochila está entre o observador e o tronco: ela cobre a camiseta
// e é a maior mancha da figura. De frente ela está ATRÁS do tronco, e o que se
// vê são as alças no peito mais uma sobra do pacote escapando pelos lados.
//
// Por isso este arquivo exporta duas funções em vez de uma. `cargaAtras` entra
// antes do tronco e `cargaFrente` depois — quem monta a figura (o `index.js`)
// só precisa chamar as duas no lugar certo, sem saber de que lado está.
//
// O PACOTE É UM POUCO MAIS LARGO QUE A CINTURA
//
// Se ele coubesse exatamente dentro do tronco, de frente não sobraria nada para
// ver e a mochila sumiria — a pessoa escolheria "com mochila" e veria o mesmo
// boneco de "sem mochila". Meio ponto de folga de cada lado resolve.

import { marca, clarear, escurecer } from './paleta';

/* --- Alças --- */

const alcas = (camera, p, s) => {
  if (camera === 'costas') {
    return `
      <path d="M14.9 18.4 h2.5 v4.4 h-2.5 Z" fill="url(#g-equip-${s})" />
      <path d="M22.6 18.4 h2.5 v4.4 h-2.5 Z" fill="url(#g-equip-${s})" />
    `;
  }

  // De frente a alça desce do ombro e converge para o meio do peito, que é o
  // caminho que ela faz num corpo de verdade.
  return `
    <g class="patrol-avatar__straps">
      <path d="M14.8 18.6 C15.4 22 16.2 25.4 16.8 28.8 L19 28.4 C18.4 25 17.6 21.6 17.2 18.4 Z"
        fill="url(#g-equip-${s})" />
      <path d="M25.2 18.6 C24.6 22 23.8 25.4 23.2 28.8 L21 28.4 C21.6 25 22.4 21.6 22.8 18.4 Z"
        fill="url(#g-equip-${s})" />
      <g stroke="none" opacity="0.9">
        <rect x="16.1" y="24.4" width="2.6" height="1.5" rx="0.5" fill="${p.acento}" transform="rotate(-9 17.4 25.1)" />
        <rect x="21.3" y="24.4" width="2.6" height="1.5" rx="0.5" fill="${p.acento}" transform="rotate(9 22.6 25.1)" />
      </g>
    </g>
  `;
};

/* --- Corpo da mochila --- */

const pacotePadrao = (p, s) => `
  <path d="M13.4 23.6 C13.4 20.6 15.8 19.5 20 19.5 C24.2 19.5 26.6 20.6 26.6 23.6
    L26.2 30.4 C26 32.1 23.4 32.8 20 32.8 C16.6 32.8 14 32.1 13.8 30.4 Z"
    fill="url(#g-mochila-${s})" />
  <path d="M16 27.9 h8 v3.4 c0 0.9 -8 0.9 -8 0 Z" fill="${clarear(p.mochila, 0.24)}" stroke="none" />
  ${marca(20, 24.4, 0.92, p.acento)}
  <path d="M13.4 23.6 C13.4 20.6 15.8 19.5 20 19.5 C24.2 19.5 26.6 20.6 26.6 23.6
    L26.2 30.4 C26 32.1 23.4 32.8 20 32.8 C16.6 32.8 14 32.1 13.8 30.4 Z"
    fill="url(#g-vol-${s})" stroke="none" />
  <ellipse cx="17.2" cy="21.9" rx="2.2" ry="1.3" fill="#fff" opacity="0.16" stroke="none" />
`;

const pacoteTatico = (p, s) => `
  <path d="M13.2 22.8 C13.2 20.4 15.6 19.4 20 19.4 C24.4 19.4 26.8 20.4 26.8 22.8
    L26.4 30.6 C26.2 32.2 23.4 32.9 20 32.9 C16.6 32.9 13.8 32.2 13.6 30.6 Z"
    fill="url(#g-equip-${s})" />
  <g stroke="none" opacity="0.55">
    <rect x="14.4" y="22.4" width="11.2" height="1.1" rx="0.55" fill="${clarear(p.equipamento, 0.34)}" />
    <rect x="14.4" y="25.2" width="11.2" height="1.1" rx="0.55" fill="${clarear(p.equipamento, 0.34)}" />
    <rect x="14.6" y="28" width="10.8" height="1.1" rx="0.55" fill="${clarear(p.equipamento, 0.34)}" />
  </g>
  <rect x="16.4" y="30" width="7.2" height="2.6" rx="1.1" fill="${p.acento}" stroke="none" />
  <path d="M13.2 22.8 C13.2 20.4 15.6 19.4 20 19.4 C24.4 19.4 26.8 20.4 26.8 22.8
    L26.4 30.6 C26.2 32.2 23.4 32.9 20 32.9 C16.6 32.9 13.8 32.2 13.6 30.6 Z"
    fill="url(#g-vol-${s})" stroke="none" />
`;

// O que escapa pelos lados do tronco quando a mochila está nas costas e a
// pessoa está de frente. São só duas lascas, mas são a diferença entre "tem
// mochila" e "não tem".
const lascas = (tatica, p, s) => `
  <g class="patrol-avatar__backpack" stroke="none">
    <path d="M12.9 23.4 C12.9 21.4 13.6 20.4 14.6 20.1 L14.6 31.6 C13.6 31.2 13.1 30.6 13 29.8 Z"
      fill="${tatica ? escurecer(p.equipamento, 0.06) : escurecer(p.mochila, 0.06)}" />
    <path d="M27.1 23.4 C27.1 21.4 26.4 20.4 25.4 20.1 L25.4 31.6 C26.4 31.2 26.9 30.6 27 29.8 Z"
      fill="${tatica ? escurecer(p.equipamento, 0.14) : escurecer(p.mochila, 0.14)}" />
  </g>
`;

/* --- Bugigangas --- */

const garrafa = (p, s) => `
  <g class="patrol-avatar__gear">
    <rect x="25.6" y="23.4" width="3.6" height="7.4" rx="1.6" fill="url(#g-acento-${s})" />
    <rect x="26.4" y="21.9" width="2.1" height="2.3" rx="0.85" fill="url(#g-equip-${s})" />
    <rect x="25.6" y="23.4" width="3.6" height="7.4" rx="1.6" fill="url(#g-vol-${s})" stroke="none" />
  </g>
`;

const radio = (p, s) => `
  <g class="patrol-avatar__gear">
    <rect x="25.8" y="22.6" width="3.4" height="6" rx="1.2" fill="url(#g-equip-${s})" />
    <rect x="27.1" y="17.2" width="1.1" height="5.8" rx="0.55" fill="url(#g-metal-${s})" />
    <rect x="26.4" y="24.1" width="2.1" height="1.5" rx="0.55" fill="${p.acento}" stroke="none" />
  </g>
`;

// Óculos e fone moram na cabeça; aqui eles só herdam a mochila padrão para que
// escolher um acessório de rosto não signifique perder a mochila.
const CARGAS = {
  mochila: { pacote: 'padrao' },
  tatica: { pacote: 'tatica' },
  nenhuma: { pacote: null },
  garrafa: { pacote: 'padrao', extra: garrafa },
  radio: { pacote: 'padrao', extra: radio },
  oculos: { pacote: 'padrao' },
  fone: { pacote: 'padrao' },
};

const escolher = (acessorio) => CARGAS[acessorio] || CARGAS.mochila;

/** Entra ANTES do tronco. Só rende alguma coisa na câmera frontal. */
export const cargaAtras = (acessorio, camera, p, s) => {
  const carga = escolher(acessorio);
  if (camera === 'costas' || !carga.pacote) return '';

  return `
    ${lascas(carga.pacote === 'tatica', p, s)}
    ${carga.extra ? carga.extra(p, s) : ''}
  `;
};

/** Entra DEPOIS do tronco: a mochila inteira de costas, as alças de frente. */
export const cargaFrente = (acessorio, camera, p, s) => {
  const carga = escolher(acessorio);
  if (!carga.pacote) return '';

  if (camera === 'frente') return alcas(camera, p, s);

  return `
    <g class="patrol-avatar__backpack">
      ${alcas(camera, p, s)}
      ${carga.pacote === 'tatica' ? pacoteTatico(p, s) : pacotePadrao(p, s)}
    </g>
    ${carga.extra ? carga.extra(p, s) : ''}
  `;
};
