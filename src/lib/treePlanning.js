import { findTreeStreet, treeStreetAddressName, treeStreetSearchKey } from './treeStreetLocation.js';

// Valores compartilhados pelo formulário, pela validação e pelos relatórios.
export const TREE_SURVEY_OPTIONS = {
  planting_site: { label: 'Tipo de local de plantio', options: { calcada: 'Calçada', canteiro: 'Canteiro central', praca: 'Praça', parque: 'Parque', lote_publico: 'Lote público' } },
  sidewalk_width: { label: 'Largura da calçada', options: { estreita: '< 1,5 m', media: '1,5 m a 2,5 m', larga: '> 2,5 m' } },
  power_lines: { label: 'Presença de fiação elétrica', options: { baixa: 'Sim (baixa tensão)', alta: 'Sim (alta tensão)', nenhuma: 'Não' } },
  wire_conflict: { label: 'Conflito com fiação', options: { nenhum: 'Sem conflito', toca: 'Toca os fios', poda_v: 'Podada em formato de V' } },
  equipment_conflicts: { label: 'Conflito com outros equipamentos', multiple: true, options: { agua_esgoto: 'Rede de esgoto / água', sinalizacao: 'Placas de sinalização', semaforo: 'Semáforo', fachada: 'Fachada comercial' } },
  sidewalk_damage: { label: 'Danos na calçada / meio-fio', options: { nenhum: 'Nenhum', leve: 'Leve (trinca)', severo: 'Severo (levantamento de piso)' } },
  health: { label: 'Sanidade geral', options: { boa: 'Boa', regular: 'Regular', ruim: 'Ruim / moribunda', morta: 'Morta em pé' } },
  pests: { label: 'Pragas / doenças', multiple: true, options: { cupins: 'Cupins', fungos: 'Fungos', erva: 'Erva-de-passarinho', nenhuma: 'Nenhuma visível' } },
  trunk_lesions: { label: 'Lesões / podridão no tronco', options: { sim: 'Sim', nao: 'Não' } },
  trunk_lean: { label: 'Inclinação do tronco', options: { normal: 'Normal (< 15º)', acentuada: 'Acentuada (risco de queda)' } },
  immediate_intervention: { label: 'Intervenção imediata', options: { nenhuma: 'Nenhuma', formacao: 'Poda de formação', limpeza: 'Poda de limpeza / galhos secos', seguranca: 'Poda de segurança / rede elétrica', supressao: 'Supressão (corte total)', substituicao: 'Substituição de espécie inadequada' } },
  execution_term: { label: 'Prazo de execução', options: { curto: 'Curto prazo (0–1 ano)', medio: 'Médio prazo (1–3 anos)', longo: 'Longo prazo' } },
};

export const EMPTY_TREE_PLANNING = { planting_year: '', street_id: '', street_name: '', dap_cm: '', scheduled_action: '', replacement_species: '',
  ...Object.fromEntries(Object.entries(TREE_SURVEY_OPTIONS).map(([key, config]) => [key, config.multiple ? [] : ''])) };

