import { CheckCircle2, FileText, Globe2, LockKeyhole, Paperclip, X } from 'lucide-react';
import DemandAttachments from '@/components/municipality/DemandAttachments';
import { Button } from '@/components/ui/button';

const groups = [
  {
    tipo: 'execucao',
    icon: FileText,
    title: 'Anexos de execução',
    description: 'Fotos e documentos de trabalho para a equipe municipal. Permanecem internos.',
  },
  {
    tipo: 'conclusao',
    icon: CheckCircle2,
    title: 'Comprovantes de conclusão',
    description: 'Mostre o resultado do serviço. Você pode publicar estes arquivos nas solicitações vinculadas.',
  },
];

export default function MunicipalDemandAttachmentsTab({ files, errors = {}, pendingFiles, editable, busy, canPublish, onAdd, onTogglePublic, onRemove }) {
  return <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm" aria-label="Anexos da ordem"><div className="grid min-w-0 flex-1 items-stretch gap-4 lg:grid-cols-2">
    {groups.map(({ tipo, icon: Icon, title, description }) => {
      const saved = files.filter((file) => (file.tipo || (file.visibilidade === 'publica' ? 'conclusao' : 'execucao')) === tipo);
      const pending = pendingFiles.filter((file) => file.tipo === tipo);
      return <div key={tipo} className={'flex min-w-0 flex-col gap-3 ' + (tipo === 'conclusao' ? 'lg:border-l lg:border-edge-subtle lg:pl-4' : '')} aria-label={title}>
        <div className="flex items-start gap-3"><span className={'rounded-xl p-2 ' + (tipo === 'conclusao' ? 'bg-status-progressBg text-status-progressFg' : 'bg-surface-subtle text-content-secondary')}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-content-secondary">{description}</p></div></div>
        {saved.length > 0 && <div className="max-h-52 overflow-y-auto pr-1"><DemandAttachments files={saved} /></div>}
        {!saved.length && !pending.length && <p className="rounded-lg border border-dashed border-edge-default bg-surface-subtle p-3 text-xs text-content-secondary">Nenhum arquivo nesta categoria.</p>}
        <div className="max-h-36 space-y-2 overflow-y-auto pr-1">{pending.map((entry) => <div key={entry.id} className="space-y-2 rounded-lg border border-edge-subtle bg-surface-subtle p-3 text-xs">
          <div className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-content-tertiary" /><span className="min-w-0 flex-1 break-words font-semibold">{entry.file.name}</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={'Retirar arquivo ' + entry.file.name} onClick={() => onRemove(entry.id)}><X className="h-4 w-4" /></Button></div>
          {tipo === 'conclusao' ? <label className="flex items-center gap-2 text-content-secondary"><input type="checkbox" className="accent-brand" checked={entry.visibilidade === 'publica'} disabled={!canPublish || busy} onChange={(event) => onTogglePublic(entry.id, event.target.checked)} /><Globe2 className="h-3.5 w-3.5" />Mostrar nas solicitações vinculadas</label> : <p className="flex items-center gap-2 text-content-tertiary"><LockKeyhole className="h-3.5 w-3.5" />Somente equipe municipal</p>}
        </div>)}</div>
        {tipo === 'conclusao' && !canPublish && <p className="text-xs text-content-secondary">Para publicar comprovantes, vincule uma solicitação e registre a execução na aba Atendimento.</p>}
        {editable && <label className="mt-auto inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-edge-subtle px-3 py-2 text-xs font-semibold hover:bg-surface-subtle"><Paperclip className="h-4 w-4" />Adicionar fotos ou PDF<input aria-invalid={Boolean(errors[tipo])} aria-describedby={errors[tipo] ? `demand-file-${tipo}-error` : undefined} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="sr-only" onChange={(event) => onAdd(event, tipo)} disabled={busy} /></label>}
        {errors[tipo] && <p id={`demand-file-${tipo}-error`} role="alert" className="text-xs text-danger">{errors[tipo]}</p>}
      </div>;
    })}
    <p className="text-xs text-content-tertiary lg:col-span-2">Até 10 arquivos por atualização, com no máximo 10 MB cada. Arquivos novos começam como internos.</p>
  </div></section>;
}
