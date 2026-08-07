#!/usr/bin/env node
// Valida os pares texto/fundo dos tokens semanticos contra WCAG AA,
// nos temas claro e escuro. Sem dependencias externas.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = resolve(__dirname, '../src/design-system/tokens');

const readCss = (name) => readFileSync(resolve(TOKENS_DIR, name), 'utf8');

// Extrai as declaracoes de um bloco de seletor especifico.
// Remove comentarios /* ... */ antes de dividir por ';' - sem isso, uma
// declaracao logo apos um comentario fica colada nele (ex: "/* --- Texto
// --- */\n  --text-primary") e o startsWith('--') falha, descartando o token.
function extractBlock(css, selector) {
  const out = {};
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(css)) !== null) {
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const line of body.split(';')) {
      const [rawKey, ...rest] = line.split(':');
      if (!rawKey || rest.length === 0) continue;
      const key = rawKey.trim();
      if (!key.startsWith('--')) continue;
      out[key] = rest.join(':').trim();
    }
  }
  return out;
}

const primitives = extractBlock(readCss('primitives.css'), ':root');
const semanticCss = readCss('semantic.css');
const semanticLight = extractBlock(semanticCss, ':root');
const semanticDark = extractBlock(semanticCss, '.dark');

// Resolve var(--x) ate chegar num triplete RGB.
function resolveRgb(value, scope, depth = 0) {
  if (!value || depth > 10) return null;
  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (varMatch) {
    const key = varMatch[1];
    const next = scope[key] ?? primitives[key];
    return resolveRgb(next, scope, depth + 1);
  }
  const nums = value.trim().split(/\s+/).map(Number);
  if (nums.length === 3 && nums.every((n) => Number.isFinite(n))) return nums;
  return null;
}

function relativeLuminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// [nome, tokenTexto, tokenFundo, razaoMinima]
// 4.5 para corpo, 3.0 para texto grande / elementos nao textuais.
const PAIRS = [
  ['texto primario sobre base',        '--text-primary',      '--surface-base',      4.5],
  ['texto primario sobre elevado',     '--text-primary',      '--surface-raised',    4.5],
  ['texto secundario sobre base',      '--text-secondary',    '--surface-base',      4.5],
  ['texto secundario sobre elevado',   '--text-secondary',    '--surface-raised',    4.5],
  ['texto terciario sobre elevado',    '--text-tertiary',     '--surface-raised',    3.0],
  ['marca sobre elevado',              '--brand',             '--surface-raised',    3.0],
  ['texto sobre marca',                '--text-on-brand',     '--brand',             4.5],
  ['perigo sobre elevado',             '--danger',            '--surface-raised',    4.5],
  ['marca sutil',                      '--brand-subtle-fg',   '--brand-subtle-bg',   4.5],
  ['status pendente',                  '--status-pending-fg', '--status-pending-bg', 4.5],
  ['status em andamento',              '--status-progress-fg','--status-progress-bg',4.5],
  ['status resolvido',                 '--status-resolved-fg','--status-resolved-bg',4.5],
  ['status duplicado',                 '--status-duplicate-fg','--status-duplicate-bg',4.5],
  ['sinal quente',                     '--signal-hot-fg',     '--signal-hot-bg',     3.0],
  ['sinal subindo',                    '--signal-rising-fg',  '--signal-rising-bg',  3.0],
  ['sinal recente',                    '--signal-fresh-fg',   '--signal-fresh-bg',   3.0],
];

let failures = 0;
let checked = 0;

for (const [themeName, scope] of [['claro', semanticLight], ['escuro', semanticDark]]) {
  console.log(`\nTema ${themeName}`);
  for (const [label, fgToken, bgToken, min] of PAIRS) {
    const fg = resolveRgb(scope[fgToken] ?? semanticLight[fgToken], scope);
    const bg = resolveRgb(scope[bgToken] ?? semanticLight[bgToken], scope);
    if (!fg || !bg) {
      console.log(`  ?  ${label}: nao foi possivel resolver ${fgToken} / ${bgToken}`);
      failures += 1;
      continue;
    }
    checked += 1;
    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'OK ' : 'FAIL'} ${label}: ${ratio.toFixed(2)}:1 (minimo ${min}:1)`
    );
  }
}

console.log(`\n${checked} pares verificados, ${failures} reprovados.`);
process.exit(failures > 0 ? 1 : 0);
