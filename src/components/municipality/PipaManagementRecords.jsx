import React from 'react';
import { AlertCircle, CheckCircle2, Droplets, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PipaTable from './PipaTable';
import PipaProviderBadge from './PipaProviderBadge';
import { pipaNumber } from '@/lib/pipa';
function Badge({children,tone}){const Icon=tone==='urgent'?AlertCircle:tone==='success'?CheckCircle2:children==='Desativado'?PauseCircle:Droplets;return <span className="pipa-badge" data-tone={tone}><Icon size={12} aria-hidden="true" />{children}</span>}
export default function PipaManagementRecords({section,data,stats,period,match,editAllowed,open}){
  return <>
      {section === 'pipeiros' && <><PipaTable headings={['Pipeiro', 'Veículo', 'Cota / entregas do mês', 'Situação', 'Ações']} rows={data.drivers.filter(match)} render={d => { const s = stats.byDriver.find(s => s.id === d.id); return <tr key={d.id}><td><strong>{d.name}</strong><br /><PipaProviderBadge provider={d.provider} /></td><td>{d.plate}<br />{pipaNumber(d.capacity_liters)} L</td><td>{s?.quota == null ? 'Cota não definida' : `Cota: ${pipaNumber(s.quota)}`}<br />Entregues: {pipaNumber(s?.monthLoads)}{s?.quota != null && s.monthLoads > s.quota && <><br /><Badge tone="urgent">Acima da cota</Badge></>}</td><td><Badge tone={d.active ? 'success' : undefined}>{d.active ? 'Ativo' : 'Desativado'}</Badge><br />{d.user_id ? 'Login criado' : 'Sem login'}</td><td>{editAllowed(d.channel_id) && <div className="pipa-actions"><Button size="sm" variant="outline" onClick={() => open('driver', d)}>Editar</Button><Button size="sm" variant="outline" onClick={() => open('quota', { ...d, month: period.from.slice(0, 7), quota: s?.quota || 0 })}>Cota</Button>{!d.user_id && d.active && <Button size="sm" onClick={() => open('login', d)}>Criar login</Button>}</div>}</td></tr>; }} /></>}
  </>;
}
