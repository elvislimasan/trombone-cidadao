import React from 'react';
import L from 'leaflet';
import { categoryEmoji, categoryPinToken } from '@/design-system/icons';

// Fabrica unica de pins do mapa. Antes cada tela montava seu proprio divIcon com
// emoji e `border: 2px solid white` hardcoded - o anel branco estourava no tema
// escuro e o emoji nao aceita recolorir. Aqui o corpo do pin vem dos tokens
// --pin-*, que ja trazem o tom certo de cada tema, e o icone e SVG recolorivel.
//
// A cor identifica a CATEGORIA (guia de pins do mapa); o status aparece nos
// estados especiais e no popup. No tema escuro o corpo usa a cor viva do guia e
// o icone inverte para escuro; no claro o corpo escurece e o icone fica branco.
// As cores vivas com icone branco ficam em 1.63-3.76 e reprovariam AA -
// scripts/check-contrast.mjs cobre os dois temas.

// Disco: circulo com o icone da categoria no centro. Volta ao formato original
// do app (2.5rem, borda branca), agora com os SVGs do design system no lugar
// dos emojis - eles aceitam recolorir e acompanham o tema.
const PIN_SIZE = 40;
const ICON_SIZE = 22;
// Emoji ocupa mais area visual que o SVG no mesmo tamanho nominal.
const EMOJI_SIZE = 19;

// Status da bronca -> sufixo do token --pin-*. Status desconhecido ou ausente
// cai em 'pending', que e o estado inicial de toda bronca.
const STATUS_PIN_TOKEN = {
  pending: 'pending',
  'in-progress': 'progress',
  resolved: 'resolved',
  duplicate: 'duplicate',
};

const statusPinToken = (status) => STATUS_PIN_TOKEN[status] || 'pending';

// Os tokens sao tripletes RGB ("255 255 255") consumidos como rgb(var(--x)).
// O no do divIcon fica sob documentElement, que e onde applyTheme poe a classe
// .dark, entao var(--...) herda normalmente no style inline e acompanha a troca
// de tema sem re-render. Por isso o tema nao entra na chave de cache: o mesmo
// HTML serve aos dois temas.
const token = (name) => `rgb(var(${name}))`;

// Chaveado so pela identidade visual: como as cores saem de var(--...), o mesmo
// divIcon serve aos dois temas e nunca precisa ser invalidado.
const cache = new Map();

// Converte a prop React (camelCase) para atributo SVG (kebab-case), com as
// poucas excecoes que nao seguem a regra.
const ATTR_ALIAS = { className: 'class', viewBox: 'viewBox' };
const toAttr = (name) =>
  ATTR_ALIAS[name] || name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