export const isPlannedTree = tree => tree?.status === 'planejada';
export const isLivingTree = tree => !['removida', 'planejada'].includes(tree?.status);
export const streetKey = value => String(value || '').normalize('NFD').replace(/\p{Mn}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
// Endereços antigos continuam pesquisáveis sem inventar um vínculo com uma rua.
export const treeStreetName = tree => tree.street_name?.trim() || treeStreetAddressName(tree.address);
// Reúne o mesmo nome nos registros antigos e novos; o vínculo oficial continua
// em street_id. Cidade e bairro permanecem separados na agregação do relatório.
export const treeStreetKey = tree => `name:${treeStreetSearchKey(treeStreetName(tree))}`;

export function treePlanningLocations(trees, neighborhoods = [], streets = []) {
  return trees.map(tree => {
    const local = neighborhoods.filter(item => String(item.city_id) === String(tree.city_id));
    const matches = local.filter(item => streetKey(item.name) === streetKey(tree.neighborhood));
    const neighborhood = local.find(item => item.id === tree.bairro_id) || (matches.length === 1 ? matches[0] : null);
    const street = streets.find(item => item.id === tree.street_id && String(item.city_id) === String(tree.city_id))
      || findTreeStreet(treeStreetName(tree), streets, tree.city_id, neighborhood?.id || tree.bairro_id);
    return { ...tree, ...(neighborhood ? { bairro_id: neighborhood.id, neighborhood: neighborhood.name } : {}),
      ...(street ? { street_id: street.id, street_name: street.name } : {}),
    };
  });
}

export function treePlanningPayload(form) {
  const planned = isPlannedTree(form);
  const year = String(form.planting_year ?? '').trim() === '' ? null : Number(form.planting_year);
  if ((planned && year === null) || (year !== null && (!Number.isInteger(year) || year < 1900 || year > 9999))) throw new Error('Informe um ano previsto de plantio válido (1900 a 9999).');
  // Anos anteriores são permitidos para acompanhar planos em atraso.
  if (planned && form.planted_at) throw new Error('Um plantio planejado não pode ter data de plantio realizado.');
  if (!planned && year !== null && form.status !== 'removida' && !form.planted_at) throw new Error('Informe a data do plantio realizado para concluir o planejamento.');
  const dap = String(form.dap_cm ?? '').trim() === '' ? null : Number(String(form.dap_cm).replace(',', '.'));
  if (dap !== null && (!Number.isFinite(dap) || dap <= 0)) throw new Error('O DAP deve ser maior que zero.');
  const payload = { planting_year: year, street_id: form.street_id || null, street_name: form.street_name?.trim() || null,
    dap_cm: planned ? null : dap, scheduled_action: form.scheduled_action?.trim() || null, replacement_species: form.replacement_species?.trim() || null };
  for (const [key, config] of Object.entries(TREE_SURVEY_OPTIONS)) {
    const value = form[key];
    if (config.multiple) {
      if (value != null && (!Array.isArray(value) || value.some(item => !Object.hasOwn(config.options, item)))) throw new Error(`Revise: ${config.label}.`);
      payload[key] = [...new Set(value || [])];
    } else {
      if (value && !Object.hasOwn(config.options, value)) throw new Error(`Revise: ${config.label}.`);
      payload[key] = value || null;
    }
  }
  if (payload.pests.includes('nenhuma') && payload.pests.length > 1) throw new Error('Selecione as pragas ou “Nenhuma visível”.');
  if (payload.power_lines === 'nenhuma' && payload.wire_conflict && payload.wire_conflict !== 'nenhum') throw new Error('Revise o conflito com a fiação: o local está sem rede elétrica.');
  if (planned) for (const key of ['wire_conflict', 'sidewalk_damage', 'health', 'trunk_lesions', 'trunk_lean', 'immediate_intervention']) payload[key] = null;
  if (planned) payload.pests = [];
  if ((payload.scheduled_action?.length || 0) > 2000 || (payload.replacement_species?.length || 0) > 200) throw new Error('Reduza o texto da ação ou da espécie sugerida.');
  return payload;
}

export function treePlanningRows(trees) {
  const rows = new Map();
  const neighborhoodIds = new Map();
  for (const tree of trees) if (tree.bairro_id && tree.neighborhood) {
    const key = JSON.stringify([String(tree.city_id), streetKey(tree.neighborhood)]);
    const ids = neighborhoodIds.get(key) || new Set();
    ids.add(tree.bairro_id); neighborhoodIds.set(key, ids);
  }
  for (const tree of trees) {
    if (!tree.planting_year) continue;
    const neighborhood = tree.neighborhood || 'Sem bairro identificado';
    const street = treeStreetName(tree) || 'Sem rua identificada';
    const ids = neighborhoodIds.get(JSON.stringify([String(tree.city_id), streetKey(neighborhood)]));
    const neighborhoodId = tree.bairro_id || (ids?.size === 1 ? [...ids][0] : `name:${streetKey(neighborhood)}`);
    const key = JSON.stringify([String(tree.city_id), Number(tree.planting_year), neighborhoodId, treeStreetKey(tree)]);
    const row = rows.get(key) || { key, city_id: tree.city_id, year: Number(tree.planting_year), neighborhood, street, total: 0, planned: 0, planted: 0, unconfirmed: 0 };
    row.total++;
    if (isPlannedTree(tree)) row.planned++;
    else if (tree.planted_at) row.planted++;
    else row.unconfirmed++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.year - b.year || a.neighborhood.localeCompare(b.neighborhood, 'pt-BR') || a.street.localeCompare(b.street, 'pt-BR'));
}

export const csvCell = value => `"${String(value ?? '').replace(/^(\s*[=+@-])/, "'$1").replaceAll('"', '""')}"`;
export function treePlanningCsv(trees, cities = []) {
  return '\uFEFF' + [['Cidade', 'Ano previsto', 'Bairro', 'Rua', 'Plantios previstos pendentes', 'Plantios realizados', 'Outros registros sem plantio confirmado', 'Total previsto no planejamento'],
    ...treePlanningRows(trees).map(row => [cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id,
      row.year, row.neighborhood, row.street, row.planned, row.planted, row.unconfirmed, row.total])].map(row => row.map(csvCell).join(';')).join('\r\n');
}

export function treeSurveyEntries(tree) {
  return Object.entries(TREE_SURVEY_OPTIONS).flatMap(([key, config]) => {
    const value = config.multiple ? (tree[key] || []).map(item => config.options[item]).filter(Boolean).join(', ') : config.options[tree[key]];
    return value ? [[config.label, value]] : [];
  }).concat([
    ['DAP (cm)', tree.dap_cm], ['Ação programada', tree.scheduled_action], ['Espécie sugerida para substituição', tree.replacement_species],
  ].filter(([, value]) => value != null && value !== ''));
}
