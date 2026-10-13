import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Usa a dependência de processamento de imagens do gerador Capacitor instalado.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('@capacitor/assets'))('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'assets/icon-only.png');
const background = join(root, 'assets/icon-background.svg');
const android = join(root, 'android/app/src/main/res');
const brown = '#4a2121';

const save = async (pipeline, path) => {
  await mkdir(dirname(path), { recursive: true });
  await pipeline.png({ compressionLevel: 9 }).toFile(path);
};

const master = await sharp(source).resize(1024, 1024).removeAlpha().png().toBuffer();
await writeFile(source, master);
await save(sharp(master), join(root, 'assets/stores/app-store-1024.png'));
await save(sharp(master).resize(512, 512).ensureAlpha(), join(root, 'assets/stores/google-play-512.png'));
await save(sharp(master), join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));

const densities = [
  ['ldpi', 36, 81], ['mdpi', 48, 108], ['hdpi', 72, 162],
  ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];

for (const [density, size, adaptiveSize] of densities) {
  const directory = join(android, `mipmap-${density}`);
  await save(sharp(master).resize(size, size), join(directory, 'ic_launcher.png'));
  const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  await save(sharp(master).resize(size, size).ensureAlpha()
    .composite([{ input: circle, blend: 'dest-in' }]), join(directory, 'ic_launcher_round.png'));
  await save(sharp(background).resize(adaptiveSize, adaptiveSize).ensureAlpha(), join(directory, 'ic_launcher_background.png'));
}

// O fundo cobre toda a máscara; o inset é aplicado apenas ao símbolo.
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
`;
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  await writeFile(join(android, 'mipmap-anydpi-v26', name), adaptiveXml);
}

const colorPath = join(android, 'values/ic_launcher_background.xml');
const colors = await readFile(colorPath, 'utf8');
await writeFile(colorPath, colors.replace(/(<color name="ic_launcher_background">)[^<]+/, `$1${brown}`));
console.log('Ícones das lojas, iOS e Android gerados com fundo marrom.');
