import React from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PipaTable from './PipaTable';
import PipaWaterStatus from './PipaWaterStatus';
import PipaProviderBadge from './PipaProviderBadge';
import { pipaDateTime, pipaNumber } from '@/lib/pipa';

export default function PipaTankList({ tanks, levels, canEdit, canRequest, onOpen }) {
  return <PipaTable headings={['Caixa / localidade', 'Nível estimado', 'Consumo / previsão', 'Última entrega', 'Ações']} rows={tanks} render={tank => { const level = levels.get(tank.id); return <tr key={tank.id} data-water-level={level?.state}>
    <td><strong>{tank.name}</strong><span className="pipa-cell-secondary">{tank.locality} · {pipaNumber(tank.capacity_liters)} L</span><PipaProviderBadge provider={tank.provider} /></td>
    <td><PipaWaterStatus level={level} />{level?.urgent && <span className="pipa-cell-urgent">Urgência em aberto</span>}</td>
    <td>{tank.emptying_days ? <><strong>{tank.emptying_days} dias</strong><span className="pipa-cell-secondary">{level?.emptyAt ? `Esvaziamento: ${new Date(level.emptyAt).toLocaleDateString('pt-BR', { timeZone:'America/Fortaleza' })}` : 'Aguardando histórico'}</span></> : <span className="pipa-note">Média não configurada</span>}</td>
    <td>{pipaDateTime(level?.lastDelivery)}</td>
    <td><div className="pipa-actions">{canEdit(tank.channel_id) && <Button size="sm" variant="outline" onClick={() => onOpen('tank', tank)}><Pencil size={13} className="mr-1.5" aria-hidden="true" />Editar</Button>}{tank.active && canRequest && <Button size="sm" variant="ghost" onClick={() => onOpen('request', { channel_id:tank.channel_id,tank_id:tank.id,requester_name:tank.responsible_name,requester_phone:tank.responsible_phone })}><Plus size={14} className="mr-1" aria-hidden="true" />Solicitar</Button>}</div></td>
  </tr>; }} />;
}
