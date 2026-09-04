// A paleta e os gradientes que todas as peças do avatar dividem.
//
// POR QUE ISTO É SEPARADO DAS PEÇAS
//
// Cabeça, cabelo, torso, braços, pernas, calçado, mochila e acessórios
// precisam concordar nos tons derivados das cores escolhidas e nos ids dos
// gradientes. Se cada peça calculasse o seu, ajustar um tom pediria a mesma
// edição em oito arquivos — e no dia em que um ficasse para trás o boneco
// sairia com a manga de um azul e a mochila de outro.
//
// DUAS CORES DE ROUPA, NÃO UMA
//
// `cor` é a primária (camiseta, capuz, lataria). `corSecundaria` é a de apoio
// (calça, vivos, fivelas, detalhe do tênis). Enquanto havia uma só, todo
// elemento de apoio era um cinza fixo cadastrado à mão, e o boneco inteiro
// dependia de uma escolha. Com duas, a mesma arquitetura entrega centenas de
// combinações sem uma linha nova de desenho.
//
// O VOLUME É PINTADO, NÃO MODELADO
//
// O relevo do 2.5D vem de quatro camadas, sempre nesta ordem e sempre pelo
// mesmo motivo físico:
//
//   1. LUZ DE CIMA   — gradiente vertical em cada peça, clara no topo e escura
//      embaixo. É o sol; sem ele o boneco vira adesivo chapado.
//   2. VOLUME        — gradiente horizontal de preto transparente nas bordas.
//      É o que arredonda uma forma reta: sem isso a perna é uma tira.
//   3. OCLUSÃO       — manchas escuras onde uma peça encosta na outra. É a
//      sombra de contato, e é ela que encaixa as peças em vez de colá-las.
//   4. REALCE        — um brilho estreito na quina superior, deslocado para a
//      esquerda. É a única coisa que diz de onde vem a luz, e é o que dá o
//      acabamento "renderizado" sem custar um filtro.
//
// Nada disso é `filter`: são formas com `fill`, porque filtro em SVG dentro de
// um marcador que anima a 60 quadros custa caro no celular.

import {
  getPatrolAvatarColor,
  getPatrolAvatarCorCabelo,
  getPatrolAvatarTomPele,
} from '@/lib/patrolAvatarConfig';

import { QUADRO } from './geometria';

export { QUADRO };

// DUAS CÂMERAS, UM PERSONAGEM
//
// No mapa o boneco é visto de costas. Nas telas de escolha ele é visto de
// frente, porque é lá que se decide "esse sou eu" — e sem rosto não há o que
// decidir. Não são dois bonecos: é a mesma configuração desenhada de dois
// ângulos, e cada peça tem uma composição PRÓPRIA para o seu lado. Espelhar o
// desenho frontal não funcionaria: costas não é frente sem rosto — é nuca,
// costura, calcanhar e mochila.
export const normalizarCamera = (valor) => (valor === 'costas' ? 'costas' : 'frente');

const NEUTRO = {
  equipamento: '#232a38',
  vidro: '#26314a',
  refletivo: '#e6fa9c',
  lanterna: '#ff4757',
  farol: '#fff4d6',
  metal: '#8f9bb0',
  olho: '#221a20',
  sola: '#f1f5fb',
};

// Cada estilo é uma combinação de peças e tons — não um desenho próprio.
//
// O CABELO SAIU DAQUI
//
// Ele era um estilo de roupa ("Cabelo longo"), o que impedia alguém de usar
// rabo de cavalo com colete tático. Agora corte e cor de cabelo são eixos
// próprios da configuração, e todo traje aceita todo cabelo.
export const ESTILOS = {
  classico: {
    roupa: 'primaria', calca: 'secundaria', saiaFeminina: true,
  },
  tatico: {
    roupa: '#232b3b', calca: '#1b2130',
    colete: true, luvas: true, mangaLonga: true,
    acento: 'primaria', mochilaEscura: true,
  },
  urbano: {
    roupa: 'primaria', calca: 'secundaria',
    capuz: true, saiaFeminina: true,
  },
  night: {
    roupa: '#1a2130', calca: '#171d2a',
    refletivo: true, mangaLonga: true, mochilaEscura: true,
  },
  camuflado: {
    roupa: 'primaria', calca: 'secundaria',
    camuflagem: true,
  },
};

