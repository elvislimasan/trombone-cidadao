import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { issueReportMediaAccess, verifyReportMediaAccess } from '../../supabase/functions/_shared/reportMediaAccess.js';

const reportId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const secret = 'test-only-signing-key';

test('autorização anônima só vale para a mesma bronca e expira em sete dias', async () => {
  const now = 1000000;
  const token = await issueReportMediaAccess(reportId, secret, now);
  assert.equal(await verifyReportMediaAccess(reportId, token, secret, now + 1), true);
  assert.equal(await verifyReportMediaAccess('other-report', token, secret, now + 1), false);
  assert.equal(await verifyReportMediaAccess(reportId, token, 'wrong-key', now + 1), false);
  assert.equal(await verifyReportMediaAccess(reportId, token, secret, now + 7 * 86400000), false);
  assert.equal(await verifyReportMediaAccess(reportId, token + '.extra', secret, now), false);
  assert.equal(await verifyReportMediaAccess(reportId, token.replace(/.$/, token.endsWith('a') ? 'b' : 'a'), secret, now), false);
});

const source = fs.readFileSync(new URL('../../supabase/functions/report-media/index.ts', import.meta.url), 'utf8').replace(/^import .+\r?\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture({ authorId = 'author', userId = 'author', admin = false, master = false, ambassador = false, isPublic = true, moderationStatus = 'approved', stored = false, existing = null, uploadFails = false } = {}) {
  let handler;
  const calls = [], inserted = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: ambassador }; },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: table === 'reports'
          ? { id: reportId, author_id: authorId, is_anonymous: !authorId, city_id: 64, is_public: isPublic, moderation_status: moderationStatus }
          : table === 'profiles' ? { is_admin: admin, is_master: master } : existing }),
        upsert: async (value, options) => { inserted.push({ value, options }); return {}; },
      };
      return query;
    },
    storage: { from: () => ({
      list: async () => ({ data: stored ? [{ name: `${mediaId}.jpg`, metadata: { size: 123, mimetype: 'image/jpeg' } }] : [] }),
      createSignedUploadUrl: async path => { calls.push({ path }); return uploadFails ? { error: new Error('storage unavailable') } : { data: { signedUrl: `https://test/${path}` } }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://test/public/${path}` } }),
    }) },
  };
  // eslint-disable-next-line no-new-func -- Exercita o endpoint real com banco e autenticação controlados.
  new Function('serve', 'createClient', 'Deno', 'verifyReportMediaAccess', 'console', code)(fn => { handler = fn; }, () => client, { env: { get: () => secret } }, verifyReportMediaAccess, { error() {} });
  return { calls, inserted, request: (action = 'prepare', extra = {}) => handler(new Request('https://test/report-media', {
    method: 'POST', headers: { Authorization: 'Bearer test' },
    body: JSON.stringify({ action, reportId, media: { id: mediaId, type: 'photo', contentType: 'image/jpeg', name: 'photo.jpg' }, ...extra }),
  })) };
}

test('autor pode preparar upload e visitante ou outra conta não podem', async () => {
  assert.equal((await fixture().request()).status, 200);
  for (const userId of [null, 'other-user']) assert.equal((await fixture({ userId }).request()).status, 403);
});

test('moderador adiciona fotos com checagem da cidade e não acessa bronca interna por embaixadoria', async () => {
  for (const roles of [{ admin: true }, { master: true }, { ambassador: true }]) {
    const view = fixture({ userId: 'moderator', ...roles });
    assert.equal((await view.request()).status, 200);
    assert.ok(view.calls.some(call => call.name === 'is_ambassador_of' && call.args.p_city_id === 64));
  }
  assert.equal((await fixture({ userId: 'moderator', ambassador: false }).request()).status, 403);
  assert.equal((await fixture({ userId: 'moderator', ambassador: true, isPublic: false }).request()).status, 403);
  assert.equal((await fixture({ userId: 'moderator', admin: true, isPublic: false }).request()).status, 200);
});

test('envio anônimo exige autorização da bronca, não aceita apenas ID ou protocolo', async () => {
  const token = await issueReportMediaAccess(reportId, secret);
  assert.equal((await fixture({ authorId: null, userId: null }).request('prepare', { recoveryToken: token })).status, 200);
  assert.equal((await fixture({ authorId: null, userId: null }).request()).status, 403);
  assert.equal((await fixture({ authorId: null, userId: null }).request('prepare', { recoveryToken: 'TROMB-1' })).status, 403);
});

test('anexo só entra na galeria depois de o arquivo existir e finalizar novamente não duplica', async () => {
  const absent = fixture();
  assert.equal((await absent.request('complete')).status, 409);
  assert.deepEqual(absent.inserted, []);
  const complete = fixture({ stored: true });
  assert.equal((await complete.request('complete')).status, 200);
  assert.equal(complete.inserted[0].value.report_id, reportId);
  assert.equal(complete.inserted[0].value.id, mediaId);
  assert.deepEqual(complete.inserted[0].options, { onConflict: 'id', ignoreDuplicates: true });
  const repeated = fixture({ existing: { id: mediaId, report_id: reportId } });
  assert.deepEqual(await (await repeated.request('complete')).json(), { completed: true });
  assert.deepEqual(repeated.inserted, []);
});

test('preparar reenvio reconhece bytes já recebidos e falhas não excluem broncas', async () => {
  assert.equal((await (await fixture({ stored: true }).request()).json()).uploaded, true);
  assert.equal((await fixture({ uploadFails: true }).request()).status, 500);
  assert.equal((await fixture({ existing: { id: mediaId, report_id: 'other-report' } }).request()).status, 403);
  assert.equal((await fixture({ moderationStatus: 'rejected' }).request()).status, 404);
});
