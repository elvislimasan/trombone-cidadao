#!/usr/bin/env node
/**
 * Migra cores fixas para os tokens do design system.
 *
 * Uso:
 *   node scripts/migrate-colors.mjs --dry            # so relata, nao escreve
 *   node scripts/migrate-colors.mjs <arquivo|pasta>  # aplica
 *
 * O QUE ELE NAO FAZ, DE PROPOSITO:
 *
 * 1. Nao toca em cor sobre midia (bg-black/50, border-white/10, text-white
 *    dentro de overlay). Ali o branco/preto vale nos dois temas.
 * 2. Nao toca em arquivos de conteudo gerado (panfleto, card de stories): a
 *    imagem que o usuario baixa e branca independente do tema do app.
 * 3. Nao toca em cor com barra de opacidade (bg-white/5, text-white/70) —
 *    quase sempre e overlay sobre fundo escuro ou foto.
 *
 * Rode `npm run check:contrast` depois: ele valida os pares e avisa se algum
 * token ficou dessincronizado.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Arquivos onde a cor fixa e CONTEUDO, nao interface.
const SKIP_FILES = [
  'ReportFlyerModal.jsx',
  'ReportStoryModal.jsx',
  'cardInstagramAssets.js',
  'instagramStory.js',
];

// Ordem importa: padroes mais especificos primeiro.
const RULES = [
  // --- superficies ---
  [/\bbg-white\b(?!\/)/g, 'bg-surface-raised'],
  [/\bbg-slate-50\b(?!\/)/g, 'bg-surface-subtle'],
  [/\bbg-gray-50\b(?!\/)/g, 'bg-surface-subtle'],
  [/\bbg-slate-100\b(?!\/)/g, 'bg-surface-sunken'],
  [/\bbg-gray-100\b(?!\/)/g, 'bg-surface-sunken'],
  [/\bbg-\[#F9FAFB\]/gi, 'bg-surface-base'],
  [/\bbg-\[#F6F7F9\]/gi, 'bg-surface-base'],
  [/\bbg-\[#F3F4F6\]/gi, 'bg-surface-base'],
  [/\bbg-\[#FFFFFF\]/gi, 'bg-surface-raised'],
  [/\bbg-\[#FEF2F2\]/gi, 'bg-surface-subtle'],

  // --- texto ---
  [/\btext-slate-900\b(?!\/)/g, 'text-content-primary'],
  [/\btext-slate-800\b(?!\/)/g, 'text-content-primary'],
  [/\btext-gray-900\b(?!\/)/g, 'text-content-primary'],
  [/\btext-gray-800\b(?!\/)/g, 'text-content-primary'],
  [/\btext-\[#111827\]/gi, 'text-content-primary'],
  [/\btext-\[#191c1e\]/gi, 'text-content-primary'],

  [/\btext-slate-700\b(?!\/)/g, 'text-content-secondary'],
  [/\btext-slate-600\b(?!\/)/g, 'text-content-secondary'],
  [/\btext-gray-700\b(?!\/)/g, 'text-content-secondary'],
  [/\btext-gray-600\b(?!\/)/g, 'text-content-secondary'],
  [/\btext-\[#374151\]/gi, 'text-content-secondary'],
  [/\btext-\[#4B5563\]/gi, 'text-content-secondary'],
  [/\btext-\[#6B7280\]/gi, 'text-content-secondary'],

  [/\btext-slate-500\b(?!\/)/g, 'text-content-tertiary'],
  [/\btext-slate-400\b(?!\/)/g, 'text-content-tertiary'],
  [/\btext-gray-500\b(?!\/)/g, 'text-content-tertiary'],
  [/\btext-gray-400\b(?!\/)/g, 'text-content-tertiary'],
  [/\btext-\[#9CA3AF\]/gi, 'text-content-tertiary'],

  // --- bordas ---
  [/\bborder-slate-200\b(?!\/)/g, 'border-edge-subtle'],
  [/\bborder-gray-200\b(?!\/)/g, 'border-edge-subtle'],
  [/\bborder-slate-100\b(?!\/)/g, 'border-edge-subtle'],
  [/\bborder-gray-100\b(?!\/)/g, 'border-edge-subtle'],
  [/\bborder-slate-300\b(?!\/)/g, 'border-edge-default'],
  [/\bborder-gray-300\b(?!\/)/g, 'border-edge-default'],
  [/\bborder-\[#E5E7EB\]/gi, 'border-edge-subtle'],
  [/\bborder-\[#ECECEC\]/gi, 'border-edge-subtle'],
];

const walk = (p) => {
  const st = statSync(p);
  if (st.isFile()) return /\.jsx?$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((n) => walk(path.join(p, n)));
};

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = targets.length > 0 ? targets : ['src/pages', 'src/components'];

let filesChanged = 0;
let totalReplacements = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    if (SKIP_FILES.includes(path.basename(file))) continue;

    const before = readFileSync(file, 'utf8');
    let after = before;
    let n = 0;

    for (const [pattern, replacement] of RULES) {
      after = after.replace(pattern, () => {
        n += 1;
        return replacement;
      });
    }

    if (n > 0) {
      filesChanged += 1;
      totalReplacements += n;
      console.log(`${String(n).padStart(4)}  ${file.replace(/\\/g, '/')}`);
      if (!dry) writeFileSync(file, after);
    }
  }
}

console.log(
  `\n${totalReplacements} substituicoes em ${filesChanged} arquivo(s)` +
    (dry ? ' (dry-run, nada foi escrito)' : '')
);
console.log('Rode: npm run build && npm run check:contrast');
