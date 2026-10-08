import { jsPDF } from 'jspdf';
import { streetBlocks } from './streetBlocks.js';
import 'jspdf-autotable';
import { planejarRotulosDeRuas, caixaDoRotulo, rotulosColidem, nomeDaRuaNoMapa } from './streetMapLabels.js';
import { boundaryPoints, boundaryLabelPoint, neighborhoodColor, pointInBoundary } from './neighborhoodBoundary.js';

const STATUS_STYLE = {
  paved: { label: 'Pavimentada', color: [22, 163, 74] },
  partially_paved: { label: 'Parcialmente pavimentada', color: [245, 158, 11] },
  unpaved: { label: 'Sem pavimentação', color: [234, 88, 12] },
  unknown: { label: 'Situação não informada', color: [156, 163, 175] },
};

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

const organizarLegenda = (doc, registros, largura) => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  const linhas = [];
  const porLinha = registros.length > 7 ? Math.ceil(registros.length / 2) : Math.max(1, registros.length);
  let itens = [], ocupada = 0;
  for (const record of [...registros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    const texto = doc.splitTextToSize(record.nome, Math.min(140, largura - 30));
    const item = { record, texto, largura: Math.max(...texto.map(linha => doc.getTextWidth(linha))) + 28 };
    if (itens.length && (itens.length >= porLinha || ocupada + item.largura > largura)) {
      linhas.push({ itens, largura: ocupada, altura: Math.max(...itens.map(entrada => entrada.texto.length)) * 6.5 + 5 });
      itens = []; ocupada = 0;
    }
    itens.push(item); ocupada += item.largura;
  }
  if (itens.length) linhas.push({ itens, largura: ocupada, altura: Math.max(...itens.map(item => item.texto.length)) * 6.5 + 5 });
  return linhas;
};

// Pesquisa toda a área do bairro, inclusive espaços entre ruas. O tamanho e
// a quebra de linha se adaptam à área livre sem esconder nomes de logradouros.
const posicionarNomeDoBairro = (doc, bairro, mapa, caixasOcupadas) => {
  const areas = bairro.poligono ? [bairro.poligono] : bairro.quadras || [];
  const pontos = areas.length ? areas.flat() : bairro.amostras;
  const minX = Math.max(mapa.x, Math.min(...pontos.map(p => p[0])));
  const maxX = Math.min(mapa.x + mapa.largura, Math.max(...pontos.map(p => p[0])));
  const minY = Math.max(mapa.y, Math.min(...pontos.map(p => p[1])));
  const maxY = Math.min(mapa.y + mapa.altura, Math.max(...pontos.map(p => p[1])));
  const dentro = ponto => areas.some(area => pointInBoundary(ponto, area));
  const candidatos = [bairro.centro, ...areas.map(boundaryLabelPoint)];
  for (let y = minY + 1; y < maxY; y += 2) {
    for (let x = minX + 1; x < maxX; x += 2) {
      if (!areas.length || dentro([x, y])) candidatos.push([x, y]);
    }
  }
  candidatos.sort((a, b) => Math.hypot(a[0] - bairro.centro[0], a[1] - bairro.centro[1])
    - Math.hypot(b[0] - bairro.centro[0], b[1] - bairro.centro[1]));
  doc.setFont('helvetica', 'bold');
  for (const tamanho of [10, 8, 6]) {
    doc.setFontSize(tamanho);
    for (const limite of [90, 50, 32, 22, 14]) {
      const texto = doc.splitTextToSize(bairro.nome.toUpperCase(), limite);
      // Não divide palavras do nome do bairro para encaixar o rótulo.
      if (texto.join(' ') !== bairro.nome.toUpperCase()) continue;
      const largura = Math.max(...texto.map(linha => doc.getTextWidth(linha))) + 1;
      const entreLinhas = tamanho * 0.3528 * 1.15;
      const altura = tamanho * 0.3528 * 0.8 + (texto.length - 1) * entreLinhas + 1;
      for (const [x, y] of candidatos) {
        const caixa = caixaDoRotulo(x, y, largura, altura, 0);
        if (caixa.some(([px, py]) => px < mapa.x || px > mapa.x + mapa.largura
          || py < mapa.y || py > mapa.y + mapa.altura)) continue;
        // Canto, centro e borda do texto devem permanecer na mesma área,
        // inclusive quando o contorno tem reentrâncias.
        if (areas.length && !areas.some(area => [...caixa, [x, y],
          ...caixa.map((p, i) => [(p[0] + caixa[(i + 1) % 4][0]) / 2, (p[1] + caixa[(i + 1) % 4][1]) / 2]),
        ].every(p => pointInBoundary(p, area)))) continue;
        if (caixasOcupadas.some(outra => rotulosColidem(caixa, outra))) continue;
        return { nome: bairro.nome, texto, tamanho, entreLinhas, x, y, caixa };
      }
    }
  }
  return null;
};

