import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AGENCY_CASE_STATUSES, AGENCY_PRIORITIES, agencyStatus } from '@/lib/agencyPanel';

const STEPS = [
  { id: 'entrada', label: 'Receber', hint: 'Conferir e encaminhar', statuses: ['nova', 'recebida', 'triagem'], description: 'Confira a solicitação e a secretaria responsável antes de organizar o atendimento.' },
  { id: 'responsavel', label: 'Responsável', hint: 'Definir quem atende', statuses: ['atribuida'], description: 'Escolha a pessoa da secretaria que acompanhará esta demanda.' },
  { id: 'planejamento', label: 'Planejar', hint: 'Protocolo e previsão', statuses: ['programada'], description: 'Registre o protocolo e a previsão de atendimento para orientar a equipe.' },
  { id: 'execucao', label: 'Executar', hint: 'Registrar o andamento', statuses: ['em_execucao', 'execucao_informada'], description: 'Atualize o andamento conforme o serviço for iniciado ou executado.' },
  { id: 'conclusao', label: 'Concluir', hint: 'Confirmar o resultado', statuses: ['aguardando_confirmacao', 'encerrada'], description: 'Informe o resultado ao cidadão. Encerre apenas depois de verificar a conclusão do atendimento.' },
];
const stepIndex = (status) => Math.max(0, STEPS.findIndex((step) => step.statuses.includes(status)));
const NEXT_ACTION = {
  nova: { status: 'recebida', label: 'Registrar recebimento', step: 0 },
  recebida: { status: 'triagem', label: 'Iniciar triagem', step: 0 },
  triagem: { label: 'Definir responsável', step: 1 },
  atribuida: { label: 'Planejar atendimento', step: 2 },
  programada: { status: 'em_execucao', label: 'Iniciar execução', step: 3 },
  em_execucao: { status: 'execucao_informada', label: 'Informar serviço executado', step: 3 },
  execucao_informada: { status: 'aguardando_confirmacao', label: 'Solicitar confirmação', step: 4 },
  aguardando_confirmacao: { label: 'Revisar conclusão', step: 4 },
};
const selectClass = 'mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60';

