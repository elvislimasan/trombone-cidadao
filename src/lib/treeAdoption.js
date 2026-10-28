export const TREE_ADOPTION_MANAGEMENT_PATH = '/prefeitura/adote-uma-arvore';
export const ADOPTION_TYPES = { muda: 'Receber uma muda', plantio: 'Solicitar plantio pela equipe' };
export const ADOPTION_ZONES = { urbana: 'Zona urbana', rural: 'Zona rural' };
export const ADOPTION_PLACES = { calcada: 'Calçada', quintal: 'Quintal', praca: 'Praça', avenida: 'Avenida', outro: 'Outro local' };
export const ADOPTION_PURPOSES = { sombra: 'Sombra', ornamentacao: 'Ornamentação', frutifera: 'Frutífera' };
export const ADOPTION_WIRING = { sim: 'Sim, há fiação aérea', nao: 'Não há fiação aérea', nao_sei: 'Não sei informar' };
export const ADOPTION_PROVIDERS = { viveiro_municipal: 'Viveiro municipal', instituto_florestar: 'Instituto Florestar' };
export const ADOPTION_AVAILABILITY = { disponivel: 'Disponível para solicitação', indisponivel: 'Indisponível', sob_consulta: 'Sob consulta' };
export const ADOPTION_STATUSES = { solicitada: 'Solicitação enviada', em_analise: 'Em análise técnica', aguardando_informacao: 'Aguardando informação', aguardando_disponibilidade: 'Aguardando disponibilidade', aprovada: 'Aprovada', agendada: 'Plantio agendado', pronta_retirada: 'Muda pronta para retirada', concluida: 'Concluída', recusada: 'Recusada', cancelada: 'Cancelada' };
export const ADOPTION_TERMINAL = ['concluida', 'recusada', 'cancelada'];
export const EMPTY_ADOPTION = { request_type: '', zone: '', planting_place: '', purpose: '', overhead_wiring: '', species_id: '', provider: '', address: '', neighborhood: '', latitude: '', longitude: '', notes: '', commitment: false };

export function adoptionNextStatuses(request) {
  const common = ['aguardando_informacao', 'aguardando_disponibilidade', 'recusada'];
  switch (request.status) {
    case 'solicitada': return ['em_analise', 'recusada'];
    case 'em_analise': case 'aguardando_informacao': case 'aguardando_disponibilidade': return ['em_analise', 'aprovada', ...common].filter(status => status !== request.status);
    case 'aprovada': return [request.request_type === 'muda' ? 'pronta_retirada' : 'agendada', ...common];
    case 'agendada': case 'pronta_retirada': return ['concluida', ...common];
    default: return [];
  }
}

export function availableAdoptionProviders(availability, speciesId) {
  return availability.filter(item => item.species_id === speciesId && item.status === 'disponivel' && Object.hasOwn(ADOPTION_PROVIDERS, item.provider));
}

export function availableAdoptionSpecies(species, availability) {
  const availableIds = new Set(availability.filter(item => item.status === 'disponivel' && Object.hasOwn(ADOPTION_PROVIDERS, item.provider)).map(item => item.species_id));
  return species.filter(item => availableIds.has(item.id));
}

export function validateAdoption(form, cityId, species, step = null, availability = []) {
  if (!cityId) return 'Selecione a cidade onde pretende plantar.';
  if (step === null || step === 0) {
    if (!Object.hasOwn(ADOPTION_TYPES, form.request_type)) return 'Escolha entre muda e plantio.';
    if (!Object.hasOwn(ADOPTION_PURPOSES, form.purpose)) return 'Informe a finalidade.';
  }
  if (step === null || step === 1) {
    for (const [field, options, message] of [
      ['zone', ADOPTION_ZONES, 'Informe a zona de plantio.'], ['planting_place', ADOPTION_PLACES, 'Informe o tipo de local.'],
      ['overhead_wiring', ADOPTION_WIRING, 'Informe se existe fiação aérea.'],
    ]) if (!Object.hasOwn(options, form[field])) return message;
    if (String(form.address || '').trim().length < 5) return 'Informe o endereço ou a referência do local (pelo menos 5 caracteres).';
    if ([form.latitude, form.longitude].some(value => value === '' || value == null)
      || !Number.isFinite(Number(form.latitude)) || Math.abs(Number(form.latitude)) > 90
      || !Number.isFinite(Number(form.longitude)) || Math.abs(Number(form.longitude)) > 180) return 'Marque o local do plantio no mapa.';
  }
  if (step === null || step === 2) {
    if (!species.some(item => item.id === form.species_id && String(item.city_id) === String(cityId))) return 'Escolha uma espécie cadastrada nesta cidade.';
    if (!Object.hasOwn(ADOPTION_PROVIDERS, form.provider)) return 'Escolha o local de fornecimento.';
    if (!availableAdoptionProviders(availability, form.species_id).some(item => item.provider === form.provider)) return 'A espécie não tem disponibilidade confirmada neste fornecedor. Atualize o catálogo e escolha uma opção disponível.';
  }
  if (step === null && !form.commitment) return 'Confirme o compromisso de cuidado e a avaliação técnica.';
  return '';
}

export function adoptionPayload(form, cityId, id) {
  return { id, city_id: cityId, commitment: form.commitment === true, ...Object.fromEntries(Object.keys(EMPTY_ADOPTION).filter(key => key !== 'commitment').map(key =>
    [key, ['latitude', 'longitude'].includes(key) ? Number(form[key]) : String(form[key] || '').trim() || null])) };
}

export const adoptionProtocol = request => `ARV-${request.id.slice(0, 8).toUpperCase()}`;
