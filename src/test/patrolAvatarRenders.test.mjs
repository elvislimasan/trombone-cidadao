// O caminho de render 3D e, principalmente, a QUEDA PARA O VETOR.
//
// A migração do avatar para camadas de imagem é por fases: os arquivos entram
// aos poucos, e enquanto faltar uma peça o desenho vetorial responde inteiro.
// O modo de falhar aqui não é feio, é vazio — uma camada exigida que ninguém
// publicou, um nome de arquivo fora do padrão, um acessório "nenhuma" contado
// como ausência. Em todos esses casos o marcador do mapa some, e some no meio
// da rua, que é onde ninguém consegue depurar.
//
// Por isso os testes abaixo cobrem o limite entre os dois desenhos muito mais
// do que a aparência de qualquer um deles.

import test from 'node:test';
import assert from 'node:assert/strict';

import { patrolAvatarHtml } from '@/components/patrol/avatar';
import {
  chaveDaAnimacaoFigura,
  chaveDoRender,
  chaveDoSpriteCaminhada,
  limparRenders,
  registrarRenders,
  resolverCamadas,
  temRenders,
  totalDeRenders,
} from '@/components/patrol/avatar/renderizacoes';
import {
  PATROL_AVATAR_ACCESSORIES,
  PATROL_AVATAR_CABELOS,
  PATROL_AVATAR_STYLES,
  getPatrolAvatarColor,
  getPatrolAvatarCorCabelo,
  getPatrolAvatarTomPele,
} from '@/lib/patrolAvatarConfig';

const CAMERAS = ['frente', 'costas'];

const AVATAR = {
  cor: 'vermelho', corSecundaria: 'grafite', sexo: 'feminino', tomPele: 'moreno',
  cabelo: 'rabo', corCabelo: 'preto', estilo: 'urbano', acessorio: 'mochila',
  veiculo: 'sedan',
};

const registroCheio = () => {
  const mapa = new Map();
  const por = (pasta, ids, sufixos = ['']) => {
    for (const id of ids) {
      for (const camera of CAMERAS) {
        for (const sufixo of sufixos) {
          if (sufixo && camera !== 'frente') continue;
          const chave = `${pasta}/${id}-${camera}${sufixo}`;
          mapa.set(chave, `/assets/${chave}.webp`);
        }
      }
    }
  };

  por('corpo', ['masculino', 'feminino']);
  por('calca', PATROL_AVATAR_STYLES.map((e) => e.id));
  por('roupa', PATROL_AVATAR_STYLES.map((e) => e.id));
  por('cabelo', PATROL_AVATAR_CABELOS.map((c) => c.id));
  por('acessorio', PATROL_AVATAR_ACCESSORIES.filter((a) => a.id !== 'nenhuma').map((a) => a.id), ['', '-atras']);

  return mapa;
};

test('sem nenhum render publicado o boneco continua vetorial', () => {
  limparRenders();

  assert.equal(totalDeRenders(), 0);
  assert.equal(temRenders(AVATAR, 'costas'), false);

  for (const camera of CAMERAS) {
    const html = patrolAvatarHtml('walking', { avatar: AVATAR, camera });
    assert.ok(html.includes('patrol-avatar--vetor'));
    assert.ok(html.includes('<svg'));
    assert.ok(!html.includes('patrol-avatar__layer'));
  }
});

test('com o conjunto completo o render assume e o svg sai de cena', () => {
  registrarRenders(registroCheio());

  for (const camera of CAMERAS) {
    const html = patrolAvatarHtml('walking', { avatar: AVATAR, camera });
    assert.ok(html.includes('patrol-avatar--render'), `${camera} nao virou render`);
    assert.ok(!html.includes('<svg'), `${camera} ainda desenha svg`);
    assert.ok(html.includes('patrol-avatar__stack'));
    assert.ok(html.includes('patrol-avatar__contact'));
  }

  limparRenders();
});

// UMA PEÇA QUE FALTA DERRUBA A CONFIGURAÇÃO INTEIRA PARA O VETOR
//
// Meio raster e meio vetor seria pior do que qualquer um dos dois: a luz não
// bate igual, e o boneco sairia com a cabeça de um desenho e o corpo de outro.
test('faltando uma camada exigida, a configuracao inteira volta ao vetor', () => {
  for (const exigida of ['corpo/feminino-costas', 'calca/urbano-costas', 'roupa/urbano-costas', 'cabelo/rabo-costas']) {
    const mapa = registroCheio();
    mapa.delete(exigida);
    registrarRenders(mapa);

    const pilha = resolverCamadas(AVATAR, 'costas');
    assert.equal(pilha.completo, false, `${exigida} deveria derrubar o render`);
    assert.deepEqual(pilha.faltando, [exigida]);
    assert.ok(patrolAvatarHtml('walking', { avatar: AVATAR, camera: 'costas' }).includes('<svg'));
  }

  limparRenders();
});

