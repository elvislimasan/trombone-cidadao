import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LEGISLATIVE_GROUPS, LEGISLATIVE_TOPICS, LEGISLATIVE_SERVICES } from '@/lib/legislative';

export default function LegislativeClassificationForm({ matter, onSave, disabled }) {
  const [topic, setTopic] = useState(matter.annotation?.topic || ''), [group, setGroup] = useState(matter.annotation?.group_key || '');
  const [location, setLocation] = useState(matter.annotation?.location_label || ''), [neighborhood, setNeighborhood] = useState(matter.annotation?.neighborhood || '');
  const [service, setService] = useState(matter.annotation?.service || ''), [note, setNote] = useState(matter.annotation?.note || '');
  return <form className="legislative-review-form" onSubmit={event => { event.preventDefault();onSave('classify', { matter_id: matter.id, version_hash: matter.hash, topic, group_key: group, location, neighborhood, service, note }); }}>
    <div className="grid gap-4 md:grid-cols-3">
      <label>Grupo<select aria-label="Grupo revisado" value={group} onChange={event => setGroup(event.target.value)}><option value="">Automático: {LEGISLATIVE_GROUPS[matter.data.group_key] || 'Conforme regra'}</option>{Object.entries(LEGISLATIVE_GROUPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Tema<select value={topic} onChange={event => setTopic(event.target.value)}><option value="">Sem tema revisado</option>{Object.entries(LEGISLATIVE_TOPICS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Serviço<select value={service} onChange={event => setService(event.target.value)}><option value="">Sem serviço revisado</option>{Object.entries(LEGISLATIVE_SERVICES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Rua ou local citado<input value={location} maxLength={300} onChange={event => setLocation(event.target.value)} placeholder={matter.data.territory?.street || 'Conforme o documento'} /></label>
      <label>Bairro<input value={neighborhood} maxLength={120} onChange={event => setNeighborhood(event.target.value)} placeholder={matter.data.territory?.neighborhood || 'Conforme o documento'} /></label>
    </div>
    <label>Trecho ou justificativa da revisão<textarea required minLength={5} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <Button disabled={disabled} className="w-fit">Salvar revisão</Button>
  </form>;
}
