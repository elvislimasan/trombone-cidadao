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
// SÃO DOIS DESENHISTAS, E ESTE ARQUIVO ESCOLHE QUAL ATENDE
//
// O boneco tem dois caminhos. O primeiro é o RENDER 3D: camadas de imagem
// tingidas em CSS (`renderizacoes.js` + `camadas.js`), que é onde mora a
// qualidade que o vetor não alcança — pele com dispersão de luz, tecido com
// trama, oclusão de contato. O segundo é o DESENHO VETORIAL, montado por peças
// de SVG neste mesmo diretório.
//
// O render atende quando tem todas as peças da configuração; o vetor responde
// no resto. Isso não é indecisão: é o que permite migrar por fases sem que
// nenhum estado intermediário deixe alguém sem boneco no mapa. Os dois usam a
// MESMA geometria (quadro 0.8, pés em 95%), então a troca é invisível.
//
// O VETOR É MONTADO POR PEÇAS, A PARTIR DA MESMA CONFIGURAÇÃO
//
// Cor primária, cor secundária, sexo, tom de pele, corte e cor de cabelo,
// estilo, acessório e veículo vêm de `patrolAvatarConfig.js`. Cada peça mora
// no seu arquivo — `cabeca`, `cabelo`, `torso`, `bracos`, `pernas`, `calcado`,
// `mochila`, `acessorios`, `veiculo` — e devolve um pedaço de SVG. A ordem em
// que eles entram é a única coisa que este arquivo sabe sobre o desenho.
//
// A ORDEM ABAIXO É PROFUNDIDADE, E É A ÚNICA COISA QUE ESTE ARQUIVO SABE
//
// De trás para a frente. É por isso que a mochila entra em dois momentos: com
// a câmera de costas ela vem depois do tronco (está entre você e as costas da
// pessoa), e com a câmera de frente ela vem antes, sobrando só as alças por
// cima do peito. Quem decide O QUE desenhar é `mochila.js`; aqui só se decide
// QUANDO.
//
// TODA A ANIMAÇÃO É CSS, E MORA NOS FILHOS
//
// O marcador é contra-rotacionado no elemento raiz para ficar de pé no mapa
// girado (ver `.nav-rotating` no index.css). Animar a raiz — ou o próprio
// `<svg>` — sobrescreveria esse transform e o avatar perderia o rumo. Por isso
// nada aqui aplica transform no SVG inteiro: pernas, braços, cabeça e o grupo
// da figura animam cada um por si, DENTRO do desenho.
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

import { MEIO, QUADRO } from './geometria';
import { montarDefs, montarPaleta, normalizarCamera } from './paleta';
import { torso } from './torso';
import { braco } from './bracos';
import { perna } from './pernas';
import { cabeca } from './cabeca';
import { mochilaAtras, mochilaFrente } from './mochila';
import { acessorioDoCorpo, pacoteDoAcessorio } from './acessorios';
import { figuraDirigindo } from './veiculo';
import { resolverCamadas } from './renderizacoes';
import { camadasHtml, spritesheetHtml } from './camadas';

const figuraCaminhando = (camera, avatar, s) => {
  const p = montarPaleta(avatar);
  const pacote = pacoteDoAcessorio(avatar.acessorio);
  const gadget = acessorioDoCorpo(avatar.acessorio, camera, p, s);
  const comSaia = p.sexo === 'feminino' && p.estilo.saiaFeminina;

  return `
    ${montarDefs(p, s)}

    <!-- A sombra de contato fica FORA do grupo que anima: o corpo balança, a
         marca no chão não. É ela que impede o boneco de flutuar sobre o mapa. -->
    <ellipse class="patrol-avatar__ground" cx="${MEIO}" cy="${QUADRO.chao - 2}"
      rx="52" ry="10" fill="url(#g-oc-${s})" stroke="none" />

    <g class="patrol-avatar__figure">
      ${perna('back', camera, p, s)}
      ${perna('front', camera, p, s)}
      ${camera === 'frente' ? mochilaAtras(pacote, camera, p) + gadget : ''}
      ${braco('back', camera, p, s)}
      ${torso(camera, p, s)}
      <!-- O tronco pousa sobre as pernas, e a sombra de contato diz isso. -->
      <ellipse cx="${MEIO}" cy="${comSaia ? 264 : 228}" rx="${comSaia ? 48 : 42}"
        ry="${comSaia ? 10 : 15}" fill="url(#g-oc-${s})" stroke="none" />
      ${mochilaFrente(pacote, camera, p, s)}
      ${camera === 'costas' ? gadget : ''}
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

  // OS IDS DOS GRADIENTES SAEM DA CONFIGURAÇÃO
  //
  // `url(#id)` resolve pelo PRIMEIRO id do documento. Com dois avatares na
  // mesma página — a prévia e o mapa, ou a grade de estilos da personalização —
  // ids fixos fariam todos herdarem as cores do primeiro. Derivando o sufixo da
  // configuração, desenhos iguais compartilham (o que é correto) e desenhos
  // diferentes nunca colidem. A CÂMERA entra no sufixo pelo mesmo motivo: de
  // frente e de costas não definem exatamente os mesmos recortes.
  const sufixo = id === 'driving'
    ? `${id}-${lado}-${config.cor}-${config.corSecundaria}-${config.veiculo}`
    : [
        id, lado, config.cor, config.corSecundaria, config.sexo, config.tomPele,
        config.estilo, config.cabelo, config.corCabelo, config.acessorio,
      ].join('-');

  // O RENDER 3D ATENDE PRIMEIRO; O VETOR É A REDE DE SEGURANÇA
  //
  // `resolverCamadas` só devolve `completo` quando TODAS as peças exigidas
  // (corpo, calça, roupa, cabelo) têm arquivo para esta configuração e esta
  // câmera. Enquanto faltar uma, o desenho vetorial responde inteiro — nunca
  // meio raster, meio vetor, que seria pior do que qualquer um dos dois.
  //
  // É isso que deixa a migração acontecer por fases sem nenhum estado
  // intermediário em que alguém fica sem boneco no mapa. O carro continua
  // vetorial até ter render próprio.
  const pilha = id === 'walking'
    ? resolverCamadas(config, lado)
    : { completo: false, animacoes: {} };
  const estadoAnimacao = emMovimento ? 'walk' : 'idle';
  const animacaoAtiva = id === 'walking' ? pilha.animacoes?.[estadoAnimacao] : null;
  const spriteAtivo = Boolean(animacaoAtiva);
  const renderAtivo = spriteAtivo || pilha.completo;

  const corpo = spriteAtivo
    ? spritesheetHtml(animacaoAtiva)
    : pilha.completo
      ? camadasHtml(pilha.camadas)
      : `<svg class="patrol-avatar__svg" viewBox="0 0 ${QUADRO.largura} ${QUADRO.altura}" aria-hidden="true">
         ${id === 'walking'
           ? figuraCaminhando(lado, config, sufixo)
           : figuraDirigindo(lado, config, sufixo)}
       </svg>`;

  const classes = [
    'patrol-avatar',
    `patrol-avatar--${id}`,
    `patrol-avatar--${lado}`,
    renderAtivo ? 'patrol-avatar--render' : 'patrol-avatar--vetor',
    spriteAtivo ? 'patrol-avatar--sprite' : '',
    spriteAtivo ? `patrol-avatar--sprite-${estadoAnimacao}` : '',
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
        ${corpo}
      </span>
    </span>
  `;
};

export const PATROL_AVATAR_FRAME = QUADRO;
