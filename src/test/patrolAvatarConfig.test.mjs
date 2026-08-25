import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PATROL_AVATAR,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_STORAGE_KEY,
  getPatrolAvatarColor,
  getPatrolAvatarStyle,
  normalizePatrolAvatar,
  patrolAvatarKey,
  readStoredPatrolAvatar,
  storePatrolAvatar,
} from '../lib/patrolAvatarConfig.js';

const storageFalso = (inicial) => {
  const dados = new Map(inicial ? [[PATROL_AVATAR_STORAGE_KEY, inicial]] : []);
  return {
    dados,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
  };
};

test('toda cor traz os tons do desenho e a tripla que o CSS precisa', () => {
  for (const cor of PATROL_AVATAR_COLORS) {
    assert.match(cor.base, /^#[0-9a-f]{6}$/, `${cor.id} sem tom cheio`);
    assert.match(cor.escura, /^#[0-9a-f]{6}$/, `${cor.id} sem sombra`);
    assert.match(cor.clara, /^#[0-9a-f]{6}$/, `${cor.id} sem brilho`);
    // `rgb(var(--x) / 0.5)` só funciona com a tripla; um hex aqui apagaria a base.
    assert.match(cor.rgb, /^\d{1,3} \d{1,3} \d{1,3}$/, `${cor.id} sem tripla`);
    assert.match(cor.rgbClara, /^\d{1,3} \d{1,3} \d{1,3}$/, `${cor.id} sem tripla clara`);
  }
});

test('peça desconhecida cai no padrão sem levar as outras junto', () => {
  const avatar = normalizePatrolAvatar({
    cor: 'verde',
    estilo: 'inventado',
    acessorio: 'radio',
    veiculo: 'nave',
  });
  assert.equal(avatar.cor, 'verde');
  assert.equal(avatar.estilo, DEFAULT_PATROL_AVATAR.estilo);
  assert.equal(avatar.acessorio, 'radio');
  assert.equal(avatar.veiculo, DEFAULT_PATROL_AVATAR.veiculo);
});

test('configuração ausente ou de outro formato vira o boneco padrão', () => {
  assert.deepEqual(normalizePatrolAvatar(null), { ...DEFAULT_PATROL_AVATAR });
  assert.deepEqual(normalizePatrolAvatar('tatico'), { ...DEFAULT_PATROL_AVATAR });
  assert.deepEqual(normalizePatrolAvatar([]), { ...DEFAULT_PATROL_AVATAR });
});

test('salva e recupera a aparência escolhida no aparelho', () => {
  const storage = storageFalso();
  const salvo = storePatrolAvatar(storage, { cor: 'roxo', estilo: 'tatico', acessorio: 'fone' });
  assert.equal(salvo.cor, 'roxo');
  assert.deepEqual(readStoredPatrolAvatar(storage), salvo);
});

test('JSON quebrado no storage não impede abrir a patrulha', () => {
  assert.deepEqual(readStoredPatrolAvatar(storageFalso('{isto nao e json')), {
    ...DEFAULT_PATROL_AVATAR,
  });
  assert.deepEqual(readStoredPatrolAvatar(undefined), { ...DEFAULT_PATROL_AVATAR });
});

test('a busca por id nunca devolve indefinido', () => {
  assert.equal(getPatrolAvatarColor('verde').label, 'Verde');
  assert.equal(getPatrolAvatarColor('turquesa').id, PATROL_AVATAR_COLORS[0].id);
  assert.equal(getPatrolAvatarStyle(undefined).id, DEFAULT_PATROL_AVATAR.estilo);
});

test('a chave do marcador muda com a aparência, o estado e o sinal', () => {
  const base = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };
  const andando = patrolAvatarKey(base, 'walking', true);

  assert.notEqual(andando, patrolAvatarKey(base, 'walking', false));
  assert.notEqual(andando, patrolAvatarKey({ ...base, cor: 'verde' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, acessorio: 'radio' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey(base, 'walking', true, false));
  // Estilo e mochila não mudam o carro: a chave repetida reaproveita o ícone.
  assert.equal(
    patrolAvatarKey(base, 'driving', true),
    patrolAvatarKey({ ...base, estilo: 'tatico', acessorio: 'fone' }, 'driving', true)
  );
});
