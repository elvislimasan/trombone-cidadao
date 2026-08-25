// A cabeça: crânio, cabelo, rosto, boné, capuz e o que se usa na orelha.
//
// É AQUI QUE O BONECO DEIXA DE SER UM ROBÔ
//
// Enquanto a cabeça era uma elipse escura de cabelo cobrindo tudo, o desenho
// tinha uma cúpula lisa no topo — e cúpula lisa lê como capacete, não como
// pessoa. Não adiantava melhorar o tronco: o olho procura rosto primeiro, e não
// achava nenhum.
//
// De frente o crânio é PELE e o cabelo entra por cima até a linha da testa,
// deixando olhos, sobrancelha, nariz e boca. De costas o crânio é o cabelo
// inteiro, mas com linha de nuca e mecha — o que impede que ele volte a ser uma
// bola. Nos dois casos a orelha aparece na silhueta, porque é ela que diz de
// que lado está a frente.
//
// AS MEDIDAS DO ROSTO SÃO BAIXAS DE PROPÓSITO
//
// Olhos em 13.4 num crânio que vai de 3.4 a 17.8 deixam bastante testa. Isso é
// o que dá ar jovem em vez de adulto genérico, e é também o que abre espaço
// para a aba do boné passar sem cobrir o olhar.

import { CORPO, clarear, escurecer } from './paleta';

const { craneoCx: CX, craneoCy: CY, craneoRx: RX, craneoRy: RY } = CORPO;

/* --- Cabelo --- */

// De frente o cabelo é uma calota com franja: ele desce pelas laterais e para
// na testa. O recorte irregular da franja é o que evita a borda de capacete.
const cabeloFrente = (p, s) => `
  <path d="M${CX - RX} ${CY + 0.9}
    C${CX - RX} ${CY - 5.4} ${CX - 4} ${CY - 7.2} ${CX} ${CY - 7.2}
    C${CX + 4} ${CY - 7.2} ${CX + RX} ${CY - 5.4} ${CX + RX} ${CY + 0.9}
    C${CX + RX - 0.4} ${CY - 1.4} ${CX + 3.4} ${CY - 2.6} ${CX + 1.6} ${CY - 1.8}
    C${CX + 0.4} ${CY - 1.3} ${CX - 1} ${CY - 1.4} ${CX - 2.4} ${CY - 2.2}
    C${CX - 4} ${CY - 3.1} ${CX - RX + 0.5} ${CY - 2.4} ${CX - RX} ${CY + 0.9} Z"
    fill="url(#g-cabelo-${s})" />
  <path d="M${CX - 3.8} ${CY - 5.8} C${CX - 2} ${CY - 7} ${CX + 2} ${CY - 7} ${CX + 3.8} ${CY - 5.8}"
    fill="none" stroke="${clarear(p.cabelo, 0.32)}" stroke-width="0.8" stroke-linecap="round" opacity="0.5" />
`;

// De costas o cabelo é o crânio inteiro. A linha da nuca e a mecha são o que
// impedem a volta da bola lisa: sem elas não há como saber que aquilo é cabelo.
const cabeloCostas = (p, s) => `
  <ellipse cx="${CX}" cy="${CY - 0.2}" rx="${RX}" ry="${RY}" fill="url(#g-cabelo-${s})" />
  <path d="M${CX - 5.4} ${CY + 4.6} C${CX - 3.4} ${CY + 6.1} ${CX + 3.4} ${CY + 6.1} ${CX + 5.4} ${CY + 4.6}
    C${CX + 4.6} ${CY + 6.6} ${CX + 2.4} ${CY + 7.4} ${CX} ${CY + 7.4}
    C${CX - 2.4} ${CY + 7.4} ${CX - 4.6} ${CY + 6.6} ${CX - 5.4} ${CY + 4.6} Z"
    fill="${escurecer(p.cabelo, 0.32)}" stroke="none" />
  <path d="M${CX - 3.6} ${CY - 6} C${CX - 1.6} ${CY - 7.1} ${CX + 1.6} ${CY - 7.1} ${CX + 3.6} ${CY - 6}"
    fill="none" stroke="${clarear(p.cabelo, 0.34)}" stroke-width="0.85" stroke-linecap="round" opacity="0.55" />
  <path d="M${CX} ${CY - 6.8} L${CX - 0.6} ${CY + 4.4}"
    fill="none" stroke="${escurecer(p.cabelo, 0.28)}" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
`;

