import React from 'react';
import L from 'leaflet';
import Icon, { categoryIconName, categoryPinToken } from '@/design-system/icons';

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

const PIN_W = 40;
const PIN_H = 52;
const ICON_SIZE = 20;

// Os tokens sao tripletes RGB ("255 255 255") consumidos como rgb(var(--x)).
// O no do divIcon fica sob documentElement, que e onde applyTheme poe a classe
// .dark, entao var(--...) herda normalmente no style inline e acompanha a troca
// de tema sem re-render. Por isso o tema nao entra na chave de cache: o mesmo
// HTML serve aos dois temas.
const token = (name) => `rgb(var(${name}))`;

// Gota: circulo de raio 20 no topo e uma ponta que fecha em (20, 52). A ponta
// marca a coordenada exata, entao o iconAnchor precisa cair exatamente nela.
const PIN_PATH =
  'M20 0C8.95 0 0 8.95 0 20c0 12.5 16.5 29.1 18.6 31.2a2 2 0 0 0 2.8 0C23.5 49.1 40 32.5 40 20 40 8.95 31.05 0 20 0Z';

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
    <div style="position:absolute;top:0;right:0;width:16px;height:16px;border-radius:9999px;background:${token(
      '--pin-badge-bg'
    )};color:${token('--pin-badge-fg')};border:2px solid ${token(
  '--pin-ring'
)};display:flex;align-items:center;justify-content:center;">
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

  const iconMarkup = renderIconMarkup(icon);

  // fill/stroke vao no style, nao como atributo SVG: var() so e interpretado em
  // propriedade CSS - como atributo de apresentacao a string fica literal e o
  // path sai sem cor.
  const html = `
    <div style="position:relative;width:${PIN_W}px;height:${PIN_H}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
      <svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="${PIN_PATH}" style="fill:${token(bgToken)};stroke:${token(
    '--pin-ring'
  )};stroke-width:${selected ? 3 : 2};"/>
      </svg>
      <div style="position:absolute;top:${20 - ICON_SIZE / 2}px;left:${
    (PIN_W - ICON_SIZE) / 2
  }px;width:${ICON_SIZE}px;height:${ICON_SIZE}px;color:${token(
    fgToken
  )};display:flex;align-items:center;justify-content:center;">
        ${iconMarkup}
      </div>
      ${badge}
    </div>
  `;

  const divIcon = L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_W / 2, PIN_H],
    popupAnchor: [0, -PIN_H],
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
  // "Em alta" sobrepoe a cor da categoria: e um alerta, e o icone continua
  // dizendo de que categoria se trata.
  const name = hot ? 'hot' : categoryPinToken(category);
  return createMapPin({
    cacheKey: `report|${category || ''}|${hot ? 'hot' : ''}|${selected ? 's' : ''}`,
    bgToken: `--pin-${name}-bg`,
    fgToken: `--pin-${name}-fg`,
    // categoryIconName ja cai em 'other' para categoria desconhecida, e cobre
    // 'poda'/'vazamento-de-agua', que os emojis antigos do MapView nao tinham.
    icon: React.createElement(Icon, {
      name: categoryIconName(category),
      size: ICON_SIZE,
      strokeWidth: 2,
    }),
    selected,
  });
};

export { ICON_SIZE };
