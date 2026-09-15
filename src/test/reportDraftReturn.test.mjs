import test from 'node:test';
import assert from 'node:assert/strict';
import { reportReturnLocation } from '@/lib/reportReturn';
import { serializeDraftMedia, restoreDraftMedia, saveReportDraftMedia } from '@/lib/reportDraft';

test('login retains the report origin and map filters without duplicating the creation flag', () => {
  assert.deepEqual(reportReturnLocation({ pathname: '/mapa', search: '?rua=123&criar_bronca=true' }), { pathname: '/mapa', search: '?rua=123&criar_bronca=1' });
  assert.deepEqual(reportReturnLocation({ pathname: '/feed', search: '?origem=perfil' }), { pathname: '/feed', search: '?origem=perfil&criar_bronca=1' });
  assert.equal(reportReturnLocation({ pathname: '/' }).pathname, '/');
});

test('unsupported and external origins fall back to a page that can restore the wizard', () => {
  for (const pathname of ['/explorar', '//example.com', 'https://example.com', '/login']) {
    assert.deepEqual(reportReturnLocation({ pathname }), { pathname: '/feed', search: '?criar_bronca=1' });
  }
});

test('photo and video files survive serialization with their bytes and type', async () => {
  for (const [kind, name, type] of [['photo', 'rua.jpg', 'image/jpeg'], ['video', 'rua.mp4', 'video/mp4']]) {
    const file = new File(['evidence-bytes'], name, { type, lastModified: 123 });
    const saved = serializeDraftMedia({ file }, kind);
    const restored = restoreDraftMedia(structuredClone(saved));
    assert.equal(restored.name, name);
    assert.equal(restored.file.type, type);
    assert.equal(await restored.file.text(), 'evidence-bytes');
    assert.equal(restored.isProcessing, false);
  }
});

test('native media retains its file path without copying large videos into memory', () => {
  const restored = restoreDraftMedia(serializeDraftMedia({ nativePath: 'file:///data/video.mp4', name: 'video.mp4' }, 'video'));
  assert.equal(restored.nativePath, 'file:///data/video.mp4');
  assert.equal(restored.file, undefined);
});

test('unrecoverable attachments block login navigation instead of silently disappearing', async () => {
  assert.equal(await saveReportDraftMedia({ videos: [{ preview: 'blob:expired', isProcessing: true }] }), false);
  assert.equal(await saveReportDraftMedia({ photos: [], videos: [] }), true);
});
