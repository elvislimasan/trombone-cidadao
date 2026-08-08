import Icon, { registerIcons, hasIcon } from './Icon';

import Pothole from './categories/Pothole';
import Sewage from './categories/Sewage';
import Lighting from './categories/Lighting';
import Cleaning from './categories/Cleaning';
import Greenery from './categories/Greenery';
import WaterLeak from './categories/WaterLeak';
import Security from './categories/Security';
import Other from './categories/Other';

import Received from './status/Received';
import Analysis from './status/Analysis';
import Execution from './status/Execution';
import Resolved from './status/Resolved';

import FeedIcon from './nav/Feed';
import MapIcon from './nav/Map';
import Stats from './nav/Stats';
import ProfileIcon from './nav/Profile';
import NewReport from './nav/NewReport';

import Trombone from './system/Trombone';
import Support from './system/Support';
import CommentIcon from './system/Comment';
import ShareIcon from './system/Share';
import SaveIcon from './system/Save';
import LocationIcon from './system/Location';
import Ambassador from './system/Ambassador';
import Bell from './system/Bell';
import Flag from './system/Flag';
import ChevronRight from './system/ChevronRight';
import SoundOn from './system/SoundOn';
import SoundOff from './system/SoundOff';

registerIcons({
  pothole: Pothole,
  sewage: Sewage,
  lighting: Lighting,
  cleaning: Cleaning,
  greenery: Greenery,
  waterleak: WaterLeak,
  security: Security,
  other: Other,

  received: Received,
  analysis: Analysis,
  execution: Execution,
  resolved: Resolved,

  feed: FeedIcon,
  map: MapIcon,
  stats: Stats,
  profile: ProfileIcon,
  newreport: NewReport,

  trombone: Trombone,
  support: Support,
  comment: CommentIcon,
  share: ShareIcon,
  save: SaveIcon,
  location: LocationIcon,
  ambassador: Ambassador,
  bell: Bell,
  flag: Flag,
  chevronright: ChevronRight,
  soundon: SoundOn,
  soundoff: SoundOff,
});

// Mapeia category_id do banco para nome de icone.
// Os ids vem de CATEGORY_EMOJIS em src/hooks/useFeed.js.
export const CATEGORY_ICON_MAP = {
  buracos: 'pothole',
  esgoto: 'sewage',
  iluminacao: 'lighting',
  limpeza: 'cleaning',
  poda: 'greenery',
  'vazamento-de-agua': 'waterleak',
  seguranca: 'security',
  outros: 'other',
};

export function categoryIconName(categoryId) {
  return CATEGORY_ICON_MAP[categoryId] || 'other';
}

// Sufixo do token --pin-*-bg/-fg de cada categoria. Vazamento de agua divide o
// azul com esgoto: sao o mesmo dominio e o guia nao lhe da cor propria - se
// precisarem ser distinguidos so pela cor, e criar uma matiz nova em
// primitives.css. Segue o mesmo fallback do icone ('other').
export const CATEGORY_PIN_TOKEN = {
  buracos: 'pothole',
  esgoto: 'sewage',
  iluminacao: 'lighting',
  limpeza: 'cleaning',
  poda: 'greenery',
  'vazamento-de-agua': 'waterleak',
  seguranca: 'security',
  outros: 'other',
};

export function categoryPinToken(categoryId) {
  return CATEGORY_PIN_TOKEN[categoryId] || 'other';
}

// Mapeia status de bronca para nome de icone.
export const STATUS_ICON_MAP = {
  pending: 'received',
  'in-progress': 'execution',
  resolved: 'resolved',
  duplicate: 'other',
};

export { Icon, hasIcon };
export default Icon;
