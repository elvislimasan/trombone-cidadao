const messages = {
  missing_recaptcha_token: 'Marque novamente o reCAPTCHA antes de enviar.',
  recaptcha_failed: 'Não foi possível validar o reCAPTCHA. Marque a confirmação novamente e tente enviar.',
  city_unresolved: 'Não foi possível identificar a cidade. Confira o marcador no mapa e tente novamente.',
  duplicate_pole_report: 'Já existe uma bronca aberta para este poste. Confira a bronca existente no mapa.',
  invalid_payload: 'Confira os campos da bronca e o local marcado no mapa antes de enviar.',
  missing_media: 'O envio anônimo está temporariamente indisponível. Seu formulário foi mantido. Tente novamente em instantes.',
  invalid_media: 'Um dos anexos não pôde ser preparado. Troque o arquivo ou envie a bronca sem ele.',
};

export async function anonymousReportError(error, data) {
  let body = data;
  const context = error?.context;
  if (!body?.error && context && typeof context.json === 'function') {
    try { body = await (typeof context.clone === 'function' ? context.clone() : context).json(); }
    catch { /* Uma resposta sem JSON não deve substituir a mensagem de recuperação. */ }
  }
  const code = body?.error || body?.code || null;
  const status = Number(context?.status) || null;
  let message = messages[code];
  if (!message) {
    if (error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError') message = 'Não foi possível conectar ao serviço. Confira a internet e tente novamente.';
    else if (status === 401 || status === 403) message = 'Não foi possível autorizar o envio anônimo. Atualize o aplicativo e tente novamente.';
    else message = 'Não foi possível registrar a bronca. Seu formulário foi mantido. Tente novamente.';
  }
  return Object.assign(new Error(message), { code, status });
}