/* --- Tons derivados --- */
// As cores escolhidas trazem três tons prontos, mas peças de tom fixo (o preto
// do equipamento, a borracha da sola) também precisam de luz e sombra. Fazer a
// conta aqui evita cadastrar cinco variantes de cada cinza na configuração.

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
  const apoio = getPatrolAvatarColor(avatar.corSecundaria);
  const tomPele = getPatrolAvatarTomPele(avatar.tomPele);
  const corCabelo = getPatrolAvatarCorCabelo(avatar.corCabelo);
  const estilo = ESTILOS[avatar.estilo] || ESTILOS.classico;

  const tom = (valor) => {
    if (valor === 'primaria') return cor.base;
    if (valor === 'primaria-escura') return cor.escura;
    if (valor === 'primaria-clara') return cor.clara;
    if (valor === 'secundaria') return apoio.base;
    if (valor === 'secundaria-escura') return apoio.escura;
    if (valor === 'secundaria-clara') return apoio.clara;
    return valor;
  };

  return {
    ...NEUTRO,
    cor,
    apoio,
    sexo: avatar.sexo,
    tomPele,
    pele: tomPele.base,
    estilo,
    estiloId: avatar.estilo,

    // O cabelo é cor própria: o quase-preto fixo sumia contra a mochila escura,
    // e tingi-lo com a roupa fazia rostos parecerem manchados pela camiseta.
    cabeloId: avatar.cabelo,
    cabelo: corCabelo.base,

    roupa: tom(estilo.roupa),
    calca: tom(estilo.calca),
    acento: tom(estilo.acento || 'secundaria'),

    // A MOCHILA DEIXOU DE SER CINZA, E ESSE FOI O MAIOR GANHO DE COR
    //
    // Visto de costas a mochila cobre quase todo o tronco: enquanto ela era um
    // cinza-chumbo fixo, ela ERA o personagem, e a cor escolhida sobrava só nas
    // mangas. Derivando o tom da própria cor, quem escolheu vermelho vê um
    // boneco vermelho. Os estilos que vivem do escuro (tático, night) mantêm o
    // chumbo, porque ali ele é a identidade e não um acidente.
    mochila: estilo.mochilaEscura ? NEUTRO.equipamento : escurecer(cor.base, 0.36),

    // A luva herda o equipamento; a mão nua herda a pele. Uma variável só evita
    // que cada peça repita esse `if`.
    luva: estilo.luvas ? escurecer(NEUTRO.equipamento, 0.18) : tomPele.base,
  };
};

/* --- Gradientes --- */
// Todos em `objectBoundingBox` (o padrão): as coordenadas são 0..1 dentro de
// CADA forma, então uma definição só serve para a manga, a perna e o tronco,
// cada um com a própria caixa.

// A inclinação de 0.16 no eixo x é de propósito: luz perfeitamente vertical lê
// como degradê de interface. Torta de leve, lê como luz de cena.
const verticalGradiente = (id, hex) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="0.16" y2="1">
    <stop offset="0" stop-color="${clarear(hex, 0.34)}" />
    <stop offset="0.4" stop-color="${hex}" />
    <stop offset="1" stop-color="${escurecer(hex, 0.32)}" />
  </linearGradient>
`;

// A luz vem de cima e da esquerda. Manter o mesmo foco em toda esfera é o que
// faz cabeça, mão e ombro parecerem iluminados pela MESMA lâmpada.
const esferaGradiente = (id, hex) => `
  <radialGradient id="${id}" cx="0.35" cy="0.26" r="0.86">
    <stop offset="0" stop-color="${clarear(hex, 0.38)}" />
    <stop offset="0.46" stop-color="${hex}" />
    <stop offset="1" stop-color="${escurecer(hex, 0.38)}" />
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
    ${verticalGradiente(`g-membro-${sufixo}`, p.pele)}
    ${verticalGradiente(`g-sola-${sufixo}`, p.sola)}
    ${esferaGradiente(`g-cabelo-${sufixo}`, p.cabelo)}
    ${esferaGradiente(`g-pele-${sufixo}`, p.pele)}
    ${esferaGradiente(`g-luva-${sufixo}`, p.luva)}
    ${verticalGradiente(`g-corpo-${sufixo}`, p.cor.base)}
    ${verticalGradiente(`g-teto-${sufixo}`, p.cor.escura)}

    <!-- O volume: escuro nas duas bordas, limpo no meio. É o que transforma uma
         forma reta em cilindro sem custar um filtro. A borda direita é mais
         escura porque a luz vem da esquerda. -->
    <linearGradient id="g-vol-${sufixo}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.26" />
      <stop offset="0.2" stop-color="#000" stop-opacity="0" />
      <stop offset="0.58" stop-color="#000" stop-opacity="0" />
      <stop offset="1" stop-color="#000" stop-opacity="0.36" />
    </linearGradient>

    <!-- A luz que escorre pela quina de cima de cada peça. -->
    <linearGradient id="g-luz-${sufixo}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.46" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>

    <!-- Sombra interna: a peça escurece contra a própria borda de baixo. É o
         que dá espessura sem desenhar uma segunda forma. -->
    <linearGradient id="g-interna-${sufixo}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.34" />
      <stop offset="0.44" stop-color="#000" stop-opacity="0" />
    </linearGradient>

    <!-- Sombra de contato, onde uma peça encosta na outra. -->
    <radialGradient id="g-oc-${sufixo}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000" stop-opacity="0.36" />
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
    d="M${cx} ${cy - 19.8 * escala}
       L${cx + 17.3 * escala} ${cy + 19.2 * escala}
       L${cx} ${cy + 7 * escala}
       L${cx - 17.3 * escala} ${cy + 19.2 * escala} Z" />
`;
