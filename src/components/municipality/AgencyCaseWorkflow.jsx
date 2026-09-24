import React, { useEffect, useState } from 'react';
import { ClipboardList, FileText, Loader2, Send } from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AGENCY_CASE_STATUSES, AGENCY_PRIORITIES, agencyStatus } from '@/lib/agencyPanel';

const STEPS = [
  { id: 'entrada', label: 'Receber', statuses: ['nova', 'recebida', 'triagem'] },
  { id: 'responsavel', label: 'Responsável', statuses: ['atribuida'] },
  { id: 'planejamento', label: 'Planejar', statuses: ['programada'] },
  { id: 'execucao', label: 'Executar', statuses: ['em_execucao', 'execucao_informada'] },
  { id: 'conclusao', label: 'Concluir', statuses: ['aguardando_confirmacao', 'encerrada'] },
];
const stepIndex = (status) => Math.max(0, STEPS.findIndex((step) => step.statuses.includes(status)));

const selectClass = 'mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60';

export default function AgencyCaseWorkflow({ item, form, setForm, canOperate, cityAdministrator, channelMembers, cityChannels, destinationId, setDestinationId, routeCase, busy, routing, dirty, onSave, communicationOpen, setCommunicationOpen }) {
  const [active, setActive] = useState(() => stepIndex(item.status));
  const [communication, setCommunication] = useState('public');
  useEffect(() => {
    if (form.status === 'recusada' && item.status !== 'recusada') {
      setCommunication('public');
      setCommunicationOpen(true);
    }
  }, [form.status, item.status, setCommunicationOpen]);
  useEffect(() => setActive(stepIndex(item.status)), [item.report_id, item.status]);
  const triage = item.canal?.canal_triagem;
  const current = stepIndex(item.status);
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const chooseStatus = (status) => {
    update('status', status);
    setActive(stepIndex(status));
    if (status === 'recusada') setCommunication('public');
  };
  const statusAction = (status, label, disabled = false) => <Button type="button" variant={form.status === status ? 'secondary' : 'outline'} className="h-auto min-h-11 max-w-full whitespace-normal text-left" disabled={!canOperate || busy || triage || disabled || form.status === status} onClick={() => chooseStatus(status)}>{label}</Button>;

  return <div className="min-w-0 space-y-5">
    <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-label="Etapas do atendimento">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-3 text-base font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><ClipboardList className="h-5 w-5" /></span>Conduzir atendimento</h2>
        <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] text-content-secondary">{['recusada', 'encerrada'].includes(item.status) ? agencyStatus(item.status).label : `Etapa registrada: ${STEPS[current].label}`}</span>
      </div>
      <div className="mt-4 sm:hidden">
        <Label htmlFor="agency-step-select" className="text-xs text-content-secondary">Etapa {active + 1} de {STEPS.length}</Label>
        <select id="agency-step-select" value={active} onChange={(event) => setActive(Number(event.target.value))} className={selectClass}>
          {STEPS.map((step, index) => <option key={step.id} value={index}>{index + 1}. {step.label}</option>)}
        </select>
      </div>
      <nav className="mt-5 hidden grid-cols-5 gap-1 rounded-xl bg-surface-subtle p-1.5 sm:grid" aria-label="Escolher etapa">
        {STEPS.map((step, index) => <button key={step.id} type="button" onClick={() => setActive(index)} aria-pressed={active === index} aria-controls="agency-step-panel" className={`flex min-h-12 min-w-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-lg px-1 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active === index ? 'bg-surface-raised font-semibold text-brand shadow-sm ring-1 ring-inset ring-edge-subtle' : 'text-content-secondary hover:bg-surface-raised/70'}`}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${active === index ? 'bg-brand text-content-onBrand' : 'bg-surface-raised text-content-tertiary'}`}>{index + 1}</span><span>{step.label}</span>
        </button>)}
      </nav>

      <div id="agency-step-panel" className="mt-5">
        {triage && <p className="mt-3 rounded-xl bg-brand-subtleBg p-3 text-xs leading-5 text-content-secondary">Esta bronca está na triagem municipal. {cityAdministrator ? 'Selecione a secretaria na etapa Receber para liberar o atendimento.' : 'Aguarde o administrador encaminhar a bronca para uma secretaria.'}</p>}

        {active === 0 && <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="agency-destination">Secretaria responsável</Label>
            <select id="agency-destination" value={cityAdministrator ? (destinationId || item.canal_id) : item.canal_id} onChange={(event) => setDestinationId(event.target.value)} disabled={busy || !cityAdministrator} className={selectClass}>
              {!cityChannels.some((channel) => channel.id === item.canal_id) && <option value={item.canal_id}>{triage ? 'Triagem municipal' : item.canal?.nome || 'Secretaria atual'}</option>}
              {cityChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}
            </select>
            {cityAdministrator && destinationId && destinationId !== item.canal_id && <>
              <Button type="button" variant="outline" className="mt-3 h-auto min-h-11 max-w-full gap-2 whitespace-normal" onClick={routeCase} disabled={busy || dirty}>{routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{routing ? 'Encaminhando...' : 'Confirmar encaminhamento'}</Button>
              {dirty && <p className="mt-2 text-xs text-content-secondary">Salve as alterações pendentes antes de encaminhar.</p>}
            </>}
            {cityAdministrator && !cityChannels.length && <p className="mt-2 text-xs text-content-secondary">Cadastre e ative uma secretaria para encaminhar esta bronca.</p>}
          </div>
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
        {active === 3 && <div className="mt-4 flex flex-wrap gap-2">{statusAction('em_execucao', 'Iniciar execução')}{statusAction('execucao_informada', 'Informar serviço executado')}</div>}
        {active === 4 && <div className="mt-4 flex flex-wrap gap-2">{statusAction('aguardando_confirmacao', 'Aguardar confirmação')}{statusAction('encerrada', 'Marcar como encerrada')}</div>}
      </div>
      {form.status !== item.status && <p className="mt-4 text-xs text-content-secondary" role="status">Ao salvar: {agencyStatus(form.status).label}.</p>}
      <details className="mt-5 border-t border-edge-subtle pt-4"><summary className="cursor-pointer text-xs font-semibold text-content-secondary">Outras situações / corrigir etapa</summary><Label htmlFor="agency-case-status" className="mt-3 block">Situação do atendimento</Label><select id="agency-case-status" value={form.status} onChange={(event) => chooseStatus(event.target.value)} disabled={!canOperate || busy || triage} className={selectClass}>{AGENCY_CASE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select><p className="mt-2 text-xs text-content-secondary">A recusa exige uma justificativa pública. Toda mudança fica no histórico.</p></details>
    </section>

    <MunicipalDrawer open={communicationOpen} onClose={() => setCommunicationOpen(false)} busy={busy} title="Comunicar atualização" description="Escolha quem pode ver a mensagem. Ao fechar, o rascunho permanece neste atendimento até você salvar ou sair da página."
      footer={<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setCommunicationOpen(false)}>Voltar ao atendimento</Button>
        {canOperate && <Button type="button" disabled={busy || !dirty} className="h-auto min-h-11 whitespace-normal" onClick={async () => { if (await onSave()) setCommunicationOpen(false); }}>{busy ? 'Salvando...' : form.publicResponse.trim() ? 'Salvar e publicar resposta' : 'Salvar alterações'}</Button>}
      </div>}>
      <div id="agency-communication">
      <div className="flex flex-wrap gap-2" aria-label="Visibilidade da mensagem">
        <Button type="button" variant={communication === 'public' ? 'secondary' : 'ghost'} className="h-auto min-h-11 max-w-full whitespace-normal" aria-pressed={communication === 'public'} onClick={() => setCommunication('public')}><Send className="mr-2 h-4 w-4 shrink-0" />Resposta ao cidadão{form.publicResponse.trim() ? ' · rascunho' : ''}</Button>
        <Button type="button" variant={communication === 'internal' ? 'secondary' : 'ghost'} className="h-auto min-h-11 max-w-full whitespace-normal" aria-pressed={communication === 'internal'} onClick={() => setCommunication('internal')}><FileText className="mr-2 h-4 w-4 shrink-0" />Nota interna{form.internalNote.trim() ? ' · rascunho' : ''}</Button>
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
      </div>
    </MunicipalDrawer>
  </div>;
}
