import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LegislativeIdentityRow({ person, councilors, disabled, onSave }) {
  const [mode, setMode] = useState('link'), [choice, setChoice] = useState(person.link?.councilor_id || '');
  return <tr id={`official-person-${person.id}`}>
    <td data-label="Cadastro oficial"><strong>{person.data.parliamentary_name || person.data.name}</strong>{person.data.parliamentary_name && person.data.parliamentary_name !== person.data.name && <p className="mt-1 text-sm text-content-secondary">{person.data.name}</p>}</td>
    <td data-label="Perfil no Trombone"><div className="legislative-identity-mode" role="group" aria-label={`Perfil de ${person.data.parliamentary_name}`}><Button type="button" size="sm" variant="ghost" disabled={disabled} aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Vincular existente</Button><Button type="button" size="sm" variant="ghost" disabled={disabled || !!person.link} aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Criar perfil</Button></div>
      {mode === 'link' ? <select aria-label={`Perfil existente de ${person.data.parliamentary_name}`} value={choice} disabled={disabled} onChange={event => setChoice(event.target.value)}><option value="">Selecione o perfil existente</option>{councilors.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select> : <p className="text-xs text-content-secondary">Nome oficial: {person.data.name}. O novo perfil será criado sem conta responsável.</p>}
    </td>
    <td data-label="Ação"><Button disabled={disabled || (mode === 'link' && (!choice || choice === person.link?.councilor_id))} size="sm" variant="outline" onClick={() => onSave('bind', { parliamentarian_id: person.id, councilor_id: mode === 'create' ? null : choice, create: mode === 'create' })}>{mode === 'create' ? 'Confirmar criação' : 'Confirmar vínculo'}</Button></td>
  </tr>;
}
