import { jsPDF } from 'jspdf';
import { resumoDeExtensao, formatarKm, percentual } from './pavementLength.js';

const carregarImagem = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Não foi possível renderizar uma camada do mapa.'));
  image.src = src;
});

export function serializarCamadaSvg(svg, computedStyle = getComputedStyle) {
  const clone = svg.cloneNode(true);
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((element, index) => {
    const style = computedStyle(element);
    copies[index].removeAttribute('class');
    copies[index].removeAttribute('style');
    for (const property of ['stroke', 'fill', 'stroke-width', 'stroke-opacity', 'fill-opacity', 'opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'visibility', 'display']) {
      const value = style.getPropertyValue(property);
      if (value) copies[index].style.setProperty(property, value);
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

export const enquadrarImagem = (width, height, box) => {
  if (!(width > 0 && height > 0)) throw new Error('O mapa precisa estar visível para exportar.');
  const scale = Math.min(box.width / width, box.height / height);
  return {
    x: box.x + (box.width - width * scale) / 2,
    y: box.y + (box.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
};

// Captura apenas a vista já carregada: não faz varredura de tiles ou muda o zoom.
export async function capturarMapaVisivel(map) {
  if (!map) throw new Error('Abra a visualização do mapa antes de exportar.');
  map.stop();
  const center = map.getCenter();
  const zoom = map.getZoom();
  const node = map.getContainer();
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('Abra a visualização do mapa antes de exportar.');
  const tiles = [...node.querySelectorAll('img.leaflet-tile')].filter((tile) => {
    const bounds = tile.getBoundingClientRect();
    return bounds.right > rect.left && bounds.left < rect.right
      && bounds.bottom > rect.top && bounds.top < rect.bottom;
  });
  if (!tiles.length || tiles.some((tile) => !tile.complete || !tile.naturalWidth)) {
    throw new Error('Aguarde o carregamento completo do mapa e tente novamente.');
  }
  // Valida CORS e embute as imagens antes da captura: falha explícita, nunca PDF
  // com buracos silenciosos quando o provedor de mapas não permite a leitura.
  const images = new Map();
  await Promise.all([...new Set(tiles.map((tile) => tile.src))].map(async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Não foi possível carregar a base cartográfica para exportação.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('A base cartográfica retornou uma imagem inválida.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    images.set(url, data);
  }));
  const assertUnchanged = () => {
    const currentRect = node.getBoundingClientRect();
    if (!map.getCenter().equals(center) || map.getZoom() !== zoom
        || Math.abs(currentRect.width - rect.width) > 1 || Math.abs(currentRect.height - rect.height) > 1) {
      throw new Error('O enquadramento mudou durante a exportação. Tente novamente sem mover o mapa.');
    }
  };
  assertUnchanged();
  const style = getComputedStyle(node);
  const colors = ['paved', 'partial', 'unpaved', 'unknown'].map((status) => {
    const value = style.getPropertyValue(`--pin-pav-${status}-bg`).trim();
    return /^\d+\s+\d+\s+\d+$/.test(value) ? value.split(/\s+/).map(Number) : null;
  });
  // Composição explícita evita perder tiles no clone do DOM e resolve as
  // variáveis CSS antes de serializar o SVG (senão as vias ficam azuis).
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * 2);
  canvas.height = Math.round(rect.height * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este dispositivo não permite capturar o mapa.');
  context.scale(2, 2);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, rect.width, rect.height);
  for (const tile of tiles) {
    const bounds = tile.getBoundingClientRect();
    const image = await carregarImagem(images.get(tile.src));
    context.drawImage(image, bounds.left - rect.left, bounds.top - rect.top, bounds.width, bounds.height);
  }
  for (const svg of node.querySelectorAll('.leaflet-overlay-pane svg')) {
    const bounds = svg.getBoundingClientRect();
    const source = serializarCamadaSvg(svg);
    const image = await carregarImagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`);
    context.drawImage(image, bounds.left - rect.left, bounds.top - rect.top, bounds.width, bounds.height);
  }
    const image = canvas.toDataURL('image/png');
    const attribution = node.querySelector('.leaflet-control-attribution')?.textContent?.trim() || '';
    assertUnchanged();
    const mid = [rect.width / 2, rect.height / 2];
    const metersPerPixel = map.distance(map.containerPointToLatLng(mid),
      map.containerPointToLatLng([mid[0] + 100, mid[1]])) / 100;
    return { image, width: rect.width, height: rect.height, attribution, colors, metersPerPixel };
}

export function criarPdfDoMapaVisivel({ image, width, height, attribution, cidade, atualizadoEm, colors = [], metersPerPixel, ruas = [] }) {
  const resumo = resumoDeExtensao(ruas);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(25, 32, 45);
  doc.text('TROMBONE CIDADÃO', 14, 16);
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(String(cidade || 'Mapa de ruas'), 390)[0], 14, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const date = atualizadoEm ? new Date(atualizadoEm) : new Date();
  const stamp = Number.isNaN(date.getTime()) ? '' : ` • Atualizado em ${date.toLocaleDateString('pt-BR')}`;
  doc.text(`Pavimentação • Enquadramento e filtros da visualização${stamp}`, 14, 30);
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.6);
  doc.line(14, 34, 406, 34);
  doc.text(`${resumo.ruas} ruas nos filtros • ${formatarKm(resumo.metros)} de traçados • ${resumo.ruasSemTracado} ruas sem traçado`, 14, 40);
  doc.setFontSize(7);
  doc.text('Totais do conjunto filtrado, incluindo ruas fora do enquadramento. Pontos indicam ruas sem traçado.', 14, 45);
  const box = enquadrarImagem(width, height, { x: 14, y: 49, width: 392, height: 212 });
  doc.addImage(image, 'PNG', box.x, box.y, box.width, box.height);
  if (Number.isFinite(metersPerPixel) && metersPerPixel > 0) {
    const target = metersPerPixel * width * 0.15;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const meters = [5, 2, 1].find((value) => value * magnitude <= target) * magnitude;
    const length = meters / metersPerPixel * box.width / width;
    const x = box.x + 4;
    const y = box.y + box.height - 5;
    doc.setFillColor(255, 255, 255);
    doc.rect(x - 2, y - 8, Math.max(length + 4, 22), 11, 'F');
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.line(x, y, x + length, y);
    doc.line(x, y - 2, x, y + 1);
    doc.line(x + length, y - 2, x + length, y + 1);
    doc.setFontSize(7);
    doc.text(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, x, y - 3);
  }
  const legend = [
    ['Pavimentada', [22, 163, 74]],
    ['Parcialmente pavimentada', [245, 158, 11]],
    ['Sem pavimentação', [234, 88, 12]],
    ['Não informada', [156, 163, 175]],
  ];
  legend.forEach(([label, color], index) => {
    const x = 14 + index * 91;
    doc.setDrawColor(...(colors[index] || color));
    doc.setLineWidth(1);
    doc.line(x, 273, x + 8, 273);
    doc.text(label, x + 11, 274);
    const id = ['paved', 'partially_paved', 'unpaved', 'unknown'][index];
    const count = resumo.ruasPorSituacao[id];
    const metric = resumo.temTracado
      ? `${formatarKm(resumo.porSituacao[id])} • ${percentual(resumo.porSituacao[id], resumo.metros)}% da extensão`
      : `${percentual(count, resumo.ruas)}% das ruas`;
    doc.text(`${count} ruas • ${metric}`, x + 11, 278);
  });
  doc.setFontSize(7);
  doc.setTextColor(80, 88, 100);
  doc.text('Ruas: cadastro do Trombone Cidadão. Sem limites de bairros estimados. Imagem do mapa, não planta cadastral.', 14, 282);
  doc.text(doc.splitTextToSize(`Base cartográfica: ${attribution || 'créditos indisponíveis'}`, 390), 14, 287);
  return doc;
}
