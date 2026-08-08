#!/usr/bin/env node
// Valida os pares texto/fundo dos tokens semanticos contra WCAG AA,
// nos temas claro e escuro. Sem dependencias externas.

import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  ['cta principal',                    '--cta-fg',            '--cta-bg',            4.5],
  // --- Pins do mapa: icone sobre o corpo do pin ---
  // O corpo troca de tom entre os temas e o icone inverte junto, entao os dois
  // lados precisam ser checados. Sem estes pares, uma cor de categoria pode
  // reprovar AA sem nada acusar.
  ['pin buracos',                      '--pin-pothole-fg',    '--pin-pothole-bg',    4.5],
  ['pin iluminacao',                   '--pin-lighting-fg',   '--pin-lighting-bg',   4.5],
  ['pin esgoto',                       '--pin-sewage-fg',     '--pin-sewage-bg',     4.5],
  ['pin limpeza',                      '--pin-cleaning-fg',   '--pin-cleaning-bg',   4.5],
  ['pin poda',                         '--pin-greenery-fg',   '--pin-greenery-bg',   4.5],
  ['pin vazamento de agua',            '--pin-waterleak-fg',  '--pin-waterleak-bg',  4.5],
  ['pin seguranca',                    '--pin-security-fg',   '--pin-security-bg',   4.5],
  ['pin outros',                       '--pin-other-fg',      '--pin-other-bg',      4.5],
  ['pin em alta',                      '--pin-hot-fg',        '--pin-hot-bg',        4.5],
  ['pin imovel ativo',                 '--pin-rental-active-fg',  '--pin-rental-active-bg',  4.5],
  ['pin imovel inativo',               '--pin-rental-inactive-fg','--pin-rental-inactive-bg',4.5],
  ['pin obra prevista',                '--pin-work-planned-fg',   '--pin-work-planned-bg',   4.5],
  ['pin obra licitada',                '--pin-work-tendered-fg',  '--pin-work-tendered-bg',  4.5],
  ['pin obra em andamento',            '--pin-work-progress-fg',  '--pin-work-progress-bg',  4.5],
  ['pin obra paralisada',              '--pin-work-stalled-fg',   '--pin-work-stalled-bg',   4.5],
  ['pin obra inacabada',               '--pin-work-unfinished-fg','--pin-work-unfinished-bg',4.5],
  ['pin obra concluida',               '--pin-work-completed-fg', '--pin-work-completed-bg', 4.5],
  ['pin obra desconhecida',            '--pin-work-unknown-fg',   '--pin-work-unknown-bg',   4.5],
  ['pin pavimentada',                  '--pin-pav-paved-fg',     '--pin-pav-paved-bg',     4.5],
  ['pin parcialmente pavimentada',     '--pin-pav-partial-fg',   '--pin-pav-partial-bg',   4.5],
  ['pin sem pavimentacao',             '--pin-pav-unpaved-fg',   '--pin-pav-unpaved-bg',   4.5],
  ['pin pavimentacao n/a',             '--pin-pav-unknown-fg',   '--pin-pav-unknown-bg',   4.5],
  ['badge de obra no pin',             '--pin-badge-fg',         '--pin-badge-bg',         4.5],
  ['cluster poucos',                   '--pin-cluster-low-fg',   '--pin-cluster-low-bg',   4.5],
  ['cluster medio',                    '--pin-cluster-mid-fg',   '--pin-cluster-mid-bg',   4.5],
  ['cluster muitos',                   '--pin-cluster-high-fg',  '--pin-cluster-high-bg',  4.5],
  // O anel separa o pin do mapa, nao carrega texto: limiar de elemento grafico.
  // Checa as duas pontas da faixa de luminancia das categorias.
  ['anel do pin sobre iluminacao',     '--pin-ring',          '--pin-lighting-bg',   3.0],
  ['anel do pin sobre outros',         '--pin-ring',          '--pin-other-bg',      3.0],
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

// ============================================================
// Sincronia da ponte HSL x tokens semanticos RGB.
// Os tokens shadcn legados sao consumidos por hsl(var(--x)) e por isso
// duplicam, em HSL, valores que os semanticos definem em RGB. Essa
// duplicacao ja dessincronizou duas vezes neste projeto (--muted-foreground
// e --ring), com efeito visivel e sem erro de build. Aqui isso e verificado.
// ============================================================

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function parseHsl(value) {
  if (!value) return null;
  const nums = value.trim().replace(/%/g, '').split(/\s+/).map(Number);
  if (nums.length === 3 && nums.every((n) => Number.isFinite(n))) return nums;
  return null;
}