// "Sem mochila" é uma escolha, não um arquivo que ninguém publicou. Se ela
// contasse como ausência, quem escolhesse "sem mochila" nunca veria o render.
test('acessorio "nenhuma" nao conta como arquivo faltando', () => {
  registrarRenders(registroCheio());

  const pilha = resolverCamadas({ ...AVATAR, acessorio: 'nenhuma' }, 'costas');
  assert.equal(pilha.completo, true);
  assert.deepEqual(pilha.faltando, []);
  assert.ok(!pilha.camadas.some((c) => c.slot.startsWith('acessorio')));

  limparRenders();
});

test('a fatia de tras do acessorio so entra na camera frontal', () => {
  registrarRenders(registroCheio());

  const slots = (camera) => resolverCamadas(AVATAR, camera).camadas.map((c) => c.slot);

  assert.deepEqual(slots('frente'), ['acessorio-atras', 'corpo', 'calca', 'roupa', 'acessorio', 'cabelo']);
  assert.deepEqual(slots('costas'), ['corpo', 'calca', 'roupa', 'acessorio', 'cabelo']);

  limparRenders();
});

// A COR NÃO ESTÁ NA IMAGEM, E É ISSO QUE SALVA A PERSONALIZAÇÃO
//
// São 1.008.420 aparências a pé. Se a cor viesse renderizada, cada uma pediria
// um arquivo. Cada camada carrega a tinta que o CSS aplica, e é por isso que
// 56 arquivos bastam.
test('cada camada carrega a tinta certa da configuracao', () => {
  registrarRenders(registroCheio());

  const tinta = Object.fromEntries(
    resolverCamadas(AVATAR, 'costas').camadas.map((c) => [c.slot, c.tinta]),
  );

  assert.equal(tinta.corpo, getPatrolAvatarTomPele(AVATAR.tomPele).base);
  assert.equal(tinta.calca, getPatrolAvatarColor(AVATAR.corSecundaria).base);
  assert.equal(tinta.roupa, getPatrolAvatarColor(AVATAR.cor).base);
  assert.equal(tinta.cabelo, getPatrolAvatarCorCabelo(AVATAR.corCabelo).base);
  // O acessório já vem colorido do render: tingi-lo pintaria a fivela de
  // metal com a cor da camiseta.
  assert.equal(tinta.acessorio, null);

  limparRenders();
});

