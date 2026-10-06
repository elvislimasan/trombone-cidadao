import test from 'node:test';
import assert from 'node:assert/strict';
import { municipalTableRows, loadMunicipalRows } from '../lib/municipalTable.js';

test('pesquisa ignora acentos, combina termos e ordena antes da paginação', () => {
  const rows = [{ id: '2', name: 'Ágata', email: 'obras@example.com' }, { id: '1', name: 'Ana', email: 'saude@example.com' }];
  const options = { searchText: (row) => row.name + ' ' + row.email, sortValue: (row) => row.name };
  assert.deepEqual(municipalTableRows(rows, { ...options, search: 'agata obras' }).map((row) => row.id), ['2']);
  assert.deepEqual(municipalTableRows(rows, { ...options, direction: 'desc' }).map((row) => row.id), ['1', '2']);
  assert.equal(rows[0].id, '2');
});

test('carrega toda a equipe além do limite e não entrega lista parcial em erro', async () => {
  const rows = Array.from({ length: 1101 }, (_, id) => ({ id }));
  assert.equal((await loadMunicipalRows(() => ({ range: async (start, end) => ({ data: rows.slice(start, end + 1) }) }))).data.length, 1101);
  const result = await loadMunicipalRows(() => ({ range: async (start) => start ? { error: { message: 'erro' } } : { data: rows.slice(0, 500) } }));
  assert.equal(result.data, null);
});
