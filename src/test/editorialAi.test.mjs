import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorialHandler, requestEditorialDraft, validateEditorialShape } from '../../supabase/functions/_shared/editorialAi.js';
import { normalizeEditorialBrief, editorialBriefKey, editorialSpeakerOptions } from '../../supabase/functions/_shared/editorialStyle.js';

const candidateId = '10000000-0000-0000-0000-000000000001';
const requestId = '20000000-0000-0000-0000-000000000001';
const contentId = '30000000-0000-0000-0000-000000000001';
const content = { title: 'Floresta: obras registradas como paralisadas', title_fact_ids: ['F2'], blocks: [{ text: 'Os dados representam os cadastros da plataforma.', fact_ids: ['F1'] }] };
const context = { generation_id: requestId, format: 'news', snapshot: { city_name: 'Floresta', facts: [{ id: 'F1', text: '60 obras cadastradas' }], limitations: ['Não é um censo municipal.'], sources: [{ private_field: 'NEVER_SEND' }] } };
const payload = { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'RACIOCÍNIO_INTERNO' }, { text: JSON.stringify(content) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30 } };

test('resposta do provedor preserva somente campos editoriais e não expõe raciocínio', async () => {
  let sent;
  const result = await requestEditorialDraft({ apiKey: 'secret', model: 'configured-model', context, fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body); return Response.json(payload);
  } });
  assert.deepEqual(result.content, content);
  assert.equal(result.usage.input_tokens, 100);
  assert.ok(!JSON.stringify(sent).includes('NEVER_SEND'));
  assert.ok(!JSON.stringify(result).includes('RACIOCÍNIO_INTERNO'));
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
});

test('redação recebe o assunto e as regras próprias, sem enviar fontes brutas ao provedor', async () => {
  for (const module of ['reports', 'streets', 'arborization']) {
    let sent;
    await requestEditorialDraft({ apiKey: 'secret', model: 'configured-model',
      context: { ...context, snapshot: { ...context.snapshot, module, topic_key: `${module}.test` } },
      fetchImpl: async (url, options) => { sent = JSON.parse(options.body); return Response.json(payload); },
    });
    const input = JSON.parse(sent.contents[0].parts[0].text);
    assert.equal(input.module, module);
    assert.equal(input.topic, `${module}.test`);
    assert.ok(!JSON.stringify(sent).includes('NEVER_SEND'));
    const policy = sent.systemInstruction.parts[0].text;
    assert.match(policy, /Local planejado|local planejado/);
    assert.match(policy, /percentual de cadastros|percentual de extensão|percentual da extensão/);
    assert.match(policy, /não identificar|Não identificar/);
  }
});

test('bloqueia resposta incompleta, HTML e ausência de referências', async () => {
  for (const value of [null, {}, { ...content, title_fact_ids: [] }, { ...content, blocks: [{ text: '<b>Texto</b>', fact_ids: ['F1'] }] }, { ...content, title_fact_ids: ['F99'] }]) {
    assert.throws(() => validateEditorialShape(value));
  }
  await assert.rejects(() => requestEditorialDraft({ apiKey: 'secret', model: 'configured-model', context,
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
  }), /não concluiu/);
});

function harness({ authenticated = true, cached = false, reserveError, providerFails = false, envMissing = false } = {}) {
  const calls = []; let fetchCount = 0;
  const handler = createEditorialHandler({
    getEnv: name => envMissing ? undefined : ({ SUPABASE_URL: 'https://local.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'backend', GEMINI_API_KEY: 'secret', EDITORIAL_GEMINI_MODEL: 'configured-model' })[name],
    createClient: (url, key) => ({
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'editor' } : null } }) },
      rpc: async (name, args) => {
        calls.push({ key, name, args });
        if (name === 'editorial_reserve_generation_styled') return reserveError ? { error: reserveError } : { data: cached ? { cached_content_id: contentId } : { ...context, brief: args.p_brief } };
        return { data: contentId };
      },
    }),
    fetchImpl: async () => { fetchCount++; return providerFails ? new Response('', { status: 503 }) : Response.json(payload); },
  });
  const request = (body = {}, auth = true) => new Request('https://local.invalid/editorial-generate', { method: 'POST',
    headers: auth ? { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' } : {},
    body: JSON.stringify({ candidate_id: candidateId, request_id: requestId, format: 'news', base_revision: 0, instruction: '', ...body }),
  });
  return { handler, calls, request, fetchCount: () => fetchCount };
}

test('autentica e valida a solicitação antes de consumir cota ou chamar IA', async () => {
  const h = harness();
  assert.equal((await h.handler(h.request({}, false))).status, 401);
  assert.equal((await h.handler(h.request({ candidate_id: 'invalid' }))).status, 400);
  assert.equal((await h.handler(h.request({ format: 'toString' }))).status, 400);
  assert.equal((await h.handler(new Request('https://local.invalid/editorial-generate', {
    method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: 'null',
  }))).status, 400);
  assert.equal(h.calls.length, 0);
  assert.equal(h.fetchCount(), 0);
  const unsigned = harness({ authenticated: false });
  assert.equal((await unsigned.handler(unsigned.request())).status, 401);
  const missing = harness({ envMissing: true });
  assert.equal((await missing.handler(missing.request())).status, 503);
});