test('trocar uma cor muda a marcacao sem trocar nenhum arquivo', () => {
  registrarRenders(registroCheio());

  const vermelho = patrolAvatarHtml('walking', { avatar: AVATAR, camera: 'costas' });
  const roxo = patrolAvatarHtml('walking', { avatar: { ...AVATAR, cor: 'roxo' }, camera: 'costas' });

  assert.notEqual(vermelho, roxo);
  const arquivos = (html) => [...html.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(arquivos(vermelho), arquivos(roxo), 'a cor nao pode trocar o arquivo');

  limparRenders();
});

test('as duas cameras nunca compartilham arquivo', () => {
  registrarRenders(registroCheio());

  const urls = (camera) => new Set(resolverCamadas(AVATAR, camera).camadas.map((c) => c.url));
  const frente = urls('frente');
  for (const url of urls('costas')) assert.ok(!frente.has(url), `${url} usado nas duas cameras`);

  assert.equal(chaveDoRender('corpo', 'feminino', 'costas'), 'corpo/feminino-costas');
  assert.equal(chaveDoRender('acessorio', 'mochila', 'frente', '-atras'), 'acessorio/mochila-frente-atras');

  limparRenders();
});

// O carro tem render próprio na fila, mas não agora. Enquanto não tiver, ele
// não pode tentar montar uma pilha de camadas de pessoa.
test('o modo dirigindo continua vetorial mesmo com todos os renders', () => {
  registrarRenders(registroCheio());

  for (const camera of CAMERAS) {
    const html = patrolAvatarHtml('driving', { avatar: AVATAR, camera });
    assert.ok(html.includes('patrol-avatar--vetor'));
    assert.ok(html.includes('<svg'));
  }

  limparRenders();
});

test('configuracao invalida nao explode o resolvedor', () => {
  registrarRenders(registroCheio());

  for (const entrada of [null, undefined, 'tatico', [], { estilo: 'inventado', cabelo: 'moicano' }]) {
    const pilha = resolverCamadas(entrada, 'costas');
    assert.equal(pilha.completo, true, 'peca invalida deveria cair no padrao, que tem render');
  }

  limparRenders();
});

test('nome de arquivo fora do padrao e ignorado, nao quebra', () => {
  registrarRenders({ 'roupa/URBANO_costas.webp': '/x.webp', 'corpo/feminino-costas': '/y.webp' });

  assert.equal(totalDeRenders(), 2);
  assert.equal(temRenders(AVATAR, 'costas'), false);
  assert.ok(patrolAvatarHtml('walking', { avatar: AVATAR, camera: 'costas' }).includes('<svg'));

  limparRenders();
});

// A ROTA DA FIGURA FECHADA
//
// Camadas em material branco pressupoem uma cena 3D com camera travada. Quem
// gera por prompt nao consegue isso, e por isso existe a segunda rota: um
// render fechado por sexo x estilo. Ela custa a personalizacao daquela
// combinacao, e por isso so vale quando alguem a publicou de proposito.
test('a figura fechada atende quando existe, mesmo sem as camadas', () => {
  limparRenders();
  registrarRenders({
    'figura/feminino-urbano-frente': '/f/fem-urbano-frente.webp',
    'figura/feminino-urbano-costas': '/f/fem-urbano-costas.webp',
  });

  for (const camera of CAMERAS) {
    const pilha = resolverCamadas(AVATAR, camera);
    assert.equal(pilha.completo, true);
    assert.equal(pilha.rota, 'figura');
    assert.equal(pilha.camadas.length, 1);
    assert.equal(pilha.camadas[0].tinta, null, 'a figura fechada ja vem colorida');

    const html = patrolAvatarHtml('walking', { avatar: AVATAR, camera });
    assert.ok(html.includes('patrol-avatar--render'));
    assert.ok(html.includes('patrol-avatar__layer--figura'));
    assert.ok(!html.includes('<svg'));
  }

  // Uma combinacao sem figura publicada continua caindo no vetor: a rota
  // fechada nao promete cobrir o catalogo inteiro.
  const outra = patrolAvatarHtml('walking', { avatar: { ...AVATAR, estilo: 'night' }, camera: 'costas' });
  assert.ok(outra.includes('<svg'));

  limparRenders();
});

test('os sprites 4x1 sao direcionais e acompanham idle ou walk', () => {
  limparRenders();
  registrarRenders({
    'figura/feminino-urbano-frente': '/f/fem-urbano-frente.webp',
    'figura/feminino-urbano-costas': '/f/fem-urbano-costas.webp',
    'figura/feminino-urbano-frente-idle-4x1': '/f/frente-idle.webp',
    'figura/feminino-urbano-frente-walk-4x1': '/f/frente-walk.webp',
    'figura/feminino-urbano-costas-idle-4x1': '/f/costas-idle.webp',
    'figura/feminino-urbano-costas-walk-4x1': '/f/costas-walk.webp',
    // A chave explicita precisa vencer o alias legado.
    'figura/feminino-urbano-walk-4x1': '/f/costas-walk-legado.webp',
  });

  assert.equal(
    chaveDaAnimacaoFigura('feminino', 'urbano', 'frente', 'idle'),
    'figura/feminino-urbano-frente-idle-4x1',
  );
  assert.equal(
    chaveDoSpriteCaminhada('feminino', 'urbano', 'costas'),
    'figura/feminino-urbano-costas-walk-4x1',
  );
  assert.equal(
    chaveDoSpriteCaminhada('feminino', 'urbano'),
    'figura/feminino-urbano-walk-4x1',
  );

  const pilhaFrente = resolverCamadas(AVATAR, 'frente');
  const pilhaCostas = resolverCamadas(AVATAR, 'costas');
  assert.deepEqual(pilhaFrente.animacoes.idle, {
    tipo: 'spritesheet',
    estado: 'idle',
    url: '/f/frente-idle.webp',
    colunas: 4,
    linhas: 1,
    quadros: 4,
    duracaoMs: 6400,
  });
  assert.equal(pilhaFrente.animacoes.walk.url, '/f/frente-walk.webp');
  assert.equal(pilhaCostas.animacoes.idle.url, '/f/costas-idle.webp');
  assert.equal(pilhaCostas.animacoes.walk.url, '/f/costas-walk.webp');

  for (const camera of CAMERAS) {
    for (const emMovimento of [false, true]) {
      const estado = emMovimento ? 'walk' : 'idle';
      const html = patrolAvatarHtml('walking', { avatar: AVATAR, camera, emMovimento });
      assert.ok(html.includes('patrol-avatar--render'));
      assert.ok(html.includes(`patrol-avatar--sprite-${estado}`));
      assert.ok(html.includes(`patrol-avatar__sprite--${estado}`));
      assert.ok(html.includes(`/f/${camera}-${estado}.webp`));
      assert.ok(html.includes('animation: patrol-avatar-sprite-4x1'));
      assert.ok(!html.includes('<svg'));
    }
  }

  limparRenders();
});

test('o alias legado de walk atende somente costas', () => {
  limparRenders();
  registrarRenders({
    'figura/feminino-urbano-frente': '/f/frente.webp',
    'figura/feminino-urbano-costas': '/f/costas.webp',
    'figura/feminino-urbano-walk-4x1': '/f/walk-legado.webp',
  });

  assert.equal(resolverCamadas(AVATAR, 'frente').animacoes.walk, undefined);
  assert.equal(resolverCamadas(AVATAR, 'costas').animacoes.walk.url, '/f/walk-legado.webp');

  const frente = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'frente',
    emMovimento: true,
  });
  assert.ok(frente.includes('/f/frente.webp'));
  assert.ok(!frente.includes('patrol-avatar--sprite'));

  const costas = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'costas',
    emMovimento: true,
  });
  assert.ok(costas.includes('/f/walk-legado.webp'));
  assert.ok(costas.includes('patrol-avatar--sprite-walk'));

  limparRenders();
});

