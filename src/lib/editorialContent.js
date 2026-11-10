// Keep evidence attached to unchanged paragraphs when a full article is rearranged.
// New paragraphs require an explicit source selection before saving.
export function editorialBlocksFromText(text, previous = []) {
  const paragraphs = text.split(/\n\s*\n/u).map(value => value.trim()).filter(Boolean);
  const used = new Set();
  const matches = paragraphs.map(value => {
    const match = previous.findIndex((block, offset) => !used.has(offset) && block.text.trim() === value);
    if (match >= 0) used.add(match);
    return match;
  });
  return paragraphs.map((value, index) => {
    const source = matches[index] >= 0 ? matches[index] : paragraphs.length === previous.length && !used.has(index) ? index : -1;
    if (source >= 0) used.add(source);
    return { text: value, fact_ids: source >= 0 ? [...previous[source].fact_ids] : [] };
  });
}

export function editorialTextError(blocks) {
  if (!blocks.length) return 'Escreva o texto da notícia.';
  if (blocks.length > 20) return 'Use no máximo 20 parágrafos.';
  if (blocks.some(block => block.text.length < 3 || block.text.length > 3000)) return 'Cada parágrafo deve ter entre 3 e 3.000 caracteres.';
  if (blocks.some(block => !block.fact_ids.length)) return 'Selecione as fontes dos novos trechos em “Fontes do texto”.';
  return '';
}
