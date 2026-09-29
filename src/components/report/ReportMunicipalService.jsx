import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import DemandAttachments from '@/components/municipality/DemandAttachments';

const stages = {
  aberta: ['Recebida pela prefeitura', 'A prefeitura registrou uma ordem para acompanhar esta bronca.'],
  triagem: ['Em avaliação', 'A equipe está avaliando o serviço necessário.'],
  programada: ['Serviço programado', 'A prefeitura informou uma data prevista para executar o serviço.'],
  em_andamento: ['Serviço em execução', 'A equipe informou que iniciou o atendimento.'],
  aguardando_informacao: ['Aguardando informação', 'A prefeitura informou uma pendência antes de continuar.'],
  aguardando_recurso: ['Aguardando recursos', 'A prefeitura informou uma pendência de recursos para continuar.'],
  aguardando_confirmacao: ['Execução informada', 'A prefeitura registrou o resultado. A comunidade ainda pode verificar a bronca.'],
  concluida: ['Execução informada', 'A prefeitura encerrou a ordem. A verificação da bronca é feita pela comunidade.'],
  recusada: ['Atendimento recusado', 'A justificativa da prefeitura aparece nos comunicados oficiais.'],
  cancelada: ['Atendimento cancelado', 'A justificativa da prefeitura aparece nos comunicados oficiais.'],
};
const date = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function ReportMunicipalService({ reportId, reportStatus, onVerify }) {
  const [service, setService] = useState(null);
  useEffect(() => {
    let active = true;
    setService(null);
    supabase.rpc('atendimento_publico_bronca', { p_report: reportId })
      .then(({ data, error }) => { if (active && !error) setService(data); });
    return () => { active = false; };
  }, [reportId, reportStatus]);
  if (!service) return null;
  const executed = ['concluida', 'aguardando_confirmacao'].includes(service.status) && service.executada_em;
  const [stage, explanation] = stages[service.status] || ['Em atendimento', 'A prefeitura está acompanhando esta bronca.'];
  const files = executed ? service.anexos || [] : [];
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-brand/25 bg-surface-raised shadow-sm" aria-label="Atendimento da prefeitura">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand/15 bg-brand-subtleBg px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-content-onBrand"><ClipboardList className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-black">Atendimento da prefeitura</h2><p className="mt-1 break-words text-xs text-content-secondary">{service.orgao} · Ordem {service.protocolo}</p></div></div>
      <span className="rounded-full border border-brand/20 bg-surface-raised px-3 py-1 text-xs font-bold text-brand">{stage}</span>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><div className="min-w-0"><p className="text-xs font-bold">Situação informada pela prefeitura</p><p className="mt-1 text-sm leading-6 text-content-secondary">{explanation}</p>{service.updated_at && <p className="mt-1 text-[11px] text-content-tertiary">Ordem atualizada em {date(service.updated_at)}</p>}</div></div>
      {service.previsto_em && !executed && <div className="flex items-start gap-3 rounded-xl bg-surface-subtle p-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" /><div><p className="text-xs font-bold">Previsão informada</p><p className="mt-1 text-xs text-content-secondary">{date(service.previsto_em)}</p></div></div>}
      {executed && <div className="space-y-3 rounded-xl border border-edge-subtle bg-surface-subtle p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /><h3 className="text-sm font-bold">Serviço informado pela prefeitura</h3></div><p className="text-[11px] text-content-tertiary">Execução registrada em {date(service.executada_em)}</p><p className="whitespace-pre-line break-words text-sm leading-6 text-content-secondary">{service.resultado?.trim() || 'A prefeitura informou que o serviço foi executado.'}</p></div>}
      {files.length > 0 && <div className="space-y-3"><div><h3 className="text-sm font-bold">Comprovantes publicados pela prefeitura</h3><p className="mt-1 text-xs text-content-secondary">Arquivos de conclusão compartilhados com esta bronca.</p></div><DemandAttachments files={files} publicView /></div>}
      {service.revisao_pendente && <p className="rounded-xl border border-status-pendingBorder bg-status-pendingBg p-3 text-xs leading-5 text-status-pendingFg">A comunidade informou que o problema pode continuar. A prefeitura precisa revisar o atendimento.</p>}
      {executed && <div className="flex items-start gap-3 border-t border-edge-subtle pt-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><div className="min-w-0"><p className="text-xs font-bold">Verificação da comunidade</p><p className="mt-1 text-xs leading-5 text-content-secondary">{reportStatus === 'resolved' ? 'A resolução desta bronca foi verificada.' : 'A execução foi informada pela prefeitura. Confirme se o problema foi resolvido ou diga se ele continua.'}</p>{onVerify && reportStatus !== 'resolved' && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onVerify('solved')}>Foi resolvido</Button><Button size="sm" variant="outline" onClick={() => onVerify('still_here')}>O problema continua</Button></div>}</div></div>}
    </div>
  </section>;
}