/* --- Rosto --- */

// Um olho é a pupila mais o brilho. O brilho é um círculo branco minúsculo e
// fora de centro: é ele que separa "olhar" de "furo preto", e a esta escala é
// literalmente meio pixel que faz a diferença.
const olho = (cx, p) => `
  <ellipse cx="${cx}" cy="13.4" rx="1.05" ry="1.25" fill="${p.olho}" stroke="none" />
  <circle cx="${cx - 0.34}" cy="12.94" r="0.38" fill="#ffffff" stroke="none" opacity="0.92" />
`;

const rosto = (p, comBone) => `
  <g class="patrol-avatar__face" stroke="none">
    ${comBone
      ? ''
      : `<g fill="${escurecer(p.cabelo, 0.1)}" opacity="0.9">
           <rect x="15.9" y="11.1" width="2.7" height="0.75" rx="0.37" />
           <rect x="21.4" y="11.1" width="2.7" height="0.75" rx="0.37" />
         </g>`}
    ${olho(17.3, p)}
    ${olho(22.7, p)}
    <!-- O nariz é sombra, não linha: um traço nesta escala vira um risco no
         meio do rosto. -->
    <ellipse cx="20" cy="14.9" rx="0.85" ry="0.6" fill="${escurecer(p.pele, 0.26)}" opacity="0.75" />
    <path d="M18.5 16.2 C19.2 17 20.8 17 21.5 16.2" fill="none"
      stroke="${escurecer(p.pele, 0.42)}" stroke-width="0.55" stroke-linecap="round" />
    <!-- Um pouco de cor nas maçãs. Sem isso a pele fica de manequim. -->
    <g fill="${escurecer(p.pele, 0.12)}" opacity="0.45">
      <ellipse cx="15.9" cy="14.6" rx="1.3" ry="0.85" />
      <ellipse cx="24.1" cy="14.6" rx="1.3" ry="0.85" />
    </g>
  </g>
`;

/* --- O que se veste na cabeça --- */

const bone = (camera, p, s) => {
  if (!p.chapeu) return '';

  const aba = camera === 'frente'
    ? `<path d="M12.7 10.2 C12.7 11.7 16 12.4 20 12.4 C24 12.4 27.3 11.7 27.3 10.2 Z"
         fill="${escurecer(p.chapeu, 0.3)}" />
       <path d="M13.6 10.6 C14.6 11.5 25.4 11.5 26.4 10.6" fill="none"
         stroke="${escurecer(p.chapeu, 0.44)}" stroke-width="0.4" opacity="0.6" />`
    : `<path d="M13.2 9.9c-1.8.3-2.7 1-2.7 1.8 0 .7 1 1 2.7.6Z" fill="${escurecer(p.chapeu, 0.24)}" />
       <path d="M26.8 9.9c1.8.3 2.7 1 2.7 1.8 0 .7-1 1-2.7.6Z" fill="${escurecer(p.chapeu, 0.24)}" />`;

  return `
    <g class="patrol-avatar__cap">
      <path d="M13 10.4a7 7 0 0 1 14 0Z" fill="url(#g-chapeu-${s})" />
      ${aba}
      <path d="M13 10.4h14v0.9a7 7.2 0 0 1-14 0Z" fill="${escurecer(p.chapeu, 0.3)}" stroke="none" opacity="0.5" />
      <ellipse cx="16.8" cy="6.4" rx="2.6" ry="1.7" fill="#fff" opacity="0.2" stroke="none" transform="rotate(-18 16.8 6.4)" />
      <circle cx="20" cy="3.7" r="1" fill="${escurecer(p.chapeu, 0.34)}" stroke="none" />
      ${p.estilo.rabo && camera === 'costas'
        ? `<rect x="18.2" y="9.2" width="3.6" height="2.2" rx="0.8" fill="${escurecer(p.cabelo, 0.2)}" stroke="none" />`
        : ''}
      ${p.estilo.camuflagem
        ? `<g stroke="none" opacity="0.45">
             <ellipse cx="16" cy="7.6" rx="2.5" ry="1.7" fill="${p.calca}" />
             <ellipse cx="23.6" cy="6.6" rx="2.1" ry="1.5" fill="${escurecer(p.chapeu, 0.3)}" />
           </g>`
        : ''}
    </g>
  `;
};

