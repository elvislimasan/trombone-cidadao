import { poleReferenceText } from '@/lib/poleDisplay';
const statusSteps = {
  aberta: ['reopened', 'Atendimento reaberto'],
  triagem: ['triage', 'Em triagem'],
  programada: ['scheduled', 'Serviço programado'],
  em_andamento: ['started', 'Serviço iniciado'],
  aguardando_informacao: ['waiting_info', 'Aguardando informação'],
  aguardando_recurso: ['waiting_resource', 'Aguardando recurso'],
  aguardando_confirmacao: ['waiting_review', 'Aguardando conferência'],
  concluida: ['completed', 'Ordem concluída'],
  recusada: ['rejected', 'Atendimento recusado'],
  cancelada: ['canceled', 'Ordem cancelada'],
};

function stepFor(event) {
  const changes = event.detalhes?.alteracoes || {};
  if (event.tipo === 'criada') return { phase: 'created', title: 'Ordem criada' };
  if (event.tipo === 'solicitacao_atendida') return {
    phase: `report:${event.detalhes?.report_id || event.id}`,
    title: `Solicitação resolvida: ${poleReferenceText(event.detalhes?.titulo || 'sem título')}`,
  };
  if (event.tipo === 'resolucao_confirmada') return { phase: 'verified', title: 'Resolução verificada' };
  if (event.tipo === 'contestacao') return { phase: 'contested', title: 'Resolução contestada' };
  if (event.tipo === 'reaberta') return { phase: 'reopened', title: 'Atendimento reaberto' };
  if (event.tipo === 'encaminhada') return { phase: 'forwarded', title: 'Ordem encaminhada' };
  if (event.tipo === 'atribuida') return { phase: 'assigned', title: 'Ordem atribuída' };
  if (event.tipo !== 'atualizada') return null;
  if (changes.poste && /resolvid/i.test(event.detalhes?.mensagem || '')) return { phase: 'completed', title: 'Poste consertado', preferred: true };
  const status = changes.status?.depois;
  if (status === 'aberta' && !['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(changes.status?.antes)) return null;
  if (statusSteps[status]) {
    const [phase, title] = statusSteps[status];
    return { phase, title };
  }
  if (changes.atribuido_a?.depois) return { phase: 'assigned', title: 'Ordem atribuída' };
  return null;
}

export function electricianTimeline(events) {
  const steps = [];
  for (const event of events) {
    const step = stepFor(event);
    if (!step) continue;
    const timestamp = Date.parse(event.created_at);
    const duplicate = steps.findIndex((item) => item.phase === step.phase
      && Number.isFinite(timestamp) && Number.isFinite(item.timestamp)
      && Math.abs(item.timestamp - timestamp) <= 60_000);
    const item = { id: event.id, created_at: event.created_at, timestamp, ...step };
    if (duplicate < 0) steps.push(item);
    else if (step.preferred && !steps[duplicate].preferred) steps[duplicate] = item;
  }
  return steps.filter((item) => item.phase !== 'verified' || !steps.some((other) => other.phase === 'completed'
    && Number.isFinite(item.timestamp) && Number.isFinite(other.timestamp)
    && Math.abs(item.timestamp - other.timestamp) <= 60_000));
}
