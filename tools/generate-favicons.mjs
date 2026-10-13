import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('@capacitor/assets'))('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'assets/icon-only.png');
const publicDirectory = join(root, 'public');
await mkdir(publicDirectory, { recursive: true });

// Máscara vetorial circular: os cantos ficam transparentes no navegador.
const circle = Buffer.from('<svg width="1024" height="1024"><circle cx="512" cy="512" r="512" fill="white"/></svg>');
const roundSource = await sharp(source).resize(1024, 1024).ensureAlpha()
  .composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();

for (const [filename, size] of [
  ['favicon-16x16.png', 16], ['favicon-32x32.png', 32],
  ['favicon-48x48.png', 48], ['favicon-96x96.png', 96],
  ['apple-touch-icon.png', 180], ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]) {
  const favicon = filename.startsWith('favicon-');
  const image = sharp(favicon ? roundSource : source).resize(size, size);
  await (favicon ? image.ensureAlpha() : image.removeAlpha())
    .png({ compressionLevel: 9 }).toFile(join(publicDirectory, filename));
}

// ICO real com imagens PNG internas; não salvar Base64/CDATA em arquivos de imagem.
const sizes = [16, 32, 48, 96, 256];
const images = await Promise.all(sizes.map((size) =>
  sharp(roundSource).resize(size, size).ensureAlpha().png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(join(publicDirectory, 'favicon.ico'), Buffer.concat([header, ...images]));
console.log('Favicons PNG e ICO redondos gerados a partir da logo do Trombone.');
