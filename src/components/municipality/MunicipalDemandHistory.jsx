import { Clock3 } from 'lucide-react';
import { DEMAND_STATUSES, DEMAND_PRIORITIES } from '@/lib/municipalDemand';
import { electricianTimeline } from '@/lib/electricianTimeline';

const labels = { criada: 'Demanda criada', atualizada: 'Atendimento atualizado', atribuida: 'Responsável alterado', encaminhada: 'Encaminhada', reaberta: 'Atendimento reaberto', justificativa: 'Justificativa registrada', resposta_publica: 'Resposta oficial publicada', nota_interna: 'Nota para a equipe', bronca_vinculada: 'Solicitação vinculada', anexos: 'Evidências anexadas', contestacao: 'Resultado contestado', resolucao_confirmada: 'Resolução verificada' };
const fields = { status: 'Etapa', prioridade: 'Prioridade', atribuido_a: 'Responsável', canal_id: 'Secretaria', prazo_em: 'Prazo', previsto_em: 'Previsão', titulo: 'Título', descricao: 'Descrição', bairro: 'Bairro', endereco: 'Endereço', primeira_resposta_prazo_em: 'Prazo de primeira resposta', primeira_resposta_em: 'Primeira resposta', proxima_acao: 'Próxima ação', proxima_acao_em: 'Data da próxima ação', motivo_pendencia: 'Pendência', resultado: 'Resultado', registro_execucao: 'Registro técnico', service_type: 'Serviço executado', executada_em: 'Execução', revisao_pendente: 'Revisão pendente', concluida_em: 'Conclusão', ciclo_iniciado_em: 'Novo ciclo', origem: 'Origem', pole_id: 'Poste', protocolo_externo: 'Protocolo externo' };
function valueLabel(field, value, context) {
  if (value == null || value === '') return 'Não definido';
  if (field === 'status') return DEMAND_STATUSES.find(([id]) => id === value)?.[1] || value;
  if (field === 'prioridade') return DEMAND_PRIORITIES.find(([id]) => id === value)?.[1] || value;
  if (field === 'canal_id') return context.channels.find((item) => item.id === value)?.nome || 'Secretaria anterior';
  if (field === 'atribuido_a') return context.members.find((item) => item.user_id === value)?.perfil?.name || 'Pessoa anteriormente vinculada';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (field.endsWith('_em')) return new Date(value).toLocaleString('pt-BR');
  return String(value);
}
export default function MunicipalDemandHistory({ events, context, variant = 'cards' }) {
  const timeline = variant === 'timeline';
  const steps = timeline ? electricianTimeline(events) : [];
  return <section aria-label="Histórico do atendimento">
    <div className={timeline ? 'mb-5' : 'mb-4'}>
      <h2 className={timeline ? 'flex items-center gap-2 font-display text-lg font-extrabold' : 'font-bold'}>
        {timeline && <Clock3 aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" />}
        Histórico do atendimento
      </h2>
    </div>
    {timeline && !steps.length && <p className="text-sm text-content-secondary">Nenhuma etapa registrada.</p>}
    {!timeline && !events.length && <p className="text-sm text-content-secondary">Nenhuma movimentação registrada.</p>}
    {timeline && <ol className="ml-2 min-w-0 border-l-2 border-brand/20 md:ml-0 md:grid md:grid-cols-2 md:items-start md:gap-4 md:border-l-0">{steps.map((step) => <li key={step.id} className="relative min-w-0 pb-5 pl-5 last:pb-0 md:rounded-xl md:border md:border-edge-subtle md:border-l-2 md:border-l-brand/30 md:p-4">
      <span aria-hidden="true" className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-[3px] border-surface-raised bg-brand md:-left-[7px] md:top-5" />
      <p className="break-words text-base font-bold leading-6 text-content-primary">{step.title}</p>
      <time dateTime={step.created_at} className="mt-1 block text-[13px] leading-5 text-content-secondary">{new Date(step.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
    </li>)}</ol>}
    {!timeline && <ol className="grid min-w-0 items-start gap-3 xl:grid-cols-2">{events.map((event) => <li key={event.id} className="min-w-0 rounded-xl border border-edge-subtle p-3 text-sm">
      <div className="min-w-0">
        <p className="font-bold">{labels[event.tipo] || 'Movimentação registrada'}{event.visibilidade === 'publica' && <span className="ml-2 text-xs font-normal text-brand">Pública</span>}</p>
        <p className="mt-1 text-xs text-content-tertiary"><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('pt-BR')}</time><span aria-hidden="true"> · </span>{event.detalhes?.sistema ? 'Atualização automática' : event.autor?.name || 'Sistema / equipe municipal'}</p>
        {event.detalhes?.mensagem && <p className="mt-3 whitespace-pre-line break-words text-content-secondary">{event.detalhes.mensagem}</p>}
        {event.detalhes?.alteracoes && <dl className="mt-3 space-y-2">{Object.entries(event.detalhes.alteracoes).filter(([field]) => fields[field]).map(([field, values]) => <div key={field} className="break-words text-xs"><dt className="font-semibold">{fields[field]}</dt><dd className="mt-0.5 text-content-secondary">{valueLabel(field, values.antes, context)} → {valueLabel(field, values.depois, context)}</dd></div>)}</dl>}
        {event.detalhes?.arquivos && <p className="mt-2 text-xs text-content-secondary">{event.detalhes.arquivos.map((file) => file.nome).join(', ')}</p>}
      </div>
    </li>)}</ol>}
  </section>;
}
