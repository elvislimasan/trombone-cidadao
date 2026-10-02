import { DEMAND_STATUSES, DEMAND_PRIORITIES } from '@/lib/municipalDemand';

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
export default function MunicipalDemandHistory({ events, context }) {
  return <section aria-label="Histórico do atendimento">
    <h2 className="mb-4 font-bold">Histórico do atendimento</h2>
    {!events.length && <p className="text-sm text-content-secondary">Nenhuma movimentação registrada.</p>}
    <ol className="grid min-w-0 items-start gap-3 xl:grid-cols-2">{events.map((event) => <li key={event.id} className="min-w-0 rounded-xl border border-edge-subtle p-3 text-sm">
      <p className="font-bold">{labels[event.tipo] || 'Movimentação registrada'}{event.visibilidade === 'publica' && <span className="ml-2 text-xs font-normal text-brand">Pública</span>}</p>
      <p className="mt-1 text-xs text-content-tertiary">{new Date(event.created_at).toLocaleString('pt-BR')} · {event.detalhes?.sistema ? 'Atualização automática' : event.autor?.name || 'Sistema / equipe municipal'}</p>
      {event.detalhes?.mensagem && <p className="mt-3 whitespace-pre-line break-words text-content-secondary">{event.detalhes.mensagem}</p>}
      {event.detalhes?.alteracoes && <dl className="mt-3 space-y-2">{Object.entries(event.detalhes.alteracoes).filter(([field]) => fields[field]).map(([field, values]) => <div key={field} className="break-words text-xs"><dt className="font-semibold">{fields[field]}</dt><dd className="mt-0.5 text-content-secondary">{valueLabel(field, values.antes, context)} → {valueLabel(field, values.depois, context)}</dd></div>)}</dl>}
      {event.detalhes?.arquivos && <p className="mt-2 text-xs text-content-secondary">{event.detalhes.arquivos.map((file) => file.nome).join(', ')}</p>}
    </li>)}</ol>
  </section>;
}
