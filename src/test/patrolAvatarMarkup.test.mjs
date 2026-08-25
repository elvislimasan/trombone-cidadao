// O desenho do avatar não tinha nenhum teste, e é onde eles pegam mais.
//
// A figura é montada por uma tabela de peças a partir de uma configuração: cor
// x estilo x acessório x câmera. São centenas de combinações, e ninguém abre
// todas na tela. O modo de falhar não é o desenho ficar feio — é uma peça
// referenciar um gradiente que a paleta não define naquela combinação, e a
// forma sair PRETA no aparelho de alguém. Ou uma medida virar `undefined` e o
// SVG inteiro parar de renderizar.
//
// Os dois testes que mais pagam aqui, por isso, são chatos de propósito: todo
// `url(#…)` aponta para um id que existe, e nenhuma combinação produz lixo na
// marcação.

import test from 'node:test';
import assert from 'node:assert/strict';

import { patrolAvatarHtml, PATROL_AVATAR_FRAME } from '@/components/patrol/avatar';
import {
  PATROL_AVATAR_ACCESSORIES,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_STYLES,
  PATROL_AVATAR_TONS_PELE,
  PATROL_AVATAR_VEHICLES,
} from '@/lib/patrolAvatarConfig';

const CAMERAS = ['frente', 'costas'];

const cadaCaminhada = function* () {
  for (const cor of PATROL_AVATAR_COLORS) {
    for (const estilo of PATROL_AVATAR_STYLES) {
      for (const acessorio of PATROL_AVATAR_ACCESSORIES) {
        for (const sexo of PATROL_AVATAR_SEXOS) {
          for (const tomPele of PATROL_AVATAR_TONS_PELE) {
            for (const camera of CAMERAS) {
              yield {
                camera,
                avatar: {
                  cor: cor.id,
                  estilo: estilo.id,
                  acessorio: acessorio.id,
                  veiculo: 'sedan',
                  sexo: sexo.id,
                  tomPele: tomPele.id,
                },
              };
            }
          }
        }
      }
    }
  }
};

const cadaDirigindo = function* () {
  for (const cor of PATROL_AVATAR_COLORS) {
    for (const veiculo of PATROL_AVATAR_VEHICLES) {
      for (const camera of CAMERAS) {
        yield {
          camera,
          avatar: { cor: cor.id, estilo: 'classico', acessorio: 'mochila', veiculo: veiculo.id },
        };
      }
    }
  }
};

const idsDefinidos = (html) =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const idsUsados = (html) =>
  [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

test('todo gradiente e recorte usado existe, em qualquer combinacao', () => {
  const verificar = (modo, { camera, avatar }) => {
    const html = patrolAvatarHtml(modo, { avatar, camera });
    const definidos = idsDefinidos(html);
    for (const usado of idsUsados(html)) {
      assert.ok(
        definidos.has(usado),
        `${modo}/${camera} ${JSON.stringify(avatar)} usa #${usado}, que nao e definido`,
      );
    }
  };

  for (const caso of cadaCaminhada()) verificar('walking', caso);
  for (const caso of cadaDirigindo()) verificar('driving', caso);
});

test('nenhuma combinacao vaza undefined, NaN ou null na marcacao', () => {
  const verificar = (modo, { camera, avatar }) => {
    const html = patrolAvatarHtml(modo, { avatar, camera });
    for (const lixo of ['undefined', 'NaN', 'null']) {
      assert.ok(
        !html.includes(lixo),
        `${modo}/${camera} ${JSON.stringify(avatar)} produziu '${lixo}'`,
      );
    }
  };

  for (const caso of cadaCaminhada()) verificar('walking', caso);
  for (const caso of cadaDirigindo()) verificar('driving', caso);
});

test('as duas cameras desenham a mesma pessoa de lados diferentes', () => {
  const avatar = { cor: 'verde', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };
  const frente = patrolAvatarHtml('walking', { avatar, camera: 'frente' });
  const costas = patrolAvatarHtml('walking', { avatar, camera: 'costas' });

  assert.notEqual(frente, costas, 'frente e costas nao podem ser o mesmo desenho');
  // A cor escolhida é a mesma nos dois: é a MESMA pessoa, e é isso que impede a
  // tela de escolha de prometer um boneco que o mapa não entrega.
  assert.ok(frente.includes('--patrol-avatar-rgb: 22 163 74'));
  assert.ok(costas.includes('--patrol-avatar-rgb: 22 163 74'));
});

test('so a camera frontal tem rosto', () => {
  const avatar = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };

  assert.ok(patrolAvatarHtml('walking', { avatar, camera: 'frente' }).includes('patrol-avatar__face'));
  assert.ok(!patrolAvatarHtml('walking', { avatar, camera: 'costas' }).includes('patrol-avatar__face'));
});

