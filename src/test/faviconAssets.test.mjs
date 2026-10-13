import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const assertPng = (bytes, size) => {
  assert.deepEqual(bytes.subarray(0, 8), pngSignature, 'o arquivo deve conter PNG binário, não Base64/CDATA');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
};

test('favicons e ícones do manifest são PNGs válidos nas dimensões declaradas', async () => {
  for (const size of [16, 32, 48, 96]) {
    assertPng(await read(`public/favicon-${size}x${size}.png`), size);
  }
  assertPng(await read('public/apple-touch-icon.png'), 180);
  const manifest = JSON.parse(await read('public/manifest.json'));
  for (const icon of manifest.icons) {
    assertPng(await read(`public${icon.src}`), Number(icon.sizes.split('x')[0]));
  }
});

test('favicon.ico contém imagens decodificáveis com offsets e tamanhos válidos', async () => {
  const ico = await read('public/favicon.ico');
  assert.deepEqual(ico.subarray(0, 4), Buffer.from([0, 0, 1, 0]));
  const count = ico.readUInt16LE(4);
  assert.equal(count, 5);
  let offset = 6 + count * 16;
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const size = ico[entry] || 256;
    const length = ico.readUInt32LE(entry + 8);
    assert.equal(ico[entry], ico[entry + 1]);
    assert.equal(ico.readUInt32LE(entry + 12), offset);
    assertPng(ico.subarray(offset, offset + length), size);
    offset += length;
  }
  assert.equal(offset, ico.length);
});

test('a home declara um favicon grande e estável sem depender do React', async () => {
  const html = (await read('index.html')).toString();
  const head = html.split('</head>')[0];
  assert.match(head, /<link rel="icon" type="image\/png" sizes="96x96" href="\/favicon-96x96\.png"/);
  const urls = [...head.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(urls).size, urls.length, 'evitar referências duplicadas');
  for (const url of urls) assert.ok((await read(`public${url}`)).length > 0);
});