test('pauta existente retorna conteúdo sem chamar o provedor', async () => {
  const h = harness({ cached: true });
  const result = await h.handler(h.request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { content_id: contentId, reused: true });
  assert.equal(h.fetchCount(), 0);
});

test('a reserva usa JWT do editor e a finalização usa somente o backend', async () => {
  const h = harness();
  assert.equal((await h.handler(h.request())).status, 200);
  assert.equal(h.calls[0].key, 'anon');
  assert.equal(h.calls[0].name, 'editorial_reserve_generation_styled');
  assert.equal(h.calls[1].key, 'backend');
  assert.equal(h.calls[1].name, 'editorial_finish_generation');
  assert.deepEqual(h.calls[1].args.p_content, content);
});

test('estilos têm validação fechada e o cache ignora somente preferências de outro formato', () => {
  const brief = normalizeEditorialBrief({ tone: 'humorous', news_style: 'explainer', video_style: 'dialogue', guidance: ' Mais próximo. ' });
  assert.equal(brief.guidance, 'Mais próximo.');
  assert.equal(brief.schema_version, 1);
  for (const invalid of [null, [], { tone: 'toString' }, { tone: 'unknown' }, { guidance: '<script>texto</script>' }, { guidance: 'a'.repeat(1001) }]) {
    assert.throws(() => normalizeEditorialBrief(invalid));
  }
  assert.equal(editorialBriefKey(brief, 'news'), editorialBriefKey({ ...brief, video_style: 'presenter' }, 'news'));
  assert.notEqual(editorialBriefKey(brief, 'video_60'), editorialBriefKey({ ...brief, video_style: 'presenter' }, 'video_60'));
  assert.notEqual(editorialBriefKey(brief, 'news'), editorialBriefKey({ ...brief, tone: 'informative' }, 'news'));
});

test('roteiros exigem falas, cenas e os papéis compatíveis, incluindo os dois apresentadores no diálogo', async () => {
  for (const video_style of ['presenter', 'voiceover', 'dialogue']) {
    const brief = normalizeEditorialBrief({ tone: 'humorous', video_style, guidance: 'Uma abertura natural.' });
    const speakers = editorialSpeakerOptions(brief);
    const script = { ...content, blocks: speakers.map(speaker => ({ text: 'Veja o que os registros mostram.', fact_ids: ['F1'], speaker, scene: 'Apresentação com mapa dos registros.', screen_text: '' })) };
    let sent;
    const result = await requestEditorialDraft({ apiKey: 'secret', model: 'configured-model', context: { ...context, format: 'video_60', brief },
      fetchImpl: async (url, options) => { sent = JSON.parse(options.body); return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(script) }] } }] }); },
    });
    assert.deepEqual(result.content, script);
    const input = JSON.parse(sent.contents[0].parts[0].text);
    assert.equal(input.tone, 'humorous');
    assert.match(input.tone_direction, /humor leve/);
    assert.equal(input.style_guidance, 'Uma abertura natural.');
    assert.deepEqual(sent.generationConfig.responseSchema.properties.blocks.items.properties.speaker.enum, speakers);
    assert.ok(sent.generationConfig.responseSchema.properties.blocks.items.required.includes('scene'));
  }
  const options = { format: 'video_60', brief: { video_style: 'dialogue' } };
  assert.throws(() => validateEditorialShape(content, options), /roteiro/);
  assert.throws(() => validateEditorialShape({ ...content, blocks: [{ text: 'Veja os dados públicos.', fact_ids: ['F1'], speaker: 'presenter_a', scene: 'Usar mapa.', screen_text: '' }] }, options), /dois apresentadores/);
});

test('perfil inválido é recusado antes da reserva e perfil válido acompanha a solicitação', async () => {
  const h = harness();
  for (const brief of [null, { tone: 'constructor' }, { video_style: 'entrevista_com_prefeito' }, { guidance: {} }]) {
    assert.equal((await h.handler(h.request({ brief }))).status, 400);
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await h.handler(h.request({ brief: { tone: 'humorous', news_style: 'story' } }))).status, 200);
  assert.equal(h.calls[0].args.p_brief.tone, 'humorous');
  assert.equal(h.calls[0].args.p_brief.news_style, 'story');
});

test('falha do provedor é persistida sem apagar o conteúdo anterior', async () => {
  const h = harness({ providerFails: true });
  const result = await h.handler(h.request());
  assert.equal(result.status, 502);
  assert.equal(h.calls.at(-1).args.p_error_code, 'generation_failed');
  assert.equal(h.calls.at(-1).args.p_content, null);
});

test('negação de acesso e teto diário impedem chamadas ao provedor', async () => {
  for (const [error, status] of [[{ code: '42501', message: 'Pauta indisponível.' }, 403], [{ code: 'P0001', message: 'Limite diário de IA da cidade atingido.' }, 429]]) {
    const h = harness({ reserveError: error });
    assert.equal((await h.handler(h.request())).status, status);
    assert.equal(h.fetchCount(), 0);
  }
});
