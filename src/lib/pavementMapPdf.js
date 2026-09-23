import { jsPDF } from 'jspdf';
import { streetBlocks } from './streetBlocks.js';

const STATUS_STYLE = {
  paved: { label: 'Pavimentada', color: [22, 163, 74] },
  partially_paved: { label: 'Parcialmente pavimentada', color: [245, 158, 11] },
  unpaved: { label: 'Sem pavimentação', color: [234, 88, 12] },
  unknown: { label: 'Situação não informada', color: [156, 163, 175] },
};

const BAIRRO_PALETTE = [
  { fill: [121, 203, 230], border: [43, 142, 177] },
  { fill: [163, 204, 46], border: [91, 142, 17] },
  { fill: [255, 230, 82], border: [203, 157, 0] },
  { fill: [207, 210, 212], border: [117, 123, 128] },
  { fill: [140, 212, 226], border: [31, 143, 163] },
  { fill: [190, 215, 71], border: [111, 145, 18] },
  { fill: [255, 220, 111], border: [194, 139, 15] },
  { fill: [220, 220, 220], border: [128, 128, 128] },
];

const pontoValido = (ponto) => Array.isArray(ponto)
  && Number.isFinite(Number(ponto[0]))
  && Number.isFinite(Number(ponto[1]));

const pontoNoPoligono = ([x, y], poligono) => {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const cruza = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
};

const linhasDaRua = (rua) => {
  const linhas = (Array.isArray(rua?.linhas) ? rua.linhas : [])
    .map((linha) => (Array.isArray(linha) ? linha.filter(pontoValido) : []))
    .filter((linha) => linha.length > 1);

  if (linhas.length > 0) return linhas;
  if (Number.isFinite(rua?.location?.lat) && Number.isFinite(rua?.location?.lng)) {
    return [[[rua.location.lat, rua.location.lng]]];
  }
  return [];
};

export const ruasComGeometria = (ruas = []) => ruas
  .map((rua) => ({ ...rua, linhasDoMapa: linhasDaRua(rua) }))
  .filter((rua) => rua.linhasDoMapa.length > 0);

const slug = (texto) => String(texto || 'cidade')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'cidade';

export const nomeDoArquivoDoMapa = (cidade) => `mapa-de-ruas-${slug(cidade)}.pdf`;

const maiorSegmento = (linhasProjetadas) => {
  let escolhido = null;
  for (const linha of linhasProjetadas) {
    for (let i = 1; i < linha.length; i += 1) {
      const anterior = linha[i - 1];
      const atual = linha[i];
      const comprimento = Math.hypot(atual[0] - anterior[0], atual[1] - anterior[1]);
      if (!escolhido || comprimento > escolhido.comprimento) {
        escolhido = { anterior, atual, comprimento };
      }
    }
  }
  return escolhido;
};

const anguloLegivel = (segmento) => {
  let angulo = (Math.atan2(segmento.anterior[1] - segmento.atual[1], segmento.atual[0] - segmento.anterior[0]) * 180) / Math.PI;
  if (angulo > 90) angulo -= 180;
  if (angulo < -90) angulo += 180;
  return angulo;
};

