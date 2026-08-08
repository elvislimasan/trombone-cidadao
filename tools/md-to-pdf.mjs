#!/usr/bin/env node
/**
 * Converte um Markdown simples em PDF usando jsPDF (já é dependência do
 * projeto — evita instalar pandoc/puppeteer só para gerar um documento).
 *
 * Suporta o subconjunto usado nos guias: títulos, listas, checklists,
 * tabelas, blocos de código, citações, negrito e código inline.
 *
 * uso: node tools/md-to-pdf.mjs <entrada.md> <saida.pdf>
 */
import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('uso: node tools/md-to-pdf.mjs <entrada.md> <saida.pdf>');
  process.exit(1);
}

const md = fs.readFileSync(path.resolve(input), 'utf8');

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const PAGE_W = doc.internal.pageSize.getWidth();
const PAGE_H = doc.internal.pageSize.getHeight();
const M = 48;                 // margem
const MAX_W = PAGE_W - M * 2;
const RED = [182, 23, 34];    // cor da marca

let y = M;

const ensureSpace = (needed) => {
  if (y + needed > PAGE_H - M) {
    doc.addPage();
    y = M;
  }
};

const setBody = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30); };

// Remove marcações inline que não temos como renderizar com estilo próprio.
// As fontes padrão do jsPDF são WinAnsi e não cobrem setas/travessões, que
// sairiam como "!" — por isso são trocadas por equivalentes ASCII.
const ascii = (s) => s
  .replace(/[→⇒]/g, '->')
  .replace(/[←]/g, '<-')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/…/g, '...');

const clean = (s) => ascii(s)
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/`(.+?)`/g, '$1')
  .replace(/\[(.+?)\]\(.+?\)/g, '$1');

const writeLines = (text, { size = 10, style = 'normal', color = 30, indent = 0, gap = 4 } = {}) => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  if (Array.isArray(color)) doc.setTextColor(...color); else doc.setTextColor(color);
  const lines = doc.splitTextToSize(text, MAX_W - indent);
  const lh = size * 1.35;
  for (const line of lines) {
    ensureSpace(lh);
    doc.text(line, M + indent, y);
    y += lh;
  }
  y += gap;
};

const drawTable = (rows) => {
  const cols = rows[0].length;
  const colW = MAX_W / cols;
  doc.setFontSize(8.5);
  for (let r = 0; r < rows.length; r++) {
    const isHead = r === 0;
    doc.setFont('helvetica', isHead ? 'bold' : 'normal');
    // altura da linha = maior célula
    const cellLines = rows[r].map((c) => doc.splitTextToSize(clean(c), colW - 10));
    const rowH = Math.max(...cellLines.map((l) => l.length)) * 11 + 8;
    ensureSpace(rowH);
    if (isHead) {
      doc.setFillColor(240, 240, 242);
      doc.rect(M, y - 9, MAX_W, rowH, 'F');
    }
    doc.setTextColor(isHead ? 20 : 55);
    cellLines.forEach((lines, c) => {
      lines.forEach((ln, i) => doc.text(ln, M + c * colW + 5, y + i * 11));
    });
    doc.setDrawColor(222);
    doc.line(M, y + rowH - 9, M + MAX_W, y + rowH - 9);
    y += rowH;
  }
  y += 8;
};

const lines = md.split('\n');
let i = 0;

