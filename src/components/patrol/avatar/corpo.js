// Tronco, braços e pernas.
//
// POR QUE AQUI NÃO EXISTE MAIS UM `<rect>`
//
// A versão anterior montava a figura inteira com retângulos de canto
// arredondado: braço cápsula, perna cápsula, tronco cápsula. Cada peça isolada
// ficava aceitável, mas o conjunto tinha um vocabulário de forma só — e forma
// repetida com junta visível é exatamente como se desenha um robô. A cura não
// é mais sombra nem mais detalhe: é AFUNILAMENTO. Ombro mais largo que cintura,
// coxa mais grossa que canela, bíceps mais grosso que punho. É o que o olho lê
// como corpo antes de conseguir distinguir qualquer detalhe.
//
// O ANTEBRAÇO É PELE, E ISSO IMPORTA MAIS DO QUE PARECE
//
// Antes o braço era um tubo de tecido inteiro com uma bolinha cor de pele na
// ponta, e a bolinha virava a coisa mais chamativa do desenho. Agora a manga
// termina no meio do braço e o antebraço inteiro é pele: a mão deixa de ser um
// ponto solto e passa a ser o fim de algo. De quebra, a barra da manga dá uma
// linha horizontal no lugar onde o braço precisava de leitura.

import { CORPO, clarear, escurecer } from './paleta';

/* --- Tronco --- */

// A mesma silhueta serve para a camiseta e para o colete: o colete é ela
// afunilada por dentro. Um caminho só evita que os dois briguem de contorno.
const troncoPath = (recuo = 0) => {
  const e = CORPO.ombroEsq + recuo;
  const d = CORPO.ombroDir - recuo;
  const ce = CORPO.cinturaEsq + recuo * 0.7;
  const cd = CORPO.cinturaDir - recuo * 0.7;
  const topo = CORPO.ombroY + recuo * 0.6;

  return `M${e} ${topo + 3.1}
    C${e + 0.2} ${topo + 1} ${e + 3.4} ${topo} 20 ${topo}
    C${d - 3.4} ${topo} ${d - 0.2} ${topo + 1} ${d} ${topo + 3.1}
    L${cd} ${CORPO.cinturaY - 1.6}
    C${cd - 0.2} ${CORPO.cinturaY - 0.4} ${cd - 2.8} ${CORPO.cinturaY + 0.2} 20 ${CORPO.cinturaY + 0.2}
    C${ce + 2.8} ${CORPO.cinturaY + 0.2} ${ce + 0.2} ${CORPO.cinturaY - 0.4} ${ce} ${CORPO.cinturaY - 1.6}
    Z`;
};

// A gola muda com a câmera, e é o primeiro sinal de que a figura tem frente.
// De frente é uma abertura com o pescoço dentro; de costas é uma faixa e a
// etiqueta. Sem isso o tronco é um saco fechado nos dois lados.
const gola = (camera, p) => {
  if (camera === 'costas') {
    return `
      <path d="M16.5 ${CORPO.golaY - 0.5} C17.5 ${CORPO.golaY + 1.4} 22.5 ${CORPO.golaY + 1.4} 23.5 ${CORPO.golaY - 0.5} Z"
        fill="${escurecer(p.roupa, 0.3)}" stroke="none" />
      <rect x="19.2" y="${CORPO.golaY + 0.5}" width="1.6" height="1.2" rx="0.45"
        fill="${clarear(p.roupa, 0.5)}" stroke="none" opacity="0.75" />
    `;
  }
  return `
    <path d="M16.3 ${CORPO.golaY - 0.6} C17.3 ${CORPO.golaY + 2.6} 22.7 ${CORPO.golaY + 2.6} 23.7 ${CORPO.golaY - 0.6} Z"
      fill="${escurecer(p.roupa, 0.42)}" stroke="none" />
  `;
};

