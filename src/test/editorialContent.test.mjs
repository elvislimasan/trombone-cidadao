import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialBlocksFromText, editorialTextError } from '../lib/editorialContent.js';

const blocks = [{ text: 'Primeiro fato confirmado.', fact_ids: ['F1'] }, { text: 'Segundo fato confirmado.', fact_ids: ['F2'] }];

test('edição do texto completo preserva fontes ao editar ou reordenar parágrafos', () => {
  assert.deepEqual(editorialBlocksFromText('Primeiro fato atualizado.\n\nSegundo fato confirmado.', blocks).map(block => block.fact_ids), [['F1'], ['F2']]);
  const reordered = editorialBlocksFromText('Segundo fato confirmado.\n\nPrimeiro fato confirmado.', blocks);
  assert.deepEqual(reordered.map(block => block.fact_ids), [['F2'], ['F1']]);
  assert.equal(editorialTextError(reordered), '');
});

test('novos trechos exigem fontes e trechos removidos não transferem suas referências', () => {
  const inserted = editorialBlocksFromText('Novo contexto.\n\nPrimeiro fato confirmado.\n\nSegundo fato confirmado.', blocks);
  assert.deepEqual(inserted.map(block => block.fact_ids), [[], ['F1'], ['F2']]);
  assert.match(editorialTextError(inserted), /Selecione as fontes/);
  assert.deepEqual(editorialBlocksFromText('Segundo fato confirmado.', blocks), [blocks[1]]);
  assert.deepEqual(editorialBlocksFromText('Segundo fato confirmado.\n\nNovo contexto.', blocks).map(block => block.fact_ids), [['F2'], []]);
});

test('texto completo valida limites de armazenamento antes de salvar', () => {
  assert.match(editorialTextError([]), /Escreva/);
  assert.match(editorialTextError(Array(21).fill(blocks[0])), /20/);
  for (const text of ['ab', 'a'.repeat(3001)]) assert.match(editorialTextError([{ text, fact_ids: ['F1'] }]), /3.000/);
  assert.equal(editorialTextError(editorialBlocksFromText('  Primeiro fato confirmado.\r\n \r\nSegundo fato confirmado.  ', blocks)), '');
});
