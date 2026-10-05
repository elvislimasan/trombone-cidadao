import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRegisteredNeighborhood } from '../../supabase/functions/_shared/reportNeighborhoods.js';

const code = readFileSync(new URL('../hooks/useCityIdFromLocation.js', import.meta.url), 'utf8')
  .replace(/^import .+\r?\n/gm, '').replace('export function', 'function');
const location = (lat) => ({ lat, lng: -38.5 });
function makeHook(lookup) {
  const db = {
    functions: { invoke() {} },
    rpc: async (_name, body) => ({ data: body.p_name === 'Floresta' ? 64 : 99 }),
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ name: 'Centro' }, { name: 'Três Marias' }], error: null }) }) }),
  };
  return new Function('useRef', 'useCallback', 'supabase', 'reverseGeocodePin', 'resolveRegisteredNeighborhood', `${code}\nreturn useCityIdFromLocation();`)(
    (value) => ({ current: value }), (fn) => fn, db, lookup, resolveRegisteredNeighborhood,
  );
}

test('mover marcador para local sem bairro não reaproveita o bairro anterior', async () => {
  const hook = makeHook(async ({ lat }) => ({ city: 'Floresta', state_uf: 'PE', suburb: lat === -8 ? 'Centro' : null }));
  assert.equal(await hook.resolveCityIdFromLocation(location(-8)), 64);
  assert.equal(hook.getResolvedNeighborhood(), 'Centro');
  assert.equal(await hook.resolveCityIdFromLocation(location(-9)), 64);
  assert.equal(hook.getResolvedNeighborhood(), null);
});

test('consulta municipal em zoom 10 preserva bairro detalhado e usa o nome cadastrado', async () => {
  const hook = makeHook(async (_location, { zoom }) => zoom === 18
    ? { suburb: 'tres marias' } : { city: 'Floresta', state_uf: 'PE', suburb: 'Centro' });
  assert.equal(await hook.resolveCityIdFromLocation(location(-8)), 64);
  assert.equal(hook.getResolvedNeighborhood(), 'Três Marias');
});

test('resposta atrasada não substitui a associação do marcador mais recente', async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const hook = makeHook(async ({ lat }) => lat === -8 ? delayed : { city: 'Outra', state_uf: 'PE', suburb: 'Novo' });
  const old = hook.resolveCityIdFromLocation(location(-8));
  assert.equal(await hook.resolveCityIdFromLocation(location(-9)), 99);
  release({ city: 'Floresta', state_uf: 'PE', suburb: 'Centro' });
  assert.equal(await old, null);
  assert.equal(hook.getResolvedNeighborhood(), 'Novo');
});

test('resetar cache invalida também consultas que ainda estão em andamento', async () => {
  let release;
  const hook = makeHook(() => new Promise((resolve) => { release = resolve; }));
  const old = hook.resolveCityIdFromLocation(location(-8));
  hook.resetCityCache();
  release({ city: 'Floresta', state_uf: 'PE', suburb: 'Centro' });
  assert.equal(await old, null);
  assert.equal(hook.getResolvedNeighborhood(), null);
});
