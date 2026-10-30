export const EMPTY_PAYMENT_MEASUREMENT = {
  contractor_id: '', measurement_pdf_url: '', photo_report_pdf_url: '', measurement_date: '',
  execution_start_date: '', execution_end_date: '',
};

export function resolvePaymentContractor(payment, contractors, fallback) {
  if (payment?.contractor_id) return payment.contractor_id;
  const name = String(payment?.creditor_name || fallback?.name || '').trim().toLocaleLowerCase('pt-BR');
  const matches = contractors.filter((contractor) => contractor.name.trim().toLocaleLowerCase('pt-BR') === name);
  return matches.length === 1 ? matches[0].id : '';
}

export function paymentMeasurementFields(form, contractors) {
  const start = form.execution_start_date || null;
  const end = form.execution_end_date || null;
  if (start && end && end < start) throw new Error('O fim do período de execução deve ser igual ou posterior ao início.');
  const url = String(form.measurement_pdf_url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Informe um link HTTP ou HTTPS para o PDF do boletim.');
  const photoReportUrl = String(form.photo_report_pdf_url || '').trim();
  if (photoReportUrl && !/^https?:\/\//i.test(photoReportUrl)) throw new Error('Informe um link HTTP ou HTTPS para o PDF do relatório fotográfico.');
  const contractor = contractors.find((item) => item.id === form.contractor_id);
  if (form.contractor_id && !contractor) throw new Error('Selecione uma construtora cadastrada.');
  return {
    contractor_id: contractor?.id || null,
    creditor_name: contractor?.name || form.creditor_name || null,
    measurement_pdf_url: url || null,
    photo_report_pdf_url: photoReportUrl || null,
    measurement_date: form.measurement_date || null,
    execution_start_date: start,
    execution_end_date: end,
  };
}

export function validateMeasurementPdf(file, documentLabel = 'boletim de medição') {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
    throw new Error(`Selecione um arquivo PDF para o ${documentLabel}.`);
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 20 MB.');
}

export async function uploadPaymentMeasurementPdf(supabase, measurementId, file) {
  return uploadPaymentPdf(supabase, measurementId, file, 'boletim', 'boletim de medição');
}

export async function uploadPaymentPhotoReportPdf(supabase, measurementId, file) {
  return uploadPaymentPdf(supabase, measurementId, file, 'relatorio-fotografico', 'relatório fotográfico');
}

async function uploadPaymentPdf(supabase, measurementId, file, suffix, documentLabel) {
  if (!file) return null;
  validateMeasurementPdf(file, documentLabel);
  const path = `measurements/${measurementId}/documents/${crypto.randomUUID()}-${suffix}.pdf`;
  const bucket = supabase.storage.from('work-media');
  const { error } = await bucket.upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  return { path, url: bucket.getPublicUrl(path).data.publicUrl };
}
