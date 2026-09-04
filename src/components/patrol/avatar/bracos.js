// OS BRAÇOS, DO DELTOIDE À MÃO.
//
// O BRAÇO NASCE DE PELE E A MANGA ENTRA POR CIMA
//
// Antes o braço era um tubo de tecido inteiro com uma bolinha cor de pele na
// ponta, e a bolinha virava a coisa mais chamativa do desenho. Agora a forma
// inteira é uma só, preenchida de pele, e a manga é pintada por dentro do
// recorte dela. O contorno da silhueta é um só, em vez de duas peças
// encostadas uma na outra — e a barra da manga dá a linha horizontal no lugar
// exato onde o braço precisava de leitura.
//
// A MÃO É GRANDE E É REDONDA, E OS DOIS SÃO DE PROPÓSITO
//
// Grande porque é a ponta do movimento: a 48px, é a mão indo e voltando que
// diz "caminhando" antes de qualquer detalhe ser distinguível. Redonda porque
// dedo nenhum sobrevive a essa escala — cinco tiras viram sujeira, enquanto o
// círculo com um polegar lê como mão fechada imediatamente.
//
// O GRUPO INTEIRO É O QUE ANIMA
//
// `.patrol-avatar__limb` gira em torno do ombro (`transform-origin` em 8% da
// própria caixa). Por isso mão, manga e punho vivem DENTRO do grupo do braço:
// o CSS não sabe nada da anatomia, ele só gira a peça.

import { BRACO as B, MEIO } from './geometria';
import { clarear, escurecer } from './paleta';

const bracoPath = (cx, p) => {
  // O braço feminino é um pouco mais fino, mas nunca frágil: a diferença é de
  // dois pontos em 256, o suficiente para mudar a silhueta sem quebrar a
  // leitura na miniatura.
  const fino = p.sexo === 'feminino' ? 2 : 0;
  const ombro = B.ombroR - fino;
  const cotovelo = B.cotoveloR - fino;
  const punho = B.punhoR - fino * 0.6;

  return `M${cx - ombro} ${B.topo + 14}
    C${cx - ombro} ${B.topo - 4} ${cx + ombro} ${B.topo - 4} ${cx + ombro} ${B.topo + 14}
    C${cx + cotovelo + 2} ${B.cotoveloY} ${cx + punho + 2} ${B.cotoveloY + 22} ${cx + punho} ${B.punhoY}
    C${cx + punho} ${B.punhoY + 8} ${cx - punho} ${B.punhoY + 8} ${cx - punho} ${B.punhoY}
    C${cx - punho - 2} ${B.cotoveloY + 22} ${cx - cotovelo - 2} ${B.cotoveloY} ${cx - ombro} ${B.topo + 14} Z`;
};

// Onde a manga termina. Curta deixa o antebraço à mostra; comprida é o que os
// trajes técnicos pedem, e neles a pele não apareceria mesmo.
const bainha = (p) => (p.estilo.mangaLonga ? B.bainhaLonga : B.bainhaCurta);

