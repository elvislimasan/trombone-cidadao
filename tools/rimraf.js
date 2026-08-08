#!/usr/bin/env node
/**
 * Remove um diretório de forma portátil (Windows/Linux/macOS).
 *
 * Os scripts de clean usavam `rm -rf ... || rmdir /s /q ...`. No PowerShell o
 * `rm` existe (alias de Remove-Item), mas os scripts do npm rodam via cmd.exe,
 * onde `rm` não existe — e o fallback com `rmdir` nem sempre pegava, deixando
 * o dist/ num estado sujo entre builds.
 *
 * Nunca falha: se o caminho não existe, sai em silêncio (é o comportamento
 * esperado de um "clean").
 */
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('uso: node tools/rimraf.js <caminho>');
  process.exit(1);
}

const full = path.resolve(process.cwd(), target);

// Trava de segurança: nunca apagar a raiz do projeto nem fora dela.
const root = path.resolve(process.cwd());
if (full === root || !full.startsWith(root)) {
  console.error(`[rimraf] recusando apagar caminho fora do projeto: ${full}`);
  process.exit(1);
}

try {
  fs.rmSync(full, { recursive: true, force: true });
} catch (err) {
  // force:true já ignora "não existe"; outros erros (arquivo em uso) não devem
  // derrubar o build — o vite sobrescreve o que precisar.
  console.warn(`[rimraf] aviso ao limpar ${target}: ${err.message}`);
}
