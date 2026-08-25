// A cabeça: crânio, cabelo, rosto, capuz e o que se usa na orelha.
//
// É AQUI QUE O BONECO DEIXA DE SER UM ROBÔ
//
// Enquanto a cabeça era uma elipse escura de cabelo cobrindo tudo, o desenho
// tinha uma cúpula lisa no topo — e cúpula lisa lê como capacete, não como
// pessoa. Não adiantava melhorar o tronco: o olho procura rosto primeiro, e não
// achava nenhum.
//
// De frente o crânio é PELE e o cabelo entra por cima até a linha da testa,
// deixando olhos, sobrancelha, nariz e boca. De costas a pele continua por
// baixo, com cabelo recortado, nuca e mechas próprias para cada sexo. Nos dois
// casos a orelha aparece na silhueta, porque é ela que orienta a cabeça.
//
// AS MEDIDAS DO ROSTO SÃO BAIXAS DE PROPÓSITO
//
// Olhos em 13.4 num crânio que vai de 3.4 a 17.8 deixam bastante testa. Isso é
// o que dá ar jovem em vez de adulto genérico e mantém o rosto legível até nas
// miniaturas de 54px.

import { CORPO, clarear, escurecer } from './paleta';

const { craneoCx: CX, craneoCy: CY, craneoRx: RX, craneoRy: RY } = CORPO;

/* --- Cabelo --- */

