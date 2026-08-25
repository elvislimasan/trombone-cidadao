// A paleta, o quadro e os gradientes que todas as peças do avatar dividem.
//
// POR QUE ISTO É UM ARQUIVO SEPARADO DAS PEÇAS
//
// Cabeça, tronco, mochila e carro precisam concordar em três coisas: o quadro
// em que desenham, os tons derivados da cor escolhida e os ids dos gradientes.
// Se cada peça calculasse o seu, ajustar um tom pediria a mesma edição em seis
// arquivos — e no dia em que um ficasse para trás o boneco sairia com a manga
// de um azul e o boné de outro.
//
// O QUADRO NÃO MUDA SOZINHO
//
// A figura vive em 40x48 com os PÉS na linha 45.6. O CSS ancora o avatar por
// esse ponto (`.patrol-avatar-planted`, no index.css), então mexer aqui pede
// mexer lá.
//
// O VOLUME É PINTADO, NÃO MODELADO
//
// O relevo vem de três camadas, sempre nesta ordem e sempre pelo mesmo motivo
// físico:
//
//   1. LUZ DE CIMA  — gradiente vertical em cada peça, clara no topo e escura
//      embaixo. É o sol; sem ele o boneco vira adesivo chapado.
//   2. VOLUME       — gradiente horizontal de preto transparente nas bordas.
//      É o que arredonda uma forma reta: sem isso a perna é uma tira.
//   3. OCLUSÃO      — manchas escuras onde uma peça encosta na outra. É a
//      sombra de contato, e é ela que faz as peças parecerem encaixadas em vez
//      de coladas lado a lado.
//
// Nada disso é `filter`: são formas com `fill`, porque filtro em SVG dentro de
// um marcador que anima a 60 quadros custa caro no celular.

import { getPatrolAvatarColor } from '@/lib/patrolAvatarConfig';

export const QUADRO = { largura: 40, altura: 48, chao: 45.6 };

// DUAS CÂMERAS, UM PERSONAGEM
//
// No mapa o boneco é visto de costas. Nas telas de escolha ele é visto de
// frente, porque é lá que se decide "esse sou eu" — e sem rosto não há o que
// decidir. Não são dois bonecos: é a mesma configuração desenhada de dois
// ângulos, e cada peça sabe o que muda no seu.
export const normalizarCamera = (valor) => (valor === 'costas' ? 'costas' : 'frente');

// As medidas que mais de uma peça precisa enxergar.
//
// A CABEÇA É MAIS ESTREITA QUE OS OMBROS, E ESSE É O PONTO
//
// Enquanto o crânio era mais largo que o tronco, a silhueta lia como boneco
// articulado por mais bem pintado que estivesse. Proporção resolve de longe o
// que detalhe nenhum resolve de perto.
export const CORPO = {
  ombroY: 18.3,
  ombroEsq: 11.9,
  ombroDir: 28.1,
  cinturaY: 33,
  cinturaEsq: 13.6,
  cinturaDir: 26.4,
  craneoCx: 20,
  craneoCy: 10.6,
  craneoRx: 6.9,
  craneoRy: 7.2,
  golaY: 18.6,
};

const NEUTRO = {
  cabelo: '#2b2118',
  pele: '#e0a479',
  equipamento: '#232a38',
  vidro: '#26314a',
  refletivo: '#e6fa9c',
  lanterna: '#ff4757',
  farol: '#fff4d6',
  metal: '#8f9bb0',
  olho: '#20161d',
};

// Cada estilo é uma combinação de peças e tons — não um desenho próprio.
//
// NENHUM BONÉ USA A COR DA CAMISETA, E ISSO CUSTOU UM ERRO PARA APRENDER
//
// Enquanto o boné era `chapeu: 'base'`, ele saía EXATAMENTE na cor da roupa.
// Numa cabeça de catorze unidades vista a 52px, uma calota da cor da camiseta
// logo acima dos olhos não lê como boné — lê como uma mancha da roupa no rosto.
// O clássico perdeu o boné (o cabelo aparece, e o rosto fica inteiro); os
// estilos que vivem do boné passaram a usar o tom ESCURO da cor, que separa a
// cabeça do tronco em vez de fundi-los.
export const ESTILOS = {
  classico: {
    roupa: 'base', calca: '#39435c', chapeu: null,
  },
  tatico: {
    roupa: '#232b3b', calca: '#1b2130', chapeu: '#181e2a',
    colete: true, luvas: true, acento: 'base', mochilaEscura: true,
  },
  urbano: {
    roupa: 'base', calca: '#2c3446', chapeu: null,
    capuz: true,
  },
  night: {
    roupa: '#1a2130', calca: '#171d2a', chapeu: '#11161f',
    refletivo: true, mochilaEscura: true,
  },
  camuflado: {
    roupa: 'base', calca: '#4a5540', chapeu: 'escura',
    camuflagem: true,
  },
  rabo: {
    roupa: 'base', calca: '#39435c', chapeu: 'escura',
    rabo: true,
    // Castanho claro, e não o quase-preto padrão: o rabo cai POR CIMA da
    // mochila, e escuro sobre escuro ele desaparecia justamente no que define
    // o estilo.
    cabelo: '#6b4630',
  },
};

/* --- Tons derivados --- */
// A cor escolhida traz três tons prontos, mas peças de tom fixo (a calça, o
// preto do equipamento) também precisam de luz e sombra. Fazer a conta aqui
// evita cadastrar cinco variantes de cada cinza na configuração.

const paraRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const paraHex = (rgb) =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

export const clarear = (hex, fator) => paraHex(paraRgb(hex).map((v) => v + (255 - v) * fator));
export const escurecer = (hex, fator) => paraHex(paraRgb(hex).map((v) => v * (1 - fator)));