test('nenhum estilo desenha bone ou deixa gradiente de chapeu', () => {
  for (const estilo of PATROL_AVATAR_STYLES) {
    for (const camera of CAMERAS) {
      const html = patrolAvatarHtml('walking', {
        camera,
        avatar: {
          cor: 'vermelho',
          estilo: estilo.id,
          acessorio: 'mochila',
          veiculo: 'sedan',
          sexo: 'masculino',
          tomPele: 'medio',
        },
      });
      assert.ok(!html.includes('patrol-avatar__cap'), `${estilo.id}/${camera} ainda desenha bone`);
      assert.ok(!html.includes('g-chapeu-'), `${estilo.id}/${camera} ainda define chapeu`);
    }
  }
});

test('sexo e tom de pele mudam a pessoa sem herdar a cor da roupa', () => {
  const base = {
    cor: 'vermelho',
    estilo: 'classico',
    acessorio: 'nenhuma',
    veiculo: 'sedan',
  };
  const masculinoClaro = patrolAvatarHtml('walking', {
    camera: 'costas',
    avatar: { ...base, sexo: 'masculino', tomPele: 'claro' },
  });
  const femininoRetinto = patrolAvatarHtml('walking', {
    camera: 'costas',
    avatar: { ...base, sexo: 'feminino', tomPele: 'retinto' },
  });

  assert.notEqual(masculinoClaro, femininoRetinto);
  assert.ok(masculinoClaro.includes('patrol-avatar--masculino'));
  assert.ok(femininoRetinto.includes('patrol-avatar--feminino'));
  assert.ok(masculinoClaro.includes('patrol-avatar__hair--short'));
  assert.ok(femininoRetinto.includes('patrol-avatar__hair--long'));
  assert.ok(!masculinoClaro.includes('patrol-avatar__outfit--feminino'));
  assert.ok(femininoRetinto.includes('patrol-avatar__outfit--feminino'));
  assert.ok(!masculinoClaro.includes('patrol-avatar__skirt'));
  assert.ok(femininoRetinto.includes('patrol-avatar__skirt'));

  const idPele = (html) => [...idsDefinidos(html)].find((id) => id.startsWith('g-pele-'));
  assert.notEqual(idPele(masculinoClaro), idPele(femininoRetinto));
});

test('saia feminina aparece nos estilos casuais e nao nos trajes tecnicos', () => {
  const base = {
    cor: 'roxo',
    acessorio: 'nenhuma',
    veiculo: 'sedan',
    sexo: 'feminino',
    tomPele: 'medio',
  };

  for (const estilo of ['classico', 'urbano', 'rabo']) {
    for (const camera of CAMERAS) {
      const html = patrolAvatarHtml('walking', {
        camera,
        avatar: { ...base, estilo },
      });
      assert.ok(html.includes('patrol-avatar__skirt'), `${estilo}/${camera} deveria usar saia`);
    }
  }

  for (const estilo of ['tatico', 'night', 'camuflado']) {
    const html = patrolAvatarHtml('walking', {
      camera: 'frente',
      avatar: { ...base, estilo },
    });
    assert.ok(!html.includes('patrol-avatar__skirt'), `${estilo} precisa manter a calca tecnica`);
  }
});

