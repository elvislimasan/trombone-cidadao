import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredNeighborhood, resolveRegisteredNeighborhood, neighborhoodFromAddress } from '../../supabase/functions/_shared/reportNeighborhoods.js';

const neighborhoods = [{ name: 'Centro' }, { name: 'Três Marias' }, { name: 'São Francisco de Assis (DNER)' }, { name: 'Né Maniçoba' }, { name: 'AABB' }];

test('padroniza caixa, acento e DNER usando somente o cadastro da cidade', () => {
  assert.equal(registeredNeighborhood(' tres marias ', neighborhoods), 'Três Marias');
  assert.equal(registeredNeighborhood('São Francisco de Assis - DNER', neighborhoods), 'São Francisco de Assis (DNER)');
  assert.equal(registeredNeighborhood('DNER', [{ name: 'Centro' }]), null);
  assert.equal(registeredNeighborhood('DNER', [{ name: 'DNER' }]), 'DNER');
  assert.equal(registeredNeighborhood('DNER', [...neighborhoods, { name: 'DNER' }]), null);
});

test('bairro ausente usa segmento explícito; nome da rua e bairro composto não viram associação', () => {
  assert.equal(resolveRegisteredNeighborhood({ address: 'Rua A - tres marias - Floresta' }, neighborhoods), 'Três Marias');
  assert.equal(neighborhoodFromAddress('Rua Centro - Floresta', neighborhoods), null);
  assert.equal(neighborhoodFromAddress('Rua A - Né Maniçoba - AABB - Floresta', neighborhoods), null);
  assert.equal(neighborhoodFromAddress('Rua A, bairro: Três Marias', neighborhoods), 'Três Marias');
  assert.equal(neighborhoodFromAddress('Rua DNER - Centro - Floresta', neighborhoods), 'Centro');
  assert.equal(resolveRegisteredNeighborhood({ neighborhood: 'Né Maniçoba - AABB', address: 'Rua A - Centro' }, neighborhoods), 'Né Maniçoba - AABB');
});
