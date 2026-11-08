import { supabase } from '@/lib/customSupabaseClient';
import { normalizeEditorialBrief, EDITORIAL_SPEAKERS, EDITORIAL_TONES, estimatedSpeechSeconds } from '../../supabase/functions/_shared/editorialStyle.js';
export { EDITORIAL_FORMATS } from '../../supabase/functions/_shared/editorialAi.js';
export { EDITORIAL_TONES, EDITORIAL_NEWS_STYLES, EDITORIAL_VIDEO_STYLES, EDITORIAL_SPEAKERS,
  DEFAULT_EDITORIAL_BRIEF, normalizeEditorialBrief, editorialBriefKey, editorialSpeakerOptions, estimatedSpeechSeconds } from '../../supabase/functions/_shared/editorialStyle.js';

export const EDITORIAL_MODULES = {
  all: 'Todos os assuntos', works: 'Obras', reports: 'Broncas', streets: 'Ruas', arborization: 'Arborização',
};

export function editorialSourceHref(source, module = 'works') {
  const type = source.source_type || { works: 'work', reports: 'report', streets: 'street', arborization: 'tree' }[module];
  const prefixes = { work: '/obras-publicas/', report: '/bronca/', street: '/mapa-pavimentacao/rua/',
    tree: '/arborizacao/arvore/', community_tree: '/arvores-da-comunidade/' };
  const prefix = Object.hasOwn(prefixes, type) ? prefixes[type] : null;
  return prefix && source.id ? prefix + encodeURIComponent(source.id) : null;
}

export function editorialLastAnalysis(settings, module) {
  const values = [settings?.last_analysis_at, settings?.last_analysis_modules?.all, settings?.last_analysis_modules?.[module]].filter(Boolean);
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

export const EDITORIAL_STATES = {
  proposed: 'Proposta', writing: 'Em produção', approved: 'Aprovada',
  published: 'Publicada', dismissed: 'Descartada', superseded: 'Atualizada',
};

async function unwrap(promise) {
  const { data, error } = await promise;
  if (error) {
    if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code)) {
      throw new Error('A Central Editorial precisa da atualização do banco. Aplique as migrações 411, 412 e 413.');
    }
    throw new Error(error.message || 'Não foi possível concluir a operação.');
  }
  return data;
}

export async function loadEditorial(cityId, history = false, module = 'all') {
  const permissions = await unwrap(supabase.rpc('editorial_permissions', { p_city_id: cityId }));
  if (!permissions?.read) return { cityId, module, permissions, candidates: [], settings: null };
  let query = supabase.from('editorial_candidates').select('*').eq('city_id', cityId)
    .in('status', history ? ['published', 'dismissed', 'superseded'] : ['proposed', 'writing', 'approved']);
  if (module !== 'all') query = query.eq('module', module);
  const [candidates, settings] = await Promise.all([
    unwrap(query.order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(60)),
    unwrap(supabase.from('editorial_settings').select('*').eq('city_id', cityId).maybeSingle()),
  ]);
  return { cityId, module, permissions, candidates: candidates || [], settings };
}

export const loadEditorialContents = (cityId, candidateId) => unwrap(supabase.from('editorial_contents').select('*')
  .eq('city_id', cityId).eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(100));

export const analyzeEditorial = (cityId, module = 'all') => unwrap(supabase.rpc('editorial_analyze_module', { p_city_id: cityId, p_module: module }));
export const editorialAction = (candidateId, action, reason = '') => unwrap(supabase.rpc('editorial_candidate_action', {
  p_candidate_id: candidateId, p_action: action, p_reason: reason,
}));
export const saveEditorial = (contentId, content) => unwrap(supabase.rpc('editorial_save_content', { p_content_id: contentId, p_content: content }));
export const approveEditorial = contentId => unwrap(supabase.rpc('editorial_approve', { p_content_id: contentId, p_verified: true }));
export const publishEditorial = contentId => unwrap(supabase.rpc('editorial_publish', { p_content_id: contentId }));
export const exportEditorial = contentId => unwrap(supabase.rpc('editorial_export', { p_content_id: contentId }));
export const setEditorialDaily = (cityId, enabled) => unwrap(supabase.rpc('editorial_set_daily', { p_city_id: cityId, p_enabled: enabled }));

export async function generateEditorial({ candidateId, format, revision = 0, instruction = '', brief = {} }) {
  const result = await supabase.functions.invoke('editorial-generate', { body: {
    candidate_id: candidateId, format, base_revision: revision, instruction, brief: normalizeEditorialBrief(brief),
    request_id: crypto.randomUUID(),
  } });
  if (result.error) {
    let message;
    try { message = (await result.error.context?.json())?.error; } catch { /* Rede sem resposta JSON. */ }
    throw new Error(message || 'Não foi possível gerar o conteúdo. Confira a função editorial-generate e os segredos do servidor.');
  }
  if (result.data?.error) throw new Error(result.data.error);
  return result.data;
}

export function editorialPlainText(version) {
  const { content, source_snapshot: snapshot } = version;
  const used = new Set([...content.title_fact_ids, ...content.blocks.flatMap(block => block.fact_ids)]);
  const video = version.format !== 'news';
  const profile = normalizeEditorialBrief(version.brief || {});
  return [content.title,
    ...(version.brief?.schema_version === 1 ? [`Tom: ${EDITORIAL_TONES[profile.tone]}`] : []),
    ...(video ? [`Duração estimada da locução: ${estimatedSpeechSeconds(content.blocks)} segundos. Conferir em leitura.`] : []),
    ...content.blocks.map((block, index) => video ? [
      `Cena ${index + 1} · ${EDITORIAL_SPEAKERS[block.speaker] || 'Locução'}`,
      `Fala: ${block.text}`, block.scene ? `Cena sugerida: ${block.scene}` : '',
      block.screen_text ? `Na tela: ${block.screen_text}` : '', `[${block.fact_ids.join(', ')}]`,
    ].filter(Boolean).join('\n') : `${block.text}\n[${block.fact_ids.join(', ')}]`),
    `Referência: ${snapshot.city_name} · ${snapshot.as_of}`,
    ...(snapshot.facts || []).filter(fact => used.has(fact.id)).map(fact => `[${fact.id}] ${fact.text}`),
    ...(snapshot.limitations || []),
    'Produzido com assistência de IA e revisão editorial humana.',
  ].join('\n\n');
}
