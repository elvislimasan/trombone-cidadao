// O TORSO: a silhueta do tronco, a gola, o traje e a saia.
//
// POR QUE AQUI NÃO EXISTE UM ÚNICO `<rect>`
//
// A versão anterior montava a figura com retângulos de canto arredondado:
// braço cápsula, perna cápsula, tronco cápsula. Cada peça isolada ficava
// aceitável, mas o conjunto tinha um vocabulário de forma só — e forma
// repetida com junta visível é exatamente como se desenha um robô. A cura não
// é mais sombra nem mais detalhe: é AFUNILAMENTO. Ombro mais largo que
// cintura, quadril mais largo que cintura. É o que o olho lê como corpo antes
// de conseguir distinguir qualquer detalhe.
//
// UMA SILHUETA, DUAS TABELAS
//
// Masculino e feminino usam o MESMO path, com números diferentes. Enquanto
// eram dois caminhos escritos à mão, todo ajuste de ombro pedia duas edições e
// as duas silhuetas foram divergindo em coisas que não eram escolha de
// ninguém. Agora a diferença é só a tabela de `geometria.js`.
//
// O TRAJE ENTRA DENTRO DE UM RECORTE
//
// Camuflagem, faixa refletiva e colete são pintados por cima do tronco e
// cortados pelo contorno dele. Sem o recorte, a mancha de camuflagem escapa
// pela cintura — que agora tem curva, e não é mais uma caixa onde qualquer
// retângulo cabia.

import { MEIO, SAIA, TORSO } from './geometria';
import { clarear, escurecer } from './paleta';

const medidas = (p) => TORSO[p.sexo] || TORSO.masculino;

// `recuo` encolhe a silhueta por dentro: é assim que o colete nasce do mesmo
// caminho do tronco, em vez de brigar de contorno com ele.
export const torsoPath = (p, recuo = 0) => {
  const m = medidas(p);
  const ox = m.ombroX - recuo;
  const cx = m.cinturaX - recuo * 0.7;
  const qx = m.quadrilX - recuo * 0.75;
  const topo = m.ombroY + recuo * 0.6;
  const cy = m.cinturaY;
  const qy = m.quadrilY;
  const meioAltura = (topo + cy) / 2;

  return `M${MEIO - ox} ${topo + 18}
    C${MEIO - ox} ${topo + 5} ${MEIO - ox + 16} ${topo} ${MEIO} ${topo}
    C${MEIO + ox - 16} ${topo} ${MEIO + ox} ${topo + 5} ${MEIO + ox} ${topo + 18}
    C${MEIO + ox - 1} ${meioAltura} ${MEIO + cx + 3} ${cy - 12} ${MEIO + cx} ${cy}
    C${MEIO + cx - 1} ${cy + 10} ${MEIO + qx} ${qy - 16} ${MEIO + qx} ${qy - 8}
    C${MEIO + qx} ${qy + 2} ${MEIO + 20} ${qy + 6} ${MEIO} ${qy + 6}
    C${MEIO - 20} ${qy + 6} ${MEIO - qx} ${qy + 2} ${MEIO - qx} ${qy - 8}
    C${MEIO - qx} ${qy - 16} ${MEIO - cx + 1} ${cy + 10} ${MEIO - cx} ${cy}
    C${MEIO - cx - 3} ${cy - 12} ${MEIO - ox + 1} ${meioAltura} ${MEIO - ox} ${topo + 18} Z`;
};

/* --- Gola --- */
// A gola muda com a câmera, e é o primeiro sinal de que a figura tem frente.
// De frente é uma abertura com o pescoço dentro; de costas é uma faixa fechada
// com a etiqueta. Sem isso o tronco é um saco igual dos dois lados.

