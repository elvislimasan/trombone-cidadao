const panelPath = '/prefeitura/eletricista';
const assignmentTitles = new Set([
  'Atendimento atribuído a você',
  'Ordem urgente atribuída',
  'Ordem prioritária atribuída',
]);

export const ELECTRICIAN_NOTIFICATION_LINK_FILTER =
  `link.like.${panelPath}?oferta=*,link.like.${panelPath}/ordem/*`;

// Offers and new assignments are the only alerts in the electrician's bell.
export function isElectricianServiceNotification(notification) {
  if (notification?.type !== 'agency_case' || typeof notification.link !== 'string') return false;
  const link = notification.link;
  if (link.startsWith(`${panelPath}?oferta=`)) {
    return /^(ordem|solicitacao):[^&?#/]+$/.test(link.slice(`${panelPath}?oferta=`.length));
  }
  return link.startsWith(`${panelPath}/ordem/`)
    && link.length > `${panelPath}/ordem/`.length
    && assignmentTitles.has(notification.title);
}
