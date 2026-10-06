import test from 'node:test';
import assert from 'node:assert/strict';
import { streetHistoryResponseError } from '../../supabase/functions/_shared/streetHistoryResponse.js';

test('PROHIBITED_CONTENT explica bloqueio sem atribuí-lo ao homenageado', () => {
  const error = streetHistoryResponseError({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
  assert.equal(error.code, 'ai_content_blocked');
  assert.equal(error.providerReason, 'PROHIBITED_CONTENT');
  assert.match(error.message, /não identifica qual trecho/);
});

test('rascunho bloqueado ou incompleto não é aceito mesmo contendo texto parcial', () => {
  for (const [reason, code] of [['SAFETY', 'ai_content_blocked'], ['MAX_TOKENS', 'ai_output_truncated'], ['RECITATION', 'ai_recitation_blocked'], ['OTHER', 'ai_response_incomplete']]) {
    const error = streetHistoryResponseError({ candidates: [{ finishReason: reason, content: { parts: [{ text: '{"biography":"parcial"}' }] } }] });
    assert.equal(error.code, code);
  }
  assert.equal(streetHistoryResponseError({ candidates: [{ finishReason: 'STOP' }] }), null);
});