const nomeDeBairroGenerico = (nome) => String(nome || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .match(/^(varios|diversos|outros) bairros$|^(sem bairro( definido)?|nao informado)$/);

const mediana = (valores) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

const centroDasAmostras = (amostras) => [
  mediana(amostras.map((ponto) => ponto[0])),
  mediana(amostras.map((ponto) => ponto[1])),
];

const amostrarLinha = (linha, passo = 2.5) => {
  if (linha.length <= 1) return linha;
  const amostras = [];
  for (let i = 1; i < linha.length; i += 1) {
    const a = linha[i - 1];
    const b = linha[i];
    const partes = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / passo));
    for (let parte = 0; parte < partes; parte += 1) {
      const t = parte / partes;
      amostras.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  amostras.push(linha.at(-1));
  return amostras;
};

const distanciaAoSegmentoAoQuadrado = (ponto, segmento) => {
  const [a, b] = segmento;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const tamanho2 = dx ** 2 + dy ** 2;
  if (tamanho2 <= Number.EPSILON) {
    return (ponto[0] - a[0]) ** 2 + (ponto[1] - a[1]) ** 2;
  }
  const t = Math.max(0, Math.min(1, (
    (ponto[0] - a[0]) * dx + (ponto[1] - a[1]) * dy
  ) / tamanho2));
  const x = a[0] + dx * t;
  const y = a[1] + dy * t;
  return (ponto[0] - x) ** 2 + (ponto[1] - y) ** 2;
};

const menorDistanciaAoGrupo = (ponto, grupo) => {
  let menor = Infinity;
  for (const segmento of grupo.segmentos || []) {
    menor = Math.min(menor, distanciaAoSegmentoAoQuadrado(ponto, segmento));
  }
  if (Number.isFinite(menor)) return menor;
  for (const amostra of grupo.amostras || []) {
    menor = Math.min(menor, (ponto[0] - amostra[0]) ** 2 + (ponto[1] - amostra[1]) ** 2);
  }
  return menor;
};

// A cor de uma quadra deve vir das ruas que formam seu perímetro. Usar somente
// o centro fazia uma rua isolada do bairro vizinho "puxar" toda a quadra para
// a cor errada, sobretudo nas divisas. Três amostras por lado também preservam
// a decisão quando um lado da face reúne trechos de mais de uma rua.
export const indiceDoBairroDaQuadra = (quadra, grupos = []) => {
  if (!Array.isArray(quadra) || quadra.length < 3 || grupos.length === 0) return -1;
  const votos = new Float64Array(grupos.length);
  for (let i = 0; i < quadra.length; i += 1) {
    const a = quadra[i];
    const b = quadra[(i + 1) % quadra.length];
    const comprimento = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (comprimento <= 1e-7) continue;
    for (const t of [0.25, 0.5, 0.75]) {
      const ponto = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let melhorGrupo = -1;
      let melhorDistancia = Infinity;
      grupos.forEach((grupo, indice) => {
        const distancia = menorDistanciaAoGrupo(ponto, grupo);
        if (distancia < melhorDistancia) {
          melhorDistancia = distancia;
          melhorGrupo = indice;
        }
      });
      if (melhorGrupo >= 0) votos[melhorGrupo] += comprimento / 3;
    }
  }

  const centro = quadra.reduce((total, ponto) => [
    total[0] + ponto[0] / quadra.length,
    total[1] + ponto[1] / quadra.length,
  ], [0, 0]);
  return grupos.reduce((melhor, grupo, indice) => {
    if (melhor < 0 || votos[indice] > votos[melhor] + 1e-7) return indice;
    if (Math.abs(votos[indice] - votos[melhor]) <= 1e-7
      && menorDistanciaAoGrupo(centro, grupo) < menorDistanciaAoGrupo(centro, grupos[melhor])) {
      return indice;
    }
    return melhor;
  }, -1);
};

const suavizarContorno = (pontos, iteracoes = 2) => {
  let resultado = pontos;
  for (let iteracao = 0; iteracao < iteracoes; iteracao += 1) {
    const proximo = [];
    for (let i = 0; i < resultado.length; i += 1) {
      const a = resultado[i];
      const b = resultado[(i + 1) % resultado.length];
      proximo.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
      );
    }
    resultado = proximo;
  }
  return resultado;
};