test('sexo faz parte da chave e masculino nao reutiliza atlas feminino', () => {
  limparRenders();
  registrarRenders({
    'figura/feminino-urbano-costas-walk-4x1': '/f/feminino-walk.webp',
    'figura/masculino-urbano-costas-walk-4x1': '/f/masculino-walk.webp',
  });

  const masculino = { ...AVATAR, sexo: 'masculino' };
  assert.equal(resolverCamadas(AVATAR, 'costas').animacoes.walk.url, '/f/feminino-walk.webp');
  assert.equal(
    resolverCamadas(masculino, 'costas').animacoes.walk.url,
    '/f/masculino-walk.webp',
  );

  const html = patrolAvatarHtml('walking', {
    avatar: masculino,
    camera: 'costas',
    emMovimento: true,
  });
  assert.ok(html.includes('/f/masculino-walk.webp'));
  assert.ok(!html.includes('/f/feminino-walk.webp'));

  limparRenders();
});

test('sprite do estado funciona sem figura estatica e o outro estado cai no vetor', () => {
  limparRenders();
  registrarRenders({
    'figura/feminino-urbano-costas-walk-4x1': '/f/costas-walk.webp',
    'figura/feminino-urbano-frente-idle-4x1': '/f/frente-idle.webp',
  });

  const andandoCostas = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'costas',
    emMovimento: true,
  });
  assert.ok(andandoCostas.includes('patrol-avatar--render'));
  assert.ok(andandoCostas.includes('patrol-avatar--sprite-walk'));
  assert.ok(andandoCostas.includes('/f/costas-walk.webp'));
  assert.ok(!andandoCostas.includes('<svg'));
  assert.equal(temRenders(AVATAR, 'costas'), true);
  assert.equal(temRenders(AVATAR, 'costas', 'walk'), true);
  assert.equal(temRenders(AVATAR, 'costas', 'idle'), false);

  const paradoCostas = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'costas',
    emMovimento: false,
  });
  assert.ok(paradoCostas.includes('patrol-avatar--vetor'));
  assert.ok(paradoCostas.includes('<svg'));
  assert.ok(!paradoCostas.includes('patrol-avatar__sprite'));

  const paradoFrente = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'frente',
    emMovimento: false,
  });
  assert.ok(paradoFrente.includes('patrol-avatar--sprite-idle'));
  assert.ok(paradoFrente.includes('/f/frente-idle.webp'));

  const andandoFrente = patrolAvatarHtml('walking', {
    avatar: AVATAR,
    camera: 'frente',
    emMovimento: true,
  });
  assert.ok(andandoFrente.includes('patrol-avatar--vetor'));
  assert.ok(andandoFrente.includes('<svg'));

  limparRenders();
});

test('havendo as duas rotas, a figura fechada vence', () => {
  const mapa = registroCheio();
  mapa.set('figura/feminino-urbano-costas', '/f/fechada.webp');
  registrarRenders(mapa);

  const pilha = resolverCamadas(AVATAR, 'costas');
  assert.equal(pilha.rota, 'figura');
  // A camera sem figura continua nas camadas: as rotas convivem por camera.
  assert.equal(resolverCamadas(AVATAR, 'frente').rota, 'camadas');

  limparRenders();
});
