import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML gerado por usuários (conteúdo de petições, notícias, blocos do
 * editor) antes de injetar via dangerouslySetInnerHTML.
 *
 * Remove <script>, atributos de evento (onerror, onclick, ...) e URLs
 * javascript:, mantendo a formatação rich-text produzida pelo TipTap
 * (parágrafos, headings, listas, links, imagens, ênfase, etc.).
 *
 * Sempre passe o HTML por aqui — nunca injete conteúdo cru de usuário.
 */
export const sanitizeHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  // USE_PROFILES html já remove <script>, event handlers (onerror/onclick/...)
  // e URLs javascript:, preservando a formatação do TipTap (inclusive style
  // inline usado para cor/alinhamento de texto, cujo conteúdo é higienizado).
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  });
};

// Força links a abrirem com rel de segurança (evita reverse tabnabbing).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export default sanitizeHtml;
