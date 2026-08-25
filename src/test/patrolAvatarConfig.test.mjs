import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PATROL_AVATAR,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_STORAGE_KEY,
  PATROL_AVATAR_STYLES,
  PATROL_AVATAR_TONS_PELE,
  getPatrolAvatarColor,
  getPatrolAvatarSexo,
  getPatrolAvatarStyle,
  getPatrolAvatarTomPele,
  isPatrolAvatarStyleUnlocked,
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

test('oferece os dois sexos e seis tons de pele válidos', () => {
  assert.deepEqual(PATROL_AVATAR_SEXOS.map((item) => item.id), ['masculino', 'feminino']);
  assert.equal(PATROL_AVATAR_TONS_PELE.length, 6);
  assert.equal(new Set(PATROL_AVATAR_TONS_PELE.map((item) => item.id)).size, 6);

  for (const tom of PATROL_AVATAR_TONS_PELE) {
    assert.match(tom.base, /^#[0-9a-f]{6}$/, `${tom.id} sem cor hexadecimal`);
  }
});

test('cada estilo declara seu nível e nenhuma descrição promete boné', () => {
  const niveis = Object.fromEntries(
    PATROL_AVATAR_STYLES.map((estilo) => [estilo.id, estilo.nivelMinimo])
  );

  assert.deepEqual(niveis, {
    classico: 1,
    tatico: 2,
    urbano: 1,
    night: 3,
    camuflado: 4,
    rabo: 1,
  });
  for (const estilo of PATROL_AVATAR_STYLES) {
    assert.doesNotMatch(estilo.descricao, /bon[eé]/i, `${estilo.id} ainda descreve um boné`);
  }
});

test('peça desconhecida cai no padrão sem levar as outras junto', () => {
  const avatar = normalizePatrolAvatar({
    cor: 'verde',
    sexo: 'inventado',
    tomPele: 'escuro',
    estilo: 'inventado',
    acessorio: 'radio',
    veiculo: 'nave',
  });
  assert.equal(avatar.cor, 'verde');
  assert.equal(avatar.sexo, DEFAULT_PATROL_AVATAR.sexo);
  assert.equal(avatar.tomPele, 'escuro');
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
  const salvo = storePatrolAvatar(storage, {
    cor: 'roxo',
    sexo: 'feminino',
    tomPele: 'retinto',
    estilo: 'tatico',
    acessorio: 'fone',
  });
  assert.equal(salvo.cor, 'roxo');
  assert.equal(salvo.sexo, 'feminino');
  assert.equal(salvo.tomPele, 'retinto');
  assert.deepEqual(readStoredPatrolAvatar(storage), salvo);
});

test('storage legado ganha sexo e tom de pele sem perder escolhas antigas', () => {
  const legado = {
    cor: 'verde',
    estilo: 'night',
    acessorio: 'radio',
    veiculo: 'suv',
  };
  const migrado = readStoredPatrolAvatar(storageFalso(JSON.stringify(legado)));

  assert.deepEqual(migrado, {
    cor: 'verde',
    sexo: DEFAULT_PATROL_AVATAR.sexo,
    tomPele: DEFAULT_PATROL_AVATAR.tomPele,
    estilo: 'night',
    acessorio: 'radio',
    veiculo: 'suv',
  });
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
  assert.equal(getPatrolAvatarSexo('feminino').label, 'Feminino');
  assert.equal(getPatrolAvatarSexo('inventado').id, DEFAULT_PATROL_AVATAR.sexo);
  assert.equal(getPatrolAvatarTomPele('retinto').base, '#452b23');
  assert.equal(getPatrolAvatarTomPele('inventado').id, DEFAULT_PATROL_AVATAR.tomPele);
  assert.equal(getPatrolAvatarStyle(undefined).id, DEFAULT_PATROL_AVATAR.estilo);
});

test('desbloqueia estilos exatamente nos níveis declarados', () => {
  for (const id of ['classico', 'urbano', 'rabo']) {
    assert.equal(isPatrolAvatarStyleUnlocked(id, 1), true, `${id} deveria abrir no nível 1`);
  }

  assert.equal(isPatrolAvatarStyleUnlocked('tatico', 1), false);
  assert.equal(isPatrolAvatarStyleUnlocked('tatico', 2), true);
  assert.equal(isPatrolAvatarStyleUnlocked('night', 2), false);
  assert.equal(isPatrolAvatarStyleUnlocked('night', 3), true);
  assert.equal(isPatrolAvatarStyleUnlocked('camuflado', 3), false);
  assert.equal(isPatrolAvatarStyleUnlocked('camuflado', 4), true);
  assert.equal(isPatrolAvatarStyleUnlocked(' TATICO ', '2'), true);
  assert.equal(isPatrolAvatarStyleUnlocked('desconhecido', 99), false);
});

test('nível inválido é tratado como nível 1', () => {
  for (const nivel of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'inválido']) {
    assert.equal(isPatrolAvatarStyleUnlocked('classico', nivel), true);
    assert.equal(isPatrolAvatarStyleUnlocked('tatico', nivel), false);
  }
});

test('a chave do marcador muda com a aparência, o estado e o sinal', () => {
  const base = { ...DEFAULT_PATROL_AVATAR };
  const andando = patrolAvatarKey(base, 'walking', true);

  assert.notEqual(andando, patrolAvatarKey(base, 'walking', false));
  assert.notEqual(andando, patrolAvatarKey({ ...base, cor: 'verde' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, sexo: 'feminino' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, tomPele: 'retinto' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, acessorio: 'radio' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey(base, 'walking', true, false));
  // Estilo, mochila, sexo e pele não aparecem dentro do carro: a chave repetida
  // reaproveita o ícone em vez de reconstruir o marcador do Leaflet.
  assert.equal(
    patrolAvatarKey(base, 'driving', true),
    patrolAvatarKey({
      ...base,
      sexo: 'feminino',
      tomPele: 'retinto',
      estilo: 'tatico',
      acessorio: 'fone',
    }, 'driving', true)
  );
  assert.notEqual(
    patrolAvatarKey(base, 'driving', true),
    patrolAvatarKey({ ...base, veiculo: 'suv' }, 'driving', true)
  );
});
