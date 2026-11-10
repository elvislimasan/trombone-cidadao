import React, { useState } from 'react';
import { Check, MapPin, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pipaRoutePending, pipaRouteSource, pipaRouteStops } from '@/lib/pipaRoutes';
import { PIPA_STATUSES } from '@/lib/pipa';

export default function PipaRoutes({ data, onPlan, onOpen, onCancel, canCancel = () => false, busy = false }) {
  const [confirmId, setConfirmId] = useState('');
  const routes = (data.routes || []).filter(route => !route.cancelled);
  return <section className="pipa-driver-section">
    <div className="pipa-driver-section-heading"><h2><Route size={19} />Rotas planejadas</h2>{onPlan && <Button onClick={onPlan}>Planejar rota</Button>}</div>
    <div className="pipa-routes-grid">{routes.map(route => {
      const stops = pipaRouteStops(route, data.requests), completed = stops.filter(s => s.status === 'completed').length, pending = pipaRoutePending(route, data.requests);
      return <article key={route.id} className="pipa-panel pipa-route-card">
        <div className="pipa-actions"><span className="pipa-badge">{pipaRouteSource(route.source)}</span><span className="pipa-note">{route.scheduled_date.split('-').reverse().join('/')}</span></div>
        <h3>{route.name}</h3>{data.drivers && <p className="pipa-note">{data.drivers.find(d => d.id === route.driver_id)?.name}</p>}
        <p className="pipa-note">{completed} de {stops.length} abastecidas{!pending ? ' · Encerrada' : ''}</p>
        <div className="pipa-route-progress-bar" aria-label={`${completed} de ${stops.length} caixas abastecidas`}><span style={{ width: `${stops.length ? completed / stops.length * 100 : 0}%` }} /></div>
        <details className="pipa-route-details"><summary>Ver {stops.length} {stops.length === 1 ? 'parada' : 'paradas'}</summary><ol className="pipa-route-stop-list">{stops.map(stop => { const tank = data.tanks.find(t => t.id === stop.tank_id); return <li key={stop.request_id}><span className="pipa-route-order" data-completed={stop.status === 'completed'}>{stop.status === 'completed' ? <Check size={15} /> : stop.position}</span><span className="pipa-route-stop-name"><strong>{tank?.name || 'Caixa indisponível'}</strong><small>{tank?.locality} · {PIPA_STATUSES[stop.status]}</small></span></li>; })}</ol></details>
        <div className="pipa-actions">{pending && onOpen && <Button variant="outline" className="pipa-driver-soft-action" onClick={() => onOpen(route.id)}><MapPin size={16} className="mr-2" />Abrir rota no mapa</Button>}{pending && canCancel(route) && <Button variant="ghost" disabled={busy} onClick={() => setConfirmId(route.id)}>Cancelar rota</Button>}</div>
        {confirmId === route.id && <div className="pipa-route-cancel" role="alert"><p>Cancelar as paradas pendentes? As entregas já registradas serão preservadas.</p><div className="pipa-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmId('')}>Voltar</Button><Button size="sm" disabled={busy} onClick={async () => { await onCancel(route.id); setConfirmId(''); }}>Confirmar cancelamento</Button></div></div>}
      </article>;
    })}</div>{!routes.length && <div className="pipa-driver-empty"><span><Route size={23} /></span><strong>Nenhuma rota planejada</strong></div>}
  </section>;
}
