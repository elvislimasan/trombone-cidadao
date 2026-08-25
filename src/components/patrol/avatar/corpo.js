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
const troncoPath = (p, recuo = 0) => {
  const topo = CORPO.ombroY + recuo * 0.6;

  if (p.sexo === 'feminino') {
    const ombroEsq = 12.7 + recuo;
    const ombroDir = 27.3 - recuo;
    const cinturaEsq = 15.4 + recuo * 0.55;
    const cinturaDir = 24.6 - recuo * 0.55;
    const quadrilEsq = 13 + recuo * 0.65;
    const quadrilDir = 27 - recuo * 0.65;

    return `M${ombroEsq} ${topo + 3}
      C${ombroEsq + 0.2} ${topo + 0.9} ${ombroEsq + 3} ${topo} 20 ${topo}
      C${ombroDir - 3} ${topo} ${ombroDir - 0.2} ${topo + 0.9} ${ombroDir} ${topo + 3}
      C${ombroDir - 0.1} 23.4 ${cinturaDir + 0.8} 25.4 ${cinturaDir} 28.4
      C${cinturaDir - 0.1} 29.5 ${quadrilDir} 30.5 ${quadrilDir} 31.7
      C${quadrilDir - 0.1} 32.8 23.2 ${CORPO.cinturaY + 0.25} 20 ${CORPO.cinturaY + 0.25}
      C16.8 ${CORPO.cinturaY + 0.25} ${quadrilEsq + 0.1} 32.8 ${quadrilEsq} 31.7
      C${quadrilEsq} 30.5 ${cinturaEsq + 0.1} 29.5 ${cinturaEsq} 28.4
      C${cinturaEsq - 0.8} 25.4 ${ombroEsq + 0.1} 23.4 ${ombroEsq} ${topo + 3}
      Z`;
  }

  const e = CORPO.ombroEsq + recuo;
  const d = CORPO.ombroDir - recuo;
  const ce = CORPO.cinturaEsq + recuo * 0.7;
  const cd = CORPO.cinturaDir - recuo * 0.7;

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
      ${p.sexo === 'feminino'
        ? `<path d="M15.4 ${CORPO.golaY + 1.2} C17.2 ${CORPO.golaY + 2.8} 22.8 ${CORPO.golaY + 2.8} 24.6 ${CORPO.golaY + 1.2}"
             fill="none" stroke="${clarear(p.roupa, 0.24)}" stroke-width="0.48" stroke-linecap="round" opacity="0.7" />`
        : ''}
    `;
  }

  if (p.sexo === 'feminino') {
    return `
      <path d="M15.7 ${CORPO.golaY - 0.6} C16.8 ${CORPO.golaY + 3.1} 23.2 ${CORPO.golaY + 3.1} 24.3 ${CORPO.golaY - 0.6} Z"
        fill="${escurecer(p.roupa, 0.42)}" stroke="none" />
      <path d="M17.2 ${CORPO.golaY + 0.1} C18.1 ${CORPO.golaY + 1.8} 21.9 ${CORPO.golaY + 1.8} 22.8 ${CORPO.golaY + 0.1}"
        fill="none" stroke="${clarear(p.roupa, 0.26)}" stroke-width="0.5" stroke-linecap="round" opacity="0.72" />
    `;
  }

  return `
    <path d="M16.3 ${CORPO.golaY - 0.6} C17.3 ${CORPO.golaY + 2.6} 22.7 ${CORPO.golaY + 2.6} 23.7 ${CORPO.golaY - 0.6} Z"
      fill="${escurecer(p.roupa, 0.42)}" stroke="none" />
  `;
};

// A roupa feminina continua sendo roupa de rua: blusa, jaqueta ou colete com
// corte acinturado e calça. O que muda é a modelagem — gola mais aberta, painéis
// laterais e pences — em vez de acrescentar um adereço que atrapalharia a
// patrulha. As formas têm contraste suficiente para sobreviver aos 58px do mapa.
const roupaFeminina = (camera, p) => {
  if (p.sexo !== 'feminino') return '';

  const tecido = p.estilo.colete ? p.equipamento : p.roupa;
  const sombra = escurecer(tecido, 0.2);
  const luz = clarear(tecido, 0.24);

  if (camera === 'costas') {
    return `
      <g class="patrol-avatar__outfit patrol-avatar__outfit--feminino" stroke-linecap="round">
        <path d="M13.4 21.4 C15.2 23.8 15 28.3 15.1 31.2 L17 31.8 C16.8 27.8 17 24 16.1 21.1 Z"
          fill="${sombra}" stroke="none" opacity="0.62" />
        <path d="M26.6 21.4 C24.8 23.8 25 28.3 24.9 31.2 L23 31.8 C23.2 27.8 23 24 23.9 21.1 Z"
          fill="${sombra}" stroke="none" opacity="0.62" />
        <path d="M16.3 22.4 C17.5 23.3 18.7 23.7 20 23.7 C21.3 23.7 22.5 23.3 23.7 22.4"
          fill="none" stroke="${luz}" stroke-width="0.46" opacity="0.72" />
        <path d="M16 30 C18.3 31.1 21.7 31.1 24 30" fill="none"
          stroke="${sombra}" stroke-width="0.52" opacity="0.78" />
      </g>
    `;
  }

  return `
    <g class="patrol-avatar__outfit patrol-avatar__outfit--feminino" stroke-linecap="round">
      <path d="M13.4 21.2 C15.2 23.8 15 28.5 15.2 31.3 L17.2 31.9 C16.9 27.5 17.1 23.9 16 20.8 Z"
        fill="${sombra}" stroke="none" opacity="0.64" />
      <path d="M26.6 21.2 C24.8 23.8 25 28.5 24.8 31.3 L22.8 31.9 C23.1 27.5 22.9 23.9 24 20.8 Z"
        fill="${sombra}" stroke="none" opacity="0.64" />
      <path d="M17.2 22.4 C17.9 25.2 17.7 28.4 17.4 30.7 M22.8 22.4 C22.1 25.2 22.3 28.4 22.6 30.7"
        fill="none" stroke="${luz}" stroke-width="0.46" opacity="0.7" />
      <path d="M15.8 30 C18.2 31.2 21.8 31.2 24.2 30" fill="none"
        stroke="${sombra}" stroke-width="0.54" opacity="0.8" />
    </g>
  `;
};

const saiaFeminina = (camera, p, s) => {
  if (p.sexo !== 'feminino' || !p.estilo.saiaFeminina) return '';

  return `
    <g class="patrol-avatar__skirt patrol-avatar__outfit--feminino">
      <path d="M14.7 29.5 C17.1 28.8 22.9 28.8 25.3 29.5 L28.3 38.2
        C24.8 39.6 15.2 39.6 11.7 38.2 Z" fill="url(#g-calca-${s})" />
      <path d="M14.7 29.5 C17.1 28.8 22.9 28.8 25.3 29.5 L25.7 31.2
        C22.5 31.9 17.5 31.9 14.3 31.2 Z" fill="${clarear(p.calca, 0.2)}" stroke="none" />
      ${camera === 'frente'
        ? `<g fill="none" stroke-linecap="round">
             <path d="M17.1 31.4 L15.5 38.4 M20 31.7 L20 39 M22.9 31.4 L24.5 38.4"
               stroke="${clarear(p.calca, 0.28)}" stroke-width="0.52" opacity="0.7" />
             <path d="M18.4 31.6 L17.8 38.8 M21.6 31.6 L22.2 38.8"
               stroke="${escurecer(p.calca, 0.28)}" stroke-width="0.48" opacity="0.68" />
           </g>`
        : `<g fill="none" stroke-linecap="round">
             <path d="M20 30.8 L20 38.9" stroke="${escurecer(p.calca, 0.34)}"
               stroke-width="0.55" stroke-dasharray="0.75 0.55" opacity="0.82" />
             <path d="M16.7 31.4 L15.5 38.4 M23.3 31.4 L24.5 38.4"
               stroke="${clarear(p.calca, 0.22)}" stroke-width="0.48" opacity="0.62" />
           </g>`}
      <path d="M11.9 37.9 C15.8 39.1 24.2 39.1 28.1 37.9" fill="none"
        stroke="${clarear(p.calca, 0.3)}" stroke-width="0.58" stroke-linecap="round" opacity="0.72" />
      <path d="M14.7 29.5 C17.1 28.8 22.9 28.8 25.3 29.5 L28.3 38.2
        C24.8 39.6 15.2 39.6 11.7 38.2 Z" fill="url(#g-vol-${s})" stroke="none" />
    </g>
  `;
};

export const tronco = (camera, p, s) => {
  const recorte = `c-tronco-${s}`;

  return `
    <g class="patrol-avatar__torso">
      <!-- O recorte existe para camuflagem e refletivo não vazarem pela borda
           agora que o tronco tem cintura e não é mais uma caixa. -->
      <clipPath id="${recorte}"><path d="${troncoPath(p)}" /></clipPath>

      <path d="${troncoPath(p)}" fill="url(#g-roupa-${s})" />

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
               <path d="${troncoPath(p, 1.1)}" fill="url(#g-equip-${s})" stroke="none" />
               <rect x="12" y="24.2" width="16" height="1.7" rx="0.85" fill="${p.acento}" stroke="none" />
               ${camera === 'frente'
                 ? `<rect x="17.8" y="20.4" width="4.4" height="11.4" rx="1.5" fill="${clarear(p.equipamento, 0.22)}" stroke="none" opacity="0.7" />`
                 : `<rect x="14.4" y="27.4" width="11.2" height="3" rx="1.2" fill="${clarear(p.equipamento, 0.16)}" stroke="none" opacity="0.8" />`}
             </g>`
          : ''}

        ${roupaFeminina(camera, p)}

        ${p.estilo.refletivo
          ? `<rect x="11" y="24" width="18" height="2" rx="1" fill="${p.refletivo}" stroke="none" />`
          : ''}

        ${camera === 'costas'
          ? `<g class="patrol-avatar__back-details" fill="none" stroke-linecap="round">
               <path d="M14.4 21.8 C17.4 23 22.6 23 25.6 21.8"
                 stroke="${clarear(p.roupa, 0.22)}" stroke-width="0.55" opacity="0.68" />
               <path d="M20 22.3 C19.7 25.5 20.3 28.1 20 30.7"
                 stroke="${escurecer(p.roupa, 0.36)}" stroke-width="0.5" opacity="0.7" />
               <path d="M15.1 28.2 C16.6 29 17.4 29.2 18.4 29.3 M24.9 28.2 C23.4 29 22.6 29.2 21.6 29.3"
                 stroke="${clarear(p.roupa, 0.18)}" stroke-width="0.42" opacity="0.54" />
             </g>`
          : ''}

        <!-- A dobra do tecido na cintura. Uma linha só, mas é o que impede o
             tronco de parecer uma peça sólida moldada. -->
        <path d="M14.6 30.4 C17.4 31.4 22.6 31.4 25.4 30.4" fill="none"
          stroke="${escurecer(p.roupa, 0.38)}" stroke-width="0.5" opacity="0.65" stroke-linecap="round" />
      </g>

      <path d="${troncoPath(p)}" fill="url(#g-vol-${s})" stroke="none" />
      <path d="M15 ${CORPO.ombroY + 0.9} C17 ${CORPO.ombroY + 0.1} 23 ${CORPO.ombroY + 0.1} 25 ${CORPO.ombroY + 0.9}
        L25 ${CORPO.ombroY + 2.4} C23 ${CORPO.ombroY + 1.6} 17 ${CORPO.ombroY + 1.6} 15 ${CORPO.ombroY + 2.4} Z"
        fill="url(#g-luz-${s})" stroke="none" />

      ${saiaFeminina(camera, p, s)}

      ${gola(camera, p)}

      <!-- A cabeça projeta sombra nos ombros: sem ela o pescoço parece só
           encostado no tronco. -->
      <ellipse cx="20" cy="${CORPO.ombroY + 1.4}" rx="6.2" ry="2.6" fill="url(#g-oc-${s})" stroke="none" />
    </g>
  `;
};

/* --- Braços --- */

const bracoPath = (cx, p) => {
  const t = p.sexo === 'feminino' ? 1.9 : 2.1;
  const b = p.sexo === 'feminino' ? 1.55 : 1.7;
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
      <path d="${bracoPath(cx, p)}" fill="url(#g-pele-${s})" />

      <clipPath id="${recorte}"><path d="${bracoPath(cx, p)}" /></clipPath>
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

      <path d="${bracoPath(cx, p)}" fill="url(#g-vol-${s})" stroke="none" />

      ${camera === 'costas'
        ? `<path d="M${cx - 1.25} 28.4 C${cx - 0.35} 29 ${cx + 0.35} 29 ${cx + 1.25} 28.4"
             fill="none" stroke="${escurecer(fim > 28 ? p.roupa : p.pele, 0.3)}"
             stroke-width="0.45" stroke-linecap="round" opacity="0.62" />`
        : ''}

      <circle cx="${cx}" cy="33.9" r="2" fill="url(#g-luva-${s})" />
      ${!p.estilo.luvas
        ? camera === 'frente'
          ? `<path d="M${cx + (lado === 'back' ? -1.5 : 1.5)} 33.2 C${cx + (lado === 'back' ? -2.2 : 2.2)} 33.9 ${cx + (lado === 'back' ? -1.8 : 1.8)} 34.8 ${cx + (lado === 'back' ? -1 : 1)} 34.9"
               fill="none" stroke="${escurecer(p.pele, 0.28)}" stroke-width="0.45" stroke-linecap="round" opacity="0.8" />`
          : `<g class="patrol-avatar__hand-back" fill="none" stroke="${escurecer(p.pele, 0.3)}"
               stroke-width="0.38" stroke-linecap="round" opacity="0.78">
               <path d="M${cx - 1.15} 33.6 C${cx - 0.4} 33.25 ${cx + 0.4} 33.25 ${cx + 1.15} 33.6" />
               <path d="M${cx - 0.75} 34.25 h1.5" />
             </g>`
        : ''}
    </g>
  `;
};

/* --- Pernas --- */

const pernaPath = (cx, p) => {
  const topo = p.sexo === 'feminino' ? 3.3 : 3.1;
  const canela = p.sexo === 'feminino' ? 1.9 : 2.1;
  return `M${cx - topo} 32.4
    C${cx - topo} 31 ${cx + topo} 31 ${cx + topo} 32.4
    L${cx + canela} 40.9
    L${cx - canela} 40.9
    Z`;
};

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
      <path d="${pernaPath(cx, p)}" fill="none" stroke="none" />
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
      <path d="${pernaPath(cx, p)}" fill="url(#g-calca-${s})" />
      ${p.estilo.refletivo
        ? `<rect x="${cx - 2.6}" y="36" width="5.2" height="1.7" rx="0.85" fill="${p.refletivo}" stroke="none" />`
        : ''}
      <path d="${pernaPath(cx, p)}" fill="url(#g-vol-${s})" stroke="none" />
      ${camera === 'frente' && p.sexo === 'feminino'
        ? `<path class="patrol-avatar__outfit patrol-avatar__outfit--feminino"
             d="M${cx - 2.25} 33.8 C${cx - 1.1} 34.5 ${cx + 1.1} 34.5 ${cx + 2.25} 33.8"
             fill="none" stroke="${clarear(p.calca, 0.22)}" stroke-width="0.44"
             stroke-linecap="round" opacity="0.64" />`
        : ''}
      ${camera === 'costas'
        ? `<g class="patrol-avatar__leg-back-details" fill="none" stroke-linecap="round">
             <path d="M${cx - 2.05} 34.1 C${cx - 0.8} 34.8 ${cx + 0.8} 34.8 ${cx + 2.05} 34.1"
               stroke="${clarear(p.calca, 0.2)}" stroke-width="0.45" opacity="0.62" />
             <path d="M${cx} 34.8 L${cx} 39.6"
               stroke="${escurecer(p.calca, 0.3)}" stroke-width="0.38" opacity="0.62" />
           </g>`
        : ''}
      ${tenis(cx, camera, p, s)}
    </g>
  `;
};
