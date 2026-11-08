export const EDITORIAL_TONES = {
  informative: 'Informativo', conversational: 'Conversado', light: 'Leve', humorous: 'Com humor', critical: 'Crítico e construtivo',
};
export const EDITORIAL_NEWS_STYLES = { direct: 'Notícia direta', explainer: 'Explicativa', story: 'História local' };
export const EDITORIAL_VIDEO_STYLES = { presenter: 'Apresentação', voiceover: 'Narração', dialogue: 'Diálogo entre apresentadores' };
export const EDITORIAL_SPEAKERS = { presenter: 'Apresentador(a)', narrator: 'Narração', presenter_a: 'Apresentador A', presenter_b: 'Apresentador B' };
export const DEFAULT_EDITORIAL_BRIEF = Object.freeze({ schema_version: 1, tone: 'informative', news_style: 'direct', video_style: 'presenter', guidance: '' });

export function normalizeEditorialBrief(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Escolha um estilo editorial válido.');
  const result = { ...DEFAULT_EDITORIAL_BRIEF, ...value };
  if (!Object.hasOwn(EDITORIAL_TONES, result.tone) || !Object.hasOwn(EDITORIAL_NEWS_STYLES, result.news_style)
    || !Object.hasOwn(EDITORIAL_VIDEO_STYLES, result.video_style) || typeof result.guidance !== 'string'
    || result.guidance.length > 1000 || /[<>]/.test(result.guidance)) throw new Error('Escolha um estilo válido e uma orientação de até 1000 caracteres em texto simples.');
  return { schema_version: 1, tone: result.tone, news_style: result.news_style, video_style: result.video_style, guidance: result.guidance.trim() };
}

export function editorialBriefKey(value, format) {
  const brief = normalizeEditorialBrief(value || {});
  return JSON.stringify({ tone: brief.tone, style: format === 'news' ? brief.news_style : brief.video_style,
    guidance: brief.guidance, script_schema: format === 'news' ? null : value?.schema_version === 1 ? 1 : 0 });
}

export function editorialSpeakerOptions(brief) {
  const style = normalizeEditorialBrief(brief).video_style;
  return style === 'dialogue' ? ['presenter_a', 'presenter_b'] : [style === 'voiceover' ? 'narrator' : 'presenter'];
}

export function estimatedSpeechSeconds(blocks = []) {
  const words = blocks.map(block => block.text || '').join(' ').trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(0, Math.round(words * 60 / 140));
}

export const EDITORIAL_TONE_INSTRUCTIONS = {
  informative: 'Priorize explicações claras, contexto e utilidade, com linguagem natural e frases variadas; evite burocratês.',
  conversational: 'Converse com o público de forma próxima e espontânea. Use perguntas de abertura e transições naturais sem repetir bordões.',
  light: 'Use linguagem leve, ágil e acessível, com analogias simples, sem diminuir a importância dos fatos.',
  humorous: 'Use humor leve e pontual, trocadilhos e ironia sobre a situação ou a burocracia. Não humilhe moradores, vítimas, denunciantes ou trabalhadores. Não insinue crime, culpa ou promessas inexistentes. Em sofrimento ou risco, priorize respeito e informação, sem piadas sobre a pessoa afetada.',
  critical: 'Faça uma leitura crítica e construtiva, com perguntas legítimas de interesse público e caminhos de acompanhamento. Não atribua culpa nem afirme que um responsável foi procurado sem registro.',
};
