import React from 'react';
import { Check, Loader2, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntryField, entrySelectClass } from './TreeEntryParts';
import TreeBatchPointList from './TreeBatchPointList';
import TreeLocationSelect from './TreeLocationSelect';
import { treeStreetAddressName, treeStreetSearchKey } from '@/lib/treeStreetLocation';

export default function TreeEntryAddressFields({ form, onChange, position, onLocationChange, streets, neighborhoods, lookup, onLookup, catalogLoading, catalogError, streetsError, onRetryStreets, blocked, batchMode, points, onPointsChange, onLocatePoint, manualNeighborhood = false }) {
  const status = form.street_id && form.bairro_id ? 'Rua e bairro conferidos no cadastro.'
    : lookup === 'loading' ? 'Buscando rua e bairro…'
    : lookup === 'failed' ? 'Endereço não identificado. Selecione a rua e o bairro abaixo.'
    : lookup === 'partial' ? 'Confira e complete o endereço do ponto.'
    : form.address ? 'Endereço do ponto. Ajuste se precisar.' : 'Marque um ponto para identificar o endereço.';
  const neighborhoodSelect = (value, onSelect) => <TreeLocationSelect label="Bairro" items={neighborhoods} value={value} fallback={form.neighborhood} onChange={onSelect} disabled={blocked || catalogLoading || !!catalogError} placeholder="Não identificado" searchLabel="Buscar bairro" />;
  const streetSelect = (value, onSelect) => <TreeLocationSelect label="Rua cadastrada" items={streets} value={value} fallback={treeStreetAddressName(form.address)} onChange={onSelect} disabled={blocked} placeholder="Selecione ou busque uma rua" emptyLabel="Sem rua identificada" searchLabel="Buscar rua" normalize={treeStreetSearchKey} />;
  const retryStreets = streetsError && <p role="alert" className="tree-entry-hint text-destructive">Não foi possível carregar as ruas. <Button type="button" variant="link" onClick={onRetryStreets}>Tentar novamente</Button></p>;
  if (batchMode) return <TreeBatchPointList {...{ points, onPointsChange, streets, neighborhoods, blocked, catalogLoading, catalogError, streetsError, onRetryStreets, onLocatePoint }} />;
  return <section className="tree-entry-address" aria-label="Endereço da árvore">
    <div className="tree-entry-address-state" role="status">{lookup === 'loading' ? <Loader2 size={18} className="animate-spin" /> : form.address ? <Check size={18} /> : <MapPin size={18} />}<p>{status}</p></div>
    <div className="tree-entry-field-grid">
      {streetSelect(form.street_id, value => {
        const street = streets.find(item => item.id === value);
        onChange('street_id', street?.id || ''); onChange('street_name', street?.name || '');
        if (street) {
          onChange('address', street.name);
          if (!manualNeighborhood) { const neighborhood = neighborhoods.find(item => item.id === street.bairro_id); if (neighborhood) { onChange('bairro_id', neighborhood.id); onChange('neighborhood', neighborhood.name); } }
        }
      })}
      {neighborhoodSelect(form.bairro_id, value => { onChange('bairro_id', value); onChange('neighborhood', neighborhoods.find(item => item.id === value)?.name || ''); })}
    </div>
    <details className="tree-entry-address-reference"><summary>Complemento / referência (opcional)</summary><EntryField label="Endereço / referência"><Input maxLength={300} value={form.address || ''} onChange={event => onChange('address', event.target.value)} placeholder="Rua, número ou praça" /></EntryField></details>
    {retryStreets}
    <div className="tree-entry-address-tools"><p className="tree-entry-hint">Se o pin não reconhecer a rua, selecione no cadastro.</p>{!form.bairro_id && <Button type="button" variant="ghost" size="sm" disabled={!position || blocked || catalogLoading || !!catalogError || lookup === 'loading'} onClick={onLookup}><Navigation size={14} />Buscar bairro pelo ponto</Button>}</div>
    {form.neighborhood && !form.bairro_id && !catalogLoading && <p className="tree-entry-hint">O bairro “{form.neighborhood}” não está no catálogo. Selecione um bairro cadastrado.</p>}
    <details className="tree-entry-coordinate-fields"><summary>Ajustar coordenadas</summary><div className="tree-entry-field-grid"><EntryField label="Latitude"><Input inputMode="decimal" value={form.latitude} onChange={event => onLocationChange({ latitude: event.target.value })} placeholder="-8.597031" /></EntryField><EntryField label="Longitude"><Input inputMode="decimal" value={form.longitude} onChange={event => onLocationChange({ longitude: event.target.value })} placeholder="-38.574217" /></EntryField></div></details>
  </section>;
}
