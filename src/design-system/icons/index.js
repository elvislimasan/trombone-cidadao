import Icon, { registerIcons, hasIcon } from './Icon';

import Pothole from './categories/Pothole';
import Sewage from './categories/Sewage';
import Lighting from './categories/Lighting';
import Cleaning from './categories/Cleaning';
import Greenery from './categories/Greenery';
import WaterLeak from './categories/WaterLeak';
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

registerIcons({
  pothole: Pothole,
  sewage: Sewage,
  lighting: Lighting,
  cleaning: Cleaning,
  greenery: Greenery,
  waterleak: WaterLeak,
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
  outros: 'other',
};

export function categoryIconName(categoryId) {
  return CATEGORY_ICON_MAP[categoryId] || 'other';
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
