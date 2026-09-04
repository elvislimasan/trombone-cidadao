// Fatia os atlas de pose e de caminhada nos sprites que o app carrega.
//
// POR QUE ISTO É SEPARADO DO `patrol-avatar-renders.mjs`
//
// Aquele script converte UM master já enquadrado. Este resolve o problema
// anterior: a arte não chega enquadrada, chega em folha de contato — 16 poses
// numa grade 8x2, ou um ciclo de caminhada numa tira horizontal. O trabalho
// aqui é recortar, escolher e ALINHAR.
//
// O ALINHAMENTO É O TRABALHO INTEIRO
//
// Cada figura da folha está numa altura diferente, num tamanho diferente e num
// x diferente. Se cada quadro fosse publicado como veio, o boneco pularia de
// tamanho ao trocar de estado e afundaria no mapa — porque o CSS ancora pelos
// pés, na linha 95%. Então todo recorte passa por: achar o conteúdo real pelo
// alfa, escalar para a altura de referência, e pousar centrado com os pés na
// linha certa.
//
// UM CICLO NÃO PODE SER ALINHADO QUADRO A QUADRO
//
// Essa é a diferença entre uma pose solta e uma animação. Centrar cada quadro
// da caminhada pelo próprio conteúdo mataria exatamente o que faz a caminhada
// existir: o corpo indo e voltando. Por isso a tira usa UMA transformação só,
// derivada da união dos quadros — o movimento relativo sobrevive, e o conjunto
// fica ancorado.
//
// A ESCALA DA CAMINHADA É UMA APROXIMAÇÃO, E ISSO ESTÁ ASSUMIDO
//
// No meio da passada as pernas dobram e a silhueta encurta: a pessoa não ficou
// menor, mas a caixa dela sim. Normalizar pela caixa faria o boneco CRESCER ao
// andar. Usamos o quadro mais alto do ciclo (o mais próximo de em pé) como
// referência, o que deixa um erro de poucos por cento. `escala` existe em cada
// fonte para acertar isso a olho sem refatiar nada.
//
// Uso:
//   node scripts/patrol-avatar-sprites.mjs --diagnostico
//   node scripts/patrol-avatar-sprites.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const FIGURA = 'src/assets/patrol/avatar/figura';
const LARGURA = 384;
const ALTURA = 480;
// Os mesmos 95% que o CSS usa para ancorar o marcador no ponto do GPS.
const LINHA_PES = Math.round(ALTURA * 0.95);
// A figura em pé ocupa do topo (~5%) à linha dos pés.
const ALTURA_FIGURA = LINHA_PES - Math.round(ALTURA * 0.05);
// Abaixo disto é borda suavizada, não conteúdo. As folhas vêm com alfa
// praticamente binário, então qualquer corte no meio serve; 128 é o mais
// seguro contra o halo de compressão.
const LIMIAR = 128;

const diagnostico = process.argv.includes('--diagnostico');

/* --- As fontes --- */
//
// `celula` é [coluna, linha] na grade. `tira` marca o ciclo, que é fatiado
// inteiro e alinhado como um bloco só.

const FONTES = [
  {
    arquivo: 'feminino-urbano-idle.png',
    grade: { colunas: 8, linhas: 2 },
    // A primeira coluna é a pose neutra das duas linhas: em pé, simétrica,
    // sem gesto. As outras sete são acenos e poses de mão — servem de catálogo
    // para o futuro, mas como quadro parado uma pessoa fazendo "V" de vitória
    // no meio do mapa não descreve "parado".
    recortes: [
      { celula: [0, 0], saida: 'feminino-urbano-frente' },
      { celula: [0, 1], saida: 'feminino-urbano-costas' },
    ],
  },
  {
    arquivo: 'masculino-urbano-idle.png',
    grade: { colunas: 8, linhas: 2 },
    recortes: [
      { celula: [0, 0], saida: 'masculino-urbano-frente' },
      { celula: [0, 1], saida: 'masculino-urbano-costas' },
    ],
  },
  {
    arquivo: 'masculino-urbano-walk.png',
    grade: { colunas: 4, linhas: 1 },
    tira: { saida: 'masculino-urbano-costas-walk-4x1' },
  },
  {
    // Já veio fatiado em 4x1 de uma passagem anterior, mas sem a âncora dos
    // pés. Repassar pelo mesmo caminho é o que faz os dois sexos concordarem.
    arquivo: 'feminino-urbano-walk-4x1.webp',
    grade: { colunas: 4, linhas: 1 },
    tira: { saida: 'feminino-urbano-costas-walk-4x1' },
  },
];

