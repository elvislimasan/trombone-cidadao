import { executorHome, executionActivity, executorActivityForPath } from './executorActivities.js';

export const ATTENDANCE_LEVELS = [
  { id: 'nenhum', label: 'Sem acesso ao atendimento' },
  { id: 'leitura', label: 'Somente leitura' },
  { id: 'atendente', label: 'Atendente' },
  { id: 'gestor', label: 'Gestor da secretaria' },
];

export const MUNICIPAL_STAFF_ROLES = [
  { id: 'gestor', label: 'Gestor', description: 'Administra solicitações, serviços e inventários da secretaria.' },
  { id: 'atendente', label: 'Atendente', description: 'Recebe, responde e prepara rascunhos para o gestor.' },
  { id: 'inventario', label: 'Responsável pelo inventário', description: 'Cuida apenas dos mapas e cadastros da secretaria.' },
  { id: 'executor', label: 'Executor de campo', description: 'Executa os serviços habilitados pela secretaria.' },
  { id: 'leitura', label: 'Somente leitura', description: 'Consulta os dados da secretaria sem alterar registros.' },
];

export function assertMunicipalWorkspaceIdentity(data, userId) {
  if (data?.access_contract !== 2) throw new Error('Atualize o banco com as migrações do painel municipal.');
  if (!Object.hasOwn(data, 'actor_user_id')) throw new Error('Atualize o banco com a migração 376 do painel municipal.');
  if (!data.actor_user_id || data.actor_user_id !== userId) throw new Error('A sessão consultada não corresponde à conta aberta. Saia e entre novamente para carregar seu painel.');
}

export function municipalCapabilities(rows, administrator = false, channelId = '') {
  const scoped = rows.filter(row => !channelId || String(row.canal_id) === String(channelId));
  const receiving = scoped.filter(row => ['atendente', 'gestor'].includes(row.atendimento));
  const managing = scoped.filter(row => row.atendimento === 'gestor');
  const electricians = scoped.filter(row => row.especialidades_execucao?.includes('eletricista'));
  const specialties = [...new Set(scoped.flatMap(row => row.especialidades_execucao || []))].filter(id => executionActivity(id));
  const reading = scoped.filter(row => ['leitura', 'atendente', 'gestor'].includes(row.atendimento));
  return {
    readableChannelIds: reading.map(row => String(row.canal_id)),
    editableChannelIds: receiving.map(row => String(row.canal_id)),
    dispatchChannelIds: managing.map(row => String(row.canal_id)),
    electricianChannelIds: electricians.map(row => String(row.canal_id)),
    canReadAttendance: administrator || reading.length > 0,
    canReceive: administrator || receiving.length > 0,
    canReply: administrator || receiving.length > 0,
    canDispatch: administrator || managing.length > 0,
    canExecute: specialties.length > 0,
    canExecuteLighting: electricians.length > 0,
    executionSpecialties: specialties,
    canReview: administrator || managing.length > 0,
    canEditLighting: scoped.some(row => row.inventario_iluminacao),
  };
}

export function municipalHome(workspace, inventoryPath) {
  if (workspace.isAdministrator) return '/prefeitura/visao-geral';
  if (workspace.canDispatch) return '/prefeitura/demandas';
  if (workspace.canReceive) return '/prefeitura/broncas';
  if (workspace.canExecute) return executorHome(workspace);
  if (inventoryPath) return inventoryPath;
  if (workspace.canEditLighting) return '/prefeitura/iluminacao';
  if (workspace.canReadAttendance) return '/prefeitura/broncas';
  return null;
}

export function municipalAccessUnavailableReason(workspace) {
  if (!workspace.municipality) return 'Nenhum vínculo municipal ativo foi encontrado para esta conta. O administrador deve conferir seu vínculo com a prefeitura.';
  const accesses = (workspace.accesses || []).filter(row => !workspace.activeChannelId || String(row.canal_id) === String(workspace.activeChannelId));
  if (accesses.some(row => row.cargos?.includes('executor'))) return 'Seu cargo de executor foi encontrado, mas não há atividade de execução habilitada neste contexto. O administrador deve conferir os serviços de campo e suas categorias na secretaria.';
  if (!accesses.length) return 'Nenhum cargo configurado em uma secretaria ativa foi encontrado neste município. O administrador deve conferir seu vínculo com a secretaria e os cargos concedidos.';
  return 'Os cargos encontrados não habilitam uma atividade neste contexto. O administrador deve conferir as áreas da secretaria e os cargos concedidos.';
}

export function municipalRouteAllowed(path, workspace) {
  if (path.startsWith('/prefeitura/gestao-territorial')) return true; // City/module guard in the inventory.
  if (path === '/prefeitura/executor') return workspace.canExecute;
  if (path.startsWith('/prefeitura/eletricista')) return workspace.canExecuteLighting;
  if (path.startsWith('/prefeitura/executor/')) return Boolean(workspace.executionSpecialties?.includes(executorActivityForPath(path)?.id));
  if (/^\/prefeitura\/(equipe|secretarias|configuracoes)(\/|$)/.test(path)) return workspace.isAdministrator;
  if (path.startsWith('/prefeitura/iluminacao/estatisticas')) return Boolean(workspace.canViewLighting && workspace.canReadAttendance);
  if (path.startsWith('/prefeitura/iluminacao')) return workspace.canViewLighting ?? workspace.canEditLighting;
  return workspace.canReadAttendance;
}

export function municipalContextPath(path, cityId, channelId = '') {
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query);
  if (cityId != null) params.set('cidade', String(cityId));
  if (channelId) params.set('secretaria', channelId); else params.delete('secretaria');
  return pathname + (params.size ? '?' + params : '');
}
