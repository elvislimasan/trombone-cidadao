import React from 'react';
import CityCombobox from '@/components/CityCombobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCity } from '@/contexts/CityContext';

export default function GuideTransportFields({ value = {}, onChange }) {
  const { cities } = useCity();
  const setCity = (field, nameField, id) => onChange({ ...value, [field]: id, [nameField]: (cities || []).find((city) => String(city.id) === String(id))?.name || '' });
  return <fieldset className="space-y-3 rounded-lg border p-3">
    <legend className="px-1 text-sm font-semibold">Trajeto da lotação</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label>Cidade de saída</Label><CityCombobox modal value={value.origin_city_id} onChange={(id) => setCity('origin_city_id', 'origin', id)} /></div>
      <div className="space-y-2"><Label>Cidade de chegada</Label><CityCombobox modal value={value.destination_city_id} onChange={(id) => setCity('destination_city_id', 'destination', id)} /></div>
      <div className="space-y-2"><Label htmlFor="departure-time">Horário de saída</Label><Input id="departure-time" type="time" value={value.departure_time || ''} onChange={(event) => onChange({ ...value, departure_time: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="arrival-time">Horário de chegada</Label><Input id="arrival-time" type="time" value={value.arrival_time || ''} onChange={(event) => onChange({ ...value, arrival_time: event.target.value })} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="transport-schedule">Dias e observações dos horários</Label><Input id="transport-schedule" value={value.schedule || ''} onChange={(event) => onChange({ ...value, schedule: event.target.value })} /></div>
  </fieldset>;
}
