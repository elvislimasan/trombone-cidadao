export const TREE_ADOPTION_MANAGEMENT_PATH = '/prefeitura/adote-uma-arvore';
export const ADOPTION_TYPES = { muda: 'Receber uma muda', plantio: 'Solicitar plantio pela equipe' };
export const ADOPTION_ZONES = { urbana: 'Zona urbana', rural: 'Zona rural' };
export const ADOPTION_PLACES = { calcada: 'Calçada', quintal: 'Quintal', praca: 'Praça', avenida: 'Avenida', outro: 'Outro local' };
export const ADOPTION_PURPOSES = { sombra: 'Sombra', ornamentacao: 'Ornamentação', frutifera: 'Frutífera' };
export const ADOPTION_WIRING = { sim: 'Sim, há fiação aérea', nao: 'Não há fiação aérea', nao_sei: 'Não sei informar' };
export const ADOPTION_PROVIDERS = { viveiro_municipal: 'Viveiro municipal', instituto_florestar: 'Instituto Florestar' };
export const ADOPTION_AVAILABILITY = { disponivel: 'Disponível para solicitação', indisponivel: 'Indisponível', sob_consulta: 'Sob consulta' };
export const ADOPTION_STATUSES = { solicitada: 'Solicitação enviada', em_analise: 'Em análise técnica', aguardando_informacao: 'Aguardando informação', aguardando_disponibilidade: 'Aguardando disponibilidade', aprovada: 'Aprovada', agendada: 'Plantio agendado', pronta_retirada: 'Muda pronta para retirada', concluida: 'Solicitação atendida', recusada: 'Recusada', cancelada: 'Cancelada' };
export const ADOPTION_TERMINAL = ['concluida', 'recusada', 'cancelada'];
export const EMPTY_ADOPTION = { request_type: '', zone: '', planting_place: '', purpose: '', overhead_wiring: '', species_id: '', provider: '', items: [], requester_name: '', requester_phone: '', requester_email: '', address: '', neighborhood: '', latitude: '', longitude: '', notes: '', commitment: false };
export const ADOPTION_CITY_ID = 64; // Primeira etapa do convênio: Floresta · PE.
export const ADOPTION_CITY_NOTICE = 'A prefeitura desta cidade ainda não tem convênio com a plataforma Trombone Cidadão para oferta de mudas ou plantio de árvores. Procure a prefeitura municipal da sua cidade e sugira essa ideia!';
export const adoptionItems = form => Array.isArray(form.items) && form.items.length ? form.items : form.species_id ? [{ species_id: form.species_id, provider: form.provider, quantity: 1 }] : [];
export const adoptionQuantity = form => adoptionItems(form).reduce((total, item) => total + Number(item.quantity || 0), 0);

export function adoptionNextStatuses(request) {
  if (ADOPTION_TERMINAL.includes(request.status)) return [];
  return Object.keys(ADOPTION_STATUSES).filter(status => status !== request.status
    && (status !== 'agendada' || request.request_type === 'plantio')
    && (status !== 'pronta_retirada' || request.request_type === 'muda'));
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
    if (String(form.requester_name || '').trim().length < 3 || form.requester_name.trim().length > 160) return 'Informe seu nome completo (3 a 160 caracteres).';
    if (!/^[+\d\s().-]+$/.test(form.requester_phone || '') || !/^\d{10,15}$/.test(String(form.requester_phone || '').replace(/\D/g, ''))) return 'Informe um telefone de contato com DDD.';
    if (form.requester_email && (form.requester_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.requester_email.trim()))) return 'Informe um e-mail válido ou deixe o campo vazio.';
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
    const items = adoptionItems(form);
    if (!items.length || items.length > 50) return 'Escolha entre 1 e 50 espécies para o pedido.';
    if (new Set(items.map(item => item.species_id)).size !== items.length) return 'Cada espécie deve aparecer apenas uma vez. Ajuste a quantidade desejada.';
    for (const item of items) {
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000) return 'Informe uma quantidade inteira de 1 a 1.000 para cada espécie.';
      if (!species.some(species => species.id === item.species_id && String(species.city_id) === String(cityId))) return 'Escolha uma espécie cadastrada nesta cidade.';
      if (!Object.hasOwn(ADOPTION_PROVIDERS, item.provider)) return 'Escolha o local de fornecimento de cada espécie.';
      if (!availableAdoptionProviders(availability, item.species_id).some(row => row.provider === item.provider)) return 'A espécie não tem disponibilidade confirmada neste fornecedor. Atualize o catálogo e escolha uma opção disponível.';
    }
    if (adoptionQuantity(form) > 1000) return 'O pedido pode ter até 1.000 mudas ou árvores no total.';
  }
  if (step === null && !form.commitment) return 'Confirme o compromisso de cuidado e a avaliação técnica.';
  return '';
}

export function adoptionPayload(form, cityId, id) {
  const items = adoptionItems(form).map(item => ({ species_id: item.species_id, provider: item.provider, quantity: Number(item.quantity) }));
  return { id, city_id: cityId, commitment: form.commitment === true, ...Object.fromEntries(Object.keys(EMPTY_ADOPTION).filter(key => !['commitment', 'items'].includes(key)).map(key =>
    [key, ['latitude', 'longitude'].includes(key) ? Number(form[key]) : String(form[key] || '').trim() || null])), items, species_id: items[0]?.species_id, provider: items[0]?.provider };
}

export const adoptionProtocol = request => `ARV-${request.id.slice(0, 8).toUpperCase()}`;
