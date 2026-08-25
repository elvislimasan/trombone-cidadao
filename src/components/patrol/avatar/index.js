// O avatar de deslocamento: o "você" que anda no mapa durante a patrulha.
//
// POR QUE MARCAÇÃO EM TEXTO, E NÃO UM COMPONENTE REACT
//
// O marcador do mapa nasce dentro de um `L.divIcon`, que só aceita string de
// HTML. O mesmo desenho também aparece na tela de preparação, em React. Manter
// dois desenhos separados garantiria que um dia divergissem — a pessoa
// escolheria um boneco e veria outro na rua. Então o desenho é uma função só,
// e o lado React injeta o resultado (ver `PatrolAvatar.jsx`).
//
// É MONTADO POR PEÇAS, A PARTIR DE UMA CONFIGURAÇÃO
//
// Cor, estilo, acessório e veículo vêm de `patrolAvatarConfig.js`. Cada peça
// mora no seu arquivo (`corpo`, `cabeca`, `carga`, `veiculo`) e devolve um
// pedaço de SVG; este arquivo é só a ordem em que eles entram. Um estilo novo é
// uma entrada na tabela `ESTILOS` da paleta, não um boneco novo.
//
// A ORDEM ABAIXO É PROFUNDIDADE, E É A ÚNICA COISA QUE ESTE ARQUIVO SABE
//
// De trás para a frente. É por isso que a mochila entra em dois momentos: com a
// câmera de costas ela vem depois do tronco (está entre você e as costas da
// pessoa), e com a câmera de frente ela vem antes, sobrando só as alças por
// cima do peito. Quem decide o que desenhar é `carga.js`; aqui só se decide
// quando.
//
// TODA A ANIMAÇÃO É CSS, E MORA NOS FILHOS
//
// O marcador é contra-rotacionado no elemento raiz para ficar de pé no mapa
// girado (ver `.nav-rotating` no index.css). Animar a raiz sobrescreveria esse
// transform e o avatar perderia o rumo. Por isso pernas, braços, tronco e base
// animam cada um por si, dentro do SVG.
//
// ANDAR E PARAR SÃO DOIS ESTADOS, NÃO UM LIGA-DESLIGA
//
// Congelar o desenho no meio de uma passada parecia travamento, não parada.
// `is-moving` roda o ciclo da caminhada; `is-idle` roda uma respiração lenta.
// É o que diz, de relance, se o GPS ainda está lendo.

import { normalizePatrolTravelMode } from '@/lib/patrolTravelMode';
import {
  getPatrolAvatarColor,
  normalizePatrolAvatar,
} from '@/lib/patrolAvatarConfig';

import { QUADRO, montarDefs, montarPaleta, normalizarCamera } from './paleta';
import { braco, perna, tronco } from './corpo';
import { cabeca } from './cabeca';
import { cargaAtras, cargaFrente } from './carga';
import { figuraDirigindo } from './veiculo';

const figuraCaminhando = (camera, avatar, s) => {
  const p = montarPaleta(avatar);
  const comSaia = p.sexo === 'feminino' && p.estilo.saiaFeminina;

  return `
    ${montarDefs(p, s)}
    <g class="patrol-avatar__figure">
      ${perna('back', camera, p, s)}
      ${perna('front', camera, p, s)}
      ${cargaAtras(avatar.acessorio, camera, p, s)}
      ${braco('back', camera, p, s)}
      ${tronco(camera, p, s)}
      <!-- O tronco pousa sobre as pernas, e a sombra de contato diz isso. -->
      <ellipse cx="20" cy="${comSaia ? 38.2 : 32.2}" rx="${comSaia ? 7.2 : 6.4}"
        ry="${comSaia ? 1.5 : 2.3}" fill="url(#g-oc-${s})" stroke="none" />
      ${cargaFrente(avatar.acessorio, camera, p, s)}
      ${braco('front', camera, p, s)}
      ${cabeca(camera, p, s, avatar.acessorio)}
    </g>
  `;
};

/**
 * @param {string} modo   'walking' | 'driving'
 * @param {object} opcoes `avatar` é a configuração de `patrolAvatarConfig`;
 *                        `camera` é 'frente' (telas de escolha) ou 'costas'
 *                        (o mapa); `emMovimento` escolhe entre o ciclo da
 *                        caminhada e a respiração parada; `gpsAtivo` acende a
 *                        base luminosa; `className` deixa quem chama posicionar
 *                        o avatar sem envolvê-lo em outra caixa.
 */
export const patrolAvatarHtml = (modo, {
  avatar,
  camera = 'frente',
  emMovimento = true,
  gpsAtivo = true,
  className = '',
} = {}) => {
  const id = normalizePatrolTravelMode(modo);
  const config = normalizePatrolAvatar(avatar);
  const cor = getPatrolAvatarColor(config.cor);
  const lado = normalizarCamera(camera);

  // OS IDs DOS GRADIENTES SAEM DA CONFIGURAÇÃO
  //
  // `url(#id)` resolve pelo PRIMEIRO id do documento. Com dois avatares na
  // mesma página — a prévia e o mapa, ou a grade de estilos da personalização —
  // ids fixos fariam todos herdarem as cores do primeiro. Derivando o sufixo da
  // configuração, desenhos iguais compartilham (o que é correto) e desenhos
  // diferentes nunca colidem. A CÂMERA entra no sufixo pelo mesmo motivo: de
  // frente e de costas não definem exatamente os mesmos gradientes.
  const sufixo = id === 'driving'
    ? `${id}-${lado}-${config.cor}-${config.veiculo}`
    : `${id}-${lado}-${config.cor}-${config.sexo}-${config.tomPele}-${config.estilo}-${config.acessorio}`;

  const figura = id === 'walking'
    ? figuraCaminhando(lado, config, sufixo)
    : figuraDirigindo(lado, config, sufixo);

  const classes = [
    'patrol-avatar',
    `patrol-avatar--${id}`,
    `patrol-avatar--${lado}`,
    id === 'walking' ? `patrol-avatar--${config.sexo}` : '',
    emMovimento ? 'is-moving' : 'is-idle',
    gpsAtivo ? 'is-live' : 'is-searching',
    className,
  ].filter(Boolean).join(' ');

  // A base fica ANTES do corpo no DOM: ela é o chão, e o boneco pisa nela.
  return `
    <span class="${classes}" style="--patrol-avatar-rgb: ${cor.rgb}; --patrol-avatar-light-rgb: ${cor.rgbClara};">
      <span class="patrol-avatar__base">
        <span class="patrol-avatar__cone"></span>
        <span class="patrol-avatar__glow"></span>
        <span class="patrol-avatar__ring"></span>
        <span class="patrol-avatar__ring patrol-avatar__ring--pulse"></span>
      </span>
      <span class="patrol-avatar__pod">
        <svg class="patrol-avatar__svg" viewBox="0 0 ${QUADRO.largura} ${QUADRO.altura}" aria-hidden="true">
          ${figura}
        </svg>
      </span>
    </span>
  `;
};

export const PATROL_AVATAR_FRAME = QUADRO;