const gola = (camera, p) => {
  const y = medidas(p).golaY;

  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__collar">
        <path d="M${MEIO - 23} ${y - 4} C${MEIO - 17} ${y + 9} ${MEIO + 17} ${y + 9} ${MEIO + 23} ${y - 4} Z"
          fill="${escurecer(p.roupa, 0.3)}" stroke="none" />
        <rect x="${MEIO - 6}" y="${y + 4}" width="12" height="9" rx="3"
          fill="${clarear(p.roupa, 0.5)}" stroke="none" opacity="0.75" />
      </g>
    `;
  }

  const abertura = p.sexo === 'feminino' ? 27 : 23;
  const fundo = p.sexo === 'feminino' ? 22 : 18;

  return `
    <g class="patrol-avatar__collar">
      <path d="M${MEIO - abertura} ${y - 4} C${MEIO - abertura + 6} ${y + fundo} ${MEIO + abertura - 6} ${y + fundo} ${MEIO + abertura} ${y - 4} Z"
        fill="${escurecer(p.roupa, 0.44)}" stroke="none" />
      <path d="M${MEIO - abertura + 8} ${y - 1} C${MEIO - abertura + 12} ${y + fundo - 8} ${MEIO + abertura - 12} ${y + fundo - 8} ${MEIO + abertura - 8} ${y - 1}"
        fill="none" stroke="${clarear(p.roupa, 0.28)}" stroke-width="3.4"
        stroke-linecap="round" opacity="0.72" />
    </g>
  `;
};

/* --- Modelagem feminina --- */
// A roupa feminina continua sendo roupa de rua: blusa, jaqueta ou colete com
// corte acinturado. O que muda é a modelagem — painéis laterais e pences — em
// vez de um adereço que atrapalharia a patrulha.

const modelagemFeminina = (camera, p) => {
  if (p.sexo !== 'feminino') return '';

  const tecido = p.estilo.colete ? p.equipamento : p.roupa;
  const sombra = escurecer(tecido, 0.2);
  const luz = clarear(tecido, 0.24);

  return `
    <g class="patrol-avatar__outfit patrol-avatar__outfit--feminino" stroke-linecap="round">
      <path d="M${MEIO - 34} 162 C${MEIO - 23} 184 ${MEIO - 24} 214 ${MEIO - 23} 232
        L${MEIO - 11} 236 C${MEIO - 13} 208 ${MEIO - 12} 182 ${MEIO - 18} 160 Z"
        fill="${sombra}" stroke="none" opacity="0.6" />
      <path d="M${MEIO + 34} 162 C${MEIO + 23} 184 ${MEIO + 24} 214 ${MEIO + 23} 232
        L${MEIO + 11} 236 C${MEIO + 13} 208 ${MEIO + 12} 182 ${MEIO + 18} 160 Z"
        fill="${sombra}" stroke="none" opacity="0.6" />
      ${camera === 'costas'
        ? `<path d="M${MEIO - 24} 172 C${MEIO - 16} 178 ${MEIO + 16} 178 ${MEIO + 24} 172"
             fill="none" stroke="${luz}" stroke-width="3" opacity="0.7" />`
        : `<path d="M${MEIO - 17} 172 C${MEIO - 12} 192 ${MEIO - 13} 214 ${MEIO - 15} 228
             M${MEIO + 17} 172 C${MEIO + 12} 192 ${MEIO + 13} 214 ${MEIO + 15} 228"
             fill="none" stroke="${luz}" stroke-width="3" opacity="0.68" />`}
    </g>
  `;
};

/* --- Saia --- */

const saia = (camera, p, s) => {
  if (p.sexo !== 'feminino' || !p.estilo.saiaFeminina) return '';

  const forma = `M${MEIO - SAIA.topoX} ${SAIA.topo}
    C${MEIO - 20} ${SAIA.topo - 6} ${MEIO + 20} ${SAIA.topo - 6} ${MEIO + SAIA.topoX} ${SAIA.topo}
    L${MEIO + SAIA.baseX} ${SAIA.base}
    C${MEIO + 30} ${SAIA.base + 10} ${MEIO - 30} ${SAIA.base + 10} ${MEIO - SAIA.baseX} ${SAIA.base} Z`;

  return `
    <g class="patrol-avatar__skirt patrol-avatar__outfit--feminino">
      <path d="${forma}" fill="url(#g-calca-${s})" />
      <path d="M${MEIO - SAIA.topoX} ${SAIA.topo}
        C${MEIO - 20} ${SAIA.topo - 6} ${MEIO + 20} ${SAIA.topo - 6} ${MEIO + SAIA.topoX} ${SAIA.topo}
        L${MEIO + SAIA.topoX + 4} ${SAIA.topo + 12}
        C${MEIO + 20} ${SAIA.topo + 6} ${MEIO - 20} ${SAIA.topo + 6} ${MEIO - SAIA.topoX - 4} ${SAIA.topo + 12} Z"
        fill="${clarear(p.calca, 0.22)}" stroke="none" />
      ${camera === 'frente'
        ? `<g fill="none" stroke-linecap="round">
             <path d="M${MEIO - 18} ${SAIA.topo + 12} L${MEIO - 29} ${SAIA.base + 2}
               M${MEIO} ${SAIA.topo + 14} L${MEIO} ${SAIA.base + 6}
               M${MEIO + 18} ${SAIA.topo + 12} L${MEIO + 29} ${SAIA.base + 2}"
               stroke="${clarear(p.calca, 0.3)}" stroke-width="3.4" opacity="0.68" />
             <path d="M${MEIO - 8} ${SAIA.topo + 13} L${MEIO - 12} ${SAIA.base + 4}
               M${MEIO + 8} ${SAIA.topo + 13} L${MEIO + 12} ${SAIA.base + 4}"
               stroke="${escurecer(p.calca, 0.3)}" stroke-width="3" opacity="0.66" />
           </g>`
        : `<g fill="none" stroke-linecap="round">
             <path d="M${MEIO} ${SAIA.topo + 8} L${MEIO} ${SAIA.base + 4}"
               stroke="${escurecer(p.calca, 0.36)}" stroke-width="3.6"
               stroke-dasharray="5 3.6" opacity="0.82" />
             <path d="M${MEIO - 21} ${SAIA.topo + 12} L${MEIO - 31} ${SAIA.base}
               M${MEIO + 21} ${SAIA.topo + 12} L${MEIO + 31} ${SAIA.base}"
               stroke="${clarear(p.calca, 0.22)}" stroke-width="3" opacity="0.6" />
           </g>`}
      <path d="M${MEIO - SAIA.baseX + 2} ${SAIA.base - 2} C${MEIO - 26} ${SAIA.base + 8} ${MEIO + 26} ${SAIA.base + 8} ${MEIO + SAIA.baseX - 2} ${SAIA.base - 2}"
        fill="none" stroke="${clarear(p.calca, 0.3)}" stroke-width="3.8"
        stroke-linecap="round" opacity="0.7" />
      <path d="${forma}" fill="url(#g-vol-${s})" stroke="none" />
    </g>
  `;
};

/* --- O tronco montado --- */

export const torso = (camera, p, s) => {
  const m = medidas(p);
  const recorte = `c-torso-${s}`;
  const forma = torsoPath(p);

  return `
    <g class="patrol-avatar__torso">
      <clipPath id="${recorte}"><path d="${forma}" /></clipPath>

      <path d="${forma}" fill="url(#g-roupa-${s})" />

      <g clip-path="url(#${recorte})">
        ${p.estilo.camuflagem
          ? `<g stroke="none" opacity="0.5">
               <ellipse cx="${MEIO - 30}" cy="180" rx="21" ry="15" fill="${escurecer(p.roupa, 0.32)}" />
               <ellipse cx="${MEIO + 27}" cy="172" rx="17" ry="13" fill="${p.calca}" />
               <ellipse cx="${MEIO + 10}" cy="222" rx="23" ry="15" fill="${escurecer(p.roupa, 0.32)}" />
               <ellipse cx="${MEIO - 37}" cy="216" rx="15" ry="12" fill="${p.calca}" />
             </g>`
          : ''}

        ${p.estilo.colete
          ? `<g class="patrol-avatar__vest">
               <path d="${torsoPath(p, 7)}" fill="url(#g-equip-${s})" stroke="none" />
               <rect x="${MEIO - 45}" y="${m.cinturaY - 16}" width="90" height="11" rx="5.5"
                 fill="${p.acento}" stroke="none" />
               ${camera === 'frente'
                 ? `<rect x="${MEIO - 15}" y="${m.ombroY + 20}" width="30" height="72" rx="10"
                      fill="${clarear(p.equipamento, 0.22)}" stroke="none" opacity="0.7" />`
                 : `<rect x="${MEIO - 36}" y="${m.cinturaY + 6}" width="72" height="20" rx="8"
                      fill="${clarear(p.equipamento, 0.16)}" stroke="none" opacity="0.8" />`}
             </g>`
          : ''}

        ${modelagemFeminina(camera, p)}

        ${p.estilo.refletivo
          ? `<rect x="${MEIO - 52}" y="${m.cinturaY - 18}" width="104" height="13" rx="6.5"
               fill="${p.refletivo}" stroke="none" />`
          : ''}

        ${camera === 'costas'
          ? `<g class="patrol-avatar__back-details" fill="none" stroke-linecap="round">
               <path d="M${MEIO - 36} ${m.ombroY + 22} C${MEIO - 18} ${m.ombroY + 30} ${MEIO + 18} ${m.ombroY + 30} ${MEIO + 36} ${m.ombroY + 22}"
                 stroke="${clarear(p.roupa, 0.22)}" stroke-width="3.6" opacity="0.68" />
               <path d="M${MEIO} ${m.ombroY + 26} C${MEIO - 2} ${m.cinturaY - 20} ${MEIO + 2} ${m.cinturaY + 4} ${MEIO} ${m.quadrilY - 4}"
                 stroke="${escurecer(p.roupa, 0.36)}" stroke-width="3.2" opacity="0.7" />
               <path d="M${MEIO - 32} ${m.cinturaY + 8} C${MEIO - 22} ${m.cinturaY + 14} ${MEIO - 16} ${m.cinturaY + 16} ${MEIO - 10} ${m.cinturaY + 17}
                 M${MEIO + 32} ${m.cinturaY + 8} C${MEIO + 22} ${m.cinturaY + 14} ${MEIO + 16} ${m.cinturaY + 16} ${MEIO + 10} ${m.cinturaY + 17}"
                 stroke="${clarear(p.roupa, 0.18)}" stroke-width="2.8" opacity="0.54" />
             </g>`
          : ''}

        <!-- A dobra do tecido na cintura. Uma linha só, mas é o que impede o
             tronco de parecer uma peça sólida moldada. -->
        <path d="M${MEIO - 34} ${m.quadrilY - 14} C${MEIO - 18} ${m.quadrilY - 8} ${MEIO + 18} ${m.quadrilY - 8} ${MEIO + 34} ${m.quadrilY - 14}"
          fill="none" stroke="${escurecer(p.roupa, 0.38)}" stroke-width="3.2"
          stroke-linecap="round" opacity="0.62" />

        <path d="${forma}" fill="url(#g-interna-${s})" stroke="none" />
      </g>

      <path d="${forma}" fill="url(#g-vol-${s})" stroke="none" />

      <!-- O realce da linha do peito: a quina que a luz de cima pega primeiro. -->
      <path d="M${MEIO - 30} ${m.ombroY + 6} C${MEIO - 14} ${m.ombroY - 1} ${MEIO + 14} ${m.ombroY - 1} ${MEIO + 30} ${m.ombroY + 6}
        L${MEIO + 30} ${m.ombroY + 16} C${MEIO + 14} ${m.ombroY + 9} ${MEIO - 14} ${m.ombroY + 9} ${MEIO - 30} ${m.ombroY + 16} Z"
        fill="url(#g-luz-${s})" stroke="none" />

      ${saia(camera, p, s)}
      ${gola(camera, p)}

      <!-- A cabeça projeta sombra nos ombros: sem ela o pescoço parece só
           encostado no tronco. -->
      <ellipse cx="${MEIO}" cy="${m.ombroY + 8}" rx="42" ry="16"
        fill="url(#g-oc-${s})" stroke="none" />
    </g>
  `;
};
