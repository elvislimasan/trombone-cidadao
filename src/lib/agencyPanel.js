export const AGENCY_CASE_STATUSES = Object.freeze([
  { id: 'nova', label: 'Aguardando recebimento', tone: 'bg-surface-subtle text-content-secondary border-edge-subtle' },
  { id: 'recebida', label: 'Recebida', tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'triagem', label: 'Em triagem', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'atribuida', label: 'Atribuída', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'programada', label: 'Programada', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'em_execucao', label: 'Em execução', tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'execucao_informada', label: 'Execução informada', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'aguardando_confirmacao', label: 'Aguardando confirmação', tone: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'encerrada', label: 'Encerrada', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'recusada', label: 'Recusada', tone: 'bg-red-50 text-red-700 border-red-200' },
]);

export const AGENCY_PRIORITIES = Object.freeze([
  { id: 'baixa', label: 'Baixa' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
  { id: 'urgente', label: 'Urgente' },
]);

export const AGENCY_MEMBER_ROLES = Object.freeze([
  { id: 'gestor', label: 'Gestor' },
  { id: 'operador', label: 'Atendente/técnico' },
  { id: 'leitura', label: 'Somente leitura' },
]);

export const agencyStatus = (id) =>
  AGENCY_CASE_STATUSES.find((status) => status.id === id) || {
    id: id || 'desconhecida',
    label: 'Situação desconhecida',
    tone: 'bg-slate-100 text-slate-700 border-slate-200',
  };

// A capa escolhida tem prioridade; as fotos anexadas cobrem registros sem capa
// e permitem tentar outra imagem quando um arquivo não estiver disponível.
export const agencyReportImages = (report) => [...new Set([
  report?.featured_image_url,
  ...(report?.report_media || [])
    .filter((media) => media.type === 'photo')
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map((media) => media.url),
].filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim()))];

// A idade é a do registro original da bronca, não a entrada na secretaria.
export const agencyCaseStatus = (item, now = Date.now()) => {
  const createdAt = item?.report?.created_at;
  const age = createdAt ? now - new Date(createdAt).getTime() : NaN;
  if (item?.status === 'nova' && Number.isFinite(age) && age >= 0 && age <= 7 * 86400000) {
    return { id: 'nova', label: 'Nova', tone: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  return agencyStatus(item?.status);
};

export const agencyCaseCounts = (cases = []) => cases.reduce((counts, item) => {
  counts.total += 1;
  if (item.status === 'nova') counts.novas += 1;
  if (!['encerrada', 'recusada'].includes(item.status)) counts.abertas += 1;
  if (item.prazo_em && new Date(item.prazo_em).getTime() < Date.now() && !['encerrada', 'recusada'].includes(item.status)) {
    counts.atrasadas += 1;
  }
  if (['execucao_informada', 'aguardando_confirmacao'].includes(item.status)) counts.aguardandoConfirmacao += 1;
  return counts;
}, { total: 0, novas: 0, abertas: 0, atrasadas: 0, aguardandoConfirmacao: 0 });

export const canOperateAgency = (role, isMunicipalityAdmin = false) =>
  Boolean(isMunicipalityAdmin || ['gestor', 'operador'].includes(role));

export const canManageAgencyTeam = (_role, isMunicipalityAdmin = false) =>
  Boolean(isMunicipalityAdmin);