export const criarPdfDoMapaDeRuas = ({
  ruas = [],
  cidade = 'Cidade',
  atualizadoEm = null,
  mostrarPavimentacao = false,
  mostrarNomesRuas = true,
  incluirIndice = false,
  toleranciaEncontro = 1,
  contornosBairros = [],
} = {}) => {
  // O nome original da fonte também identifica associações revisadas, como
  // Né Maniçoba - AABB. Usa o contorno salvo sem duplicar o bairro na planta.
  const idsComContorno = new Set(contornosBairros.map(record => String(record.bairro_id)));
  const aliases = contornosBairros.filter(record => record.source?.provider === 'osm' && record.source.source_name);
  const ruasDaPlanta = ruas.map(rua => {
    if (idsComContorno.has(String(rua.bairro_id))) return rua;
    // Alguns cadastros acrescentam o nome do loteamento ao bairro da fonte.
    // A correspondência continua exata para o nome principal e deve ser única.
    const nomePrincipal = String(rua.bairro?.name || '').replace(/\s+-\s+Loteamento\s+.+$/i, '').trim();
    const correspondencias = aliases.filter(record => record.source.source_name === nomePrincipal);
    if (correspondencias.length !== 1) return rua;
    return { ...rua, bairro_id: correspondencias[0].bairro_id, bairro: correspondencias[0].bairro };
  });
  const ruasDesenhadas = ruasComGeometria(ruasDaPlanta);
  if (ruasDesenhadas.length === 0) throw new Error('Esta cidade ainda não possui ruas posicionadas no mapa.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a1', compress: true });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margemPagina = 24;
  const larguraUtil = larguraPagina - margemPagina * 2;
  const mapa = { x: margemPagina + larguraUtil * 0.04, y: 55, largura: larguraUtil * 0.92, altura: 0 };

  const bairrosDasRuas = new Set(ruasDesenhadas.map((rua) => String(rua.bairro_id || '')));
  // O PDF mantém o recorte das ruas; bairros sem ruas no recorte não ampliam a planta.
  const contornos = contornosBairros
    .filter((record) => bairrosDasRuas.has(String(record.bairro_id)))
    .map((record) => ({ ...record, pontos: boundaryPoints(record.boundary), cor: neighborhoodColor(record.color) }))
    .filter((record) => record.pontos.length > 2)
    .sort((a, b) => String(a.bairro_id).localeCompare(String(b.bairro_id)));
  const nomeDoContorno = (record) => record.bairro?.name || ruasDesenhadas.find((rua) => String(rua.bairro_id) === String(record.bairro_id))?.bairro?.name || 'Bairro';
  const legenda = organizarLegenda(doc, contornos.map(record => ({ ...record, nome: nomeDoContorno(record), rgb: record.cor.slice(1).match(/../g).map(value => parseInt(value, 16)) })), larguraUtil);
  const alturaLegenda = 13 + legenda.reduce((total, linha) => total + linha.altura, 0);
  const pontos = [...ruasDesenhadas.flatMap((rua) => rua.linhasDoMapa.flat()),
    ...contornos.flatMap((record) => record.pontos.map(([lng, lat]) => [lat, lng]))];
  const latitudeMedia = pontos.reduce((total, ponto) => total + Number(ponto[0]), 0) / pontos.length;
  const escalaLongitude = Math.max(Math.cos((latitudeMedia * Math.PI) / 180), 0.2);
  const coordenadas = pontos.map(([lat, lng]) => ({ x: Number(lng) * escalaLongitude, y: Number(lat) }));
  let minX = Math.min(...coordenadas.map((ponto) => ponto.x));
  let maxX = Math.max(...coordenadas.map((ponto) => ponto.x));
  let minY = Math.min(...coordenadas.map((ponto) => ponto.y));
  let maxY = Math.max(...coordenadas.map((ponto) => ponto.y));
  const folgaX = Math.max((maxX - minX) * 0.025, 0.00005);
  const folgaY = Math.max((maxY - minY) * 0.025, 0.00005);
  minX -= folgaX;
  maxX += folgaX;
  minY -= folgaY;
  maxY += folgaY;

  // A altura acompanha a extensão geográfica e reserva espaço para a legenda.
  // Cabeçalho e legenda ficam próximos da planta, sem esticar coordenadas.
  const alturaMaxima = alturaPagina - mapa.y - alturaLegenda - (mostrarPavimentacao ? 47 : 33);
  mapa.altura = Math.min(alturaMaxima, mapa.largura * (maxY - minY) / (maxX - minX) + 24);

  const escala = Math.min(mapa.largura / (maxX - minX), mapa.altura / (maxY - minY));
  const larguraDesenho = (maxX - minX) * escala;
  const alturaDesenho = (maxY - minY) * escala;
  const margemX = mapa.x + (mapa.largura - larguraDesenho) / 2;
  const margemY = mapa.y + (mapa.altura - alturaDesenho) / 2;
  const projetar = ([lat, lng]) => [
    margemX + ((Number(lng) * escalaLongitude) - minX) * escala,
    margemY + (maxY - Number(lat)) * escala,
  ];

  doc.setFillColor(245, 247, 249);
  doc.setDrawColor(229, 233, 237);
  doc.setLineWidth(0.25);
  doc.roundedRect(margemPagina, mapa.y - 9, larguraUtil, mapa.altura + 18, 3, 3, 'FD');

  const ruasProjetadas = ruasDesenhadas.map((rua) => ({
    ...rua,
    linhasProjetadas: rua.linhasDoMapa.map((linha) => linha.map(projetar)),
  }));
  const contornosProjetados = contornos.map((record) => ({
    ...record,
    poligono: record.pontos.map(([lng, lat]) => projetar([lat, lng])),
    nome: nomeDoContorno(record),
    rgb: record.cor.slice(1).match(/../g).map((value) => parseInt(value, 16)),
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
  const areasDasQuadras = new Map();
  for (const quadra of quadras) {
    const indice = indiceDoBairroDaQuadra(quadra, gruposOrdenados);
    const cor = [220, 231, 240];
    const centro = quadra.reduce((sum, p) => [sum[0] + p[0] / quadra.length, sum[1] + p[1] / quadra.length], [0, 0]);
    const contorno = contornosProjetados.find((record) => pointInBoundary(centro, record.poligono));
    const nomeDoBairro = contorno?.nome || (indice < 0 ? 'Sem bairro definido' : gruposOrdenados[indice].nome);
    quadrasPorBairro[nomeDoBairro] = (quadrasPorBairro[nomeDoBairro] || 0) + 1;
    if (!areasDasQuadras.has(nomeDoBairro)) areasDasQuadras.set(nomeDoBairro, []);
    areasDasQuadras.get(nomeDoBairro).push(quadra);
    doc.setFillColor(...cor);
    desenharPoligono(doc, quadra, 'F');
  }
  // A área manual é desenhada depois das quadras estimadas, preservando a divisa
  // exata mesmo quando ela atravessa uma quadra ou não há vias fechadas.
  for (const record of contornosProjetados) {
    doc.setFillColor(...record.rgb);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    desenharPoligono(doc, record.poligono, 'FD');
    rotulosDeBairro.push({ nome: record.nome, centro: boundaryLabelPoint(record.poligono), poligono: record.poligono });
  }
  for (const grupo of gruposOrdenados) {
    if (contornosProjetados.some((record) => record.nome === grupo.nome)) continue;
    rotulosDeBairro.push({ nome: grupo.nome, centro: centroDasAmostras(grupo.amostras),
      amostras: grupo.amostras, quadras: areasDasQuadras.get(grupo.nome) || [] });
  }
  doc.setLineDashPattern([], 0);

  // Bordas discretas e corredor branco preservam a leitura das vias.
  for (const [largura, cor] of [[2.9, [184, 194, 204]], [2.5, [255, 255, 255]]]) {
    doc.setDrawColor(...cor);
    doc.setLineCap('round'); doc.setLineJoin('round'); doc.setLineWidth(largura);
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
    doc.setDrawColor(184, 194, 204);
    doc.setFillColor(184, 194, 204);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.setLineWidth(0.12);
    for (const rua of ruasProjetadas) {
      for (const linha of rua.linhasProjetadas) {
        if (linha.length === 1) {
          doc.circle(linha[0][0], linha[0][1], 0.28, 'S');
          continue;
        }
      }
    }
  }

  const caixasDosNomes = [];
  const ruasNomeadas = new Set();
  const tamanhosDosNomes = [];
  // Os nomes acompanham os segmentos reais, sem caixas ou chamadas externas.
  if (mostrarNomesRuas) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(38, 52, 69);
    const rotulos = planejarRotulosDeRuas(ruasProjetadas, mapa, (texto, tamanho) => {
      doc.setFontSize(tamanho);
      return doc.getTextWidth(texto);
    }, {
      permitirChamadas: false, nomeVisual: nomeDaRuaNoMapa,
      tamanhos: [4, 3.5, 3, 2.5, 2, 1.8, 1.5],
      alturaMaxima: 2.5, margemTexto: 0.3, margemVertical: 0.3,
      quebrarTexto: (texto, largura, tamanho) => {
        if (largura <= 0) return [];
        doc.setFontSize(tamanho);
        return doc.splitTextToSize(texto, largura);
      },
    });
    for (const { rua, linhas, x, y, angulo, tamanho, caixa } of rotulos) {
      doc.setFontSize(tamanho);
      // Desloca a linha de base perpendicularmente ao texto girado.
      const r = angulo * Math.PI / 180;
      const base = tamanho * 0.3528 * 0.32;
      linhas.forEach((linha, index) => {
        const offset = base + (index - (linhas.length - 1) / 2) * tamanho * 0.3528;
        const metade = doc.getTextWidth(linha) / 2;
        doc.text(linha, x - Math.cos(r) * metade + Math.sin(r) * offset,
          y + Math.sin(r) * metade + Math.cos(r) * offset, { angle: angulo });
      });
      caixasDosNomes.push(caixa);
      tamanhosDosNomes.push(tamanho);
      ruasNomeadas.add(rua);
    }
  }

  const caixasDeBairro = [];
  const bairrosNomeados = [];
  const rotulosDosBairros = [];
  for (const bairro of rotulosDeBairro) {
    const posicao = posicionarNomeDoBairro(doc, bairro, mapa, [...caixasDeBairro, ...caixasDosNomes]);
    if (!posicao) continue;
    caixasDeBairro.push(posicao.caixa);
    const { texto, tamanho, entreLinhas, x, y } = posicao;
    doc.setTextColor(36, 50, 71);
    doc.text(texto, x, y - (texto.length - 1) * entreLinhas / 2 + tamanho * 0.3528 * 0.32,
      { align: 'center', lineHeightFactor: 1.15 });
    bairrosNomeados.push(bairro.nome);
    rotulosDosBairros.push(posicao);
  }

  doc.setTextColor(75, 85, 99);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TROMBONE CIDADÃO', margemPagina, 15);
  doc.setTextColor(36, 50, 71);
  doc.setFontSize(26);
  const nomeCidade = String(cidade).replace(/\s[·-]\s([A-Z]{2})$/, '/$1');
  doc.text(`Mapa de ruas — ${nomeCidade}`, margemPagina, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(75, 85, 99);
  doc.text('Divisão territorial e identificação de logradouros', margemPagina, 37);
  doc.setFontSize(10);
  const dataAtualizacao = new Date(atualizadoEm);
  const referencia = atualizadoEm && Number.isFinite(dataAtualizacao.getTime())
    ? `Última atualização: ${dataAtualizacao.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}`
    : 'Base colaborativa do Trombone Cidadão';
  doc.text(referencia, larguraPagina - margemPagina, 27, { align: 'right' });
  doc.setDrawColor(224, 230, 236);
  doc.setLineWidth(0.3);
  doc.line(margemPagina, 42, larguraPagina - margemPagina, 42);

  let legendaY = mapa.y + mapa.altura + 19;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(36, 50, 71);
  doc.text(legenda.length ? 'Legenda de bairros' : 'Mapa de ruas', margemPagina, legendaY);
  doc.setFont('helvetica', 'normal');
  legendaY += 8;
  const itensDaLegenda = [];
  for (const linha of legenda) {
    let x = margemPagina + (larguraUtil - linha.largura) / 2;
    for (const { record, texto, largura } of linha.itens) {
      doc.setFillColor(...record.rgb);
      doc.setDrawColor(220, 226, 232);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, legendaY - 5, 11, 7, 1, 1, 'FD');
      doc.setTextColor(38, 52, 69);
      doc.text(texto, x + 16, legendaY, { lineHeightFactor: 1.15 });
      itensDaLegenda.push({ bairro_id: record.bairro_id, nome: record.nome, cor: record.cor, x, y: legendaY });
      x += largura;
    }
    legendaY += linha.altura;
  }
  if (!legenda.length) {
    doc.setFontSize(12);
    doc.setTextColor(75, 85, 99);
    doc.text('Quadras estimadas em azul claro · ruas em branco', margemPagina, legendaY);
    legendaY += 11;
  }
  if (mostrarPavimentacao) {
    let x = margemPagina;
    doc.setFontSize(11);
    for (const estilo of Object.values(STATUS_STYLE)) {
      doc.setDrawColor(...estilo.color);
      doc.setLineWidth(0.7);
      doc.line(x, legendaY - 1, x + 9, legendaY - 1);
      doc.setTextColor(55, 65, 81);
      doc.text(estilo.label, x + 13, legendaY);
      x += doc.getTextWidth(estilo.label) + 26;
    }
    legendaY += 12;
  }
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  const ruasSemNomeNoMapa = mostrarNomesRuas ? ruasProjetadas
    .filter(rua => String(rua.name || '').trim() && !ruasNomeadas.has(rua))
    .map(rua => ({ id: rua.id, name: rua.name })) : [];
  const usarIndice = incluirIndice;
  const ruasSomentePonto = ruasDesenhadas.filter(rua => rua.linhasDoMapa.every(linha => linha.length === 1)).length;
  doc.text(`${ruasDesenhadas.length} ruas representadas${ruasSomentePonto ? ` · ${ruasSomentePonto} com localização apenas por ponto` : ''}${usarIndice ? ' · consulte os nomes completos no índice' : ''}`, margemPagina, legendaY);
  doc.setFontSize(8.5);
  doc.text(
    contornosProjetados.some((record) => record.source?.provider === 'osm')
      ? 'Bairros: © OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright. Possíveis ajustes locais. Quadras estimadas; limites sem homologação oficial.'
      : contornosProjetados.length
      ? 'Contornos de bairros desenhados manualmente; quadras estimadas pelas ruas. Não são limites cadastrais oficiais.'
      : 'Quadras estimadas pelos traçados cadastrados; não são limites cadastrais oficiais.',
    margemPagina,
    legendaY + 7,
  );
  if (contornosProjetados.some(record => record.source?.reference_type === 'pdf')) {
    doc.text('Contornos complementares aproximados a partir do mapa em PDF de referência.', margemPagina, legendaY + 13);
  }
  const estatisticas = {
    fonteCartografica: 'Trombone Cidadão — traçados cadastrados',
    ruas: ruasDesenhadas.length,
    ruasComTracado: ruasDesenhadas.filter((rua) => rua.linhasDoMapa.some((linha) => linha.length > 1)).length,
    ruasSomentePonto: ruasDesenhadas.filter((rua) => rua.linhasDoMapa.every((linha) => linha.length === 1)).length,
    quadras: quadras.length,
    quadrasPorBairro,
    contornosBairros: contornosProjetados.map((record) => ({ bairro_id: record.bairro_id, nome: record.nome, cor: record.cor, pontos: record.pontos.length })),
    estilo: 'institucional', mapa, linhasLegenda: legenda.length, itensLegenda: itensDaLegenda,
    bairrosComNomeNoMapa: bairrosNomeados,
    bairrosSemNomeNoMapa: rotulosDeBairro.filter(bairro => !bairrosNomeados.includes(bairro.nome)).map(bairro => bairro.nome),
    rotulosDeBairros: rotulosDosBairros,
    tamanhoMinimoNomeRua: tamanhosDosNomes.length ? Math.min(...tamanhosDosNomes) : null,
    toleranciaEncontro,
    ruasComNomeNoMapa: ruasNomeadas.size,
    ruasSemNomeNoMapa,
    rotulosDeRuas: caixasDosNomes.length,
  };
  if (usarIndice) {
    doc.addPage('a4', 'portrait');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 25, 25);
    doc.setFontSize(16);
    doc.text('Índice de ruas', 14, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(String(cidade), 180), 14, 24);
    doc.setFontSize(8);
    doc.text('Planta geral em A1. Nomes na planta acompanham somente os traçados onde há espaço.', 14, 32);
    doc.text('Este índice mantém os nomes completos, inclusive ruas representadas apenas por ponto.', 14, 37);
    doc.autoTable({
      startY: 42,
      head: [['Rua', 'Bairro', 'Situação', 'Representação']],
      body: [...ruas].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')).map((rua) => [
        rua.name || 'Sem nome cadastrado',
        rua.bairro?.name || 'Bairro não informado',
        (STATUS_STYLE[rua.status] || STATUS_STYLE.unknown).label,
        linhasDaRua(rua).some((linha) => linha.length > 1) ? 'Traçado' : linhasDaRua(rua).length ? 'Somente ponto' : 'Sem localização',
      ]),
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [55, 65, 81] },
      margin: { left: 14, right: 14, top: 16, bottom: 16 },
      columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 } },
    });
  }
  doc.tromboneMapStats = { ...estatisticas, paginasDeDetalhe: 0 };
  doc.setPage(1);
  return doc;
};
