import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PATROL_AVATAR,
  PATROL_AVATAR_CABELOS,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_CORES_CABELO,
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_STORAGE_KEY,
  PATROL_AVATAR_STYLES,
  PATROL_AVATAR_TONS_PELE,
  getPatrolAvatarCabelo,
  getPatrolAvatarColor,
  getPatrolAvatarCorCabelo,
  getPatrolAvatarSexo,
  getPatrolAvatarStyle,
  getPatrolAvatarTomPele,
  isPatrolAvatarStyleUnlocked,
  normalizePatrolAvatar,
  patrolAvatarComPerfil,
  patrolAvatarSexoDoPerfil,
  readRawPatrolAvatar,
  patrolAvatarKey,
  readStoredPatrolAvatar,
  storePatrolAvatar,
  toPatrolUrbanAvatar,
} from '../lib/patrolAvatarConfig.js';

const storageFalso = (inicial) => {
  const dados = new Map(inicial ? [[PATROL_AVATAR_STORAGE_KEY, inicial]] : []);
  return {
    dados,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
  };
};

test('a experiencia atual usa o urbano sem migrar a preferencia salva', () => {
  const storage = storageFalso(JSON.stringify({
    sexo: 'feminino',
    estilo: 'night',
    cor: 'roxo',
  }));
  const salvo = readStoredPatrolAvatar(storage);
  const atual = toPatrolUrbanAvatar(salvo);

  assert.equal(salvo.estilo, 'night');
  assert.equal(atual.estilo, 'urbano');
  assert.equal(atual.sexo, 'feminino');
  assert.equal(atual.cor, 'roxo');
});

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
  });
  for (const estilo of PATROL_AVATAR_STYLES) {
    assert.doesNotMatch(estilo.descricao, /bon[eé]/i, `${estilo.id} ainda descreve um boné`);
  }
});

test('peça desconhecida cai no padrão sem levar as outras junto', () => {
  const avatar = normalizePatrolAvatar({
    cor: 'verde',
    corSecundaria: 'inventada',
    sexo: 'inventado',
    tomPele: 'escuro',
    cabelo: 'moicano',
    corCabelo: 'ruivo',
    estilo: 'inventado',
    acessorio: 'radio',
    veiculo: 'nave',
  });
  assert.equal(avatar.cor, 'verde');
  assert.equal(avatar.corSecundaria, DEFAULT_PATROL_AVATAR.corSecundaria);
  assert.equal(avatar.cabelo, DEFAULT_PATROL_AVATAR.cabelo);
  assert.equal(avatar.corCabelo, 'ruivo');
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
    corSecundaria: DEFAULT_PATROL_AVATAR.corSecundaria,
    sexo: DEFAULT_PATROL_AVATAR.sexo,
    tomPele: DEFAULT_PATROL_AVATAR.tomPele,
    cabelo: DEFAULT_PATROL_AVATAR.cabelo,
    corCabelo: DEFAULT_PATROL_AVATAR.corCabelo,
    estilo: 'night',
    acessorio: 'radio',
    veiculo: 'suv',
  });
});

// A escolha de "cabelo longo" era um ESTILO DE ROUPA. Quem escolheu aquilo
// escolheu um CABELO — se a migracao perdesse isso, todo mundo abriria o app
// com um boneco de cabeca diferente da que montou.
test('o antigo estilo "rabo" vira corte de cabelo, nao some', () => {
  const legado = { cor: 'roxo', estilo: 'rabo', sexo: 'feminino', acessorio: 'fone' };
  const migrado = readStoredPatrolAvatar(storageFalso(JSON.stringify(legado)));

  assert.equal(migrado.cabelo, 'rabo');
  assert.equal(migrado.estilo, 'classico');
  assert.equal(migrado.cor, 'roxo');
  assert.equal(migrado.acessorio, 'fone');
});