// A mão: bola mais polegar. O polegar aponta para dentro, na direção do corpo,
// que é como uma mão relaxada cai ao lado do tronco.
const mao = (cx, lado, camera, p, s) => {
  const paraDentro = lado === 'back' ? 1 : -1;
  const px = cx + paraDentro * (B.maoR - 3);

  return `
    <g class="patrol-avatar__hand">
      <circle cx="${cx}" cy="${B.maoY}" r="${B.maoR}" fill="url(#g-luva-${s})" />
      <ellipse cx="${px}" cy="${B.maoY - 5}" rx="6.5" ry="8.5" fill="url(#g-luva-${s})"
        transform="rotate(${paraDentro * 18} ${px} ${B.maoY - 5})" />
      ${p.estilo.luvas
        ? `<g stroke="none">
             <rect x="${cx - 13}" y="${B.maoY - 17}" width="26" height="8" rx="4"
               fill="${p.acento}" opacity="0.9" />
             <circle cx="${cx - 5}" cy="${B.maoY - 3}" r="5" fill="${clarear(p.luva, 0.2)}" opacity="0.55" />
           </g>`
        : camera === 'frente'
          ? `<path d="M${cx - 9} ${B.maoY + 3} C${cx - 3} ${B.maoY + 8} ${cx + 3} ${B.maoY + 8} ${cx + 9} ${B.maoY + 3}"
               fill="none" stroke="${escurecer(p.pele, 0.28)}" stroke-width="3"
               stroke-linecap="round" opacity="0.75" />`
          : `<g class="patrol-avatar__hand-back" fill="none" stroke="${escurecer(p.pele, 0.3)}"
               stroke-width="2.8" stroke-linecap="round" opacity="0.78">
               <path d="M${cx - 9} ${B.maoY - 4} C${cx - 3} ${B.maoY - 7} ${cx + 3} ${B.maoY - 7} ${cx + 9} ${B.maoY - 4}" />
               <path d="M${cx - 6} ${B.maoY + 4} h12" />
             </g>`}
      <circle cx="${cx}" cy="${B.maoY}" r="${B.maoR}" fill="url(#g-vol-${s})" stroke="none" />
      <!-- O ponto de luz alto e à esquerda, igual ao de toda esfera do boneco. -->
      <ellipse cx="${cx - 5}" cy="${B.maoY - 7}" rx="6" ry="4.4" fill="#ffffff"
        stroke="none" opacity="0.2" />
    </g>
  `;
};

/**
 * @param {'back'|'front'} lado qual braço — o de trás fica do lado esquerdo do
 *                              quadro, e é ele que acompanha a perna da frente.
 */
export const braco = (lado, camera, p, s) => {
  const cx = lado === 'back' ? MEIO - B.dx : MEIO + B.dx;
  const fim = bainha(p);
  const forma = bracoPath(cx, p);
  const recorte = `c-manga-${lado}-${s}`;

  return `
    <g class="patrol-avatar__limb patrol-avatar__arm patrol-avatar__arm--${lado}">
      <path d="${forma}" fill="url(#g-membro-${s})" />

      <clipPath id="${recorte}"><path d="${forma}" /></clipPath>
      <g clip-path="url(#${recorte})">
        <rect x="${cx - 22}" y="${B.topo - 8}" width="44" height="${fim - B.topo + 8}"
          fill="url(#g-roupa-${s})" stroke="none" />
        <rect x="${cx - 22}" y="${fim - 5}" width="44" height="5"
          fill="${escurecer(p.roupa, 0.36)}" stroke="none" />
        ${p.estilo.camuflagem
          ? `<g stroke="none" opacity="0.45">
               <ellipse cx="${cx - 5}" cy="${B.topo + 22}" rx="12" ry="9" fill="${escurecer(p.roupa, 0.3)}" />
               <ellipse cx="${cx + 7}" cy="${B.topo + 42}" rx="10" ry="7" fill="${p.calca}" />
             </g>`
          : ''}
        ${p.estilo.refletivo
          ? `<rect x="${cx - 22}" y="${B.cotoveloY + 14}" width="44" height="10" rx="4"
               fill="${p.refletivo}" stroke="none" />`
          : ''}
        <path d="${forma}" fill="url(#g-interna-${s})" stroke="none" />
      </g>

      <path d="${forma}" fill="url(#g-vol-${s})" stroke="none" />

      ${camera === 'costas'
        ? `<path d="M${cx - 8} ${B.cotoveloY + 2} C${cx - 3} ${B.cotoveloY + 6} ${cx + 3} ${B.cotoveloY + 6} ${cx + 8} ${B.cotoveloY + 2}"
             fill="none" stroke="${escurecer(fim > B.cotoveloY ? p.roupa : p.pele, 0.3)}"
             stroke-width="2.9" stroke-linecap="round" opacity="0.6" />`
        : ''}

      ${mao(cx, lado, camera, p, s)}
    </g>
  `;
};
