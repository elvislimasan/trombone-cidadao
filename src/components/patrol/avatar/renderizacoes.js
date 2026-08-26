// O CATÁLOGO DE RENDERS: quais camadas de imagem existem e como elas se pintam.
//
// POR QUE RASTER E NÃO MAIS SVG
//
// O desenho vetorial chegou onde o vetor chega: silhueta boa, volume pintado a
// gradiente, legível a 48px. O que ele não entrega é a pele com dispersão de
// luz, o tecido com trama e a oclusão de contato que fazem o boneco parecer
// modelado em vez de ilustrado. Isso é render 3D, e render 3D vira PNG.
//
// O SVG NÃO FOI EMBORA, E ISSO É DE PROPÓSITO
//
// A migração é por fases: enquanto uma peça não tiver imagem, o desenho
// vetorial responde por ela. `resolverCamadas` diz se o conjunto está completo;
// se não estiver, `index.js` cai no SVG inteiro. Nenhum estado intermediário
// da migração deixa a pessoa sem boneco no mapa.
//
// A COR CONTINUA VINDO DA CONFIGURAÇÃO, NÃO DA IMAGEM
//
// Este é o ponto que decide se a personalização sobrevive. Há hoje 1.008.420
// aparências a pé. Renderizar uma imagem por combinação é impossível; render
// por ESTILO custaria dez arquivos e mataria cor, pele e cabelo.
//
// A saída é pintar no navegador: cada peça é renderizada em material BRANCO, e
// o CSS a tinge com a cor escolhida e devolve o sombreado por cima em
// `multiply` (ver `.patrol-avatar__layer` no index.css). Branco vezes cor é a
// cor; cinza vezes cor é a cor na sombra. É difusa correta, e é o que faz 52
// arquivos cobrirem um milhão de aparências.
//
// AS MEDIDAS SÃO AS MESMAS DO VETOR
//
// Render em 1024x1280 (proporção 0.8, igual ao viewBox 256x320), pés na linha
// 1216 (95% da altura, igual ao `chao` da geometria). Assim os dois caminhos
// dividem a mesma âncora e a troca entre eles é invisível — inclusive no
// `.patrol-avatar-planted`, que não sabe qual dos dois está desenhando.
// Ver `src/assets/patrol/avatar/LEIA-ME.md` para a especificação completa.

import {
  getPatrolAvatarColor,
  getPatrolAvatarCorCabelo,
  getPatrolAvatarTomPele,
  normalizePatrolAvatar,
} from '@/lib/patrolAvatarConfig';

/* --- As camadas --- */
//
// A ORDEM ABAIXO É PROFUNDIDADE, COMO NO SVG
//
// De trás para a frente. `acessorio-atras` existe pela mesma razão que a
// mochila entra em dois momentos no desenho vetorial: de frente o pacote está
// ATRÁS do corpo e só as alças aparecem no peito. Sem essa fatia, escolher
// "com mochila" e olhar de frente daria o mesmo boneco de "sem mochila".
//
// `exigido` diz o que precisa existir para o caminho raster valer. Acessório
// não entra: "sem mochila" é uma escolha legítima e não tem arquivo nenhum.

const CAMADAS = [
  {
    slot: 'acessorio-atras', pasta: 'acessorio', sufixo: '-atras',
    id: (c) => c.acessorio, tinta: null, exigido: false,
  },
  {
    slot: 'corpo', pasta: 'corpo',
    id: (c) => c.sexo,
    tinta: (c) => getPatrolAvatarTomPele(c.tomPele).base,
    exigido: true,
  },
  {
    slot: 'calca', pasta: 'calca',
    id: (c) => c.estilo,
    tinta: (c) => getPatrolAvatarColor(c.corSecundaria).base,
    exigido: true,
  },
  {
    slot: 'roupa', pasta: 'roupa',
    id: (c) => c.estilo,
    tinta: (c) => getPatrolAvatarColor(c.cor).base,
    exigido: true,
  },
  {
    slot: 'acessorio', pasta: 'acessorio',
    id: (c) => c.acessorio, tinta: null, exigido: false,
  },
  {
    // O cabelo entra por último nas DUAS câmeras: de costas ele cai sobre a
    // mochila, de frente as mechas caem sobre o ombro. Nos dois casos é a
    // última coisa entre o observador e a pessoa.
    slot: 'cabelo', pasta: 'cabelo',
    id: (c) => c.cabelo,
    tinta: (c) => getPatrolAvatarCorCabelo(c.corCabelo).base,
    exigido: true,
  },
];