while (i < lines.length) {
  const raw = lines[i];
  const line = raw.trimEnd();

  // bloco de código
  if (line.startsWith('```')) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
    i++;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    const inner = buf.flatMap((b) => doc.splitTextToSize(ascii(b) || ' ', MAX_W - 20));
    const boxH = inner.length * 11 + 14;
    ensureSpace(boxH);
    doc.setFillColor(246, 247, 249);
    doc.rect(M, y - 8, MAX_W, boxH, 'F');
    doc.setTextColor(40);
    inner.forEach((ln, n) => doc.text(ln, M + 8, y + 4 + n * 11));
    y += boxH + 6;
    setBody();
    continue;
  }

  // tabela
  if (line.startsWith('|') && lines[i + 1]?.includes('---')) {
    const rows = [];
    const parse = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
    rows.push(parse(line));
    i += 2; // pula separador
    while (i < lines.length && lines[i].trimEnd().startsWith('|')) {
      rows.push(parse(lines[i].trimEnd()));
      i++;
    }
    drawTable(rows);
    continue;
  }

  // separador
  if (/^---+$/.test(line)) {
    ensureSpace(14);
    doc.setDrawColor(210);
    doc.line(M, y, M + MAX_W, y);
    y += 14;
    i++;
    continue;
  }

  // títulos
  if (line.startsWith('# ')) {
    y += 4;
    writeLines(clean(line.slice(2)), { size: 19, style: 'bold', color: RED, gap: 10 });
    i++; continue;
  }
  if (line.startsWith('## ')) {
    ensureSpace(34);
    y += 8;
    writeLines(clean(line.slice(3)), { size: 14, style: 'bold', color: RED, gap: 7 });
    i++; continue;
  }
  if (line.startsWith('### ')) {
    ensureSpace(26);
    y += 4;
    writeLines(clean(line.slice(4)), { size: 11.5, style: 'bold', color: 25, gap: 5 });
    i++; continue;
  }

  // citação / observação
  if (line.startsWith('> ')) {
    const text = clean(line.slice(2));
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    const wrapped = doc.splitTextToSize(text, MAX_W - 20);
    const boxH = wrapped.length * 13 + 8;
    ensureSpace(boxH);
    doc.setFillColor(255, 249, 235);
    doc.rect(M, y - 9, MAX_W, boxH, 'F');
    doc.setFillColor(...RED);
    doc.rect(M, y - 9, 3, boxH, 'F');
    doc.setTextColor(70, 55, 20);
    wrapped.forEach((ln, n) => doc.text(ln, M + 12, y + n * 13));
    y += boxH + 4;
    setBody();
    i++; continue;
  }

  // checklist
  const check = line.match(/^(\s*)- \[ \] (.+)$/);
  if (check) {
    const indent = 12 + check[1].length * 4;
    const text = clean(check[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(text, MAX_W - indent - 16);
    ensureSpace(wrapped.length * 13 + 3);
    doc.setDrawColor(120);
    doc.rect(M + indent - 10, y - 7, 8, 8);
    doc.setTextColor(30);
    wrapped.forEach((ln, n) => doc.text(ln, M + indent + 4, y + n * 13));
    y += wrapped.length * 13 + 3;
    i++; continue;
  }

  // lista comum / numerada
  const bullet = line.match(/^(\s*)[-*] (.+)$/);
  const numbered = line.match(/^(\s*)(\d+)\. (.+)$/);
  if (bullet || numbered) {
    const m = bullet || numbered;
    const indent = 12 + m[1].length * 4;
    const marker = bullet ? '•' : `${numbered[2]}.`;
    const text = clean(bullet ? m[2] : m[3]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(text, MAX_W - indent - 14);
    ensureSpace(wrapped.length * 13 + 3);
    doc.setTextColor(30);
    doc.text(marker, M + indent - 10, y);
    wrapped.forEach((ln, n) => doc.text(ln, M + indent + 6, y + n * 13));
    y += wrapped.length * 13 + 3;
    i++; continue;
  }

  // linha em branco
  if (!line.trim()) { y += 5; i++; continue; }

  // parágrafo
  writeLines(clean(line), { size: 10, gap: 5 });
  i++;
}

// rodapé com numeração
const total = doc.internal.getNumberOfPages();
for (let p = 1; p <= total; p++) {
  doc.setPage(p);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Trombone Cidadão — Deploy da Nacionalização`, M, PAGE_H - 24);
  doc.text(`${p}/${total}`, PAGE_W - M, PAGE_H - 24, { align: 'right' });
}

fs.writeFileSync(path.resolve(output), Buffer.from(doc.output('arraybuffer')));
console.log(`PDF gerado: ${output} (${total} páginas)`);
