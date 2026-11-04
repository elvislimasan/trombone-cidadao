import React, { useState } from 'react';
import { ChevronDown, Loader2, LocateFixed, MapPin, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntryField } from './TreeEntryParts';
import TreeLocationSelect from './TreeLocationSelect';
import { treeStreetAddressName, treeStreetSearchKey } from '@/lib/treeStreetLocation';

export default function TreeBatchPointList({ points, onPointsChange, streets, neighborhoods, blocked, catalogLoading, catalogError, streetsError, onRetryStreets, onLocatePoint }) {
  const [expanded, setExpanded] = useState(true);
  const update = (draftId, values) => onPointsChange(current => current.map(point => point.draftId === draftId ? { ...point, ...values } : point));
  return <section className="tree-batch-panel" data-testid="tree-batch-address-info">
    <header><h3>Pontos selecionados</h3><div>
      <Button type="button" variant="ghost" size="sm" disabled={!points.length || blocked} onClick={() => onPointsChange(current => current.slice(0, -1))}><Undo2 size={14} />Desfazer</Button>
      <Button type="button" variant="ghost" size="icon" className="tree-batch-panel-toggle" aria-label={expanded ? 'Recolher pontos' : 'Expandir pontos'} aria-expanded={expanded} aria-controls="tree-batch-point-list" onClick={() => setExpanded(value => !value)}><ChevronDown size={16} /></Button>
    </div></header>
    <div id="tree-batch-point-list" className="tree-batch-panel-body" data-expanded={expanded}>
      {!points.length ? <div className="tree-batch-empty"><MapPin size={23} /><strong>Toque no mapa para adicionar árvores</strong><p>Marque um ponto por árvore. O endereço aparece aqui automaticamente.</p></div> : <ol className="tree-batch-point-list">{points.map((point, index) => {
        const pending = !point.addressStatus || ['queued', 'loading'].includes(point.addressStatus);
        return <li key={point.draftId} className="tree-batch-point-card" data-testid="tree-batch-point">
          <div className="tree-batch-point-summary"><span className="tree-batch-point-number">{String(index + 1).padStart(2, '0')}</span><div>
            <h4>{point.address || (pending ? 'Buscando endereço…' : 'Endereço não identificado')}</h4>
            <p>{point.neighborhood || (pending ? 'Identificando bairro…' : 'Bairro não identificado')}</p>
            {pending && <small role="status"><Loader2 size={12} className="animate-spin" />Consultando localização</small>}
          </div><div className="tree-batch-point-actions">
            <Button type="button" size="icon" variant="ghost" disabled={blocked} aria-label={`Localizar ponto ${index + 1} no mapa`} onClick={() => onLocatePoint?.(point)}><LocateFixed size={15} /></Button>
            <Button type="button" size="icon" variant="ghost" disabled={blocked} aria-label={`Remover ponto ${index + 1}`} onClick={() => onPointsChange(current => current.filter(item => item.draftId !== point.draftId))}><Trash2 size={15} /></Button>
          </div></div>
          {point.addressStatus === 'failed' && !point.manualAddress && <div className="tree-batch-lookup-failed"><span>Não foi possível buscar o endereço.</span><Button type="button" variant="ghost" size="sm" disabled={blocked} onClick={() => update(point.draftId, { addressStatus: 'queued' })}><RotateCw size={13} />Tentar novamente</Button></div>}
          <details className="tree-batch-point-correction"><summary>Corrigir endereço do ponto {index + 1}</summary><div className="tree-entry-field-grid">
            <TreeLocationSelect label={`Rua do ponto ${index + 1}`} items={streets} value={point.street_id} fallback={treeStreetAddressName(point.address)} placeholder="Selecione ou busque uma rua" emptyLabel="Sem rua identificada" searchLabel="Buscar rua" normalize={treeStreetSearchKey} disabled={blocked || streetsError} onChange={value => {
              const street = streets.find(item => item.id === value);
              const neighborhood = !point.manualNeighborhood && neighborhoods.find(item => item.id === street?.bairro_id);
              update(point.draftId, { manualStreet: true, manualAddress: true, street_id: street?.id || '', street_name: street?.name || '', address: street?.name || point.address || '',
                ...(neighborhood ? { manualNeighborhood: true, bairro_id: neighborhood.id, neighborhood: neighborhood.name } : {}),
              });
            }} />
            <TreeLocationSelect label={`Bairro do ponto ${index + 1}`} items={neighborhoods} value={point.bairro_id} fallback={point.neighborhood} placeholder="Não identificado" searchLabel="Buscar bairro" disabled={blocked || catalogLoading || !!catalogError} onChange={value => update(point.draftId, { manualNeighborhood: true, bairro_id: value, neighborhood: neighborhoods.find(item => item.id === value)?.name || '' })} />
            <EntryField label={`Endereço / referência do ponto ${index + 1}`} className="tree-entry-field-wide"><Input maxLength={300} disabled={blocked} value={point.address || ''} placeholder="Rua, número ou praça" onChange={event => update(point.draftId, { address: event.target.value, manualAddress: true })} /></EntryField>
          </div></details>
        </li>;
      })}</ol>}
      {streetsError && <p role="alert" className="tree-entry-hint">Não foi possível carregar as ruas. <Button type="button" variant="link" disabled={blocked} onClick={onRetryStreets}>Tentar novamente</Button></p>}
    </div>
  </section>;
}
