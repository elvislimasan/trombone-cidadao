export const LAMP_TYPES = [
  'LED',
  'Vapor de sódio',
  'Vapor de mercúrio',
  'Iodetos metálicos',
  'Fluorescente',
  'Fluorescente compacta',
  'Incandescente',
  'Mista',
];

const fold = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

export function normalizeLampType(value) {
  const original = String(value ?? '').trim();
  if (!original) return '';
  const name = fold(original).replace(/^LAMPADA (?:DE |DO |DA )?/, '');
  if (/^LED(?:\b|$)/.test(name)) return 'LED';
  if (/^VAPOR DE SODIO(?:\b|$)/.test(name)) return 'Vapor de sódio';
  if (/^VAPOR DE MERCURIO(?:\b|$)/.test(name)) return 'Vapor de mercúrio';
  if (/^(?:IODO|IODETO|IODETOS) METALIC/.test(name) || /^VAPOR METALIC/.test(name)) return 'Iodetos metálicos';
  if (/^FLUORESCENTE COMPACTA(?:\b|$)/.test(name)) return 'Fluorescente compacta';
  if (/^FLUORESCENTE(?:\b|$)/.test(name)) return 'Fluorescente';
  if (/^INCANDESCENTE(?:\b|$)/.test(name)) return 'Incandescente';
  if (/^MISTA(?:\b|$)/.test(name)) return 'Mista';
  return original;
}

export function isStandardLampType(value) {
  return !value || LAMP_TYPES.includes(normalizeLampType(value));
}
