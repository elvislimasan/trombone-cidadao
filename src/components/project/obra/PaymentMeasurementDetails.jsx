import { FileText } from 'lucide-react';

const dateLabel = (value) => value ? value.split('-').reverse().join('/') : 'não informado';

export function PaymentMeasurementDetails({ payment, showNumber = false }) {
  const { measurement_date, execution_start_date, execution_end_date, measurement_pdf_url } = payment;
  if (!measurement_date && !execution_start_date && !execution_end_date && !measurement_pdf_url && !(showNumber && payment.installment)) return null;
  return (
    <div className="mt-2 space-y-1 whitespace-normal text-xs text-muted-foreground">
      {showNumber && payment.installment && <div>Boletim nº {payment.installment}</div>}
      {measurement_date && <div>Data do boletim: {dateLabel(measurement_date)}</div>}
      {(execution_start_date || execution_end_date) && <div>Execução: {dateLabel(execution_start_date)} a {dateLabel(execution_end_date)}</div>}
      {/^https?:\/\//i.test(measurement_pdf_url || '') && (
        <a href={measurement_pdf_url} target="_blank" rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <FileText className="h-3.5 w-3.5" /> PDF do boletim
        </a>
      )}
    </div>
  );
}