// Cada célula pertence somente ao bairro cuja malha de ruas está mais perto.
// Isso impede os polígonos sobrepostos e os grandes triângulos do fecho
// convexo. As bordas da grade são suavizadas antes de chegar ao PDF.
export const construirRegioesDeBairros = (grupos = [], mapa, {
  celula = 2.6,
  alcance = 14,
  limites = [],
} = {}) => {
  const validos = grupos
    .filter((grupo) => grupo.amostras?.length > 0 && !nomeDeBairroGenerico(grupo.nome))
    .map((grupo) => {
      const xs = grupo.amostras.map((ponto) => ponto[0]);
      const ys = grupo.amostras.map((ponto) => ponto[1]);
      return {
        ...grupo,
        limites: {
          minX: Math.min(...xs) - alcance,
          maxX: Math.max(...xs) + alcance,
          minY: Math.min(...ys) - alcance,
          maxY: Math.max(...ys) + alcance,
        },
      };
    });
  if (validos.length === 0) return [];

  const colunas = Math.max(1, Math.ceil(mapa.largura / celula));
  const linhas = Math.max(1, Math.ceil(mapa.altura / celula));
  const larguraCelula = mapa.largura / colunas;
  const alturaCelula = mapa.altura / linhas;
  const donos = new Int16Array(colunas * linhas);
  donos.fill(-1);
  const alcanceAoQuadrado = alcance ** 2;

  for (let linha = 0; linha < linhas; linha += 1) {
    const y = mapa.y + (linha + 0.5) * alturaCelula;
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      const x = mapa.x + (coluna + 0.5) * larguraCelula;
      if (limites.length > 0 && !limites.some((poligono) => pontoNoPoligono([x, y], poligono))) continue;
      let melhorGrupo = -1;
      let melhorDistancia = alcanceAoQuadrado;
      for (let indice = 0; indice < validos.length; indice += 1) {
        const grupo = validos[indice];
        if (x < grupo.limites.minX || x > grupo.limites.maxX || y < grupo.limites.minY || y > grupo.limites.maxY) continue;
        for (const ponto of grupo.amostras) {
          const distancia = (x - ponto[0]) ** 2 + (y - ponto[1]) ** 2;
          if (distancia < melhorDistancia) {
            melhorDistancia = distancia;
            melhorGrupo = indice;
          }
        }
      }
      donos[linha * colunas + coluna] = melhorGrupo;
    }
  }

  return validos.map((grupo, indice) => {
    const arestas = new Map();
    const celulasDoGrupo = [];
    const adicionar = (inicio, fim) => {
      const chave = `${inicio[0]},${inicio[1]}`;
      const lista = arestas.get(chave) || [];
      lista.push({ inicio, fim, usada: false });
      arestas.set(chave, lista);
    };
    const pertence = (coluna, linha) => coluna >= 0 && coluna < colunas && linha >= 0 && linha < linhas
      && donos[linha * colunas + coluna] === indice;

    for (let linha = 0; linha < linhas; linha += 1) {
      for (let coluna = 0; coluna < colunas; coluna += 1) {
        if (!pertence(coluna, linha)) continue;
        celulasDoGrupo.push([coluna, linha]);
        if (!pertence(coluna, linha - 1)) adicionar([coluna, linha], [coluna + 1, linha]);
        if (!pertence(coluna + 1, linha)) adicionar([coluna + 1, linha], [coluna + 1, linha + 1]);
        if (!pertence(coluna, linha + 1)) adicionar([coluna + 1, linha + 1], [coluna, linha + 1]);
        if (!pertence(coluna - 1, linha)) adicionar([coluna, linha + 1], [coluna, linha]);
      }
    }

    const todasArestas = [...arestas.values()].flat();
    const contornos = [];
    for (const primeira of todasArestas) {
      if (primeira.usada) continue;
      primeira.usada = true;
      const pontos = [primeira.inicio];
      let atual = primeira.fim;
      const chaveInicial = `${primeira.inicio[0]},${primeira.inicio[1]}`;
      let seguranca = todasArestas.length + 1;
      while (`${atual[0]},${atual[1]}` !== chaveInicial && seguranca > 0) {
        pontos.push(atual);
        const candidatas = arestas.get(`${atual[0]},${atual[1]}`) || [];
        const seguinte = candidatas.find((aresta) => !aresta.usada);
        if (!seguinte) break;
        seguinte.usada = true;
        atual = seguinte.fim;
        seguranca -= 1;
      }
      if (`${atual[0]},${atual[1]}` === chaveInicial && pontos.length >= 4) {
        const noPapel = pontos.map(([coluna, linha]) => [
          mapa.x + coluna * larguraCelula,
          mapa.y + linha * alturaCelula,
        ]);
        contornos.push(suavizarContorno(noPapel));
      }
    }

    const centro = celulasDoGrupo.length > 0
      ? celulasDoGrupo.reduce((total, [coluna, linha]) => [
        total[0] + mapa.x + (coluna + 0.5) * larguraCelula,
        total[1] + mapa.y + (linha + 0.5) * alturaCelula,
      ], [0, 0]).map((valor) => valor / celulasDoGrupo.length)
      : grupo.amostras[0];
    return { nome: grupo.nome, contornos, centro };
  }).filter((regiao) => regiao.contornos.length > 0);
};

