// A MARCAÇÃO DAS CAMADAS DE IMAGEM.
//
// COMO UMA PEÇA BRANCA VIRA UMA PEÇA COLORIDA
//
// Cada camada tingida são dois elementos empilhados sobre o MESMO arquivo:
//
//   1. TINTA  — um retângulo da cor escolhida, recortado pelo canal alfa da
//      imagem (`mask-image`). Sozinho, é uma silhueta chapada.
//   2. SOMBRA — a própria imagem, em `mix-blend-mode: multiply` por cima. A
//      peça é renderizada em material BRANCO: branco vezes a cor devolve a
//      cor, cinza vezes a cor devolve a cor na sombra. É difusa correta.
//
// O resultado é a peça na cor que a pessoa escolheu, com o sombreado do render
// 3D intacto — e sem um arquivo por cor.
//
// `isolation: isolate` NÃO É OPCIONAL
//
// `mix-blend-mode` mistura com o que estiver ATRÁS dentro do mesmo contexto de
// empilhamento. Sem o isolamento, a camada multiplicaria contra as ruas do
// mapa: o boneco ficaria transparente sobre o asfalto e mudaria de cor ao
// atravessar um parque. O isolamento está no CSS da camada, e é a linha mais
// importante daquele bloco.
//
// AS URLS NÃO VÊM DE FORA
//
// Elas saem do `import.meta.glob` do bundler — nunca de configuração salva, de
// URL ou do banco. É o mesmo contrato do resto do avatar: a marcação é montada
// pelo app a partir de um catálogo fechado, e por isso pode ser injetada como
// HTML no `L.divIcon`.

const camadaTingida = ({ slot, url, tinta }) => `
  <span class="patrol-avatar__layer patrol-avatar__layer--${slot}" style="--patrol-avatar-tint: ${tinta};">
    <span class="patrol-avatar__tint" style="-webkit-mask-image: url(${url}); mask-image: url(${url});"></span>
    <span class="patrol-avatar__shade" style="background-image: url(${url});"></span>
  </span>
`;

const camadaChapada = ({ slot, url }) => `
  <span class="patrol-avatar__layer patrol-avatar__layer--${slot}">
    <span class="patrol-avatar__flat" style="background-image: url(${url});"></span>
  </span>
`;

/**
 * A pilha inteira, pronta para entrar no lugar do `<svg>`.
 *
 * A sombra de contato fica FORA do grupo que anima, pela mesma razão do
 * desenho vetorial: o corpo balança, a marca no chão não. É ela que impede o
 * boneco de flutuar sobre o mapa.
 */
export const camadasHtml = (camadas) => `
  <span class="patrol-avatar__contact"></span>
  <span class="patrol-avatar__stack">
    ${camadas.map((c) => (c.tinta ? camadaTingida(c) : camadaChapada(c))).join('')}
  </span>
`;

/**
 * Spritesheet clássico: quatro quadros de 384x480 enfileirados horizontalmente.
 * A janela fica com o tamanho normal do avatar; o CSS desloca a faixa inteira
 * uma largura de quadro por vez. Assim o navegador decodifica um WebP só e o
 * mapa não recria quatro nós/imagens a cada passada. A animação vai inline
 * porque vale tanto para `is-moving` quanto para `is-idle`; a regra global de
 * movimento reduzido usa `!important` e continua conseguindo congelá-la.
 */
export const spritesheetHtml = ({ url, estado = 'walk', quadros = 4, duracaoMs = 960 }) => `
  <span class="patrol-avatar__contact"></span>
  <span class="patrol-avatar__stack patrol-avatar__stack--sprite" style="animation: none;">
    <span class="patrol-avatar__sprite patrol-avatar__sprite--4x1 patrol-avatar__sprite--${estado}"
      style="background-image: url(${url}); --patrol-avatar-sprite-duration: ${duracaoMs}ms; --patrol-avatar-sprite-quadros: ${quadros}; animation: patrol-avatar-sprite-4x1 var(--patrol-avatar-sprite-duration) steps(var(--patrol-avatar-sprite-quadros), end) infinite;"></span>
  </span>
`;
