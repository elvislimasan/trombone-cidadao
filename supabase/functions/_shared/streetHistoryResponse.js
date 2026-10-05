export function streetHistoryResponseError(response) {
  const candidate = response?.candidates?.[0];
  const reason = response?.promptFeedback?.blockReason
    || (candidate?.finishReason && candidate.finishReason !== 'STOP' ? candidate.finishReason : null);
  if (!reason) return null;
  if (['PROHIBITED_CONTENT', 'SAFETY', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT'].includes(reason)) {
    return {
      code: 'ai_content_blocked', providerReason: reason,
      message: 'O filtro de segurança do Gemini bloqueou a análise dos PDFs enviados. Esse retorno não identifica qual trecho provocou o bloqueio e não comprova um problema com o nome da rua. Confira os anexos e preencha a história manualmente enquanto os documentos são revisados. Os textos atuais foram preservados.',
    };
  }
  if (reason === 'MAX_TOKENS') return {
    code: 'ai_output_truncated', providerReason: reason,
    message: 'A resposta da IA atingiu o limite de tamanho e ficou incompleta. Nenhum texto foi substituído. Tente analisar PDFs menores.',
  };
  if (reason === 'RECITATION') return {
    code: 'ai_recitation_blocked', providerReason: reason,
    message: 'O Gemini interrompeu a resposta por possível reprodução de conteúdo protegido. Revise os PDFs ou preencha a história manualmente. Os textos atuais foram preservados.',
  };
  return {
    code: 'ai_response_incomplete', providerReason: reason,
    message: 'A IA interrompeu a análise antes de concluir o rascunho. Os textos atuais foram preservados. Tente novamente mais tarde.',
  };
}