export const tronco = (camera, p, s) => {
  const recorte = `c-tronco-${s}`;

  return `
    <g class="patrol-avatar__torso">
      <!-- O recorte existe para camuflagem e refletivo não vazarem pela borda
           agora que o tronco tem cintura e não é mais uma caixa. -->
      <clipPath id="${recorte}"><path d="${troncoPath()}" /></clipPath>

      <path d="${troncoPath()}" fill="url(#g-roupa-${s})" />

      <g clip-path="url(#${recorte})">
        ${p.estilo.camuflagem
          ? `<g stroke="none" opacity="0.5">
               <ellipse cx="15.4" cy="23" rx="3.2" ry="2.3" fill="${escurecer(p.roupa, 0.32)}" />
               <ellipse cx="24.2" cy="21.8" rx="2.7" ry="2" fill="${p.calca}" />
               <ellipse cx="21.6" cy="29.8" rx="3.5" ry="2.4" fill="${escurecer(p.roupa, 0.32)}" />
               <ellipse cx="14.2" cy="30.2" rx="2.3" ry="1.8" fill="${p.calca}" />
             </g>`
          : ''}

        ${p.estilo.colete
          ? `<g>
               <path d="${troncoPath(1.1)}" fill="url(#g-equip-${s})" stroke="none" />
               <rect x="12" y="24.2" width="16" height="1.7" rx="0.85" fill="${p.acento}" stroke="none" />
               ${camera === 'frente'
                 ? `<rect x="17.8" y="20.4" width="4.4" height="11.4" rx="1.5" fill="${clarear(p.equipamento, 0.22)}" stroke="none" opacity="0.7" />`
                 : `<rect x="14.4" y="27.4" width="11.2" height="3" rx="1.2" fill="${clarear(p.equipamento, 0.16)}" stroke="none" opacity="0.8" />`}
             </g>`
          : ''}

        ${p.estilo.refletivo
          ? `<rect x="11" y="24" width="18" height="2" rx="1" fill="${p.refletivo}" stroke="none" />`
          : ''}

        <!-- A dobra do tecido na cintura. Uma linha só, mas é o que impede o
             tronco de parecer uma peça sólida moldada. -->
        <path d="M14.6 30.4 C17.4 31.4 22.6 31.4 25.4 30.4" fill="none"
          stroke="${escurecer(p.roupa, 0.38)}" stroke-width="0.5" opacity="0.65" stroke-linecap="round" />
      </g>

      <path d="${troncoPath()}" fill="url(#g-vol-${s})" stroke="none" />
      <path d="M15 ${CORPO.ombroY + 0.9} C17 ${CORPO.ombroY + 0.1} 23 ${CORPO.ombroY + 0.1} 25 ${CORPO.ombroY + 0.9}
        L25 ${CORPO.ombroY + 2.4} C23 ${CORPO.ombroY + 1.6} 17 ${CORPO.ombroY + 1.6} 15 ${CORPO.ombroY + 2.4} Z"
        fill="url(#g-luz-${s})" stroke="none" />

      ${gola(camera, p)}

      <!-- A cabeça projeta sombra nos ombros: sem ela o pescoço parece só
           encostado no tronco. -->
      <ellipse cx="20" cy="${CORPO.ombroY + 1.4}" rx="6.2" ry="2.6" fill="url(#g-oc-${s})" stroke="none" />
    </g>
  `;
};

/* --- Braços --- */

const bracoPath = (cx) => {
  const t = 2.1;
  const b = 1.7;
  return `M${cx - t} 21.6
    C${cx - t} 20.1 ${cx - t + 0.9} 19.4 ${cx} 19.4
    C${cx + t - 0.9} 19.4 ${cx + t} 20.1 ${cx + t} 21.6
    L${cx + b} 30.8
    C${cx + b} 31.9 ${cx + b - 0.6} 32.5 ${cx} 32.5
    C${cx - b + 0.6} 32.5 ${cx - b} 31.9 ${cx - b} 30.8
    Z`;
};

// Onde a manga termina. Curta deixa o antebraço à mostra; comprida é o que os
// estilos escuros pedem, e neles a pele não aparece mesmo.
const bainha = (p) => (p.estilo.colete || p.estilo.refletivo ? 30.6 : 25.4);

export const braco = (lado, camera, p, s) => {
  const cx = lado === 'back' ? 11.2 : 28.8;
  const fim = bainha(p);
  const recorte = `c-manga-${lado}-${s}`;

  return `
    <g class="patrol-avatar__limb patrol-avatar__arm patrol-avatar__arm--${lado}">
      <!-- O braço inteiro nasce de pele; a manga entra por cima e para onde
           tiver de parar. Assim o contorno da silhueta é um só, em vez de duas
           peças encostadas uma na outra. -->
      <path d="${bracoPath(cx)}" fill="url(#g-pele-${s})" />

      <clipPath id="${recorte}"><path d="${bracoPath(cx)}" /></clipPath>
      <g clip-path="url(#${recorte})">
        <rect x="${cx - 2.4}" y="18.8" width="4.8" height="${fim - 18.8}" fill="url(#g-roupa-${s})" stroke="none" />
        <rect x="${cx - 2.4}" y="${fim - 0.7}" width="4.8" height="0.7" fill="${escurecer(p.roupa, 0.36)}" stroke="none" />
        ${p.estilo.camuflagem
          ? `<g stroke="none" opacity="0.45">
               <ellipse cx="${cx - 0.8}" cy="21.4" rx="1.8" ry="1.3" fill="${escurecer(p.roupa, 0.3)}" />
               <ellipse cx="${cx + 1}" cy="24" rx="1.5" ry="1.1" fill="${p.calca}" />
             </g>`
          : ''}
        ${p.estilo.refletivo
          ? `<rect x="${cx - 2.4}" y="27.2" width="4.8" height="1.5" rx="0.6" fill="${p.refletivo}" stroke="none" />`
          : ''}
      </g>

      <path d="${bracoPath(cx)}" fill="url(#g-vol-${s})" stroke="none" />

      <circle cx="${cx}" cy="33.9" r="2" fill="url(#g-luva-${s})" />
      ${camera === 'frente' && !p.estilo.luvas
        ? `<path d="M${cx + (lado === 'back' ? -1.5 : 1.5)} 33.2 C${cx + (lado === 'back' ? -2.2 : 2.2)} 33.9 ${cx + (lado === 'back' ? -1.8 : 1.8)} 34.8 ${cx + (lado === 'back' ? -1 : 1)} 34.9"
             fill="none" stroke="${escurecer(p.pele, 0.28)}" stroke-width="0.45" stroke-linecap="round" opacity="0.8" />`
        : ''}
    </g>
  `;
};