/** A chave de um arquivo, derivada só do que a configuração diz. */
export const chaveDoRender = (pasta, id, camera, sufixo = '') =>
  `${pasta}/${id}-${camera}${sufixo}`;

// O contrato novo sempre explicita camera e estado:
// `feminino-urbano-frente-idle-4x1` ou
// `feminino-urbano-costas-walk-4x1`. O primeiro atlas publicado nasceu sem a
// camera (`feminino-urbano-walk-4x1`), por isso ele sobrevive como alias apenas
// de `costas + walk`; uma chave explicita sempre vence.
export const chaveDaAnimacaoFigura = (sexo, estilo, camera, estado) =>
  `figura/${sexo}-${estilo}-${camera}-${estado}-4x1`;

export const chaveDoSpriteCaminhada = (sexo, estilo, camera = null) =>
  camera
    ? chaveDaAnimacaoFigura(sexo, estilo, camera, 'walk')
    : `figura/${sexo}-${estilo}-walk-4x1`;

const DURACAO_DA_ANIMACAO = {
  idle: 6400,
  walk: 960,
};

const descricaoDaAnimacao = (url, estado) => ({
  tipo: 'spritesheet',
  estado,
  url,
  colunas: 4,
  linhas: 1,
  quadros: 4,
  duracaoMs: DURACAO_DA_ANIMACAO[estado],
});

const resolverAnimacoesFigura = (config, lado) => {
  const animacoes = {};

  const idle = REGISTRO.get(
    chaveDaAnimacaoFigura(config.sexo, config.estilo, lado, 'idle'),
  );
  if (idle) animacoes.idle = descricaoDaAnimacao(idle, 'idle');

  const walkDirecional = REGISTRO.get(
    chaveDaAnimacaoFigura(config.sexo, config.estilo, lado, 'walk'),
  );
  const walkLegado = lado === 'costas'
    ? REGISTRO.get(chaveDoSpriteCaminhada(config.sexo, config.estilo))
    : null;
  const walk = walkDirecional || walkLegado;
  if (walk) animacoes.walk = descricaoDaAnimacao(walk, 'walk');

  return animacoes;
};

/* --- O registro --- */
//
// POR QUE UM REGISTRO MUTÁVEL, E NÃO UM `import` DIRETO
//
// As imagens entram por `import.meta.glob`, que só existe dentro do Vite. Este
// arquivo precisa rodar no node — é ele que os testes exercitam, e é onde a
// lógica de fallback mora. Se o `glob` estivesse aqui, o teste do desenho
// morreria tentando importar um `.webp`.
//
// Então o caminho é invertido: `carregarRenders.js` (que só o app importa)
// entrega o mapa pronto, e aqui só se recebe. Registro vazio significa "ainda
// não há imagens" — que é exatamente o estado em que o SVG responde.

let REGISTRO = new Map();

export const registrarRenders = (mapa) => {
  REGISTRO = mapa instanceof Map ? mapa : new Map(Object.entries(mapa || {}));
  return REGISTRO.size;
};

export const limparRenders = () => { REGISTRO = new Map(); };

export const totalDeRenders = () => REGISTRO.size;

/**
 * Resolve a pilha de camadas de uma configuração.
 *
 * @returns {{ completo: boolean, camadas: Array<{slot,url,tinta}>, animacoes: object, faltando: string[] }}
 *          `completo` descreve o fallback parado (figura fechada ou camadas).
 *          Uma animacao do estado pedido pode funcionar mesmo quando ele e
 *          false; quando o outro estado entrar, o SVG continua sendo a rede de
 *          seguranca. `faltando` diz quais camadas desse fallback nao vieram.
 */
