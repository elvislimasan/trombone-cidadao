import { poleCode } from '@/lib/poleDisplay';
import { categoriaPorId } from '@/lib/reportCategories';
import { rotuloDoTipoDeProblema } from '@/lib/reportCategoryFields';

export function receiptCategory(report) {
  return report.category?.name || categoriaPorId(report.category_id)?.name || report.category_id || 'Não informada';
}

export function receiptProblemFields(report) {
  const fields = [];
  if (report.issue_type) fields.push({ label: 'Tipo do problema', value: rotuloDoTipoDeProblema(report.category_id, report.issue_type) });
  if (report.pole_number) fields.push({ label: 'Plaqueta do poste', value: poleCode(report.pole_number) });
  if (report.reference_point) fields.push({ label: 'Ponto de referência', value: report.reference_point });
  if (report.is_from_water_utility) fields.push({ label: 'Origem informada', value: 'Obra de água ou esgoto' });
  return fields;
}