test('camera traseira inclui detalhes de nuca roupa maos pernas e mochila', () => {
  const avatar = {
    cor: 'azul',
    estilo: 'classico',
    acessorio: 'mochila',
    veiculo: 'sedan',
    sexo: 'masculino',
    tomPele: 'medio',
  };
  const costas = patrolAvatarHtml('walking', { avatar, camera: 'costas' });

  assert.ok(costas.includes('patrol-avatar__back-details'));
  assert.ok(costas.includes('patrol-avatar__hand-back'));
  assert.ok(costas.includes('patrol-avatar__leg-back-details'));
  assert.ok(costas.includes('patrol-avatar__backpack-buckles'));
  assert.ok(costas.includes('patrol-avatar__hair--short'));
});

test('so a camera frontal do carro tem farol e retrovisor', () => {
  const avatar = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'suv' };
  const frente = patrolAvatarHtml('driving', { avatar, camera: 'frente' });
  const costas = patrolAvatarHtml('driving', { avatar, camera: 'costas' });

  assert.ok(frente.includes('patrol-avatar__headlights'));
  assert.ok(frente.includes('patrol-avatar__mirrors'));
  assert.ok(!frente.includes('patrol-avatar__taillights'));
  assert.ok(costas.includes('patrol-avatar__taillights'));
  assert.ok(!costas.includes('patrol-avatar__headlights'));
});

test('configuracoes diferentes nao dividem os mesmos gradientes', () => {
  const base = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };
  const outraCor = patrolAvatarHtml('walking', { avatar: { ...base, cor: 'roxo' }, camera: 'frente' });
  const original = patrolAvatarHtml('walking', { avatar: base, camera: 'frente' });
  const mesmoDeNovo = patrolAvatarHtml('walking', { avatar: { ...base }, camera: 'frente' });

  const sufixo = (html) => [...idsDefinidos(html)].find((id) => id.startsWith('g-roupa-'));

  assert.notEqual(sufixo(original), sufixo(outraCor), 'cores diferentes nao podem colidir');
  assert.equal(sufixo(original), sufixo(mesmoDeNovo), 'desenhos iguais devem compartilhar');
});

test('a camera entra no id, senao frente e costas brigam na mesma pagina', () => {
  const avatar = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };
  const idDe = (camera) =>
    [...idsDefinidos(patrolAvatarHtml('walking', { avatar, camera }))].find((id) => id.startsWith('g-roupa-'));

  assert.notEqual(idDe('frente'), idDe('costas'));
});

test('camera desconhecida cai na de frente, que e a das telas de escolha', () => {
  const avatar = { cor: 'azul', estilo: 'classico', acessorio: 'mochila', veiculo: 'sedan' };

  assert.equal(
    patrolAvatarHtml('walking', { avatar, camera: 'lateral' }),
    patrolAvatarHtml('walking', { avatar, camera: 'frente' }),
  );
  assert.equal(
    patrolAvatarHtml('walking', { avatar }),
    patrolAvatarHtml('walking', { avatar, camera: 'frente' }),
  );
});

test('o quadro nao muda sozinho: o CSS ancora o boneco por ele', () => {
  // `.patrol-avatar-planted` usa -0.95 da altura para pousar os pés no chão do
  // marcador. Se este teste falhar, o index.css precisa mudar junto.
  assert.deepEqual(PATROL_AVATAR_FRAME, { largura: 40, altura: 48, chao: 45.6 });
  assert.ok(patrolAvatarHtml('walking', { avatar: null }).includes('viewBox="0 0 40 48"'));
});

test('configuracao ausente ainda desenha um boneco', () => {
  for (const camera of CAMERAS) {
    const html = patrolAvatarHtml('walking', { avatar: null, camera });
    assert.ok(html.includes('patrol-avatar__figure'));
    assert.ok(html.includes('<svg'));
  }
});
