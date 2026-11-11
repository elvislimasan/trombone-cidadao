import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Droplets, Navigation, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PipaSelect } from './PipaForm';
import PipaFilterBar from './PipaFilterBar';
import PipaTable from './PipaTable';
import { PIPA_KINDS, PIPA_STATUSES, pipaDateTime } from '@/lib/pipa';

const GROUPS = [
  { id: 'pending', label: 'Pendentes', icon: Clock3, statuses: ['pending', 'assigned', 'in_transit'], empty: 'Nenhuma solicitação pendente' },
  { id: 'completed', label: 'Atendidas', icon: CheckCircle2, statuses: ['completed'], empty: 'Nenhuma solicitação atendida' },
  { id: 'cancelled', label: 'Canceladas', icon: XCircle, statuses: ['cancelled'], empty: 'Nenhuma solicitação cancelada' },
];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function RequestStatus({ status }) {
  const Icon = { pending: Clock3, assigned: Send, in_transit: Navigation, completed: CheckCircle2, cancelled: XCircle }[status] || Clock3;
  return <span className="pipa-record-status" data-status={status}><Icon size={12} aria-hidden="true" />{PIPA_STATUSES[status]}</span>;
}

export default function PipaRequests({ data, canEdit, onOpen }) {
  const [tab, setTab] = useState('pending'), [query, setQuery] = useState(''), [status, setStatus] = useState('');
  const tanks = useMemo(() => new Map(data.tanks.map(tank => [tank.id, tank])), [data.tanks]);
  const drivers = useMemo(() => new Map(data.drivers.map(driver => [driver.id, driver])), [data.drivers]);
  const matching = useMemo(() => {
    const needle = normalize(query).trim();
    return data.requests.filter(request => !needle || normalize([request.locality, request.requester_name, tanks.get(request.tank_id)?.name].join(' ')).includes(needle));
  }, [data.requests, query, tanks]);
  const group = GROUPS.find(item => item.id === tab);
  const rows = matching.filter(request => group.statuses.includes(request.status) && (!status || request.status === status)).sort((a, b) => Number(b.kind === 'urgent') - Number(a.kind === 'urgent') || String(b.created_at).localeCompare(String(a.created_at)));

  return <Tabs className="pipa-requests" value={tab} onValueChange={value => { setTab(value); setStatus(''); }}>
    <TabsList className="pipa-request-tabs" aria-label="Situação das solicitações">
      {GROUPS.map(({ id, label, icon: Icon, statuses }) => <TabsTrigger key={id} value={id} className="pipa-request-tab"><Icon size={16} aria-hidden="true" />{label}<span>{matching.filter(request => statuses.includes(request.status)).length}</span></TabsTrigger>)}
    </TabsList>
    <TabsContent key={tab} value={tab} className="pipa-request-content">
      <PipaFilterBar key={tab} search={query} onSearch={setQuery} placeholder="Buscar destino ou solicitante" labels={status ? [PIPA_STATUSES[status]] : []} onClear={() => { setQuery(''); setStatus(''); }}>
        <PipaSelect label="Situação" value={status} required={false} onChange={setStatus}><option value="">{tab === 'pending' ? 'Todas as pendentes' : group.label}</option>{group.statuses.map(id => <option key={id} value={id}>{PIPA_STATUSES[id]}</option>)}</PipaSelect>
      </PipaFilterBar>
      <PipaTable key={`${tab}:${status}:${query}`} headings={['Solicitação', 'Destino', 'Solicitante', 'Situação', 'Pipeiro', 'Ações']} rows={rows} empty={query || status ? 'Nenhuma solicitação para estes filtros' : group.empty} renderMobile={request => { const tank=tanks.get(request.tank_id), driver=drivers.get(request.driver_id), urgent=request.kind==='urgent'; return <article className="pipa-mobile-card" key={request.id} data-request-status={request.status}><div className="pipa-mobile-card-head"><div><strong>{tank?.name || 'Entrega avulsa'}</strong><span>{request.locality}</span></div><RequestStatus status={request.status}/></div><div className="pipa-mobile-card-meta"><span className="pipa-badge" data-tone={urgent?'urgent':undefined}>{PIPA_KINDS[request.kind]}</span><time>{pipaDateTime(request.created_at)}</time></div><details className="pipa-mobile-card-details"><summary>Detalhes e ações</summary><dl><div><dt>Solicitante</dt><dd>{request.requester_name}</dd></div>{request.requester_phone && <div><dt>Telefone</dt><dd>{request.requester_phone}</dd></div>}{request.address && <div><dt>Endereço</dt><dd>{request.address}</dd></div>}<div><dt>Pipeiro</dt><dd>{driver?.name || 'A definir'}</dd></div>{request.notes && <div><dt>Observações</dt><dd>{request.notes}</dd></div>}</dl>{canEdit(request.channel_id) && ['pending','assigned','in_transit'].includes(request.status) && <div className="pipa-actions">{request.status!=='in_transit' && !request.route_id && <Button size="sm" variant="outline" onClick={()=>onOpen('dispatch',request)}>Direcionar</Button>}<Button size="sm" variant="outline" onClick={()=>onOpen('manual',{channel_id:request.channel_id,tank_id:request.tank_id||'',driver_id:request.driver_id||'',request_id:request.id,destination_label:request.locality,liters:driver?.capacity_liters||''})}>Lançar entrega</Button><Button size="sm" variant="ghost" onClick={()=>onOpen('cancel',request)}>Cancelar</Button></div>}</details></article>; }} render={request => {
        const tank = tanks.get(request.tank_id), driver = drivers.get(request.driver_id), urgent = request.kind === 'urgent', KindIcon = urgent ? AlertCircle : Droplets;
        return <tr key={request.id} data-request-status={request.status}>
          <td><span className="pipa-badge" data-tone={urgent ? 'urgent' : undefined}><KindIcon size={12} aria-hidden="true" />{PIPA_KINDS[request.kind]}</span><span className="pipa-cell-secondary">{pipaDateTime(request.created_at)}</span></td>
          <td><strong>{tank?.name || 'Entrega avulsa'}</strong><span className="pipa-cell-secondary">{request.locality}</span><span className="pipa-cell-secondary">{request.address}</span></td>
          <td>{request.requester_name}<span className="pipa-cell-secondary">{request.requester_phone}</span>{request.notes && <details className="mt-2"><summary>Observações</summary>{request.notes}</details>}</td>
          <td><RequestStatus status={request.status} /></td>
          <td>{driver?.name || 'A definir'}</td>
          <td>{canEdit(request.channel_id) && ['pending', 'assigned', 'in_transit'].includes(request.status) && <div className="pipa-actions">
            {request.status !== 'in_transit' && !request.route_id && <Button size="sm" variant="outline" onClick={() => onOpen('dispatch', request)}>Direcionar</Button>}
            <Button size="sm" variant="outline" onClick={() => onOpen('manual', { channel_id: request.channel_id, tank_id: request.tank_id || '', driver_id: request.driver_id || '', request_id: request.id, destination_label: request.locality, liters: driver?.capacity_liters || '' })}>Lançar entrega</Button>
            <Button size="sm" variant="ghost" onClick={() => onOpen('cancel', request)}>Cancelar</Button>
          </div>}</td>
        </tr>;
      }} />
    </TabsContent>
  </Tabs>;
}