const desenharPoligono = (doc, poligono, estilo = 'FD') => {
  const origem = poligono[0];
  const segmentos = [];
  let anterior = origem;
  for (let i = 1; i < poligono.length; i += 1) {
    segmentos.push([poligono[i][0] - anterior[0], poligono[i][1] - anterior[1]]);
    anterior = poligono[i];
  }
  doc.lines(segmentos, origem[0], origem[1], [1, 1], estilo, true);
};

export const criarPdfDoMapaDeRuas = ({
  ruas = [],
  cidade = 'Cidade',
  atualizadoEm = null,
  mostrarPavimentacao = false,
  mostrarNomesRuas = false,
  toleranciaEncontro = 1,
} = {}) => {
  const ruasDesenhadas = ruasComGeometria(ruas);
  if (ruasDesenhadas.length === 0) throw new Error('Esta cidade ainda não possui ruas posicionadas no mapa.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const mapa = { x: 12, y: 31, largura: larguraPagina - 24, altura: alturaPagina - 53 };

  const pontos = ruasDesenhadas.flatMap((rua) => rua.linhasDoMapa.flat());
  const latitudeMedia = pontos.reduce((total, ponto) => total + Number(ponto[0]), 0) / pontos.length;
  const escalaLongitude = Math.max(Math.cos((latitudeMedia * Math.PI) / 180), 0.2);
  const coordenadas = pontos.map(([lat, lng]) => ({ x: Number(lng) * escalaLongitude, y: Number(lat) }));
  let minX = Math.min(...coordenadas.map((ponto) => ponto.x));
  let maxX = Math.max(...coordenadas.map((ponto) => ponto.x));
  let minY = Math.min(...coordenadas.map((ponto) => ponto.y));
  let maxY = Math.max(...coordenadas.map((ponto) => ponto.y));
  const folgaX = Math.max((maxX - minX) * 0.04, 0.00005);
  const folgaY = Math.max((maxY - minY) * 0.04, 0.00005);
  minX -= folgaX;
  maxX += folgaX;
  minY -= folgaY;
  maxY += folgaY;

  const escala = Math.min(mapa.largura / (maxX - minX), mapa.altura / (maxY - minY));
  const larguraDesenho = (maxX - minX) * escala;
  const alturaDesenho = (maxY - minY) * escala;
  const margemX = mapa.x + (mapa.largura - larguraDesenho) / 2;
  const margemY = mapa.y + (mapa.altura - alturaDesenho) / 2;
  const projetar = ([lat, lng]) => [
    margemX + ((Number(lng) * escalaLongitude) - minX) * escala,
    margemY + (maxY - Number(lat)) * escala,
  ];

  doc.setFillColor(255, 255, 255);
  doc.rect(mapa.x, mapa.y, mapa.largura, mapa.altura, 'F');

  const ruasProjetadas = ruasDesenhadas.map((rua) => ({
    ...rua,
    linhasProjetadas: rua.linhasDoMapa.map((linha) => linha.map(projetar)),
  }));

  const gruposDeBairro = new Map();
  for (const rua of ruasProjetadas) {
    const nome = String(rua.bairro?.name || '').trim();
    if (!nome) continue;
    const chave = String(rua.bairro_id || nome);
    const grupo = gruposDeBairro.get(chave) || { nome, amostras: [], segmentos: [] };
    for (const linha of rua.linhasProjetadas) {
      grupo.amostras.push(...amostrarLinha(linha));
      for (let i = 1; i < linha.length; i += 1) {
        grupo.segmentos.push([linha[i - 1], linha[i]]);
      }
    }
    gruposDeBairro.set(chave, grupo);
  }

  const gruposOrdenados = [...gruposDeBairro.values()]
    .filter((grupo) => grupo.amostras.length > 0 && !nomeDeBairroGenerico(grupo.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const rotulosDeBairro = [];

  const quadras = streetBlocks(
    ruasProjetadas.flatMap((rua) => rua.linhasProjetadas),
    { snapTolerance: toleranciaEncontro },
  );
  const quadrasPorBairro = {};
  for (const quadra of quadras) {
    const indice = indiceDoBairroDaQuadra(quadra, gruposOrdenados);
    const cor = indice < 0 ? [224, 226, 228]
      : BAIRRO_PALETTE[indice % BAIRRO_PALETTE.length].fill;
    const nomeDoBairro = indice < 0 ? 'Sem bairro definido' : gruposOrdenados[indice].nome;
    quadrasPorBairro[nomeDoBairro] = (quadrasPorBairro[nomeDoBairro] || 0) + 1;
    doc.setFillColor(...cor);
    desenharPoligono(doc, quadra, 'F');
  }
  for (const grupo of gruposOrdenados) {
    rotulosDeBairro.push({ nome: grupo.nome, centro: centroDasAmostras(grupo.amostras), oficial: true });
  }
  doc.setLineDashPattern([], 0);

  // Um corredor branco sob cada traçado recorta visualmente os quarteirões,
  // como no desenho cadastral usado como referência. A cor fina aplicada logo
  // depois continua dizendo a situação da pavimentação sem transformar cada
  // bairro numa mancha sem ruas.
  if (quadras.length > 0) {
    doc.setDrawColor(255, 255, 255);
    doc.setFillColor(255, 255, 255);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.setLineWidth(1.2);
    for (const rua of ruasProjetadas) {
      for (const linha of rua.linhasProjetadas) {
        if (linha.length === 1) {
          continue;
        }
        for (let i = 1; i < linha.length; i += 1) {
          doc.line(linha[i - 1][0], linha[i - 1][1], linha[i][0], linha[i][1]);
        }
      }
    }
  }

  if (mostrarPavimentacao) {
    for (const rua of ruasProjetadas) {
      const estilo = STATUS_STYLE[rua.status] || STATUS_STYLE.unknown;
      doc.setDrawColor(...estilo.color);
      doc.setFillColor(...estilo.color);
      doc.setLineCap('round');
      doc.setLineJoin('round');
      doc.setLineWidth(0.25);
      for (const linha of rua.linhasProjetadas) {
        if (linha.length === 1) {
          doc.circle(linha[0][0], linha[0][1], 0.45, 'S');
          continue;
        }
        for (let i = 1; i < linha.length; i += 1) {
          doc.line(linha[i - 1][0], linha[i - 1][1], linha[i][0], linha[i][1]);
        }
      }
    }
  } else {
    // Mantém a rede completa legível mesmo onde os eixos ainda não formam uma
    // quadra fechada. O traço fino se aproxima da planta cadastral de referência
    // sem competir com os corredores brancos e as cores dos bairros.
    doc.setDrawColor(178, 182, 185);
    doc.setFillColor(178, 182, 185);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.setLineWidth(0.12);
    for (const rua of ruasProjetadas) {
      for (const linha of rua.linhasProjetadas) {
        if (linha.length === 1) {
          doc.circle(linha[0][0], linha[0][1], 0.28, 'S');
          continue;
        }
        for (let i = 1; i < linha.length; i += 1) {
          doc.line(linha[i - 1][0], linha[i - 1][1], linha[i][0], linha[i][1]);
        }
      }
    }
  }

  // Os nomes entram depois das vias para permanecerem legíveis. Uma grade de
  // ocupação simples evita que dezenas de rótulos sejam impressos exatamente
  // no mesmo cruzamento, sem esconder nomes que possuem espaço disponível.
  if (mostrarNomesRuas) {
    const celulasOcupadas = new Set();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.2);
    doc.setTextColor(31, 41, 55);
    for (const rua of ruasProjetadas) {
      const segmento = maiorSegmento(rua.linhasProjetadas);
      if (!segmento || segmento.comprimento < 7 || !rua.name) continue;
      const x = (segmento.anterior[0] + segmento.atual[0]) / 2;
      const y = (segmento.anterior[1] + segmento.atual[1]) / 2;
      const celula = `${Math.round(x / 11)}:${Math.round(y / 4)}`;
      if (celulasOcupadas.has(celula)) continue;
      celulasOcupadas.add(celula);
      doc.text(String(rua.name), x, y - 0.8, {
        angle: anguloLegivel(segmento),
        align: 'center',
        maxWidth: Math.max(18, segmento.comprimento * 1.8),
      });
    }
  }

  const caixasDeBairro = [];
  for (const bairro of rotulosDeBairro) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(bairro.oficial ? 7.2 : 8.5);
    const texto = bairro.nome.toUpperCase();
    let [x, y] = bairro.centro;
    if (bairro.oficial) {
      const largura = doc.getTextWidth(texto) + 4;
      const altura = 5.2;
      const deslocamentos = [[0, 0], [0, -7], [0, 7], [-12, 0], [12, 0], [-10, -7], [10, 7]];
      const posicao = deslocamentos
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .find((candidata) => {
          const caixa = {
            esquerda: candidata.x - largura / 2,
            direita: candidata.x + largura / 2,
            topo: candidata.y - altura + 0.8,
            base: candidata.y + 0.8,
          };
          const dentro = caixa.esquerda >= mapa.x && caixa.direita <= mapa.x + mapa.largura
            && caixa.topo >= mapa.y && caixa.base <= mapa.y + mapa.altura;
          const livre = caixasDeBairro.every((outra) => (
            caixa.direita < outra.esquerda || caixa.esquerda > outra.direita
            || caixa.base < outra.topo || caixa.topo > outra.base
          ));
          if (dentro && livre) {
            caixasDeBairro.push(caixa);
            return true;
          }
          return false;
        });
      if (!posicao) continue;
      ({ x, y } = posicao);
    }
    doc.setTextColor(25, 25, 25);
    doc.text(texto, x, y, { align: 'center' });
  }

  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`TROMBONE CIDADÃO — ${String(cidade).toUpperCase()}`, larguraPagina / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  const referencia = atualizadoEm
    ? `Base do Trombone Cidadão • atualizada em ${new Date(atualizadoEm).toLocaleDateString('pt-BR')}`
    : 'Base colaborativa do Trombone Cidadão';
  doc.text(referencia, larguraPagina / 2, 21, { align: 'center' });
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.8);
  doc.line(larguraPagina / 2 - 12, 25, larguraPagina / 2 + 12, 25);

  let legendaX = 14;
  const legendaY = alturaPagina - 11;
  doc.setFontSize(7.5);
  for (const estilo of (mostrarPavimentacao ? Object.values(STATUS_STYLE) : [])) {
    doc.setFillColor(...estilo.color);
    doc.roundedRect(legendaX, legendaY - 3, 5, 3, 0.6, 0.6, 'F');
    doc.setTextColor(55, 65, 81);
    doc.text(estilo.label, legendaX + 7, legendaY);
    legendaX += doc.getTextWidth(estilo.label) + 15;
  }
  if (!mostrarPavimentacao) {
    doc.setTextColor(55, 65, 81);
    doc.text('Mapa de ruas • Quadras coloridas por bairro • Vias em branco', legendaX, legendaY);
  }

  doc.setTextColor(107, 114, 128);
  doc.text(`${ruasDesenhadas.length} ruas representadas`, larguraPagina - 14, legendaY, { align: 'right' });
  doc.setFontSize(6.5);
  doc.text(
    'Quadras estimadas pelas ruas cadastradas. Cores indicam bairros do cadastro, não limites oficiais.',
    larguraPagina / 2,
    alturaPagina - 4.5,
    { align: 'center' },
  );
  doc.tromboneMapStats = {
    fonteCartografica: 'Trombone Cidadão — traçados cadastrados',
    ruas: ruasDesenhadas.length,
    ruasComTracado: ruasDesenhadas.filter((rua) => rua.linhasDoMapa.some((linha) => linha.length > 1)).length,
    ruasSomentePonto: ruasDesenhadas.filter((rua) => rua.linhasDoMapa.every((linha) => linha.length === 1)).length,
    quadras: quadras.length,
    quadrasPorBairro,
    toleranciaEncontro,
  };
  return doc;
};
