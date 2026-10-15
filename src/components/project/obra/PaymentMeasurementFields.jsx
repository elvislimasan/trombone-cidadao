import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, PlusCircle, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showAppError } from '@/lib/appError';
import { validateMeasurementPdf } from '@/lib/workPaymentMeasurement';

export function PaymentMeasurementFields({ form, onChange, pdfFile, onPdfFileChange, idPrefix = '', disabled = false }) {
  const fileRef = useRef(null);
  const hasMeasurement = Boolean(form.installment || form.measurement_date || form.execution_start_date || form.execution_end_date || form.measurement_pdf_url || pdfFile);
  const [expanded, setExpanded] = useState(hasMeasurement);
  const id = (name) => `${idPrefix}${name}`;
  const field = (name) => ({
    value: form[name] || '', disabled,
    onChange: (event) => onChange((previous) => ({ ...previous, [name]: event.target.value })),
  });
  return (
    <section className={`overflow-hidden rounded-xl border ${expanded || hasMeasurement ? 'border-edge-subtle' : 'border-dashed border-edge-default'}`}>
      <Button type="button" variant="ghost" disabled={disabled}
        aria-expanded={expanded} aria-controls={id('measurement-fields')}
        className="h-auto w-full justify-between gap-2 rounded-lg px-3 py-2.5 text-left"
        onClick={() => setExpanded((previous) => !previous)}>
        <span className="flex min-w-0 items-center gap-2">
          {!expanded && !hasMeasurement ? <PlusCircle className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
          <span className="text-sm">{!expanded && !hasMeasurement ? 'Adicionar boletim de medição' : `Boletim de medição${form.installment ? ` nº ${form.installment}` : ''}`}</span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </Button>
      <div id={id('measurement-fields')} hidden={!expanded} className="border-t px-3 pb-3 pt-2">
      <fieldset disabled={disabled} className="space-y-3">
      <legend className="sr-only">Dados opcionais do boletim de medição</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id('measurement-number')} className="text-xs">Número do boletim</Label>
          <Input id={id('measurement-number')} placeholder="Ex.: 01" className="h-9" {...field('installment')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id('measurement-date')} className="text-xs">Data do boletim (opcional)</Label>
          <Input id={id('measurement-date')} type="date" className="h-9" {...field('measurement_date')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id('execution-start')} className="text-xs">Início da execução (opcional)</Label>
          <Input id={id('execution-start')} type="date" className="h-9" {...field('execution_start_date')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id('execution-end')} className="text-xs">Fim da execução (opcional)</Label>
          <Input id={id('execution-end')} type="date" className="h-9" min={form.execution_start_date || undefined} {...field('execution_end_date')} />
        </div>
        <div className="grid content-start gap-1.5 min-w-0">
          <Label htmlFor={id('measurement-pdf')} className="text-xs">PDF do boletim (opcional)</Label>
          <Input ref={fileRef} id={id('measurement-pdf')} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              try { validateMeasurementPdf(file); onPdfFileChange(file); }
              catch (error) {
                event.target.value = '';
                onPdfFileChange(null);
                showAppError({ title: 'PDF inválido', description: error.message, variant: 'destructive' });
              }
            }} />
          <div className="flex min-w-0 items-center gap-1.5">
            <Button type="button" variant="outline" className="h-10 min-w-0 flex-1 justify-start gap-2 px-3 text-xs font-normal"
              onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 shrink-0 text-content-secondary" />
              <span className="truncate">{pdfFile?.name || 'Escolher PDF'}</span>
            </Button>
            {pdfFile && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
              aria-label="Remover PDF selecionado" title="Remover PDF selecionado" onClick={() => {
                onPdfFileChange(null);
                if (fileRef.current) fileRef.current.value = '';
              }}><X className="h-4 w-4" /></Button>}
          </div>
          <p className="text-xs text-muted-foreground">PDF de até 20 MB.</p>
        </div>
      <div className="grid content-start gap-1.5 min-w-0">
        <Label htmlFor={id('measurement-pdf-url')} className="text-xs">Ou link do PDF</Label>
        <Input id={id('measurement-pdf-url')} type="url" className="h-10 text-xs" placeholder="https://..." {...field('measurement_pdf_url')} disabled={disabled || Boolean(pdfFile)} />
        {!pdfFile && /^https?:\/\//i.test(form.measurement_pdf_url || '') && (
          <a href={form.measurement_pdf_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Abrir PDF vinculado</a>
        )}
      </div>
      </div>
      </fieldset>
      </div>
    </section>
  );
}