export const resolverCamadas = (avatar, camera) => {
  const config = normalizePatrolAvatar(avatar);
  const lado = camera === 'costas' ? 'costas' : 'frente';
  // Resolvida antes da figura estatica e das camadas de proposito: cada estado
  // pode ser publicado de forma independente sem criar um quadro vazio nos
  // demais estados.
  const animacoes = resolverAnimacoesFigura(config, lado);

  // A FIGURA FECHADA: A ROTA PARA QUEM GERA POR PROMPT
  //
  // Camadas separadas em material branco pressupõem uma cena 3D, onde se
  // mostra e esconde peças com a câmera travada. Quem gera por prompt não
  // consegue isso: dois prompts nunca devolvem a mesma pessoa na mesma pose, e
  // a pilha sai desalinhada.
  //
  // Então existe uma segunda rota: um render fechado por sexo × estilo, já
  // colorido. Ele custa a personalização daquela combinação — cor, pele,
  // cabelo e acessório vêm embutidos na imagem — e por isso NÃO é o caminho
  // preferido. Mas é o único que uma ferramenta de prompt entrega alinhado, e
  // um boneco lindo com menos opções é melhor do que uma pilha torta.
  //
  // Ela vence quando existe, porque só é publicada de propósito.
  const fechada = REGISTRO.get(chaveDoRender('figura', `${config.sexo}-${config.estilo}`, lado));
  if (fechada) {
    return {
      completo: true,
      rota: 'figura',
      camadas: [{ slot: 'figura', url: fechada, tinta: null }],
      animacoes,
      faltando: [],
    };
  }

  const camadas = [];
  const faltando = [];

  for (const camada of CAMADAS) {
    const id = camada.id(config);
    // "Sem mochila" não tem arquivo e não deveria ser procurado: uma ausência
    // esperada não é uma ausência.
    if (camada.pasta === 'acessorio' && id === 'nenhuma') continue;

    const chave = chaveDoRender(camada.pasta, id, lado, camada.sufixo || '');
    const url = REGISTRO.get(chave);

    if (!url) {
      if (camada.exigido) faltando.push(chave);
      continue;
    }

    camadas.push({
      slot: camada.slot,
      url,
      tinta: camada.tinta ? camada.tinta(config) : null,
    });
  }

  return {
    completo: faltando.length === 0 && camadas.length > 0,
    rota: 'camadas',
    camadas,
    animacoes,
    faltando,
  };
};

export const temRenders = (avatar, camera, estado = null) => {
  const resolvido = resolverCamadas(avatar, camera);
  if (estado) return Boolean(resolvido.animacoes?.[estado] || resolvido.completo);
  return resolvido.completo || Object.keys(resolvido.animacoes || {}).length > 0;
};

/* --- Pré-carga --- */
//
// O MARCADOR DO MAPA PISCA SEM ISTO
//
// O ícone do Leaflet nasce de uma string de HTML, e é RECRIADO toda vez que
// `patrolAvatarKey` muda — inclusive na troca entre andando e parado. Um nó
// novo com `<img>` (ou com `background-image`) pinta vazio até o decode
// terminar. A cada mudança de estado o boneco sumiria por um quadro no meio da
// rua, que é o pior lugar possível para ele sumir.
//
// Decodificar antes resolve, e `decode()` é o que garante que o bitmap está
// pronto — `onload` só promete que os bytes chegaram.

const jaDecodificado = new Set();

const decodificar = (url) => {
  if (jaDecodificado.has(url) || typeof Image === 'undefined') return Promise.resolve();

  const img = new Image();
  img.src = url;
  const pronto = typeof img.decode === 'function'
    ? img.decode()
    : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });

  return pronto
    .then(() => { jaDecodificado.add(url); })
    // Falhar a pré-carga não pode derrubar a patrulha: sem o bitmap pronto o
    // pior caso é o quadro em branco que existia antes desta função.
    .catch(() => {});
};

/**
 * Prepara as duas câmeras de uma configuração. As duas porque a preparação
 * mostra a frente e o mapa mostra as costas, e a pessoa passa de uma para a
 * outra em menos tempo do que leva para decodificar seis imagens.
 */
export const precarregarRenders = (avatar) => {
  const urls = new Set();
  for (const camera of ['frente', 'costas']) {
    const resolvido = resolverCamadas(avatar, camera);
    for (const camada of resolvido.camadas) urls.add(camada.url);
    for (const animacao of Object.values(resolvido.animacoes || {})) {
      if (animacao?.url) urls.add(animacao.url);
    }
  }
  return Promise.all([...urls].map(decodificar));
};

/** Exposto para o script de conferência dos assets. */
export const CAMADAS_DO_AVATAR = CAMADAS;