/* --- Medir --- */

const caixaDoConteudo = (data, info) => {
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < LIMIAR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, largura: x1 - x0 + 1, altura: y1 - y0 + 1 };
};

const celulaCrua = async (arquivo, grade, coluna, linha) => {
  const base = sharp(path.join(FIGURA, arquivo));
  const meta = await base.metadata();
  const largura = Math.floor(meta.width / grade.colunas);
  const altura = Math.floor(meta.height / grade.linhas);

  return sharp(path.join(FIGURA, arquivo))
    .extract({ left: coluna * largura, top: linha * altura, width: largura, height: altura })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
};

/* --- Compor --- */
//
// `transformacao` é o que todos os quadros de um mesmo destino dividem: uma
// escala e o par de âncoras. Passá-la de fora é o que permite a tira inteira
// usar a mesma, e cada pose solta usar a sua.

const compor = async (crua, caixa, transformacao) => {
  const { escala, centroX, base } = transformacao;

  const larguraFinal = Math.max(1, Math.round(crua.info.width * escala));
  const alturaFinal = Math.max(1, Math.round(crua.info.height * escala));

  const escalada = await sharp(crua.data, { raw: crua.info })
    .resize(larguraFinal, alturaFinal, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Onde o conteúdo cai depois da escala, e quanto ele precisa andar para o
  // centro dele bater no meio do quadro e a base dele na linha dos pés.
  const esquerda = Math.round(LARGURA / 2 - centroX * escala);
  const topo = Math.round(LINHA_PES - base * escala);

  // DOIS ESTÁGIOS, E O BUFFER NO MEIO NÃO É DESPERDÍCIO
  //
  // O sharp não executa as operações na ordem em que são encadeadas: um
  // `extract` pedido antes de qualquer `resize` vale como recorte da ENTRADA,
  // ou seja, roda antes do `composite`. Encadeando os dois, o recorte cortaria
  // a tela em branco e só depois tentaria colar a figura — fora dos limites.
  // Materializar aqui fecha o primeiro pipeline e abre o segundo.
  //
  // A folga existe porque o recorte final pode cair fora da imagem escalada
  // (a figura raramente está centrada na célula de origem). Apoiando tudo num
  // quadro maior, a janela nunca sai dos limites e não há caso especial.
  const folga = Math.max(LARGURA, ALTURA, larguraFinal, alturaFinal) * 2;

  const apoiada = await sharp({
    create: {
      width: larguraFinal + folga * 2,
      height: alturaFinal + folga * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: escalada, left: folga, top: folga }])
    .png()
    .toBuffer();

  return sharp(apoiada)
    .extract({ left: folga - esquerda, top: folga - topo, width: LARGURA, height: ALTURA })
    .png()
    .toBuffer();
};

const publicar = async (buffer, saida) => {
  const destino = path.join(FIGURA, `${saida}.webp`);
  await sharp(buffer)
    // `alphaQuality` alto: é o alfa que separa o boneco do mapa, e alfa sujo
    // vira franja escura em volta do cabelo.
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(destino);
  return destino;
};

/* --- Poses soltas --- */

const fatiarPose = async (fonte, recorte) => {
  const [coluna, linha] = recorte.celula;
  const crua = await celulaCrua(fonte.arquivo, fonte.grade, coluna, linha);
  const caixa = caixaDoConteudo(crua.data, crua.info);
  if (!caixa) return { saida: recorte.saida, erro: 'célula vazia' };

  const escala = (ALTURA_FIGURA / caixa.altura) * (fonte.escala || 1);
  const buffer = await compor(crua, caixa, {
    escala,
    centroX: (caixa.x0 + caixa.x1) / 2,
    base: caixa.y1,
  });

  if (!diagnostico) await publicar(buffer, recorte.saida);
  return { saida: recorte.saida, caixa, escala };
};

/* --- Ciclos --- */

const fatiarTira = async (fonte) => {
  const quadros = [];
  for (let coluna = 0; coluna < fonte.grade.colunas; coluna++) {
    const crua = await celulaCrua(fonte.arquivo, fonte.grade, coluna, 0);
    const caixa = caixaDoConteudo(crua.data, crua.info);
    if (!caixa) return { saida: fonte.tira.saida, erro: `quadro ${coluna} vazio` };
    quadros.push({ crua, caixa });
  }

  // O QUE O CICLO COMPARTILHA, E O QUE ELE NÃO PODE COMPARTILHAR
  //
  // ESCALA e BASE são compartilhadas. A escala sai do quadro MAIS ALTO, que é
  // o mais próximo de em pé — normalizar pela média faria o boneco crescer ao
  // dobrar o joelho. A base é o pé mais baixo do ciclo, e compartilhá-la é o
  // que preserva o BALANÇO: um quadro cujo ponto mais baixo está mais alto
  // pousa mais acima, e é assim que o corpo sobe e desce na passada.
  //
  // O CENTRO HORIZONTAL, NÃO. E ESSE FOI UM ERRO CARO DE ACHAR.
  //
  // Compartilhar o x parecia certo — "preserva o movimento relativo". Só que o
  // movimento relativo nestes atlas não é movimento: é onde o gerador resolveu
  // desenhar cada pose. O resultado era o boneco DERIVANDO para o lado ao longo
  // do ciclo, que é exatamente o deslizamento lateral que o avatar não deve
  // ter — ele caminha no lugar, e quem se move é o mapa embaixo dele.
  //
  // Centrando cada quadro pela própria caixa, sobra só a oscilação de dois ou
  // três pixels que os braços e as pernas causam. Essa é real.
  const base = Math.max(...quadros.map((q) => q.caixa.y1));
  const maisAlto = Math.max(...quadros.map((q) => q.caixa.altura));
  const escala = (ALTURA_FIGURA / maisAlto) * (fonte.escala || 1);

  const compostos = [];
  for (const quadro of quadros) {
    compostos.push(await compor(quadro.crua, quadro.caixa, {
      escala,
      base,
      centroX: (quadro.caixa.x0 + quadro.caixa.x1) / 2,
    }));
  }

  const transformacao = { escala, base };

  const tira = await sharp({
    create: {
      width: LARGURA * quadros.length,
      height: ALTURA,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compostos.map((input, i) => ({ input, left: i * LARGURA, top: 0 })))
    .png()
    .toBuffer();

  if (!diagnostico) await publicar(tira, fonte.tira.saida);
  return { saida: fonte.tira.saida, quadros: quadros.map((q) => q.caixa), transformacao };
};

/* --- Execução --- */

for (const fonte of FONTES) {
  const caminho = path.join(FIGURA, fonte.arquivo);
  if (!fs.existsSync(caminho)) {
    console.log(`AUSENTE  ${fonte.arquivo}`);
    continue;
  }

  console.log(`\n${fonte.arquivo}`);

  if (fonte.tira) {
    const r = await fatiarTira(fonte);
    if (r.erro) { console.log(`  erro: ${r.erro}`); continue; }
    console.log(`  -> ${r.saida}.webp  escala ${r.transformacao.escala.toFixed(3)}`);
    r.quadros.forEach((c, i) => {
      console.log(`     quadro ${i}: ${c.largura}x${c.altura} em (${c.x0},${c.y0})`);
    });
    continue;
  }

  for (const recorte of fonte.recortes) {
    const r = await fatiarPose(fonte, recorte);
    if (r.erro) { console.log(`  erro em ${r.saida}: ${r.erro}`); continue; }
    console.log(`  -> ${r.saida}.webp  conteudo ${r.caixa.largura}x${r.caixa.altura}  escala ${r.escala.toFixed(3)}`);
  }
}

console.log(diagnostico ? '\n(diagnostico: nada foi escrito)' : '\nconcluido.');
