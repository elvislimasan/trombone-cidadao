// Converte os masters do avatar (1024x1280) para o que o app carrega (384x480).
//
// POR QUE EXISTE UM PASSO DE CONVERSÃO
//
// O master precisa ser grande para o render ter detalhe. O ARQUIVO PUBLICADO
// não pode ser: um WebP de 1024x1280 decodifica para ~5 MB de bitmap na RAM
// mesmo aparecendo com 58px na tela, e este app já convive com OOM kill no
// Android (ver CLAUDE.md — KeepAliveService, appRestoredResult). Seis camadas
// de master = 30 MB de bitmap para desenhar um boneco de meio centímetro.
//
// 384x480 é 1,5x o viewBox do vetor: cobre 100px de prévia a DPR 3 sem
// suavizar, e cada camada decodificada cai para ~740 KB.
//
// O MODO --conferir É O QUE MAIS SE USA
//
// A migração é por fases, e a pergunta constante é "por que esta combinação
// ainda está vetorial?". A resposta é sempre um arquivo que falta, e é isso
// que o modo de conferência lista — derivado dos catálogos de verdade, não de
// uma lista escrita à mão que envelheceria na primeira roupa nova.
//
// Uso:
//   npm run avatar:renders -- --conferir
//   npm run avatar:renders                      (masters ja em 1024x1280 com alfa)
//   npm run avatar:renders -- --chroma=ff00ff --alinhar --masters=saida-do-gerador
//
// Opcoes:
//   --masters=<pasta>   de onde vem os masters (padrao: renders-master)
//   --chroma=RRGGBB     troca um fundo chapado por alfa de verdade
//   --tolerancia=<n>    quanto o chroma tolera de variacao (padrao 42)
//   --alinhar           refaz o enquadramento pousando os pes na linha 1216;
//                       use SO na rota da figura fechada, nunca em camadas
//   --conferir          lista o que o app ainda nao encontra

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  PATROL_AVATAR_ACCESSORIES,
  PATROL_AVATAR_CABELOS,
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_STYLES,
} from '../src/lib/patrolAvatarConfig.js';

const ORIGEM = new Set(['1024x1280']);
const LARGURA = 384;
const ALTURA = 480;
const DESTINO = 'src/assets/patrol/avatar';
const CAMERAS = ['frente', 'costas'];

const args = process.argv.slice(2);
const conferir = args.includes('--conferir');
const alinhar = args.includes('--alinhar');
const masters = (args.find((a) => a.startsWith('--masters=')) || '--masters=renders-master').slice(10);
const chroma = (args.find((a) => a.startsWith('--chroma=')) || '').slice(9).replace('#', '');
const tolerancia = Number((args.find((a) => a.startsWith('--tolerancia=')) || '--tolerancia=42').slice(13));

// A faixa que o conteúdo ocupa: do topo da cabeça (64) à linha dos pés (1216).
const TOPO_CABECA = 64;
const LINHA_PES = 1216;

/* --- O que o app espera encontrar --- */
// Derivado dos catálogos. Uma roupa nova em `patrolAvatarConfig.js` aparece
// aqui sozinha, e o script passa a cobrar o render dela.
const esperados = () => {
  const lista = [];
  const por = (pasta, ids, sufixos = ['']) => {
    for (const id of ids) {
      for (const camera of CAMERAS) {
        for (const sufixo of sufixos) {
          if (sufixo && camera !== 'frente') continue;
          lista.push({ chave: `${pasta}/${id}-${camera}${sufixo}`, exigido: !sufixo && pasta !== 'acessorio' });
        }
      }
    }
  };

  // A rota alternativa: um render fechado por sexo x estilo. Nunca exigida —
  // ela existe para quem gera por prompt e nao consegue camadas alinhadas.
  for (const sexo of PATROL_AVATAR_SEXOS) {
    for (const estilo of PATROL_AVATAR_STYLES) {
      for (const camera of CAMERAS) {
        lista.push({ chave: `figura/${sexo.id}-${estilo.id}-${camera}`, exigido: false, alternativa: true });
      }
      // Os atlas 4x1 animam a figura fechada. A parada continua obrigatória:
      // ela responde pelos estados sem atlas, e é ela que garante que a troca
      // entre andar e parar não mude a pessoa.
      for (const camera of CAMERAS) {
        for (const estado of ['walk', 'idle']) {
          lista.push({
            chave: `figura/${sexo.id}-${estilo.id}-${camera}-${estado}-4x1`,
            exigido: false,
            animacao: true,
          });
        }
      }
    }
  }

  por('corpo', PATROL_AVATAR_SEXOS.map((s) => s.id));
  por('calca', PATROL_AVATAR_STYLES.map((e) => e.id));
  por('roupa', PATROL_AVATAR_STYLES.map((e) => e.id));
  por('cabelo', PATROL_AVATAR_CABELOS.map((c) => c.id));
  por(
    'acessorio',
    PATROL_AVATAR_ACCESSORIES.filter((a) => a.id !== 'nenhuma').map((a) => a.id),
    ['', '-atras'],
  );

  return lista;
};

