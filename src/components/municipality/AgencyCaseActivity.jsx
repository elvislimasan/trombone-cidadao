import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, FileText, MessageSquare } from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { agencyStatus } from '@/lib/agencyPanel';

const eventLabel = (type) => ({
  encaminhada: 'Encaminhamento registrado',
  resposta_publica: 'Resposta pública enviada',
  nota_interna: 'Nota interna adicionada',
  atribuida: 'Responsável alterado',
}[type] || 'Demanda atualizada');

export default function AgencyCaseActivity({ events, responses }) {
  const [open, setOpen] = useState(false);

  const activity = useMemo(() => {
    // A mensagem e seu evento são criados na mesma transação. Exiba o texto
    // uma única vez, preservando eventos cujo conteúdo não foi carregado.
    const messageEvents = new Set(responses.map((response) => `${response.visibilidade === 'publica' ? 'resposta_publica' : 'nota_interna'}:${response.created_at}`));
    return [
      ...responses.map((response) => ({ ...response, key: `response-${response.id}`, message: true })),
      ...events.filter((event) => !messageEvents.has(`${event.tipo}:${event.created_at}`)).map((event) => ({ ...event, key: `event-${event.id}`, message: false })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [events, responses]);

  return <>
    <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm" aria-label="Atividade do atendimento">
      <h2 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-subtle"><Clock className="h-4 w-4 text-content-secondary" /></span>Atividade <span className="ml-auto rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-content-secondary">{activity.length}</span></h2>
      <p className="mt-3 text-xs leading-5 text-content-secondary">Acompanhe as respostas, notas internas e movimentações deste atendimento.</p>
      {activity[0] && <div className="mt-4 border-l-2 border-brand/30 pl-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-content-tertiary">Última atualização</p>
        <p className="mt-1 text-xs font-medium">{activity[0].message ? (activity[0].visibilidade === 'publica' ? 'Resposta ao cidadão' : 'Nota interna') : eventLabel(activity[0].tipo)}</p>
        <p className="mt-1 text-[11px] text-content-tertiary">{new Date(activity[0].created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>}
      <Button onClick={() => setOpen(true)} variant="outline" className="mt-4 w-full justify-between gap-2 text-xs">Ver histórico<ArrowUpRight className="h-4 w-4" /></Button>
    </section>
    <MunicipalDrawer open={open} onClose={() => setOpen(false)} title="Atividade do atendimento" description="Respostas, notas e movimentações · mais recentes primeiro">
      <ol className="space-y-5 py-2">
        {activity.map((entry) => {
          const Icon = entry.message ? (entry.visibilidade === 'publica' ? MessageSquare : FileText) : Clock;
          return <li key={entry.key} className="relative min-w-0 border-l border-edge-subtle pl-4">
            <Icon className="absolute -left-2 top-0.5 h-4 w-4 bg-surface-raised text-content-tertiary" />
            <p className="text-xs font-semibold">{entry.message ? (entry.visibilidade === 'publica' ? 'Resposta ao cidadão' : 'Nota interna · equipe') : eventLabel(entry.tipo)}</p>
            {entry.message && <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-5 text-content-secondary">{entry.mensagem}</p>}
            {!entry.message && entry.para_status && <p className="mt-1 text-xs text-content-secondary">{agencyStatus(entry.para_status).label}</p>}
            <p className="mt-1.5 break-words text-[11px] leading-4 text-content-tertiary">{entry.autor?.name || entry.orgao_nome || 'Sistema'} · {new Date(entry.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </li>;
        })}
      </ol>
      {!activity.length && <p className="py-3 text-xs text-content-secondary">Nenhuma movimentação registrada.</p>}
    </MunicipalDrawer>
  </>;
}
