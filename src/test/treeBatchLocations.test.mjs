import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TREE } from '../lib/arborization.js';
import { treeBatchPayloads } from '../lib/treeBatchLocations.js';

const values = { ...EMPTY_TREE, common_name: 'Nim', species_id: 'nim', address: 'Referência compartilhada', neighborhood: 'Bairro errado', bairro_id: 'errado' };
const points = [{ latitude: -8.60, longitude: -38.57 }, { latitude: -8.61, longitude: -38.58 }];
const neighborhoods = [{ id: 'centro', name: 'Centro', city_id: 64 }, { id: 'marias', name: 'Três Marias', city_id: 64 }];

test('cada pin recebe seu endereço e ID de bairro, preservando coordenadas e dados comuns', async () => {
  const calls = [], progress = [];
  const payloads = await treeBatchPayloads(values, points, 64, { neighborhoods,
    lookup: async point => { calls.push(point); return point.lat === -8.60 ? { address: 'Rua A', suburb: ' centro ' } : { address: 'Rua B', suburb: 'tres marias' }; },
    onProgress: value => progress.push(value),
  });
  assert.deepEqual(calls, [{ lat: -8.60, lng: -38.57 }, { lat: -8.61, lng: -38.58 }]);
  assert.deepEqual(payloads.map(row => [row.address, row.bairro_id, row.neighborhood]), [['Rua A', 'centro', 'Centro'], ['Rua B', 'marias', 'Três Marias']]);
  assert.deepEqual(payloads.map(row => [row.latitude, row.longitude, row.species_id]), [[-8.60, -38.57, 'nim'], [-8.61, -38.58, 'nim']]);
  assert.deepEqual(progress, [{ completed: 0, total: 2 }, { completed: 1, total: 2 }, { completed: 2, total: 2 }]);
});

test('falha preserva consultas concluídas para repetir só os pins pendentes', async () => {
  const cache = new Map(); let calls = 0;
  await assert.rejects(treeBatchPayloads(values, points, 64, { neighborhoods, cache,
    lookup: async () => ++calls === 1 ? { address: 'Rua A', suburb: 'Centro' } : null,
  }), /ponto 2.*Nenhuma árvore foi salva/);
  const retry = await treeBatchPayloads(values, points, 64, { neighborhoods, cache,
    lookup: async () => { calls++; return { address: 'Rua B', suburb: 'Três Marias' }; },
  });
  assert.equal(calls, 3);
  assert.deepEqual(retry.map(row => row.address), ['Rua A', 'Rua B']);
});

test('bairro desconhecido ou de outra cidade não reutiliza o bairro compartilhado', async () => {
  for (const suburb of ['Desconhecido', 'Recife']) {
    const [row] = await treeBatchPayloads(values, points.slice(0, 1), 64, {
      neighborhoods: [...neighborhoods, { id: 'fora', name: 'Recife', city_id: 65 }],
      lookup: async () => ({ address: 'Rua A', suburb }),
    });
    assert.equal(row.address, 'Rua A'); assert.equal(row.bairro_id, null); assert.equal(row.neighborhood, null);
  }
});

test('identifica bairro pelo endereço quando a consulta não traz suburb', async () => {
  const [row] = await treeBatchPayloads(values, points.slice(0, 1), 64, { neighborhoods,
    lookup: async () => ({ address: 'Rua A, Centro, Floresta' }),
  });
  assert.equal(row.bairro_id, 'centro');
});

test('valida todos os pins antes de iniciar consultas e limita espera por uma resposta', async () => {
  let calls = 0;
  await assert.rejects(treeBatchPayloads(values, [...points, { latitude: 200, longitude: 0 }], 64, { lookup: async () => { calls++; } }), /localização válida/);
  assert.equal(calls, 0);
  await assert.rejects(treeBatchPayloads(values, points, 64, { timeoutMs: 10, lookup: () => new Promise(() => {}) }), /ponto 1/);
});

test('cancelar a tela interrompe a preparação do lote sem retornar dados para salvar', async () => {
  const controller = new AbortController(); let finish;
  const pending = treeBatchPayloads(values, points, 64, { signal: controller.signal,
    lookup: () => new Promise(resolve => { finish = resolve; }),
  });
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, /cancelada/);
  finish({ address: 'Resposta atrasada', suburb: 'Centro' });
});