const existentes = () => {
  const achados = new Set();
  const andar = (dir, prefixo = '') => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) andar(path.join(dir, item.name), `${prefixo}${item.name}/`);
      // Apenas `.webp`: e o que `carregarRenders.js` varre. Contar os `.png`
      // das folhas de origem daria um numero que o app nao enxerga.
      else if (/\.webp$/.test(item.name)) achados.add(prefixo + item.name.replace(/\.webp$/, ''));
    }
  };
  andar(DESTINO);
  return achados;
};

/* --- Conferência --- */

if (conferir) {
  const tem = existentes();
  const lista = esperados();
  const faltando = lista.filter((e) => !tem.has(e.chave));

  const camadas = lista.filter((e) => !e.alternativa && !e.animacao);
  const figuras = lista.filter((e) => e.alternativa);
  const animacoes = lista.filter((e) => e.animacao);
  console.log(`renders publicados: ${tem.size}`);
  console.log(`  rota por camadas: ${camadas.filter((e) => tem.has(e.chave)).length} de ${camadas.length}`);
  console.log(`  rota por figura fechada: ${figuras.filter((e) => tem.has(e.chave)).length} de ${figuras.length} (opcional)`);
  console.log(`  atlas de animacao:  ${animacoes.filter((e) => tem.has(e.chave)).length} de ${animacoes.length} (opcional)`);

  if (!faltando.length) {
    console.log('nada faltando — todas as combinações podem virar raster.');
  } else {
    const exigidos = faltando.filter((f) => f.exigido);
    console.log(`\nfaltando ${faltando.length}:`);
    for (const f of faltando) {
      console.log(`  ${f.exigido ? '!' : f.animacao ? '>' : f.alternativa ? '~' : ' '} ${f.chave}`);
    }
    console.log('\n"~" = rota alternativa da figura fechada, e nunca obrigatoria.');
    console.log('">" = spritesheet opcional de caminhada no mapa.');
    console.log(`\n"!" = obrigatório. Enquanto um deles faltar, as configurações`);
    console.log(`que o usam continuam sendo desenhadas em SVG. (${exigidos.length} obrigatórios)`);
  }

  const sobrando = [...tem].filter((c) => !lista.some((e) => e.chave === c));
  if (sobrando.length) {
    console.log(`\nfora do padrão de nomes (o app não vai encontrar):`);
    for (const c of sobrando) console.log(`  ? ${c}`);
  }

  process.exit(0);
}

/* --- Conversão --- */

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp não encontrado. Instale com: npm i -D sharp');
  process.exit(1);
}

/* --- Chroma: transformar um fundo chapado em alfa de verdade --- */
//
// POUCA FERRAMENTA DE PROMPT ENTREGA ALFA
//
// A maioria devolve o personagem sobre um fundo, e "recortar depois" costuma
// significar um halo da cor do fundo em volta do cabelo. Aqui a borda ganha
// alfa PROPORCIONAL à distância da cor-chave, em vez de um corte binário: o
// que estava a meio caminho da cor de fundo fica meio transparente, que é o
// que o pixel realmente era.
//
// Ainda assim, fio de cabelo contra fundo chapado é o caso difícil de todo
// chroma. Gere sobre uma cor que NÃO exista no personagem (magenta puro é uma
// boa escolha para este boneco, que é vermelho, preto e pele).

const recortarChroma = async (entrada) => {
  const alvo = [
    parseInt(chroma.slice(0, 2), 16),
    parseInt(chroma.slice(2, 4), 16),
    parseInt(chroma.slice(4, 6), 16),
  ];

  const { data, info } = await entrada.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const distancia = Math.hypot(data[i] - alvo[0], data[i + 1] - alvo[1], data[i + 2] - alvo[2]);
    if (distancia <= tolerancia) {
      data[i + 3] = 0;
    } else if (distancia <= tolerancia * 2) {
      const suave = (distancia - tolerancia) / tolerancia;
      data[i + 3] = Math.round(data[i + 3] * suave);
    }
  }

  return sharp(data, { raw: info });
};