// De frente o cabelo é uma calota com franja: ele desce pelas laterais e para
// na testa. O recorte irregular da franja é o que evita a borda de capacete.
const cabeloFrente = (p, s) => `
  ${p.sexo === 'feminino' && !p.estilo.rabo
    ? `<g class="patrol-avatar__hair patrol-avatar__hair--long" stroke="none">
         <path d="M13.8 8.2 C12.2 10.8 11.9 15.8 12.5 20.2 C12.8 22.2 14.2 22.7 15.1 20.8
           C15.7 18.7 15.3 14.3 15.4 10.2 Z" fill="url(#g-cabelo-${s})" />
         <path d="M26.2 8.2 C27.8 10.8 28.1 15.8 27.5 20.2 C27.2 22.2 25.8 22.7 24.9 20.8
           C24.3 18.7 24.7 14.3 24.6 10.2 Z" fill="url(#g-cabelo-${s})" />
       </g>`
    : ''}
  <path d="M${CX - RX} ${CY + 0.9}
    C${CX - RX} ${CY - 5.4} ${CX - 4} ${CY - 7.2} ${CX} ${CY - 7.2}
    C${CX + 4} ${CY - 7.2} ${CX + RX} ${CY - 5.4} ${CX + RX} ${CY + 0.9}
    C${CX + RX - 0.4} ${CY - 1.4} ${CX + 3.4} ${CY - 2.6} ${CX + 1.6} ${CY - 1.8}
    C${CX + 0.4} ${CY - 1.3} ${CX - 1} ${CY - 1.4} ${CX - 2.4} ${CY - 2.2}
    C${CX - 4} ${CY - 3.1} ${CX - RX + 0.5} ${CY - 2.4} ${CX - RX} ${CY + 0.9} Z"
    fill="url(#g-cabelo-${s})" />
  <path d="M${CX - 3.8} ${CY - 5.8} C${CX - 2} ${CY - 7} ${CX + 2} ${CY - 7} ${CX + 3.8} ${CY - 5.8}"
    fill="none" stroke="${clarear(p.cabelo, 0.32)}" stroke-width="0.8" stroke-linecap="round" opacity="0.5" />
  ${p.sexo === 'feminino' && !p.estilo.rabo
    ? `<g fill="none" stroke="${clarear(p.cabelo, 0.26)}" stroke-width="0.48" stroke-linecap="round" opacity="0.48">
         <path d="M13.5 9.1 C12.9 13.3 13.2 17.2 13.6 20.1" />
         <path d="M26.5 9.1 C27.1 13.3 26.8 17.2 26.4 20.1" />
       </g>`
    : ''}
`;

// De costas há dois cortes reconhecíveis na escala do mapa: curto com nuca
// visível e longo com pontas sobre os ombros. Partes e mechas quebram a bola
// lisa que o desenho antigo formava.
const cabeloCostas = (p, s) => {
  if (p.sexo === 'feminino' && !p.estilo.rabo) {
    return `
      <g class="patrol-avatar__hair patrol-avatar__hair--long">
        <path d="M13.1 11.2 C13.1 5.7 15.8 3.2 20 3.2 C24.2 3.2 26.9 5.7 26.9 11.2
          C27.2 14.8 28.1 18.6 26.1 21.5 C24.8 23.4 22.6 22.1 20 22.1
          C17.4 22.1 15.2 23.4 13.9 21.5 C11.9 18.6 12.8 14.8 13.1 11.2 Z"
          fill="url(#g-cabelo-${s})" />
        <path d="M20 3.7 C18.8 8.1 19 14.7 18.4 20.6" fill="none"
          stroke="${clarear(p.cabelo, 0.29)}" stroke-width="0.55" stroke-linecap="round" opacity="0.55" />
        <path d="M20.2 4 C21.4 8.5 21.1 15.2 21.8 20.7" fill="none"
          stroke="${escurecer(p.cabelo, 0.25)}" stroke-width="0.48" stroke-linecap="round" opacity="0.58" />
        <path d="M14.2 18.3 C16.5 20.1 23.5 20.1 25.8 18.3" fill="none"
          stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="0.55" stroke-linecap="round" opacity="0.5" />
      </g>
    `;
  }

  return `
    <g class="patrol-avatar__hair patrol-avatar__hair--short">
      <path d="M13.1 11.6 C13.1 5.7 15.8 3.2 20 3.2 C24.2 3.2 26.9 5.7 26.9 11.6
        C26.8 14.5 24.9 16.2 22.5 16.7 L21.6 15 C20.7 15.5 19.3 15.5 18.4 15
        L17.5 16.7 C15.1 16.2 13.2 14.5 13.1 11.6 Z" fill="url(#g-cabelo-${s})" />
      <path d="M16.5 15.2 C18.2 16.6 21.8 16.6 23.5 15.2" fill="none"
        stroke="${escurecer(p.cabelo, 0.34)}" stroke-width="0.65" stroke-linecap="round" opacity="0.72" />
      <path d="M16.4 5 C18 3.5 22 3.3 23.8 4.8" fill="none"
        stroke="${clarear(p.cabelo, 0.34)}" stroke-width="0.85" stroke-linecap="round" opacity="0.55" />
      <path d="M20 3.7 L19.5 13.8" fill="none"
        stroke="${escurecer(p.cabelo, 0.28)}" stroke-width="0.5" stroke-linecap="round" opacity="0.48" />
    </g>
  `;
};

/* --- Rosto --- */

// Um olho é a pupila mais o brilho. O brilho é um círculo branco minúsculo e
// fora de centro: é ele que separa "olhar" de "furo preto", e a esta escala é
// literalmente meio pixel que faz a diferença.
const olho = (cx, p) => `
  <ellipse cx="${cx}" cy="13.4" rx="1.05" ry="1.25" fill="${p.olho}" stroke="none" />
  <circle cx="${cx - 0.34}" cy="12.94" r="0.38" fill="#ffffff" stroke="none" opacity="0.92" />
`;

const rosto = (p) => `
  <g class="patrol-avatar__face" stroke="none">
    ${p.sexo === 'feminino'
      ? `<g fill="none" stroke="${escurecer(p.cabelo, 0.1)}" stroke-width="0.72" stroke-linecap="round" opacity="0.9">
           <path d="M15.8 11.4 C16.6 10.8 17.8 10.7 18.6 11.2" />
           <path d="M21.4 11.2 C22.2 10.7 23.4 10.8 24.2 11.4" />
         </g>`
      : `<g fill="${escurecer(p.cabelo, 0.1)}" opacity="0.9">
           <rect x="15.9" y="11.1" width="2.7" height="0.75" rx="0.37" />
           <rect x="21.4" y="11.1" width="2.7" height="0.75" rx="0.37" />
         </g>`}
    ${olho(17.3, p)}
    ${olho(22.7, p)}
    ${p.sexo === 'feminino'
      ? `<g fill="none" stroke="${p.olho}" stroke-width="0.42" stroke-linecap="round" opacity="0.85">
           <path d="M15.9 12.7 l-0.65 -0.45 M16.1 13.15 l-0.75 0" />
           <path d="M24.1 12.7 l0.65 -0.45 M23.9 13.15 l0.75 0" />
         </g>`
      : ''}
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
    <g class="patrol-avatar__hair patrol-avatar__hair--ponytail">
      <path d="M17.8 11.4c0 5.4-1.4 7-1.4 10.6 0 2.4 1.7 3.9 3.6 3.9s3.6-1.5 3.6-3.9c0-3.6-1.4-5.2-1.4-10.6Z"
        fill="url(#g-cabelo-${s})" />
      <ellipse cx="20" cy="12.1" rx="2.5" ry="1.3" fill="${p.acento}" stroke="none" />
      <path d="M18.6 14.4c-.4 3.6-1.2 5.4-1.2 7.8" fill="none"
        stroke="${clarear(p.cabelo, 0.28)}" stroke-width="0.5" stroke-linecap="round" opacity="0.5" />
      <path d="M21.2 14.3c.6 3.4 1.3 5.4 1.3 7.8" fill="none"
        stroke="${escurecer(p.cabelo, 0.3)}" stroke-width="0.45" stroke-linecap="round" opacity="0.55" />
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
  // Com fone a orelha some debaixo da concha; sem ele, a orelha é o detalhe que
  // faz a cabeça deixar de ser uma bola.
  const orelhas = acessorio === 'fone'
    ? ''
    : `<g class="patrol-avatar__ears">
         <ellipse cx="${CX - RX + 0.3}" cy="12.2" rx="1.35" ry="1.85" fill="url(#g-pele-${s})" />
         <ellipse cx="${CX + RX - 0.3}" cy="12.2" rx="1.35" ry="1.85" fill="url(#g-pele-${s})" />
         <path d="M13.5 11.5 C12.8 12.1 12.9 13.1 13.6 13.5" fill="none"
           stroke="${escurecer(p.pele, 0.3)}" stroke-width="0.4" stroke-linecap="round" opacity="0.72" />
         <path d="M26.5 11.5 C27.2 12.1 27.1 13.1 26.4 13.5" fill="none"
           stroke="${escurecer(p.pele, 0.3)}" stroke-width="0.4" stroke-linecap="round" opacity="0.72" />
       </g>`;

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
           ${cabeloFrente(p, s)}
           ${rosto(p)}`
        : `<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="url(#g-pele-${s})" />
           ${orelhas}
           ${cabeloCostas(p, s)}
           ${p.sexo === 'masculino' || p.estilo.rabo
             ? `<path d="M17.8 16.1 C18.8 17.1 21.2 17.1 22.2 16.1" fill="none"
                  stroke="${escurecer(p.pele, 0.34)}" stroke-width="0.5" stroke-linecap="round" opacity="0.7" />`
             : ''}`}

      ${acessorio === 'oculos' ? oculos(camera, p) : ''}
      ${acessorio === 'fone' ? fone(p, s) : ''}
    </g>
  `;
};
