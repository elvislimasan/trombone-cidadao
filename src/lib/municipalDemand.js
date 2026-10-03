export const DEMAND_STATUSES = [
  ['aberta', 'Aberta'], ['triagem', 'Em triagem'], ['programada', 'Programada'],
  ['em_andamento', 'Em execução'], ['aguardando_informacao', 'Aguardando informação'],
  ['aguardando_recurso', 'Aguardando recurso'], ['aguardando_confirmacao', 'Aguardando conferência interna'],
  ['concluida', 'Concluída'], ['recusada', 'Recusada'], ['cancelada', 'Cancelada'],
];
export const DEMAND_PRIORITIES = [['baixa', 'Baixa'], ['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']];
export const OPEN_DEMAND_STATUSES = DEMAND_STATUSES.map(([value]) => value).filter((value) => !['concluida', 'recusada', 'cancelada'].includes(value));
export const DEMAND_TONES = {
  aberta: 'bg-status-pendingBg text-status-pendingFg', triagem: 'bg-status-pendingBg text-status-pendingFg',
  programada: 'bg-status-progressBg text-status-progressFg', em_andamento: 'bg-status-progressBg text-status-progressFg',
  aguardando_informacao: 'bg-status-pendingBg text-status-pendingFg', aguardando_recurso: 'bg-status-pendingBg text-status-pendingFg',
  aguardando_confirmacao: 'bg-status-progressBg text-status-progressFg', concluida: 'bg-success-bg text-success-fg',
  recusada: 'bg-danger-subtleBg text-danger-subtleFg', cancelada: 'bg-surface-subtle text-content-secondary',
};
export const DEMAND_INITIAL_FORM = {
  titulo: '', descricao: '', bairro: '', endereco: '', latitude: '', longitude: '',
  category_id: '', issue_type: '', service_type: '', prioridade: 'normal', status: 'aberta', canal_id: '', atribuido_a: '',
  prazo_em: '', previsto_em: '', primeira_resposta_prazo_em: '', proxima_acao: '', proxima_acao_em: '',
  motivo_pendencia: '', resultado: '', registro_execucao: '', executada_em: '',
  origem: 'interno', protocolo_externo: '', pole_id: '',
};
export function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function canEditDemand(context, canalId) {
  return Boolean(context.isAdministrator || (canalId && context.editableChannelIds?.includes(String(canalId))));
}
export function suggestDemandAssignment(context, categoryId, currentChannel = '') {
  const channels = context.channels || [];
  const allowed = channels.filter((channel) => canEditDemand(context, String(channel.id)));
  const rule = context.serviceRules?.find((item) => item.category_id === categoryId);
  const matching = allowed.filter((channel) => context.categoryChannels?.some((mapping) => String(mapping.canal_id) === String(channel.id) && mapping.category_id === categoryId));
  const configured = allowed.find((channel) => String(channel.id) === String(rule?.canal_id));
  const channelId = currentChannel || configured?.id || (matching.length === 1 ? matching[0].id : allowed.length === 1 ? allowed[0].id : '');
  const members = (context.members || []).filter((member) => String(member.canal_id) === String(channelId) && member.ativo && ['gestor', 'operador'].includes(member.papel));
  const users = [...new Set(members.map((member) => member.user_id))];
  return { canal_id: String(channelId || ''), atribuido_a: users.length === 1 ? users[0] : '' };
}
export function formFromReport(report, context, now = new Date()) {
  const [lng, lat] = report.location?.coordinates || [];
  const rule = context.serviceRules?.find((item) => item.category_id === report.category_id);
  const deadline = (hours) => Number(hours) > 0 ? localDateTime(new Date(now.getTime() + Number(hours) * 3600000)) : '';
  return {
    ...DEMAND_INITIAL_FORM, ...suggestDemandAssignment(context, report.category_id),
    titulo: (report.title || '').slice(0, 180), descricao: report.description || '', bairro: report.neighborhood || '',
    endereco: report.address || '', latitude: Number.isFinite(lat) ? lat : '', longitude: Number.isFinite(lng) ? lng : '',
    category_id: report.category_id || '', issue_type: report.issue_type || '', prioridade: rule?.prioridade || 'normal', origem: 'bronca',
    pole_id: report.pole_id || '', prazo_em: deadline(rule?.atendimento_horas), primeira_resposta_prazo_em: deadline(rule?.primeira_resposta_horas),
  };
}
export function demandReportLocations(reports = []) {
  return reports.map((report) => {
    const [longitude, latitude] = report.location?.coordinates || [];
    const lat = latitude ?? report.location?.lat;
    const lng = longitude ?? report.location?.lng;
    const valid = (value, limit) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
    return {
      id: report.id, title: report.title || 'Solicitação vinculada',
      address: (report.address || '').trim(), neighborhood: (report.neighborhood || '').trim(),
      position: valid(lat, 90) && valid(lng, 180) ? { lat: Number(lat), lng: Number(lng) } : null,
    };
  });
}
export function demandPayload(form) {
  const dates = ['prazo_em', 'previsto_em', 'primeira_resposta_prazo_em', 'proxima_acao_em', 'executada_em'];
  const result = Object.fromEntries(Object.keys(DEMAND_INITIAL_FORM).map((key) => {
    const value = form[key];
    if (dates.includes(key)) return [key, value ? new Date(value).toISOString() : null];
    if (['latitude', 'longitude', 'pole_id'].includes(key)) return [key, value === '' || value == null ? null : Number(value)];
    return [key, typeof value === 'string' ? value.trim() || null : value ?? null];
  }));
  return result;
}
export function validateDemandFields(form, { previousStatus, reason = '', electricianMode = false } = {}) {
  const errors = {};
  if ((form.titulo || '').trim().length < 3) errors.titulo = 'Informe um título com pelo menos 3 caracteres.';
  if ((form.latitude === '') !== (form.longitude === '')) errors[form.latitude === '' ? 'latitude' : 'longitude'] = 'Informe latitude e longitude juntas.';
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]]) {
    if (form[key] !== '' && (!Number.isFinite(Number(form[key])) || Math.abs(Number(form[key])) > limit)) errors[key] = 'Informe coordenadas válidas.';
  }
  if (form.status !== previousStatus && ['programada', 'em_andamento', 'aguardando_confirmacao', 'concluida'].includes(form.status) && !form.canal_id) errors.canal_id = 'Defina a secretaria responsável pelo atendimento.';
  if (form.status === 'programada' && !form.previsto_em) errors.previsto_em = 'Informe a previsão de execução.';
  if (['aguardando_informacao', 'aguardando_recurso'].includes(form.status)) {
    if ((form.motivo_pendencia || '').trim().length < 5) errors.motivo_pendencia = 'Explique a pendência com pelo menos 5 caracteres.';
    if (!form.proxima_acao_em) errors.proxima_acao_em = 'Informe quando a pendência será revista.';
  }
  if (form.status !== previousStatus && ['cancelada', 'recusada'].includes(form.status) && reason.trim().length < 5) errors.reason = 'Explique o motivo do cancelamento ou da recusa.';
  if (['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(previousStatus) && OPEN_DEMAND_STATUSES.includes(form.status) && form.status !== 'aguardando_confirmacao' && form.status !== previousStatus && reason.trim().length < 5) errors.reason = 'Explique o motivo da reabertura.';
  if (electricianMode && form.status === 'concluida' && form.category_id === 'iluminacao' && !['lamp_replacement', 'arm_installation', 'other'].includes(form.service_type)) errors.service_type = 'Selecione o serviço executado.';
  if (['concluida', 'aguardando_confirmacao'].includes(form.status) && form.resultado && form.resultado.trim().length > 0 && form.resultado.trim().length < 10) errors.resultado = 'Descreva o resultado com pelo menos 10 caracteres.';
  return errors;
}
export function validateDemand(form, options) {
  return Object.values(validateDemandFields(form, options))[0] || '';
}
export function suggestedPublicResponse(form) {
  const forecast = form.previsto_em ? new Date(form.previsto_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  if (['concluida', 'aguardando_confirmacao'].includes(form.status)) return form.resultado?.trim() || '';
  if (form.status === 'programada' && forecast) return `O atendimento foi programado para ${forecast}.`;
  if (form.status === 'em_andamento') return 'A equipe iniciou o atendimento desta solicitação.';
  if (form.status === 'triagem') return 'Recebemos a solicitação e estamos avaliando as providências necessárias.';
  return '';
}
export function evidenceError(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) return 'Use fotos JPG, PNG, WebP ou documentos PDF.';
  if (file.size > 10 * 1024 * 1024) return 'Cada arquivo pode ter no máximo 10 MB.';
  return '';
}