/* --- Alinhamento: pousar os pés na linha certa --- */
//
// GERADOR NENHUM RESPEITA "PÉS EM y=1216"
//
// Pedir enquadramento exato num prompt não funciona: cada geração enquadra do
// seu jeito, e meio ponto de diferença na linha dos pés faz o boneco flutuar
// ou afundar no mapa — porque é essa linha que o CSS usa como âncora.
//
// Então o enquadramento deixa de ser problema do gerador. Recorta-se ao
// conteúdo real (o alfa diz onde ele está), escala-se para a faixa da cabeça
// aos pés e recoloca-se centrado, com a base do conteúdo em 1216. O gerador só
// precisa entregar a pessoa inteira sobre fundo removível.
//
// ISTO NÃO SERVE PARA A ROTA DE CAMADAS
//
// Lá as peças precisam dividir o MESMO enquadramento da cena, e alinhar cada
// uma pelo próprio conteúdo faria exatamente o contrário: a calça sozinha seria
// esticada até a altura da pessoa inteira.

const alinharNaAncora = async (entrada) => {
  const recortado = sharp(await entrada.png().toBuffer()).trim({ threshold: 1 });
  const conteudo = await recortado.toBuffer({ resolveWithObject: true });

  const faixa = LINHA_PES - TOPO_CABECA;
  let altura = faixa;
  let largura = Math.round((conteudo.info.width * faixa) / conteudo.info.height);

  if (largura > 1024) {
    largura = 1024;
    altura = Math.round((conteudo.info.height * 1024) / conteudo.info.width);
  }

  const escalado = await sharp(conteudo.data).resize(largura, altura, { kernel: 'lanczos3' }).png().toBuffer();

  // O BUFFER INTERMEDIÁRIO NÃO É DESPERDÍCIO
  //
  // O sharp não executa as operações na ordem em que são encadeadas: `resize`
  // roda ANTES de `composite` no mesmo pipeline. Devolvendo o objeto direto, a
  // conversão seguinte encolheria a base para 384x480 e só então tentaria colar
  // uma figura de 1152px em cima — que é o erro "must have same dimensions or
  // smaller". Materializar aqui fecha este pipeline e abre outro.
  const montado = await sharp({
    create: { width: 1024, height: 1280, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: escalado,
    left: Math.round((1024 - largura) / 2),
    top: Math.max(0, LINHA_PES - altura),
  }]).png().toBuffer();

  return sharp(montado);
};

if (!fs.existsSync(masters)) {
  console.error(`pasta de masters não encontrada: ${masters}`);
  console.error('Use --masters=<caminho> ou crie a pasta. Ver src/assets/patrol/avatar/LEIA-ME.md');
  process.exit(1);
}

const arquivos = [];
const varrer = (dir, prefixo = '') => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) varrer(path.join(dir, item.name), `${prefixo}${item.name}/`);
    else if (/\.(png|webp)$/i.test(item.name)) arquivos.push({ absoluto: path.join(dir, item.name), relativo: prefixo + item.name });
  }
};
varrer(masters);

if (!arquivos.length) {
  console.error(`nenhum png/webp em ${masters}`);
  process.exit(1);
}

let convertidos = 0;
const avisos = [];

for (const arquivo of arquivos) {
  let img = sharp(arquivo.absoluto);
  const meta = await img.metadata();
  const dimensao = `${meta.width}x${meta.height}`;

  if (chroma) img = await recortarChroma(img);

  // Canvas errado não é um detalhe: a linha dos pés é o que ancora o marcador,
  // e ela é definida em porcentagem da altura. Redimensionar um 2:3 para 0.8
  // esticaria a pessoa; encaixotar tiraria os pés do chão.
  //
  // Com `--alinhar` a checagem sai de cena porque o enquadramento é refeito
  // aqui — é para isso que a opção existe.
  if (alinhar) {
    img = await alinharNaAncora(img);
  } else if (!ORIGEM.has(dimensao)) {
    avisos.push(`${arquivo.relativo}: canvas ${dimensao}, esperado 1024x1280 — pulado (use --alinhar)`);
    continue;
  } else if (!meta.hasAlpha && !chroma) {
    avisos.push(`${arquivo.relativo}: sem canal alfa — pulado (use --chroma=RRGGBB)`);
    continue;
  }

  const saida = path.join(DESTINO, arquivo.relativo.replace(/\.(png|webp)$/i, '.webp'));
  fs.mkdirSync(path.dirname(saida), { recursive: true });

  await img
    .resize(LARGURA, ALTURA, { fit: 'fill', kernel: 'lanczos3' })
    // `alphaQuality` alto importa mais que a qualidade de cor: é o alfa que
    // vira máscara de tingimento, e alfa sujo vira franja colorida na borda.
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(saida);

  convertidos += 1;
  console.log(`  ${arquivo.relativo} -> ${saida}`);
}

console.log(`\nconvertidos: ${convertidos} de ${arquivos.length}`);
for (const aviso of avisos) console.log(`  aviso: ${aviso}`);
console.log('\nconfira o que ainda falta com: npm run avatar:renders -- --conferir');
