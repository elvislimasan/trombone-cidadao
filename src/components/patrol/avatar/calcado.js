// O CALÇADO.
//
// É O DETALHE QUE MAIS PAGA NA ESCALA DO MAPA
//
// A 48px o rosto é uma mancha e a mochila é um bloco; o que o olho pega
// primeiro é o contraste na base da figura. Dois tênis grandes de sola clara,
// alternando, leem como "pessoa caminhando" antes de qualquer outra coisa ser
// distinguível. É por isso que o pé é desproporcionalmente grande: ele carrega
// a informação mais importante do marcador.
//
// FRENTE E COSTAS SÃO DOIS CALÇADOS DIFERENTES
//
// De frente se vê o bico, a lingueta e o cadarço. De costas, o contraforte do
// calcanhar e a alça de puxar. É pouca tinta e é o que impede os dois lados de
// serem o mesmo desenho espelhado — que é exatamente o que faria a câmera
// traseira parecer preguiçosa.
//
// A SOLA É RECORTADA, NÃO SOBREPOSTA
//
// Ela é uma faixa clara cortada pelo contorno do próprio tênis. Desenhada por
// cima como forma solta, ela escapava pelas bordas arredondadas e o tênis
// ganhava um degrau branco no perfil.

import { CALCADO as K } from './geometria';
import { clarear, escurecer } from './paleta';

const forma = (cx) => `M${cx - 22} ${K.topo}
  C${cx - 30} ${K.topo + 2} ${cx - K.meiaLargura - 1} ${K.topo + 12} ${cx - K.meiaLargura - 1} ${K.topo + 20}
  C${cx - K.meiaLargura - 1} ${K.base - 6} ${cx - 26} ${K.base} ${cx} ${K.base}
  C${cx + 26} ${K.base} ${cx + K.meiaLargura + 1} ${K.base - 6} ${cx + K.meiaLargura + 1} ${K.topo + 20}
  C${cx + K.meiaLargura + 1} ${K.topo + 12} ${cx + 30} ${K.topo + 2} ${cx + 22} ${K.topo} Z`;

export const calcado = (cx, camera, p, s, chave) => {
  const d = forma(cx);
  const recorte = `c-tenis-${chave}-${s}`;

  return `
    <g class="patrol-avatar__shoe">
      <path d="${d}" fill="url(#g-equip-${s})" />

      <clipPath id="${recorte}"><path d="${d}" /></clipPath>
      <g clip-path="url(#${recorte})">
        <!-- A entressola clara: a faixa que faz o pé existir contra o asfalto. -->
        <rect x="${cx - 40}" y="${K.base - 15}" width="80" height="22" fill="url(#g-sola-${s})" stroke="none" />
        <rect x="${cx - 40}" y="${K.base - 15}" width="80" height="3.5"
          fill="${escurecer(p.sola, 0.22)}" stroke="none" opacity="0.7" />

        ${camera === 'frente'
          ? `<!-- Bico, lingueta e cadarço. -->
             <ellipse cx="${cx}" cy="${K.base - 17}" rx="21" ry="10"
               fill="${clarear(p.equipamento, 0.16)}" stroke="none" />
             <rect x="${cx - 11}" y="${K.topo - 2}" width="22" height="16" rx="7"
               fill="${clarear(p.equipamento, 0.28)}" stroke="none" />
             <g stroke="${clarear(p.equipamento, 0.62)}" stroke-width="3"
                stroke-linecap="round" fill="none" opacity="0.85">
               <path d="M${cx - 12} ${K.topo + 6} L${cx + 12} ${K.topo + 14}" />
               <path d="M${cx + 12} ${K.topo + 6} L${cx - 12} ${K.topo + 14}" />
             </g>
             <rect x="${cx - 30}" y="${K.topo + 20}" width="10" height="12" rx="4"
               fill="${p.acento}" stroke="none" opacity="0.92" />`
          : `<!-- Contraforte do calcanhar e a alça de puxar. -->
             <path d="M${cx - 15} ${K.topo + 2} L${cx + 15} ${K.topo + 2} L${cx + 12} ${K.base - 14}
               L${cx - 12} ${K.base - 14} Z" fill="${clarear(p.equipamento, 0.2)}" stroke="none" />
             <rect x="${cx - 9}" y="${K.topo - 4}" width="18" height="11" rx="5"
               fill="${p.acento}" stroke="none" />
             <path d="M${cx - 26} ${K.topo + 16} C${cx - 14} ${K.topo + 24} ${cx + 14} ${K.topo + 24} ${cx + 26} ${K.topo + 16}"
               fill="none" stroke="${escurecer(p.equipamento, 0.3)}" stroke-width="3"
               stroke-linecap="round" opacity="0.8" />`}

        ${p.estilo.refletivo
          ? `<rect x="${cx - 40}" y="${K.topo + 22}" width="80" height="7" rx="3.5"
               fill="${p.refletivo}" stroke="none" opacity="0.9" />`
          : ''}

        <path d="${d}" fill="url(#g-interna-${s})" stroke="none" />
      </g>

      <path d="${d}" fill="url(#g-vol-${s})" stroke="none" />
      <ellipse cx="${cx - 9}" cy="${K.topo + 12}" rx="10" ry="5" fill="#ffffff"
        stroke="none" opacity="0.16" />
    </g>
  `;
};
