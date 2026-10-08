// Coordenadas em milímetros no papel. Une vértices intermediários somente
// quando o traçado permanece próximo da corda, sem atravessar curvas.
export function trechosParaRotulos(linhas, tolerancia = 0.65) {
  const trechos = [];
  for (const linha of linhas) {
    let inicio = 0;
    while (inicio < linha.length - 1) {
      let fim = inicio + 1;
      for (let candidato = fim + 1; candidato < linha.length; candidato += 1) {
        const a = linha[inicio]; const b = linha[candidato];
        const dx = b[0] - a[0]; const dy = b[1] - a[1];
        const tamanho = Math.hypot(dx, dy);
        if (!tamanho || linha.slice(inicio + 1, candidato).some((p) => {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / tamanho ** 2;
          return t < 0 || t > 1 || Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / tamanho > tolerancia;
        })) break;
        fim = candidato;
      }
      const anterior = linha[inicio]; const atual = linha[fim];
      const comprimento = Math.hypot(atual[0] - anterior[0], atual[1] - anterior[1]);
      if (comprimento > 0) trechos.push({ anterior, atual, comprimento });
      inicio = fim;
    }
  }
  return trechos.sort((a, b) => b.comprimento - a.comprimento);
}

export function caixaDoRotulo(x, y, largura, altura, angulo) {
  const r = -angulo * Math.PI / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [
    x + sx * largura / 2 * Math.cos(r) - sy * altura / 2 * Math.sin(r),
    y + sx * largura / 2 * Math.sin(r) + sy * altura / 2 * Math.cos(r),
  ]);
}

