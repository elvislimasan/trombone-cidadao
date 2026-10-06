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
