// A MOCHILA, AS ALÇAS E O QUE ELAS SEGURAM.
//
// A CÂMERA AQUI MUDA A ORDEM, NÃO SÓ O DESENHO
//
// De costas a mochila está entre o observador e o tronco: ela cobre a
// camiseta e é a maior mancha da figura. De frente ela está ATRÁS do tronco, e
// o que se vê são as alças no peito mais uma lasca do pacote escapando pelos
// lados.
//
// Por isso este arquivo exporta duas funções em vez de uma. `mochilaAtras`
// entra antes do tronco e `mochilaFrente` depois — quem monta a figura só
// precisa chamar as duas no lugar certo, sem saber de que lado está.
//
// O PACOTE É MAIS LARGO QUE O TRONCO, E ISSO É DELIBERADO
//
// Se ele coubesse exatamente dentro do tronco, de frente não sobraria nada
// para ver e a mochila sumiria — a pessoa escolheria "com mochila" e veria o
// mesmo boneco de "sem mochila".

import { MEIO, MOCHILA as M, TORSO } from './geometria';
import { clarear, escurecer, marca } from './paleta';

const ESQ = M.x;
const DIR = M.x + M.largura;

/* --- Alças --- */

const alcas = (camera, p, s) => {
  const ombroY = (TORSO[p.sexo] || TORSO.masculino).ombroY;

  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__straps">
        <path d="M${MEIO - 40} ${ombroY} h17 v34 h-17 Z" fill="url(#g-equip-${s})" />
        <path d="M${MEIO + 23} ${ombroY} h17 v34 h-17 Z" fill="url(#g-equip-${s})" />
      </g>
    `;
  }

  // De frente a alça desce do ombro e converge para o meio do peito, que é o
  // caminho que ela faz num corpo de verdade.
  return `
    <g class="patrol-avatar__straps">
      <path d="M${MEIO - 42} ${ombroY + 2} C${MEIO - 38} ${ombroY + 28} ${MEIO - 32} ${ombroY + 54} ${MEIO - 28} ${ombroY + 80}
        L${MEIO - 12} ${ombroY + 76} C${MEIO - 16} ${ombroY + 50} ${MEIO - 22} ${ombroY + 24} ${MEIO - 25} ${ombroY} Z"
        fill="url(#g-equip-${s})" />
      <path d="M${MEIO + 42} ${ombroY + 2} C${MEIO + 38} ${ombroY + 28} ${MEIO + 32} ${ombroY + 54} ${MEIO + 28} ${ombroY + 80}
        L${MEIO + 12} ${ombroY + 76} C${MEIO + 16} ${ombroY + 50} ${MEIO + 22} ${ombroY + 24} ${MEIO + 25} ${ombroY} Z"
        fill="url(#g-equip-${s})" />
      <g class="patrol-avatar__backpack-buckles" stroke="none" opacity="0.92">
        <rect x="${MEIO - 33}" y="${ombroY + 44}" width="18" height="11" rx="4"
          fill="${p.acento}" transform="rotate(-9 ${MEIO - 24} ${ombroY + 50})" />
        <rect x="${MEIO + 15}" y="${ombroY + 44}" width="18" height="11" rx="4"
          fill="${p.acento}" transform="rotate(9 ${MEIO + 24} ${ombroY + 50})" />
      </g>
    </g>
  `;
};

/* --- Corpo da mochila --- */

const contorno = `M${ESQ} ${M.topo + 40}
  C${ESQ} ${M.topo + 8} ${MEIO - 36} ${M.topo - 6} ${MEIO} ${M.topo - 6}
  C${MEIO + 36} ${M.topo - 6} ${DIR} ${M.topo + 8} ${DIR} ${M.topo + 40}
  L${DIR - 4} ${M.base - 16}
  C${DIR - 6} ${M.base + 2} ${MEIO + 34} ${M.base + 8} ${MEIO} ${M.base + 8}
  C${MEIO - 34} ${M.base + 8} ${ESQ + 6} ${M.base + 2} ${ESQ + 4} ${M.base - 16} Z`;

const pacotePadrao = (p, s) => `
  <!-- A alça de mão no topo. É o primeiro detalhe que diz "mochila" e não
       "caixa nas costas". -->
  <path d="M${MEIO - 24} ${M.topo + 4} C${MEIO - 24} ${M.topo - 22} ${MEIO + 24} ${M.topo - 22} ${MEIO + 24} ${M.topo + 4}"
    fill="none" stroke="${escurecer(p.mochila, 0.34)}" stroke-width="9" stroke-linecap="round" />

  <path d="${contorno}" fill="url(#g-mochila-${s})" />

  <!-- O zíper central, tracejado: linha contínua lia como vinco de papel. -->
  <path d="M${MEIO} ${M.topo + 6} L${MEIO} ${M.base - 58}" fill="none"
    stroke="${clarear(p.mochila, 0.42)}" stroke-width="3.6"
    stroke-dasharray="4.4 3.6" stroke-linecap="round" opacity="0.82" />

  <!-- O bolso da frente, com a própria sombra de contato em cima. -->
  <path d="M${MEIO - 40} ${M.base - 52} h80 v26
    c0 8 -8 12 -40 12 c-32 0 -40 -4 -40 -12 Z"
    fill="${clarear(p.mochila, 0.24)}" stroke="none" />
  <path d="M${MEIO - 38} ${M.base - 50} C${MEIO - 20} ${M.base - 44} ${MEIO + 20} ${M.base - 44} ${MEIO + 38} ${M.base - 50}"
    fill="none" stroke="${escurecer(p.mochila, 0.28)}" stroke-width="3"
    stroke-linecap="round" opacity="0.7" />

  <g class="patrol-avatar__backpack-buckles" stroke="none">
    <rect x="${ESQ - 2}" y="${M.base - 76}" width="14" height="11" rx="3.5" fill="${p.equipamento}" />
    <rect x="${DIR - 12}" y="${M.base - 76}" width="14" height="11" rx="3.5" fill="${p.equipamento}" />
    <rect x="${ESQ + 1}" y="${M.base - 73}" width="7" height="5" rx="2" fill="${clarear(p.equipamento, 0.42)}" />
    <rect x="${DIR - 9}" y="${M.base - 73}" width="7" height="5" rx="2" fill="${clarear(p.equipamento, 0.42)}" />
  </g>

  ${marca(MEIO, M.topo + 58, 1.1, p.acento)}

  <path d="${contorno}" fill="url(#g-vol-${s})" stroke="none" />
  <path d="${contorno}" fill="url(#g-interna-${s})" stroke="none" />
  <ellipse cx="${MEIO - 26}" cy="${M.topo + 26}" rx="16" ry="9" fill="#ffffff"
    opacity="0.16" stroke="none" />
`;

const pacoteTatico = (p, s) => `
  <path d="M${MEIO - 24} ${M.topo + 2} C${MEIO - 24} ${M.topo - 22} ${MEIO + 24} ${M.topo - 22} ${MEIO + 24} ${M.topo + 2}"
    fill="none" stroke="${clarear(p.equipamento, 0.18)}" stroke-width="10" stroke-linecap="round" />

  <path d="${contorno}" fill="url(#g-equip-${s})" />

  <!-- As fitas MOLLE em três fileiras. É o que distingue a mochila técnica da
       comum sem precisar mudar a silhueta. -->
  <g stroke="none" opacity="0.55">
    <rect x="${ESQ + 10}" y="${M.topo + 30}" width="${M.largura - 20}" height="8" rx="4"
      fill="${clarear(p.equipamento, 0.34)}" />
    <rect x="${ESQ + 10}" y="${M.topo + 56}" width="${M.largura - 20}" height="8" rx="4"
      fill="${clarear(p.equipamento, 0.34)}" />
    <rect x="${ESQ + 12}" y="${M.topo + 82}" width="${M.largura - 24}" height="8" rx="4"
      fill="${clarear(p.equipamento, 0.34)}" />
  </g>

  <g class="patrol-avatar__backpack-buckles" stroke="none">
    <rect x="${ESQ + 14}" y="${M.topo + 26}" width="10" height="66" rx="4"
      fill="${escurecer(p.equipamento, 0.28)}" />
    <rect x="${DIR - 24}" y="${M.topo + 26}" width="10" height="66" rx="4"
      fill="${escurecer(p.equipamento, 0.28)}" />
    <rect x="${ESQ + 8}" y="${M.base - 78}" width="16" height="10" rx="3.5" fill="${p.acento}" />
    <rect x="${DIR - 24}" y="${M.base - 78}" width="16" height="10" rx="3.5" fill="${p.acento}" />
  </g>

  <rect x="${MEIO - 26}" y="${M.base - 42}" width="52" height="20" rx="9"
    fill="${p.acento}" stroke="none" />

  <path d="${contorno}" fill="url(#g-vol-${s})" stroke="none" />
  <path d="${contorno}" fill="url(#g-interna-${s})" stroke="none" />
`;

// O que escapa pelos lados do tronco quando a mochila está nas costas e a
// pessoa está de frente. São só duas lascas, mas são a diferença entre "tem
// mochila" e "não tem".
const lascas = (tatica, p) => {
  const tom = tatica ? p.equipamento : p.mochila;
  return `
    <g class="patrol-avatar__backpack patrol-avatar__backpack--slivers" stroke="none">
      <path d="M${ESQ + 2} ${M.topo + 42} C${ESQ + 2} ${M.topo + 14} ${ESQ + 10} ${M.topo + 2} ${ESQ + 20} ${M.topo - 2}
        L${ESQ + 20} ${M.base} C${ESQ + 10} ${M.base - 6} ${ESQ + 4} ${M.base - 16} ${ESQ + 3} ${M.base - 28} Z"
        fill="${escurecer(tom, 0.06)}" />
      <path d="M${DIR - 2} ${M.topo + 42} C${DIR - 2} ${M.topo + 14} ${DIR - 10} ${M.topo + 2} ${DIR - 20} ${M.topo - 2}
        L${DIR - 20} ${M.base} C${DIR - 10} ${M.base - 6} ${DIR - 4} ${M.base - 16} ${DIR - 3} ${M.base - 28} Z"
        fill="${escurecer(tom, 0.16)}" />
    </g>
  `;
};

/** Entra ANTES do tronco. Só rende alguma coisa na câmera frontal. */
export const mochilaAtras = (pacote, camera, p) =>
  (camera === 'costas' || !pacote ? '' : lascas(pacote === 'tatica', p));

/** Entra DEPOIS do tronco: a mochila inteira de costas, as alças de frente. */
export const mochilaFrente = (pacote, camera, p, s) => {
  if (!pacote) return '';
  if (camera === 'frente') return alcas(camera, p, s);

  return `
    <g class="patrol-avatar__backpack">
      ${alcas(camera, p, s)}
      ${pacote === 'tatica' ? pacoteTatico(p, s) : pacotePadrao(p, s)}
    </g>
  `;
};
