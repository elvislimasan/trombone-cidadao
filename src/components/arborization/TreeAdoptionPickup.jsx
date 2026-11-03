import React from 'react';
import { Navigation } from 'lucide-react';
import { adoptionPickupLocations } from '@/lib/treeAdoptionPickup';
import './treeAdoptionPickup.css';

export default function TreeAdoptionPickup({ request, catalog, city }) {
  if (request.status !== 'pronta_retirada' || request.request_type !== 'muda') return null;
  if (catalog.loading) return <p className="adoption-pickup-unavailable" role="status">Carregando local de retirada…</p>;
  const locations = adoptionPickupLocations(request, catalog, city);
  if (!locations.length) return <p className="adoption-pickup-unavailable">Local de retirada a confirmar com a equipe.</p>;
  return <div className="adoption-pickup-locations" aria-label="Locais de retirada">{locations.map(location => <div className="adoption-pickup-location" key={location.key}><strong>{location.label}</strong>{location.address && <p>{location.address}</p>}{location.href ? <a href={location.href} target="_blank" rel="noopener noreferrer" aria-label={`Ver local de retirada e rota para ${location.label}`}><Navigation size={17} aria-hidden="true" />Ver local de retirada</a> : <p className="adoption-pickup-unavailable">Localização a confirmar com a equipe.</p>}</div>)}</div>;
}
