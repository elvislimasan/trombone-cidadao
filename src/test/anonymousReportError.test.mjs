import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousReportError } from '../lib/anonymousReportError.js';

test('lê erro JSON em FunctionsHttpError sem consumir a resposta original', async () => {
  const context = Response.json({ error: 'city_unresolved' }, { status: 400 });
  const error = await anonymousReportError({ message: 'Edge Function returned a non-2xx status code', context });
  assert.equal(error.code, 'city_unresolved');
  assert.equal(error.status, 400);
  assert.match(error.message, /identificar a cidade/);
  assert.equal(context.bodyUsed, false);
});

test('mensagens de captcha, serviço antigo, poste duplicado e payload permitem recuperação', async () => {
  for (const [code, message] of [
    ['recaptcha_failed', /reCAPTCHA/], ['missing_recaptcha_token', /reCAPTCHA/],
    ['missing_media', /formulário foi mantido/i], ['duplicate_pole_report', /Já existe/],
    ['invalid_payload', /Confira os campos/], ['invalid_media', /Troque o arquivo/],
  ]) assert.match((await anonymousReportError(null, { error: code })).message, message);
});

test('resposta inválida e erro interno não mostram mensagens técnicas ao cidadão', async () => {
  const malformed = await anonymousReportError({ context: new Response('bad gateway', { status: 502 }) });
  assert.match(malformed.message, /formulário foi mantido/);
  const database = await anonymousReportError(null, { error: 'sensitive internal SQL details' });
  assert.doesNotMatch(database.message, /SQL|sensitive/);
  const offline = await anonymousReportError({ name: 'FunctionsFetchError' });
  assert.match(offline.message, /internet/);
  const unauthorized = await anonymousReportError({ context: Response.json({ message: 'Invalid JWT' }, { status: 401 }) });
  assert.match(unauthorized.message, /autorizar/);
});
