// AS PERNAS.
//
// COXA MAIS GROSSA QUE CANELA, E É SÓ ISSO
//
// Enquanto a perna era uma cápsula de largura constante, o boneco lia como
// robô por mais bem pintado que estivesse: forma repetida com junta visível é
// literalmente como se desenha um autômato. O afunilamento da coxa ao
// tornozelo é o que o olho lê como perna, e ele custa dois números.
//
// O TÊNIS VIVE DENTRO DO GRUPO DA PERNA
//
// `.patrol-avatar__limb` gira em torno do quadril. Se o calçado ficasse fora,
// a perna daria o passo e o pé ficaria plantado no chão. O CSS não sabe nada
// disso: ele gira a peça, e a peça é a perna inteira, do quadril à sola.

import { MEIO, PERNA as L } from './geometria';
import { clarear, escurecer } from './paleta';
import { calcado } from './calcado';

const pernaPath = (cx, p) => {
  const coxa = p.sexo === 'feminino' ? L.coxaR - 1 : L.coxaR;
  const joelho = p.sexo === 'feminino' ? L.joelhoR - 2 : L.joelhoR;
  const tornozelo = p.sexo === 'feminino' ? L.tornozeloR - 2 : L.tornozeloR;

  return `M${cx - coxa} ${L.quadrilY + 6}
    C${cx - coxa} ${L.quadrilY - 8} ${cx + coxa} ${L.quadrilY - 8} ${cx + coxa} ${L.quadrilY + 6}
    C${cx + joelho + 1} ${L.joelhoY} ${cx + tornozelo + 1} ${L.joelhoY + 12} ${cx + tornozelo} ${L.tornozeloY}
    L${cx - tornozelo} ${L.tornozeloY}
    C${cx - tornozelo - 1} ${L.joelhoY + 12} ${cx - joelho - 1} ${L.joelhoY} ${cx - coxa} ${L.quadrilY + 6} Z`;
};

export const perna = (lado, camera, p, s) => {
  const cx = lado === 'back' ? MEIO - L.dx : MEIO + L.dx;
  const forma = pernaPath(cx, p);
  const recorte = `c-perna-${lado}-${s}`;

  return `
    <g class="patrol-avatar__limb patrol-avatar__leg patrol-avatar__leg--${lado}">
      <path d="${forma}" fill="url(#g-calca-${s})" />

      <clipPath id="${recorte}"><path d="${forma}" /></clipPath>
      <g clip-path="url(#${recorte})">
        ${p.estilo.camuflagem
          ? `<g stroke="none" opacity="0.42">
               <ellipse cx="${cx - 8}" cy="${L.quadrilY + 24}" rx="14" ry="10"
                 fill="${escurecer(p.calca, 0.3)}" />
               <ellipse cx="${cx + 8}" cy="${L.joelhoY + 4}" rx="11" ry="8"
                 fill="${clarear(p.calca, 0.24)}" />
             </g>`
          : ''}
        ${p.estilo.refletivo
          ? `<rect x="${cx - 20}" y="${L.joelhoY - 8}" width="40" height="11" rx="5.5"
               fill="${p.refletivo}" stroke="none" />`
          : ''}
        ${camera === 'costas'
          ? `<g class="patrol-avatar__leg-back-details" fill="none" stroke-linecap="round">
               <path d="M${cx - 15} ${L.quadrilY + 18} C${cx - 6} ${L.quadrilY + 24} ${cx + 6} ${L.quadrilY + 24} ${cx + 15} ${L.quadrilY + 18}"
                 stroke="${clarear(p.calca, 0.2)}" stroke-width="3" opacity="0.62" />
               <path d="M${cx} ${L.quadrilY + 26} L${cx} ${L.tornozeloY - 6}"
                 stroke="${escurecer(p.calca, 0.3)}" stroke-width="2.6" opacity="0.6" />
             </g>`
          : `<path d="M${cx - 15} ${L.joelhoY - 16} C${cx - 6} ${L.joelhoY - 10} ${cx + 6} ${L.joelhoY - 10} ${cx + 15} ${L.joelhoY - 16}"
               fill="none" stroke="${clarear(p.calca, 0.22)}" stroke-width="3"
               stroke-linecap="round" opacity="0.6" />`}
        <path d="${forma}" fill="url(#g-interna-${s})" stroke="none" />
      </g>

      <path d="${forma}" fill="url(#g-vol-${s})" stroke="none" />

      ${calcado(cx, camera, p, s, lado)}
    </g>
  `;
};