const capuz = (camera, p, s) => {
  if (!p.estilo.capuz) return '';

  const forma = `M11.8 13.4C11.8 6.2 15.4 2.4 20 2.4s8.2 3.8 8.2 11c0 3.4-1.8 5.2-2.9 5.2H14.7c-1.1 0-2.9-1.8-2.9-5.2Z`;

  return `
    <g class="patrol-avatar__hood">
      <path d="${forma}" fill="url(#g-roupa-${s})" />
      <path d="${forma}" fill="url(#g-vol-${s})" stroke="none" />
      ${camera === 'frente'
        ? `<!-- De frente o capuz emoldura o rosto: as duas abas caem por cima do
                cabelo e o interior fica na sombra. -->
           <path d="M11.8 12.6C11.8 8 13.4 5 15.4 3.6 13.6 6.4 13 9.6 13.4 13.8 13.6 16.4 14.4 18 15.2 18.6H14.7c-1.1 0-2.9-1.8-2.9-5.2Z"
             fill="${escurecer(p.roupa, 0.34)}" stroke="none" />
           <path d="M28.2 12.6C28.2 8 26.6 5 24.6 3.6c1.8 2.8 2.4 6 2 10.2-.2 2.6-1 4.2-1.8 4.8h.5c1.1 0 2.9-1.8 2.9-5.2Z"
             fill="${escurecer(p.roupa, 0.34)}" stroke="none" />`
        : `<path d="M14.6 17.4C16.6 18.6 23.4 18.6 25.4 17.4" fill="none"
             stroke="${escurecer(p.roupa, 0.36)}" stroke-width="0.55" stroke-linecap="round" opacity="0.7" />`}
    </g>
  `;
};

// O rabo cai por trás da cabeça. De costas ele é o estilo inteiro; de frente
// sobra só o que escapa pelos lados do pescoço, que é como se vê na vida real.
const rabo = (camera, p, s) => {
  if (!p.estilo.rabo) return '';

  if (camera === 'frente') {
    return `
      <g class="patrol-avatar__hair">
        <path d="M13.4 12.6c-1.1 3.4-1.3 5.6-1 7.6.2 1.4 1.4 1.8 2 .6.7-1.4.6-4.4.4-8.2Z" fill="url(#g-cabelo-${s})" />
        <path d="M26.6 12.6c1.1 3.4 1.3 5.6 1 7.6-.2 1.4-1.4 1.8-2 .6-.7-1.4-.6-4.4-.4-8.2Z" fill="url(#g-cabelo-${s})" />
      </g>
    `;
  }

  return `
    <g class="patrol-avatar__hair">
      <path d="M17.8 11.4c0 5.4-1.4 7-1.4 10.6 0 2.4 1.7 3.9 3.6 3.9s3.6-1.5 3.6-3.9c0-3.6-1.4-5.2-1.4-10.6Z"
        fill="url(#g-cabelo-${s})" />
      <path d="M18.6 14.4c-.4 3.6-1.2 5.4-1.2 7.8" fill="none"
        stroke="${clarear(p.cabelo, 0.28)}" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
    </g>
  `;
};