const escapeAttr = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Serializa um elemento React para string de HTML.
//
// Nao usa react-dom para isso. A tentativa obvia - renderizar num container
// off-DOM com createRoot + flushSync - falha silenciosamente aqui: as telas
// chamam createPinIcon DURANTE o render (o icone e prop do <Marker>), e nesse
// contexto o React ignora o flushSync ("cannot flush when React is already
// rendering"), entao innerHTML e lido antes do commit e volta string vazia - o
// pin sai com a gota e sem icone. react-dom/server resolveria, mas nenhum outro
// ponto do app o importa e num app Capacitor o peso nao se justifica.
//
// Os icones do design system sao arvores estaticas de <path>/<circle>, sem
// estado nem hooks, entao percorrer o elemento e suficiente e e sincrono.
const renderIconMarkup = (element) => {
  if (!element) return '';

  // Componente (o Icon do design system, ou os SVG locais das outras telas):
  // executa a funcao para obter o elemento que ele devolve.
  if (typeof element.type === 'function') {
    return renderIconMarkup(element.type(element.props || {}));
  }

  // Fragment: so os filhos importam.
  if (element.type === React.Fragment) {
    return React.Children.toArray(element.props?.children)
      .map(renderIconMarkup)
      .join('');
  }

  if (typeof element.type !== 'string') return '';

  const { children, ...props } = element.props || {};
  const attrs = Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${toAttr(k)}="${escapeAttr(v)}"`)
    .join(' ');

  const inner = React.Children.toArray(children).map(renderIconMarkup).join('');
  return `<${element.type}${attrs ? ' ' + attrs : ''}>${inner}</${element.type}>`;
};

/**
 * Marcador circular pequeno sobreposto ao canto do pin (ex: "tem obra
 * vinculada"). Devolve HTML pronto para o parametro `badge` de createMapPin.
 *
 * @param {React.ReactElement} icon  elemento do icone, ja dimensionado
 */
export const buildPinBadge = (icon) => `
    <div style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:9999px;background:${token(
      '--pin-badge-bg'
    )};color:${token('--pin-badge-fg')};border:2px solid ${token(
  '--pin-ring'
)};display:flex;align-items:center;justify-content:center;box-sizing:border-box;">
      ${renderIconMarkup(icon)}
    </div>
  `;

/**
 * Constroi um pin em forma de gota. Base comum das telas de mapa; use
 * createPinIcon para broncas, que ja resolve categoria e status.
 *
 * @param {object} opts
 * @param {string} opts.cacheKey   identidade visual do pin (sem tema: os tokens
 *                                 resolvem sozinhos na troca)
 * @param {string} opts.bgToken    token do corpo (ex: '--pin-pending-bg')
 * @param {string} opts.fgToken    token do icone (ex: '--pin-pending-fg')
 * @param {React.ReactElement} opts.icon  elemento do icone, ja dimensionado
 * @param {boolean} [opts.selected] engrossa o anel do pin ativo
 * @param {string} [opts.badge]    HTML sobreposto no canto superior direito
 */
export const createMapPin = ({
  cacheKey,
  bgToken,
  fgToken,
  icon,
  selected = false,
  badge = '',
}) => {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Aceita emoji (string) alem de elemento React: os pins de bronca voltaram a
  // usar emoji, enquanto as outras telas de mapa (obras, pavimentacao, imoveis)
  // seguem com SVG proprio.
  // As reticencias de "outros" sao texto, nao emoji: assentam na linha de base
  // e ficariam encostadas embaixo. O flex do disco centra na horizontal, mas o
  // ajuste vertical precisa deste translate.
  const ehTexto = icon === '…';
  const iconMarkup =
    typeof icon === 'string'
      ? `<span style="font-size:${
          ehTexto ? EMOJI_SIZE + 6 : EMOJI_SIZE
        }px;line-height:1;font-weight:700;transform:translateY(${
          ehTexto ? '-4px' : '0'
        });">${icon}</span>`
      : renderIconMarkup(icon);

  // Disco simples: um div redondo com o icone centralizado. Sem SVG de corpo,
  // entao as cores entram por background/color e o var(--...) resolve direto -
  // nao ha o problema de fill/stroke como atributo de apresentacao.
  const ring = selected ? 3 : 2;

  // position:relative e necessario aqui: o badge se posiciona por absolute
  // em relacao a este disco.
  const html = `
    <div style="position:relative;width:${PIN_SIZE}px;height:${PIN_SIZE}px;border-radius:50%;background:${token(
    bgToken
  )};border:${ring}px solid ${token(
    '--pin-ring'
  )};box-shadow:0 2px 5px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:${token(
    fgToken
  )};box-sizing:border-box;">
      ${iconMarkup}
      ${badge}
    </div>
  `;

  const divIcon = L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [PIN_SIZE, PIN_SIZE],
    // Ancora no centro, nao na base: o disco marca o ponto pelo proprio centro,
    // diferente da gota, que apontava a coordenada com a ponta.
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -PIN_SIZE / 2],
  });

  cache.set(cacheKey, divIcon);
  return divIcon;
};

/**
 * Pin de bronca: corpo colorido pela CATEGORIA, icone da categoria.
 *
 * Aceita o objeto da bronca inteiro porque as duas telas o montam diferente:
 * MapPage remapeia para `category`, enquanto HomePage passa o objeto do useFeed
 * cru, que so tem `category_id`. Ler as duas chaves evita que uma delas caia
 * silenciosamente no icone 'other' - era o que acontecia com o emoji antigo,
 * onde o fallback generico nao parecia quebrado.
 *
 * @param {object}  opts
 * @param {object}  opts.report    bronca; usa category ou category_id
 * @param {boolean} [opts.selected] engrossa o anel do pin ativo
 * @param {boolean} [opts.hot]      estado "em alta" do guia
 */
export const createPinIcon = ({ report, selected = false, hot = false }) => {
  const category = report?.category ?? report?.category_id;
  const status = report?.status;
  // Cor pelo STATUS: laranja pendente, azul em andamento, verde resolvida. A
  // categoria e dita pelo emoji dentro do disco. Assim o mapa responde de
  // relance "o que ainda esta em aberto", que e a pergunta da tela.
  const name = hot ? 'hot' : statusPinToken(status);
  return createMapPin({
    cacheKey: `report|${category || ''}|${status || ''}|${hot ? 'hot' : ''}|${
      selected ? 's' : ''
    }`,
    bgToken: `--pin-${name}-bg`,
    fgToken: `--pin-${name}-fg`,
    // categoryEmoji ja cai em 'outros' para categoria desconhecida, e cobre
    // 'vazamento-de-agua' e 'seguranca', que o mapa antigo nao tinha.
    icon: categoryEmoji(category),
    selected,
  });
};

export { ICON_SIZE };