export default function AgencyCaseWorkflow({ item, form, setForm, canOperate, cityAdministrator, channelMembers, cityChannels, destinationId, setDestinationId, routeCase, busy, routing, dirty }) {
  const [active, setActive] = useState(() => stepIndex(item.status));
  const [communication, setCommunication] = useState('public');
  useEffect(() => setActive(stepIndex(item.status)), [item.report_id, item.status]);
  const triage = item.canal?.canal_triagem;
  const current = stepIndex(item.status);
  const next = NEXT_ACTION[form.status];
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const chooseStatus = (status) => {
    update('status', status);
    setActive(stepIndex(status));
    if (status === 'recusada') setCommunication('public');
  };
  const statusAction = (status, label, disabled = false) => <Button type="button" variant={form.status === status ? 'secondary' : 'outline'} disabled={!canOperate || busy || triage || disabled || form.status === status} onClick={() => chooseStatus(status)}>{label}</Button>;

  return <div className="min-w-0 space-y-5">
    <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-label="Etapas do atendimento">
      <h2 className="font-black">Conduzir atendimento</h2>
      <p className="mt-1 text-xs leading-5 text-content-secondary">Clique em uma etapa para abrir seus campos. As alterações só são aplicadas ao salvar.</p>
      <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-5" aria-label="Escolher etapa">
        {STEPS.map((step, index) => <button key={step.id} type="button" onClick={() => setActive(index)} aria-pressed={active === index} aria-controls="agency-step-panel" className={`min-w-0 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active === index ? 'border-brand bg-brand-subtleBg' : 'border-edge-subtle bg-surface-subtle hover:border-brand/50'}`}>
          <span className="flex items-center gap-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active === index ? 'bg-brand text-white' : 'bg-surface-raised text-content-secondary'}`}>{index + 1}</span><span className="text-xs font-bold">{step.label}</span></span>
          <span className="mt-2 block text-[11px] text-content-secondary">{step.hint}</span>
          {current === index && !['recusada', 'encerrada'].includes(item.status) && <span className="mt-1 block text-[10px] font-bold text-brand">Etapa registrada</span>}
        </button>)}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-subtle p-3">
        <div className="text-xs"><p className="text-content-secondary">Situação registrada: <strong className="text-content-primary">{agencyStatus(item.status).label}</strong></p>{form.status !== item.status && <p className="mt-1 font-semibold text-brand" role="status">Ao salvar: {agencyStatus(form.status).label}</p>}</div>
        {canOperate && !triage && next && form.status === item.status && <Button type="button" size="sm" disabled={busy} onClick={() => { if (next.status) update('status', next.status); setActive(next.step); }} className="h-auto min-h-9 whitespace-normal text-left">{next.label}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>}
      </div>

      <div id="agency-step-panel" className="mt-5 border-t border-edge-subtle pt-5">
        <h3 className="text-base font-bold">{active + 1}. {STEPS[active].label}</h3>
        <p className="mt-1 text-sm leading-6 text-content-secondary">{STEPS[active].description}</p>
        {triage && <p className="mt-3 rounded-xl bg-brand-subtleBg p-3 text-xs leading-5 text-content-secondary">Esta bronca está na triagem municipal. {cityAdministrator ? 'Selecione a secretaria na etapa Receber para liberar o atendimento.' : 'Aguarde o administrador encaminhar a bronca para uma secretaria.'}</p>}

        {active === 0 && <div className="mt-4 space-y-4">
          <p className="text-sm text-content-secondary"><Building2 className="mr-2 inline h-4 w-4" />Secretaria atual: <strong>{triage ? 'Triagem municipal' : item.canal?.nome}</strong></p>
          {cityAdministrator && <details open={triage || undefined} className="rounded-xl border border-edge-subtle p-3">
            <summary className="cursor-pointer text-sm font-semibold">{triage ? 'Escolher secretaria responsável' : 'Encaminhar para outra secretaria'}</summary>
            <Label htmlFor="agency-destination" className="mt-4 block">Secretaria de destino</Label>
            <select id="agency-destination" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={busy} className={selectClass}><option value="">Selecione uma secretaria</option>{cityChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select>
            <Button type="button" className="mt-3 gap-2" onClick={routeCase} disabled={busy || dirty || !destinationId || destinationId === item.canal_id}>{routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{routing ? 'Encaminhando...' : 'Confirmar encaminhamento'}</Button>
            {dirty && <p className="mt-2 text-xs text-content-secondary">Salve as alterações pendentes antes de encaminhar.</p>}
            {!cityChannels.length && <p className="mt-2 text-xs text-content-secondary">Cadastre e ative uma secretaria para encaminhar esta bronca.</p>}
          </details>}
          <div><Label htmlFor="agency-priority">Prioridade do atendimento</Label><select id="agency-priority" value={form.priority} onChange={(event) => update('priority', event.target.value)} disabled={!canOperate || busy} className={selectClass}>{AGENCY_PRIORITIES.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</select></div>
          <div className="flex flex-wrap gap-2">{statusAction('recebida', 'Registrar recebimento')}{statusAction('triagem', 'Marcar em triagem')}</div>
        </div>}
        {active === 1 && <div className="mt-4 space-y-3">
          <Label htmlFor="agency-assignee">Pessoa responsável</Label>
          <select id="agency-assignee" value={form.assignedTo} onChange={(event) => update('assignedTo', event.target.value)} disabled={!canOperate || busy || triage} className={selectClass}><option value="">Selecione um membro da secretaria</option>{channelMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.perfil?.name || member.user_id}</option>)}</select>
          {!channelMembers.length && <p className="text-xs text-content-secondary">Nenhum membro ativo nesta secretaria. Vincule a equipe para atribuir o atendimento.</p>}
          {statusAction('atribuida', 'Marcar como atribuída', !form.assignedTo)}
        </div>}
        {active === 2 && <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="agency-protocol">Protocolo</Label><Input id="agency-protocol" value={form.protocol} onChange={(event) => update('protocol', event.target.value)} disabled={!canOperate || busy} placeholder="Ex.: 2026/00123" className="mt-1" /></div><div className="min-w-0"><Label htmlFor="agency-deadline">Previsão de atendimento</Label><Input id="agency-deadline" type="datetime-local" value={form.deadline} onChange={(event) => update('deadline', event.target.value)} disabled={!canOperate || busy} className="mt-1 min-w-0" /></div></div>
          {statusAction('programada', 'Marcar como programada')}
        </div>}
        {active === 3 && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{statusAction('em_execucao', 'Iniciar execução')}{statusAction('execucao_informada', 'Informar serviço executado')}</div><p className="text-xs leading-5 text-content-secondary">Use a comunicação abaixo para explicar o que foi realizado e eventuais pendências.</p></div>}
        {active === 4 && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{statusAction('aguardando_confirmacao', 'Aguardar confirmação')}{statusAction('encerrada', 'Marcar como encerrada')}</div><p className="text-xs leading-5 text-content-secondary">Revise o resultado e a resposta pública antes de salvar o encerramento.</p></div>}
      </div>
      <details className="mt-5 border-t border-edge-subtle pt-4"><summary className="cursor-pointer text-xs font-semibold text-content-secondary">Outras situações / corrigir etapa</summary><Label htmlFor="agency-case-status" className="mt-3 block">Situação do atendimento</Label><select id="agency-case-status" value={form.status} onChange={(event) => chooseStatus(event.target.value)} disabled={!canOperate || busy || triage} className={selectClass}>{AGENCY_CASE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select><p className="mt-2 text-xs text-content-secondary">A recusa exige uma justificativa pública. Toda mudança fica no histórico.</p></details>
    </section>

    <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 font-bold"><MessageSquare className="h-4 w-4 text-brand" />Comunicar atualização</h2>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Visibilidade da mensagem">
        <Button type="button" variant={communication === 'public' ? 'default' : 'outline'} aria-pressed={communication === 'public'} onClick={() => setCommunication('public')}><Send className="mr-2 h-4 w-4" />Resposta pública{form.publicResponse.trim() ? ' · rascunho' : ''}</Button>
        <Button type="button" variant={communication === 'internal' ? 'default' : 'outline'} aria-pressed={communication === 'internal'} onClick={() => setCommunication('internal')}><FileText className="mr-2 h-4 w-4" />Nota interna{form.internalNote.trim() ? ' · rascunho' : ''}</Button>
      </div>
      <div className="mt-4" hidden={communication !== 'public'}>
        <Label htmlFor="agency-public-response">{form.status === 'recusada' ? 'Justificativa da recusa (obrigatória)' : 'Resposta oficial ao cidadão'}</Label>
        <p className="mt-1 text-xs leading-5 text-content-secondary">Ao salvar, esta mensagem aparece nos detalhes públicos da bronca, com a identificação da secretaria.</p>
        <textarea id="agency-public-response" value={form.publicResponse} onChange={(event) => update('publicResponse', event.target.value)} disabled={!canOperate || busy || triage} rows={5} maxLength={4000} placeholder="Explique a providência, a previsão ou o resultado do atendimento." className="mt-3 w-full resize-y rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-sm disabled:opacity-60" />
        <p className="text-right text-[11px] text-content-tertiary">{form.publicResponse.length}/4000</p>
      </div>
      <div className="mt-4" hidden={communication !== 'internal'}>
        <Label htmlFor="agency-internal-note">Anotação para a equipe</Label><p className="mt-1 text-xs leading-5 text-content-secondary">Visível apenas para a equipe municipal com acesso a este atendimento.</p>
        <textarea id="agency-internal-note" value={form.internalNote} onChange={(event) => update('internalNote', event.target.value)} disabled={!canOperate || busy} rows={5} maxLength={4000} placeholder="Registre contatos, pendências e orientações para a equipe." className="mt-3 w-full resize-y rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-sm disabled:opacity-60" />
        <p className="text-right text-[11px] text-content-tertiary">{form.internalNote.length}/4000</p>
      </div>
      {!canOperate && <p className="mt-3 text-xs text-content-secondary">Seu perfil permite somente consultar este atendimento.</p>}
    </section>
  </div>;
}
