const clean = (value) => String(value ?? '').trim();

export const GUIDE_WEEKDAYS = [
  { id: 'monday', short: 'Seg', label: 'Segunda' },
  { id: 'tuesday', short: 'Ter', label: 'Terça' },
  { id: 'wednesday', short: 'Qua', label: 'Quarta' },
  { id: 'thursday', short: 'Qui', label: 'Quinta' },
  { id: 'friday', short: 'Sex', label: 'Sexta' },
  { id: 'saturday', short: 'Sáb', label: 'Sábado' },
  { id: 'sunday', short: 'Dom', label: 'Domingo' },
];

export const normalizeGuideWeekdays = (value) => {
  const selected = new Set(Array.isArray(value) ? value.map(String) : []);
  return GUIDE_WEEKDAYS.filter(({ id }) => selected.has(id)).map(({ id }) => id);
};

const joinLabels = (labels) => labels.length <= 1 ? labels[0] || ''
  : labels.length === 2 ? `${labels[0]} e ${labels[1]}`
    : `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`;

export const guideWeekdayTitle = (weekdays) => {
  const selected = normalizeGuideWeekdays(weekdays);
  if (!selected.length) return '';
  const first = GUIDE_WEEKDAYS.findIndex(({ id }) => id === selected[0]);
  const last = GUIDE_WEEKDAYS.findIndex(({ id }) => id === selected.at(-1));
  if (selected.length === last - first + 1 && selected.length > 1) {
    return `Percurso de ${GUIDE_WEEKDAYS[first].label.toLocaleLowerCase('pt-BR')} a ${GUIDE_WEEKDAYS[last].label.toLocaleLowerCase('pt-BR')}`;
  }
  return `Percurso: ${joinLabels(selected.map((id) => GUIDE_WEEKDAYS.find((day) => day.id === id).label.toLocaleLowerCase('pt-BR')))}`;
};

const uniqueText = (values) => {
  const seen = new Set();
  return values.flatMap((value) => {
    const text = clean(value);
    if (!text) return [];
    const key = text.replace(/\D/g, '') || text.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
};

/** Telefones do cadastro novo, com o campo legado `phone` sempre preservado. */
export const guidePhones = (entry = {}) => uniqueText([
  entry.phone,
  ...(Array.isArray(entry.guide_metadata?.phones) ? entry.guide_metadata.phones : []),
]);

export const emptyGuideJourney = () => ({
  origin_city_id: '', origin: '', destination_city_id: '', destination: '',
  departure_time: '', arrival_time: '', schedule: '',
  boarding_location: '', dropoff_location: '', weekdays: [],
});

const normalizeJourney = (journey = {}) => {
  const normalized = { ...emptyGuideJourney(), ...journey };
  // Não regrava um campo novo em registros legados apenas ao lê-los.
  if (Array.isArray(journey.weekdays)) normalized.weekdays = normalizeGuideWeekdays(journey.weekdays);
  else delete normalized.weekdays;
  return normalized;
};

// O título reflete os dias selecionados. Registros antigos sem dias preservam o
// título que já possuíam; os demais recebem um rótulo neutro.
export const guideJourneyTitle = (journey = {}, index = 0) => guideWeekdayTitle(journey.weekdays)
  || clean(journey.title) || `Percurso ${index + 1}`;

/** Lê tanto os novos percursos quanto o formato singular dos registros antigos. */
export const guideJourneys = (metadata = {}) => {
  if (Array.isArray(metadata.journeys) && metadata.journeys.length > 0) {
    return metadata.journeys.map(normalizeJourney);
  }
  const legacy = normalizeJourney(metadata);
  const hasLegacyJourney = [legacy.origin, legacy.destination, legacy.departure_time,
    legacy.arrival_time, legacy.schedule, legacy.boarding_location, legacy.dropoff_location]
    .some((value) => clean(value));
  return hasLegacyJourney ? [legacy] : [];
};

/** Grava a lista nova e mantém o primeiro percurso nos campos antigos. */
export const metadataWithJourneys = (metadata = {}, journeys = []) => {
  const normalized = journeys.map(normalizeJourney);
  const first = normalized[0] || emptyGuideJourney();
  return {
    ...metadata,
    journeys: normalized,
    origin_city_id: first.origin_city_id || null,
    origin: clean(first.origin) || null,
    destination_city_id: first.destination_city_id || null,
    destination: clean(first.destination) || null,
    departure_time: clean(first.departure_time) || null,
    arrival_time: clean(first.arrival_time) || null,
    schedule: clean(first.schedule) || null,
    boarding_location: clean(first.boarding_location) || null,
    dropoff_location: clean(first.dropoff_location) || null,
  };
};
