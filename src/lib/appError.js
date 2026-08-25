export const APP_FEEDBACK_EVENT = 'app-feedback';
export const APP_ERROR_EVENT = APP_FEEDBACK_EVENT;

const toPlainText = (value) => {
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join(' ');
  if (typeof value === 'object' && value.props?.children != null) {
    return toPlainText(value.props.children);
  }
  return '';
};

/**
 * Exibe uma falha persistente dentro do layout atual.
 *
 * Aceita as duas assinaturas usadas anteriormente pelo app:
 * `showAppError({ title, description })` e
 * `showAppError('Título', { description })`.
 */
const showAppFeedback = (kind, messageOrOptions, options = {}) => {
  const objectStyle =
    messageOrOptions &&
    typeof messageOrOptions === 'object' &&
    !Array.isArray(messageOrOptions) &&
    !(messageOrOptions instanceof Error);

  const title = toPlainText(objectStyle ? messageOrOptions.title : messageOrOptions)
    || 'Não foi possível concluir';
  const description = toPlainText(
    objectStyle ? messageOrOptions.description : options?.description
  );
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_ERROR_EVENT, {
      detail: { id, kind, title, description },
    }));
  }

  return { id };
};

export const showAppError = (messageOrOptions, options = {}) =>
  showAppFeedback('error', messageOrOptions, options);

export const showAppNotice = (messageOrOptions, options = {}) =>
  showAppFeedback('success', messageOrOptions, options);

export const showAppInfo = (messageOrOptions, options = {}) =>
  showAppFeedback('info', messageOrOptions, options);