export const montarPaleta = (avatar) => {
  const cor = getPatrolAvatarColor(avatar.cor);
  const estilo = ESTILOS[avatar.estilo] || ESTILOS.classico;
  const tom = (valor) => {
    if (valor === 'base') return cor.base;
    if (valor === 'escura') return cor.escura;
    if (valor === 'clara') return cor.clara;
    return valor;
  };

  return {
    ...NEUTRO,
    cor,
    estilo,
    cabelo: estilo.cabelo || NEUTRO.cabelo,
    roupa: tom(estilo.roupa),
    calca: tom(estilo.calca),
    chapeu: estilo.chapeu ? tom(estilo.chapeu) : null,
    acento: tom(estilo.acento || 'base'),
    // A MOCHILA DEIXOU DE SER CINZA, E ESSE FOI O MAIOR GANHO DE COR
    //
    // Visto de costas a mochila cobre quase todo o tronco: enquanto ela era um
    // cinza-chumbo fixo, ela ERA o personagem, e a cor escolhida sobrava só nas
    // mangas. Derivando o tom da própria cor, quem escolheu vermelho vê um
    // boneco vermelho. Os estilos que vivem do escuro (tático, night) mantêm o
    // chumbo, porque ali ele é a identidade e não um acidente.
    mochila: estilo.mochilaEscura ? NEUTRO.equipamento : escurecer(cor.base, 0.36),
  };
};

/* --- Gradientes --- */
// Todos em `objectBoundingBox` (o padrão): as coordenadas são 0..1 dentro de
// CADA forma, então uma definição só serve para a manga, a perna e o tronco,
// cada um com a própria caixa.

const verticalGradiente = (id, hex) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${clarear(hex, 0.3)}" />
    <stop offset="0.42" stop-color="${hex}" />
    <stop offset="1" stop-color="${escurecer(hex, 0.3)}" />
  </linearGradient>
`;

const esferaGradiente = (id, hex) => `
  <radialGradient id="${id}" cx="0.36" cy="0.24" r="0.82">
    <stop offset="0" stop-color="${clarear(hex, 0.34)}" />
    <stop offset="0.5" stop-color="${hex}" />
    <stop offset="1" stop-color="${escurecer(hex, 0.36)}" />
  </radialGradient>
`;

export const montarDefs = (p, sufixo) => `
  <defs>
    ${verticalGradiente(`g-roupa-${sufixo}`, p.roupa)}
    ${verticalGradiente(`g-calca-${sufixo}`, p.calca)}
    ${verticalGradiente(`g-equip-${sufixo}`, p.equipamento)}
    ${verticalGradiente(`g-mochila-${sufixo}`, p.mochila)}
    ${verticalGradiente(`g-acento-${sufixo}`, p.acento)}
    ${verticalGradiente(`g-metal-${sufixo}`, p.metal)}
    ${verticalGradiente(`g-vidro-${sufixo}`, p.vidro)}
    ${esferaGradiente(`g-cabelo-${sufixo}`, p.cabelo)}
    ${esferaGradiente(`g-pele-${sufixo}`, p.pele)}
    ${esferaGradiente(`g-luva-${sufixo}`, p.estilo.luvas ? escurecer(p.equipamento, 0.25) : p.pele)}
    ${p.chapeu ? esferaGradiente(`g-chapeu-${sufixo}`, p.chapeu) : ''}
    ${verticalGradiente(`g-corpo-${sufixo}`, p.cor.base)}
    ${verticalGradiente(`g-teto-${sufixo}`, p.cor.escura)}

    <!-- O volume: escuro nas duas bordas, limpo no meio. É o que transforma uma
         forma reta em cilindro sem custar um filtro. -->
    <linearGradient id="g-vol-${sufixo}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.3" />
      <stop offset="0.26" stop-color="#000" stop-opacity="0" />
      <stop offset="0.62" stop-color="#000" stop-opacity="0" />
      <stop offset="1" stop-color="#000" stop-opacity="0.34" />
    </linearGradient>

    <!-- A luz que escorre pela quina de cima de cada peça. -->
    <linearGradient id="g-luz-${sufixo}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.4" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>

    <!-- Sombra de contato, onde uma peça encosta na outra. -->
    <radialGradient id="g-oc-${sufixo}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000" stop-opacity="0.34" />
      <stop offset="1" stop-color="#000" stop-opacity="0" />
    </radialGradient>

    <radialGradient id="g-lanterna-${sufixo}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${clarear(NEUTRO.lanterna, 0.4)}" />
      <stop offset="0.55" stop-color="${NEUTRO.lanterna}" />
      <stop offset="1" stop-color="${escurecer(NEUTRO.lanterna, 0.3)}" />
    </radialGradient>

    <radialGradient id="g-farol-${sufixo}" cx="0.5" cy="0.42" r="0.58">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="0.5" stop-color="${NEUTRO.farol}" />
      <stop offset="1" stop-color="${escurecer(NEUTRO.farol, 0.42)}" />
    </radialGradient>
  </defs>
`;

// A seta que a marca usa nas costas da mochila e na tampa do carro. É o mesmo
// símbolo do "você está aqui" — quem vê o marcador de longe reconhece antes de
// distinguir o boneco.
export const marca = (cx, cy, escala, cor) => `
  <path class="patrol-avatar__mark" fill="${cor}" stroke="none"
    d="M${cx} ${cy - 3.1 * escala}
       L${cx + 2.7 * escala} ${cy + 3 * escala}
       L${cx} ${cy + 1.1 * escala}
       L${cx - 2.7 * escala} ${cy + 3 * escala} Z" />
`;