// [tokenLegadoHSL, tokenSemanticoRGB]
const BRIDGE = [
  ['--background', '--surface-base'],
  ['--foreground', '--text-primary'],
  ['--card', '--surface-raised'],
  ['--card-foreground', '--text-primary'],
  ['--popover', '--surface-overlay'],
  ['--popover-foreground', '--text-primary'],
  ['--primary', '--brand'],
  ['--primary-foreground', '--text-on-brand'],
  ['--muted-foreground', '--text-secondary'],
  ['--destructive', '--danger'],
  ['--border', '--border-subtle'],
  ['--input', '--border-subtle'],
  ['--ring', '--brand'],
];

// Tolerancia por canal: hue 1.5 grau, saturacao e lightness 1.5 ponto.
const TOL = [1.5, 1.5, 1.5];

console.log('\nSincronia da ponte HSL');
let bridgeChecked = 0;

for (const [themeName, scope] of [['claro', semanticLight], ['escuro', semanticDark]]) {
  for (const [legacyToken, semanticToken] of BRIDGE) {
    const declared = parseHsl(scope[legacyToken]);
    const rgb = resolveRgb(scope[semanticToken] ?? semanticLight[semanticToken], scope);
    if (!declared || !rgb) {
      console.log(`  ?  [${themeName}] ${legacyToken}: nao foi possivel comparar com ${semanticToken}`);
      failures += 1;
      continue;
    }
    bridgeChecked += 1;
    const expected = rgbToHsl(rgb);
    // Hue e circular e irrelevante quando a cor e quase acromatica.
    const isAchromatic = expected[1] < 5 && declared[1] < 5;
    const delta = expected.map((v, i) => Math.abs(v - declared[i]));
    if (isAchromatic) delta[0] = 0;
    const ok = delta.every((d, i) => d <= TOL[i]);
    if (!ok) failures += 1;
    if (!ok) {
      console.log(
        `  FAIL [${themeName}] ${legacyToken} nao espelha ${semanticToken}: ` +
        `declarado ${declared.map((n) => +n.toFixed(1)).join(' ')} vs esperado ${expected.map((n) => +n.toFixed(1)).join(' ')}`
      );
    }
  }
}

console.log(`  ${bridgeChecked} pares de ponte verificados.`);

// ============================================================
// Os tokens chegaram ao CSS compilado?
// Se os @import de tokens ficarem depois das diretivas @tailwind em
// src/index.css, o PostCSS os descarta EM SILENCIO — o build passa, as
// classes existem, mas rgb(var(--token)) vira cor invalida e os elementos
// ficam transparentes. Foi assim que o tema escuro deixou de funcionar uma vez.
// ============================================================

const distDir = resolve(__dirname, '../dist/assets');
let bundle = null;
try {
  const files = readdirSync(distDir).filter((f) => f.endsWith('.css'));
  if (files.length > 0) {
    const newest = files
      .map((f) => ({ f, t: statSync(resolve(distDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    bundle = readFileSync(resolve(distDir, newest), 'utf8');
  }
} catch {}

if (!bundle) {
  console.log('\nBundle CSS ausente (rode npm run build para verificar a compilacao dos tokens).');
} else {
  console.log('\nTokens no CSS compilado');
  const required = ['--tc-red-600', '--surface-base', '--brand', '--text-primary'];
  const missing = required.filter((t) => !bundle.includes(`${t}:`));
  const hasDark = /\.dark\s*\{/.test(bundle);
  if (missing.length > 0) {
    console.log(`  FAIL tokens ausentes no bundle: ${missing.join(', ')}`);
    console.log('       Verifique se os @import de tokens estao ANTES das diretivas @tailwind em src/index.css.');
    failures += missing.length;
  } else if (!hasDark) {
    console.log('  FAIL bundle sem regras .dark — o tema escuro nao vai funcionar.');
    failures += 1;
  } else {
    console.log('  OK  tokens e bloco .dark presentes no bundle.');
  }
}

console.log(`\n${checked} pares de contraste verificados, ${failures} reprovados.`);
process.exit(failures > 0 ? 1 : 0);
