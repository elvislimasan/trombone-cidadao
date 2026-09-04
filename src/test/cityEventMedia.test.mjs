// A foto do acontecimento: validação e montagem do caminho no Storage.
//   node --test src/test/cityEventMedia.test.mjs
//
// O teste que mais importa é o do PRIMEIRO SEGMENTO do caminho. A policy do
// bucket (migração 209) lê `split_part(name, '/', 1)::bigint` para decidir se
// quem enviou pode publicar naquela cidade. Se o caminho deixar de começar pelo
// city_id — ou se um nome de arquivo conseguir injetar uma barra e empurrar o
// id para outra posição — a autorização passa a olhar para o segmento errado.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CITY_EVENT_BUCKET,
  CITY_EVENT_IMAGE_ACCEPT,
  caminhoDaImagem,
  cityEventMimeType,
  validarImagemDeAcontecimento,
} from '../lib/cityEventMedia.js';

const arquivo = (nome, tipo, bytes = 1024) => ({ name: nome, type: tipo, size: bytes });

// ── Validação ────────────────────────────────────────────────────────────────

test('aceita os formatos que o bucket declara', () => {
  for (const mime of CITY_EVENT_IMAGE_ACCEPT.split(',')) {
    assert.equal(validarImagemDeAcontecimento(arquivo('foto.jpg', mime)), '');
  }
});

test('recusa o que o bucket recusaria', () => {
  // PDF passa no bucket da pavimentação e não neste. Deixar passar aqui daria
  // um erro cru do Storage em vez de uma frase que diz o que fazer.
  assert.match(validarImagemDeAcontecimento(arquivo('doc.pdf', 'application/pdf')), /JPG, PNG, WebP ou AVIF/);
  assert.match(validarImagemDeAcontecimento(arquivo('v.mp4', 'video/mp4')), /JPG, PNG, WebP ou AVIF/);
});

test('recusa acima de 5 MB — o limite do bucket', () => {
  assert.equal(validarImagemDeAcontecimento(arquivo('g.jpg', 'image/jpeg', 5 * 1024 * 1024)), '');
  assert.match(validarImagemDeAcontecimento(arquivo('g.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)), /5 MB/);
});

test('sem arquivo, a mensagem diz o que fazer', () => {
  assert.match(validarImagemDeAcontecimento(null), /Selecione/);
});

test('a extensão salva o arquivo que veio sem type', () => {
  // A câmera nativa às vezes devolve File sem `type`. Recusar por isso faria a
  // foto tirada na hora ser rejeitada.
  assert.equal(cityEventMimeType(arquivo('foto.JPG', '')), 'image/jpeg');
  assert.equal(cityEventMimeType(arquivo('foto.webp', undefined)), 'image/webp');
  assert.equal(validarImagemDeAcontecimento(arquivo('foto.PNG', '')), '');
});

test('sem type e sem extensão conhecida, recusa', () => {
  assert.match(validarImagemDeAcontecimento(arquivo('coisa', '')), /JPG, PNG, WebP ou AVIF/);
});

// ── Caminho ──────────────────────────────────────────────────────────────────

test('o caminho começa pelo city_id — é o que a policy lê', () => {
  const p = caminhoDaImagem({ cityId: 42, fileName: 'cano.jpg' });
  assert.equal(p.split('/')[0], '42');
});

test('cidade inválida não gera caminho', () => {
  // Um caminho com primeiro segmento não numérico faria a policy comparar
  // `split_part(...)::bigint` com lixo e derrubar a query inteira.
  for (const ruim of [null, undefined, '', 'abc', '4 2', '42; drop']) {
    assert.throws(() => caminhoDaImagem({ cityId: ruim, fileName: 'a.jpg' }), /Cidade inválida/);
  }
});

test('nome de arquivo não consegue criar segmento novo', () => {
  // Sem a limpeza, "../99/x.jpg" viraria um caminho cujo primeiro segmento não
  // é mais o city_id — e a policy autorizaria olhando para a cidade errada.
  const p = caminhoDaImagem({ cityId: 7, fileName: '../99/x.jpg' });
  assert.equal(p.split('/').length, 2);
  assert.equal(p.split('/')[0], '7');
  assert.ok(!p.includes('..'));
});

test('acento e espaço saem do nome', () => {
  const p = caminhoDaImagem({ cityId: 1, fileName: 'Água na Rua São João.jpg' });
  assert.match(p, /^1\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/);
  assert.ok(p.endsWith('.jpg'));
});

test('nome vazio ainda produz caminho válido', () => {
  const p = caminhoDaImagem({ cityId: 3, fileName: '' });
  assert.match(p, /^3\/[0-9a-f-]{36}-foto$/);
});

test('dois envios do mesmo arquivo não colidem', () => {
  // O upload usa `upsert: false`; sem o uuid, a segunda foto com o mesmo nome
  // falharia com "already exists".
  const a = caminhoDaImagem({ cityId: 5, fileName: 'foto.jpg' });
  const b = caminhoDaImagem({ cityId: 5, fileName: 'foto.jpg' });
  assert.notEqual(a, b);
});

test('o bucket é o que a migração 209 cria', () => {
  assert.equal(CITY_EVENT_BUCKET, 'city-events');
});