test('cabelo e cor de cabelo sao catalogos proprios e sempre validos', () => {
  assert.equal(new Set(PATROL_AVATAR_CABELOS.map((item) => item.id)).size, PATROL_AVATAR_CABELOS.length);
  assert.ok(PATROL_AVATAR_CABELOS.length >= 5, 'poucos cortes para uma escolha de identidade');

  for (const cor of PATROL_AVATAR_CORES_CABELO) {
    assert.match(cor.base, /^#[0-9a-f]{6}$/, `${cor.id} sem cor hexadecimal`);
  }

  assert.equal(getPatrolAvatarCabelo('coque').label, 'Coque');
  assert.equal(getPatrolAvatarCabelo('inventado').id, DEFAULT_PATROL_AVATAR.cabelo);
  assert.equal(getPatrolAvatarCorCabelo('loiro').base, '#d3a144');
  assert.equal(getPatrolAvatarCorCabelo('inventada').id, DEFAULT_PATROL_AVATAR.corCabelo);
});

// Sem escolha salva o corte acompanha o sexo — e so isso. Trocar o sexo depois
// de escolher um corte nao pode apagar a escolha da pessoa.
test('o corte padrao acompanha o sexo, mas nunca sobrescreve o escolhido', () => {
  assert.equal(normalizePatrolAvatar({ sexo: 'feminino' }).cabelo, 'longo');
  assert.equal(normalizePatrolAvatar({ sexo: 'masculino' }).cabelo, 'curto');
  assert.equal(normalizePatrolAvatar({ sexo: 'feminino', cabelo: 'raspado' }).cabelo, 'raspado');
  assert.equal(normalizePatrolAvatar({ sexo: 'masculino', cabelo: 'coque' }).cabelo, 'coque');
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
  for (const id of ['classico', 'urbano']) {
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
  assert.notEqual(andando, patrolAvatarKey({ ...base, corSecundaria: 'laranja' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, cabelo: 'coque' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey({ ...base, corCabelo: 'loiro' }, 'walking', true));
  assert.notEqual(andando, patrolAvatarKey(base, 'walking', true, false));
  // Estilo, mochila, sexo e pele não aparecem dentro do carro: a chave repetida
  // reaproveita o ícone em vez de reconstruir o marcador do Leaflet.
  assert.equal(
    patrolAvatarKey(base, 'driving', true),
    patrolAvatarKey({
      ...base,
      sexo: 'feminino',
      tomPele: 'retinto',
      cabelo: 'coque',
      corCabelo: 'loiro',
      estilo: 'tatico',
      acessorio: 'fone',
    }, 'driving', true)
  );
  assert.notEqual(
    patrolAvatarKey(base, 'driving', true),
    patrolAvatarKey({ ...base, veiculo: 'suv' }, 'driving', true)
  );
});

// O PERFIL É PONTO DE PARTIDA, NUNCA AUTORIDADE
//
// Quem ja montou um avatar no cadastro nao deveria abrir a patrulha e achar um
// boneco de outro sexo. Mas quem escolheu na propria patrulha decidiu depois, e
// sobre um assunto mais especifico — o perfil nao pode desfazer isso.
test('o sexo do perfil so vale enquanto a patrulha nao tem escolha propria', () => {
  const perfilMulher = { avatar_config: { sex: 'woman' } };
  const perfilHomem = { avatar_config: { sex: 'man' } };

  assert.equal(patrolAvatarComPerfil(null, perfilMulher).sexo, 'feminino');
  assert.equal(patrolAvatarComPerfil({}, perfilMulher).sexo, 'feminino');
  assert.equal(patrolAvatarComPerfil({ cor: 'roxo' }, perfilMulher).sexo, 'feminino');

  // Escolha da patrulha vence.
  assert.equal(patrolAvatarComPerfil({ sexo: 'masculino' }, perfilMulher).sexo, 'masculino');
  assert.equal(patrolAvatarComPerfil({ sexo: 'feminino' }, perfilHomem).sexo, 'feminino');

  // E o uniforme urbano continua sendo projetado nos dois casos.
  assert.equal(patrolAvatarComPerfil(null, perfilMulher).estilo, 'urbano');
});

test('perfil ausente, quebrado ou sem sexo cai no padrao sem derrubar a tela', () => {
  for (const perfil of [
    null, undefined, {}, { avatar_config: null }, { avatar_config: '{quebrado' },
    { avatar_config: { sex: 'outro' } }, { avatar_config: 42 },
  ]) {
    assert.equal(patrolAvatarSexoDoPerfil(perfil), null);
    assert.equal(patrolAvatarComPerfil(null, perfil).sexo, DEFAULT_PATROL_AVATAR.sexo);
  }

  // Cadastros antigos gravaram a configuracao como texto.
  assert.equal(patrolAvatarSexoDoPerfil({ avatar_config: '{"sex":"woman"}' }), 'feminino');
  assert.equal(patrolAvatarSexoDoPerfil({ avatar_config: { sex: ' MAN ' } }), 'masculino');
});

test('a leitura crua distingue "escolheu" de "nunca escolheu"', () => {
  // `readStoredPatrolAvatar` normaliza e preenche o sexo com o padrao — depois
  // disso as duas situacoes ficam identicas, e o perfil nunca teria vez.
  const vazio = storageFalso();
  assert.equal(readRawPatrolAvatar(vazio), null);
  assert.equal(readStoredPatrolAvatar(vazio).sexo, DEFAULT_PATROL_AVATAR.sexo);

  const comEscolha = storageFalso(JSON.stringify({ sexo: 'feminino' }));
  assert.equal(readRawPatrolAvatar(comEscolha).sexo, 'feminino');
  assert.equal(readRawPatrolAvatar(storageFalso('[]')), null);
  assert.equal(readRawPatrolAvatar(storageFalso('nao e json')), null);
});
