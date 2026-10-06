import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { parseOptions, savePoleAddress } from '../../scripts/backfill-pole-addresses.mjs';
import { polePosition } from '../lib/poleAddress.js';

const pole = {
  id: 46, city_id: 64, identifier: '46 - S231385', plate: null, address: null,
  latitude: -8.59994, longitude: -38.58344,
  lamp_type: 'LED', lamp_power_w: 100, lighting_status: 'aceso',
};

function client(responses = {}) {
  const calls = [];
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input);
      const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      if (url.pathname.endsWith('/poles')) {
        if (responses.updateError) return Response.json({ message: 'Falha ao atualizar' }, { status: 500 });
        return responses.updated === null
          ? Response.json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, { status: 406 })
          : Response.json({ ...pole, address: 'Rua A', ...responses.updated });
      }
      assert.ok(url.pathname.endsWith('/pole_lighting_changes'));
      return responses.historyError
        ? Response.json({ message: 'Falha no histórico' }, { status: 500 })
        : new Response(null, { status: 201 });
    } },
  });
  return { db, calls };
}

test('comando exige município e aceita simulação, poste e limite', () => {
  assert.deepEqual(parseOptions(['--city-id', '64', '--pole-id', '46', '--limit', '10', '--apply']), {
    apply: true, help: false, cityId: 64, poleId: 46, limit: 10,
  });
  assert.equal(parseOptions(['--city-id', '64']).apply, false);
  assert.equal(parseOptions(['--help']).help, true);
  assert.throws(() => parseOptions(['--apply']), /--city-id/);
  for (const value of ['0', '-1', 'Infinity', 'abc', '1.5', '9007199254740992']) {
    assert.throws(() => parseOptions(['--city-id', value]), /inteiro positivo/);
  }
  assert.throws(() => parseOptions(['--city-id', '64', '--overwrite']), /Argumento inválido/);
});

test('coordenadas vazias ou fora do intervalo não viram um endereço em zero', () => {
  assert.deepEqual(polePosition(pole), { lat: -8.59994, lng: -38.58344 });
  assert.deepEqual(polePosition({ latitude: 0, longitude: '0' }), { lat: 0, lng: 0 });
  for (const latitude of [null, undefined, '', ' ', NaN, Infinity, -91, 91]) {
    assert.equal(polePosition({ ...pole, latitude }), null);
  }
  assert.equal(polePosition({ ...pole, longitude: 181 }), null);
});

test('salva apenas o endereço, com proteção contra edição concorrente e histórico do estado atual', async () => {
  const { db, calls } = client({ updated: { lamp_type: 'Sódio', lamp_power_w: 150, lighting_status: 'manutencao' } });
  const result = await savePoleAddress(db, pole, '  Rua A  ');
  assert.equal(result.saved.address, 'Rua A');
  assert.equal(result.historyError, null);
  assert.equal(calls.length, 2);
  const update = calls[0];
  assert.equal(update.method, 'PATCH');
  assert.deepEqual(Object.keys(update.body).sort(), ['address', 'updated_at']);
  assert.equal(update.body.address, 'Rua A');
  assert.ok(Number.isFinite(Date.parse(update.body.updated_at)));
  assert.equal(update.url.searchParams.get('id'), 'eq.46');
  assert.equal(update.url.searchParams.get('city_id'), 'eq.64');
  assert.equal(update.url.searchParams.get('latitude'), 'eq.-8.59994');
  assert.equal(update.url.searchParams.get('longitude'), 'eq.-38.58344');
  assert.equal(update.url.searchParams.get('lighting_status'), 'neq.removido');
  assert.equal(update.url.searchParams.get('or'), '(address.is.null,address.eq."")');
  const history = calls[1].body;
  assert.equal(history.old_status, 'manutencao');
  assert.equal(history.new_status, 'manutencao');
  assert.equal(history.old_power_w, 150);
  assert.equal(history.new_power_w, 150);
  assert.equal(history.old_lamp_type, 'Sódio');
  assert.equal(history.new_lamp_type, 'Sódio');
  assert.equal(history.pole_id, 46);
  assert.equal(history.city_id, 64);
  assert.equal(history.address, 'Rua A');
});

test('não sobrescreve endereço existente nem grava resposta vazia', async () => {
  const { db, calls } = client();
  assert.deepEqual(await savePoleAddress(db, { ...pole, address: 'Rua manual' }, 'Rua A'), { skipped: true });
  assert.deepEqual(await savePoleAddress(db, pole, '  '), { skipped: true });
  assert.deepEqual(await savePoleAddress(db, pole, null), { skipped: true });
  assert.deepEqual(await savePoleAddress(db, { ...pole, latitude: null }, 'Rua A'), { skipped: true });
  assert.equal(calls.length, 0);
});

test('poste preenchido, removido ou movido durante a consulta não gera histórico falso', async () => {
  const { db, calls } = client({ updated: null });
  assert.deepEqual(await savePoleAddress(db, pole, 'Rua A'), { skipped: true });
  assert.equal(calls.length, 1);
});

test('falha ao atualizar interrompe a gravação antes de criar histórico', async () => {
  const { db, calls } = client({ updateError: true });
  await assert.rejects(savePoleAddress(db, pole, 'Rua A'), /Falha ao atualizar/);
  assert.equal(calls.length, 1);
});

test('falha no histórico informa que o endereço foi salvo e conserva o registro para recuperação', async () => {
  const { db } = client({ historyError: true });
  const result = await savePoleAddress(db, pole, 'Rua A');
  assert.equal(result.saved.address, 'Rua A');
  assert.equal(result.historyError, 'Falha no histórico');
  assert.equal(result.history.pole_id, 46);
  assert.equal(result.history.address, 'Rua A');
});
