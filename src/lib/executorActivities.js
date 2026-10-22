export const EXECUTION_ACTIVITIES = {
  eletricista: { id: 'eletricista', label: 'Iluminação', title: 'Painel do eletricista', path: '/prefeitura/eletricista', module: 'lighting', mapLabel: 'Mapa de iluminação', services: [['lamp_replacement', 'Troca de lâmpada'], ['arm_installation', 'Instalação de braço'], ['relay_replacement', 'Troca de relé'], ['other', 'Outro serviço']] },
  arborizacao: { id: 'arborizacao', label: 'Arborização', title: 'Executor de arborização', path: '/prefeitura/executor/arborizacao', module: 'arborization', mapLabel: 'Mapa de arborização', services: [['poda', 'Poda'], ['remocao', 'Remoção'], ['vistoria', 'Vistoria'], ['tratamento', 'Tratamento'], ['plantio', 'Plantio']] },
  ruas: { id: 'ruas', label: 'Ruas', title: 'Executor de ruas', path: '/prefeitura/executor/ruas', module: 'urban_planning', mapLabel: 'Mapa de ruas', services: [['reparo', 'Reparo da via'], ['pavimentacao', 'Pavimentação'], ['vistoria', 'Vistoria'], ['sinalizacao', 'Sinalização'], ['outro', 'Outro serviço']] },
  servicos_gerais: { id: 'servicos_gerais', label: 'Serviços gerais', title: 'Executor de serviços gerais', path: '/prefeitura/executor/servicos_gerais', module: null, mapLabel: 'Mapa de ocorrências', services: [['manutencao', 'Manutenção'], ['limpeza', 'Limpeza'], ['vistoria', 'Vistoria'], ['outro', 'Outro serviço']] },
};
export const executionActivity = id => EXECUTION_ACTIVITIES[id] || null;
export function executorHome(workspace) {
  return (workspace.executionSpecialties || (workspace.canExecuteLighting ? ['eletricista'] : [])).map(executionActivity).find(Boolean)?.path || null;
}
export function executorActivityForPath(pathname) {
  if (pathname.startsWith('/prefeitura/eletricista')) return EXECUTION_ACTIVITIES.eletricista;
  return executionActivity(pathname.split('/')[3]);
}
export function executionForCategory(channels, channelId, categoryId) {
  const channel = channels.find(row => String(row.id) === String(channelId));
  return channel?.execution_specialties?.find(id => channel.execution_categories?.[id]?.includes(categoryId)) || (categoryId === 'iluminacao' ? 'eletricista' : '');
}
export function validateExecutorResult(activity, { result = '', services = [], note = '' }) {
  if (!activity || !services.length || services.some(id => !activity.services.some(([key]) => id === key))) return 'Selecione os serviços executados nesta atividade.';
  if (result.trim().length > 4000 || note.trim().length > 5000) return 'Use até 4000 caracteres no resultado e 5000 no registro técnico.';
  return '';
}

// Preview only; the server derives and validates the same scope on every save.
export function departmentExecutionScope(categories = [], modules = []) {
  return [...new Set(categories)].reduce((scope, category) => {
    const specialty = category === 'iluminacao' ? 'eletricista' : category === 'poda' && modules.includes('arborization') ? 'arborizacao' : category === 'buracos' && modules.includes('urban_planning') ? 'ruas' : 'servicos_gerais';
    (scope[specialty] ||= []).push(category);
    return scope;
  }, {});
}
export function eligibleExecutors(context, channelId, categoryId) {
  const specialty = executionForCategory(context.channels || [], channelId, categoryId);
  return [...new Map((context.members || []).filter(member => member.ativo && member.especialidades_execucao?.includes(specialty)
    && (String(member.canal_id) === String(channelId) || (specialty === 'eletricista' && context.categoryChannels?.some(mapping => mapping.category_id === 'iluminacao' && String(mapping.canal_id) === String(member.canal_id)))))
    .map(member => [member.user_id, member])).values()];
}
