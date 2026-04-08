import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const gradlePath = path.join(repoRoot, 'android', 'app', 'build.gradle');

const nextInt = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n + 1;
};

const main = async () => {
  const raw = await fs.readFile(gradlePath, 'utf8');
  const re = /^(\s*versionCode\s+)(\d+)(\s*)$/m;
  const m = raw.match(re);
  if (!m) {
    throw new Error(`Não encontrei versionCode em: ${gradlePath}`);
  }

  const current = Number(m[2]);
  const bumped = nextInt(current);
  if (!bumped) {
    throw new Error(`versionCode inválido: ${m[2]}`);
  }

  const updated = raw.replace(re, `$1${bumped}$3`);
  await fs.writeFile(gradlePath, updated, 'utf8');

  process.stdout.write(`versionCode: ${current} -> ${bumped}\n`);
};

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`);
  process.exit(1);
});