const oculos = (camera, p) => {
  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__gear" stroke="none">
        <rect x="11.6" y="10.4" width="2.6" height="2.4" rx="1" fill="${escurecer(p.equipamento, 0.15)}" />
        <rect x="25.8" y="10.4" width="2.6" height="2.4" rx="1" fill="${escurecer(p.equipamento, 0.15)}" />
      </g>
    `;
  }

  return `
    <g class="patrol-avatar__gear">
      <g fill="${p.vidro}" stroke="${escurecer(p.equipamento, 0.1)}" stroke-width="0.5" opacity="0.94">
        <rect x="15.1" y="11.9" width="4.3" height="3.1" rx="1.3" />
        <rect x="20.6" y="11.9" width="4.3" height="3.1" rx="1.3" />
      </g>
      <g stroke="none">
        <rect x="19.2" y="12.9" width="1.6" height="0.6" rx="0.3" fill="${escurecer(p.equipamento, 0.1)}" />
        <path d="M15.6 12.4 L17.4 14.4" stroke="#ffffff" stroke-width="0.7" opacity="0.34" stroke-linecap="round" />
        <path d="M21.1 12.4 L22.9 14.4" stroke="#ffffff" stroke-width="0.7" opacity="0.34" stroke-linecap="round" />
      </g>
    </g>
  `;
};

const fone = (p, s) => `
  <g class="patrol-avatar__gear">
    <path d="M13.4 5.2a8 8 0 0 1 13.2 0" fill="none" stroke="${p.equipamento}" stroke-width="2.2" stroke-linecap="round" />
    <rect x="10.7" y="8.6" width="4.4" height="5.8" rx="2" fill="url(#g-equip-${s})" />
    <rect x="24.9" y="8.6" width="4.4" height="5.8" rx="2" fill="url(#g-equip-${s})" />
    <rect x="11.7" y="10" width="2.4" height="3" rx="1.2" fill="${p.acento}" stroke="none" />
    <rect x="25.9" y="10" width="2.4" height="3" rx="1.2" fill="${p.acento}" stroke="none" />
  </g>
`;

export const cabeca = (camera, p, s, acessorio) => {
  const comBone = Boolean(p.chapeu);
  // Com fone a orelha some debaixo da concha; sem ele, a orelha é o detalhe que
  // faz a cabeça deixar de ser uma bola.
  const orelhas = acessorio === 'fone'
    ? ''
    : `<ellipse cx="${CX - RX + 0.3}" cy="12.2" rx="1.35" ry="1.85" fill="url(#g-pele-${s})" />
       <ellipse cx="${CX + RX - 0.3}" cy="12.2" rx="1.35" ry="1.85" fill="url(#g-pele-${s})" />`;

  return `
    <g class="patrol-avatar__head">
      ${capuz(camera, p, s)}
      ${rabo(camera, p, s)}

      <!-- O pescoço entra depois do tronco para caber dentro da gola, e ganha
           a sombra do queixo por cima: é ela que o encaixa no corpo. -->
      <path d="M17.9 14.6 h4.2 v3.4 c0 1.2 -4.2 1.2 -4.2 0 Z" fill="url(#g-pele-${s})" />
      <ellipse cx="20" cy="15.4" rx="2.3" ry="1.1" fill="${escurecer(p.pele, 0.34)}" stroke="none" opacity="0.55" />

      ${camera === 'frente'
        ? `<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="url(#g-pele-${s})" />
           ${orelhas}
           ${comBone ? '' : cabeloFrente(p, s)}
           ${comBone
             ? `<path d="M${CX - RX} ${CY + 0.6} C${CX - RX + 0.2} ${CY - 2.4} ${CX + RX - 0.2} ${CY - 2.4} ${CX + RX} ${CY + 0.6}
                  C${CX + RX - 0.6} ${CY - 0.9} ${CX - RX + 0.6} ${CY - 0.9} ${CX - RX} ${CY + 0.6} Z"
                  fill="url(#g-cabelo-${s})" stroke="none" />`
             : ''}
           ${rosto(p, comBone)}`
        : `${cabeloCostas(p, s)}
           ${orelhas}`}

      ${bone(camera, p, s)}
      ${acessorio === 'oculos' ? oculos(camera, p) : ''}
      ${acessorio === 'fone' ? fone(p, s) : ''}
    </g>
  `;
};