/* --- Pernas --- */

const pernaPath = (cx) => `M${cx - 3.1} 32.4
  C${cx - 3.1} 31 ${cx + 3.1} 31 ${cx + 3.1} 32.4
  L${cx + 2.1} 40.9
  L${cx - 2.1} 40.9
  Z`;

// O TÊNIS DE SOLA CLARA É O DETALHE QUE MAIS PAGA
//
// A 50px de altura o rosto é uma mancha e a mochila é um bloco; o que o olho
// pega primeiro é o contraste na base da figura. Duas faixas claras andando
// alternadamente leem como "pessoa caminhando" antes de qualquer outra coisa.
//
// De frente se vê o bico e o cadarço; de costas, o calcanhar e a lingueta. É
// pouca tinta e é o que impede os dois lados de serem o mesmo desenho.
const tenis = (cx, camera, p, s) => {
  if (camera === 'costas') {
    return `
      <path d="M${cx - 2.9} 41 L${cx + 2.9} 41 L${cx + 3.1} 43.9
        C${cx + 3.1} 45.3 ${cx - 3.1} 45.3 ${cx - 3.1} 43.9 Z" fill="url(#g-equip-${s})" />
      <path d="M${cx - 3.15} 43.4 L${cx + 3.15} 43.4 L${cx + 3.1} 44.2
        C${cx + 3.1} 45.5 ${cx - 3.1} 45.5 ${cx - 3.1} 44.2 Z" fill="#eef2f8" stroke="none" />
      <rect x="${cx - 1.3}" y="41.1" width="2.6" height="2" rx="0.8"
        fill="${clarear(p.equipamento, 0.26)}" stroke="none" />
      <path d="${pernaPath(cx)}" fill="none" stroke="none" />
    `;
  }
  return `
    <path d="M${cx - 2.8} 40.9 L${cx + 2.8} 40.9 L${cx + 3.2} 43.8
      C${cx + 3.2} 45.4 ${cx - 3.2} 45.4 ${cx - 3.2} 43.8 Z" fill="url(#g-equip-${s})" />
    <path d="M${cx - 3.25} 43.3 L${cx + 3.25} 43.3 L${cx + 3.2} 44.1
      C${cx + 3.2} 45.5 ${cx - 3.2} 45.5 ${cx - 3.2} 44.1 Z" fill="#eef2f8" stroke="none" />
    <ellipse cx="${cx}" cy="43.4" rx="2.6" ry="1.5" fill="${clarear(p.equipamento, 0.18)}" stroke="none" />
    <g stroke="${clarear(p.equipamento, 0.55)}" stroke-width="0.42" stroke-linecap="round" fill="none" opacity="0.85">
      <path d="M${cx - 1.5} 41.3 L${cx + 1.5} 42.1" />
      <path d="M${cx + 1.5} 41.3 L${cx - 1.5} 42.1" />
    </g>
  `;
};

export const perna = (lado, camera, p, s) => {
  const cx = lado === 'back' ? 16.7 : 23.3;

  return `
    <g class="patrol-avatar__limb patrol-avatar__leg patrol-avatar__leg--${lado}">
      <path d="${pernaPath(cx)}" fill="url(#g-calca-${s})" />
      ${p.estilo.refletivo
        ? `<rect x="${cx - 2.6}" y="36" width="5.2" height="1.7" rx="0.85" fill="${p.refletivo}" stroke="none" />`
        : ''}
      <path d="${pernaPath(cx)}" fill="url(#g-vol-${s})" stroke="none" />
      ${tenis(cx, camera, p, s)}
    </g>
  `;
};