export function rotulosColidem(a, b) {
  for (const caixa of [a, b]) {
    for (let i = 0; i < 2; i += 1) {
      const eixo = [caixa[i + 1][1] - caixa[i][1], caixa[i][0] - caixa[i + 1][0]];
      const proj = (p) => p[0] * eixo[0] + p[1] * eixo[1];
      const pa = a.map(proj); const pb = b.map(proj);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

const anguloLegivel = ({ anterior, atual }) => {
  let angulo = Math.atan2(anterior[1] - atual[1], atual[0] - anterior[0]) * 180 / Math.PI;
  if (angulo > 90) angulo -= 180;
  if (angulo < -90) angulo += 180;
  return angulo;
};

// Primeiro reserva um nome para cada rua. Repetições de vias longas só usam
// o espaço que sobra; trechos curtos e pontos recebem chamadas com ligação.
export function nomeDaRuaNoMapa(rua) {
  const chave = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nome = String(rua.name || '').trim().replace(/\s+\((.*)\)$/, (anotacao, bairro) =>
    chave(bairro) === chave(rua.bairro?.name) ? '' : anotacao);
  if (nome !== nome.toLocaleUpperCase('pt-BR')) return nome;
  return nome.split(/\s+/).map((palavra, index) => {
    if (['AABB', 'DNER', 'BR', 'PE'].includes(palavra)) return palavra;
    const minuscula = palavra.toLocaleLowerCase('pt-BR');
    return index && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(minuscula)
      ? minuscula : minuscula.charAt(0).toLocaleUpperCase('pt-BR') + minuscula.slice(1);
  }).join(' ');
}

export function planejarRotulosDeRuas(ruas, mapa, medirTexto, {
  permitirChamadas = true, nomeVisual = rua => rua.name, tamanhos = [7, 6, 5, 4.5],
  quebrarTexto = null, alturaMaxima = Infinity, margemTexto = 1.2, margemVertical = 0.6,
} = {}) {
  const rotulos = [];
  const nomeadas = new Set();
  const ordenadas = ruas.filter((rua) => String(rua.name || '').trim())
    .map((rua) => ({ rua, trechos: trechosParaRotulos(rua.linhasProjetadas) }))
    .sort((a, b) => (a.trechos[0]?.comprimento || 0) - (b.trechos[0]?.comprimento || 0));
  const tentar = (rua, x, y, angulo, tamanho, comprimento = Infinity, ancora = null) => {
    const texto = String(nomeVisual(rua)).trim();
    const linhas = quebrarTexto && Number.isFinite(comprimento)
      ? quebrarTexto(texto, Math.max(comprimento - margemTexto, 0), tamanho) : [texto];
    if (!linhas.length) return false;
    const largura = Math.max(...linhas.map(linha => medirTexto(linha, tamanho))) + margemTexto;
    if (largura > comprimento) return false;
    const altura = tamanho * 0.3528 * (linhas.length - 1 + (quebrarTexto ? 0.8 : 1)) + margemVertical;
    if (altura > alturaMaxima) return false;
    const caixa = caixaDoRotulo(x, y, largura, altura, angulo);
    if (caixa.some(([px, py]) => px < mapa.x || px > mapa.x + mapa.largura
      || py < mapa.y || py > mapa.y + mapa.altura)
      || rotulos.some((outro) => rotulosColidem(caixa, outro.caixa))) return false;
    rotulos.push({ rua, texto, linhas, x, y, angulo, tamanho, caixa, ancora });
    nomeadas.add(rua);
    return true;
  };
  const tentarNaRua = ({ rua, trechos }, repetir = false) => {
    for (const segmento of trechos) {
      const angulo = anguloLegivel(segmento);
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9, 0.425, 0.575, 0.275, 0.725]) {
        const x = segmento.anterior[0] + (segmento.atual[0] - segmento.anterior[0]) * t;
        const y = segmento.anterior[1] + (segmento.atual[1] - segmento.anterior[1]) * t;
        if (repetir && rotulos.some((outro) => outro.rua === rua
          && Math.hypot(outro.x - x, outro.y - y) < 65)) continue;
        for (const tamanho of tamanhos) {
          if (tentar(rua, x, y, angulo, tamanho, segmento.comprimento * 2 * Math.min(t, 1 - t) - 1)) {
            if (!repetir) return;
            break;
          }
        }
      }
    }
  };
  for (const entrada of ordenadas) tentarNaRua(entrada);

  for (const { rua, trechos } of ordenadas) {
    if (!permitirChamadas) continue;
    if (nomeadas.has(rua)) continue;
    const ancoras = trechos.length ? trechos.map((segmento) => ({
      ponto: [(segmento.anterior[0] + segmento.atual[0]) / 2,
        (segmento.anterior[1] + segmento.atual[1]) / 2],
      angulo: anguloLegivel(segmento),
    })) : rua.linhasProjetadas.flat().map((ponto) => ({ ponto, angulo: 0 }));

    // Pode ultrapassar as pontas de um trecho curto, mantendo o nome inteiro.
    // Quando o texto sai do eixo, uma linha aponta para a posição cadastrada.
    buscaLocal: for (const distancia of [0, 3, 6, 10, 15, 22]) {
      if (!trechos.length && distancia === 0) continue;
      for (const { ponto, angulo } of ancoras) {
        const r = angulo * Math.PI / 180;
        for (const lado of (distancia ? [-1, 1] : [1])) {
          const x = ponto[0] + Math.sin(r) * distancia * lado;
          const y = ponto[1] + Math.cos(r) * distancia * lado;
          for (const tamanho of [5, 4.5]) {
            if (tentar(rua, x, y, angulo, tamanho, Infinity,
              distancia ? ponto : null)) break buscaLocal;
          }
        }
      }
    }
    if (nomeadas.has(rua) || !ancoras.length) continue;

    // Em cruzamentos densos, procura o espaço livre mais próximo no papel.
    const candidatos = [];
    for (let y = mapa.y + 2; y < mapa.y + mapa.altura - 1; y += 3) {
      for (let x = mapa.x + 2; x < mapa.x + mapa.largura - 1; x += 4) {
        let ancora = ancoras[0].ponto;
        let distancia = Infinity;
        for (const { ponto } of ancoras) {
          const d = (x - ponto[0]) ** 2 + (y - ponto[1]) ** 2;
          if (d < distancia) { distancia = d; ancora = ponto; }
        }
        candidatos.push({ x, y, distancia, ancora });
      }
    }
    candidatos.sort((a, b) => a.distancia - b.distancia);
    for (const { x, y, ancora } of candidatos) {
      if (tentar(rua, x, y, 0, 4.5, Infinity, ancora)) break;
    }
  }

  for (const entrada of ordenadas) {
    if (nomeadas.has(entrada.rua)) tentarNaRua(entrada, true);
  }
  return rotulos;
}
