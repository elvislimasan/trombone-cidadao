import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import CityCombobox from '@/components/CityCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCity } from '@/contexts/CityContext';
import { emptyGuideJourney, GUIDE_WEEKDAYS, guideJourneys, guideJourneyTitle, metadataWithJourneys, normalizeGuideWeekdays } from '@/lib/guideDetails';

export default function GuideTransportFields({ value = {}, onChange }) {
  const { cities } = useCity();
  const journeys = guideJourneys(value);
  const visibleJourneys = journeys.length > 0 ? journeys : [emptyGuideJourney()];
  const changeJourneys = (next) => onChange(metadataWithJourneys(value, next));
  const updateJourney = (index, changes) => changeJourneys(visibleJourneys.map((journey, itemIndex) => itemIndex === index ? { ...journey, ...changes } : journey));
  const setCity = (index, field, nameField, id) => updateJourney(index, {
    [field]: id,
    [nameField]: (cities || []).find((city) => String(city.id) === String(id))?.name || '',
  });

  return <fieldset className="space-y-4 rounded-xl border border-edge-subtle p-3 sm:p-4">
    <legend className="px-1 text-sm font-semibold">Percursos e horários</legend>
    {visibleJourneys.map((journey, index) => <section key={index} className="space-y-3 rounded-xl bg-surface-subtle p-3" aria-label={guideJourneyTitle(journey, index)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-content-primary">{guideJourneyTitle(journey, index)}</h3>
        {visibleJourneys.length > 1 && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-destructive" onClick={() => changeJourneys(visibleJourneys.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-3.5 w-3.5" /> Remover</Button>}
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium leading-none">Dias de funcionamento</legend><div className="flex flex-wrap gap-2">{GUIDE_WEEKDAYS.map((day) => { const checked = normalizeGuideWeekdays(journey.weekdays).includes(day.id); return <label key={day.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${checked ? 'border-brand bg-brand text-primary-foreground' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle'}`}><input className="sr-only" type="checkbox" checked={checked} onChange={() => updateJourney(index, { weekdays: checked ? normalizeGuideWeekdays(journey.weekdays).filter((id) => id !== day.id) : [...normalizeGuideWeekdays(journey.weekdays), day.id] })} />{day.short}</label>; })}</div><p className="text-xs text-muted-foreground">Título público: <strong className="text-content-primary">{guideJourneyTitle(journey, index)}</strong></p></fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label>Cidade de saída</Label><CityCombobox modal value={journey.origin_city_id} onChange={(id) => setCity(index, 'origin_city_id', 'origin', id)} /></div>
        <div className="space-y-2"><Label>Cidade de chegada</Label><CityCombobox modal value={journey.destination_city_id} onChange={(id) => setCity(index, 'destination_city_id', 'destination', id)} /></div>
        <div className="space-y-2"><Label htmlFor={`departure-time-${index}`}>Horário de saída</Label><Input id={`departure-time-${index}`} type="time" value={journey.departure_time || ''} onChange={(event) => updateJourney(index, { departure_time: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor={`arrival-time-${index}`}>Horário de chegada</Label><Input id={`arrival-time-${index}`} type="time" value={journey.arrival_time || ''} onChange={(event) => updateJourney(index, { arrival_time: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor={`boarding-location-${index}`}>Local de embarque</Label><Input id={`boarding-location-${index}`} value={journey.boarding_location || ''} onChange={(event) => updateJourney(index, { boarding_location: event.target.value })} placeholder="Ex.: Praça central" /></div>
        <div className="space-y-2"><Label htmlFor={`dropoff-location-${index}`}>Local de desembarque</Label><Input id={`dropoff-location-${index}`} value={journey.dropoff_location || ''} onChange={(event) => updateJourney(index, { dropoff_location: event.target.value })} placeholder="Ex.: Terminal rodoviário" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor={`transport-schedule-${index}`}>Dias e observações dos horários</Label><Input id={`transport-schedule-${index}`} value={journey.schedule || ''} onChange={(event) => updateJourney(index, { schedule: event.target.value })} placeholder="Ex.: Segunda a sexta; sábado em horário diferente" /></div>
    </section>)}
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => changeJourneys([...visibleJourneys, emptyGuideJourney()])}><Plus className="h-4 w-4" /> Adicionar percurso</Button>
  </fieldset>;
}
