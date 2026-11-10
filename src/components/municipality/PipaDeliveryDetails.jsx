import React from 'react';
import { Button } from '@/components/ui/button';
import MunicipalDrawer from './MunicipalDrawer';
import { pipaDateTime, pipaNumber, PIPA_PROVIDERS } from '@/lib/pipa';

export default function PipaDeliveryDetails({ delivery, onClose, onManual }) {
  return <MunicipalDrawer open title="Detalhes do abastecimento" description="" onClose={onClose} placement="side" footer={<div className="pipa-actions justify-between"><Button variant="outline" onClick={onClose}>Fechar</Button>{onManual && <Button onClick={() => onManual(delivery)}>Lançar outra entrega</Button>}</div>}>
    <div className="pipa-delivery-detail">
      <div className="pipa-delivery-detail-volume"><span>Volume entregue</span><strong>{pipaNumber(delivery.liters)} <small>L</small></strong><div><span className="pipa-badge">{PIPA_PROVIDERS[delivery.provider]}</span><span className="pipa-source-badge" data-source={delivery.source}>{delivery.source === 'gps' ? 'GPS' : 'Manual'}</span></div></div>
      <section><h3>Entrega</h3><dl><div><dt>Destino</dt><dd>{delivery.destination_name}</dd></div><div><dt>Localidade</dt><dd>{delivery.locality}</dd></div><div><dt>Data do abastecimento</dt><dd>{pipaDateTime(delivery.delivered_at)}</dd></div><div><dt>Pipeiro</dt><dd>{delivery.driver_name}</dd></div><div><dt>Veículo</dt><dd>{delivery.plate} · {pipaNumber(delivery.capacity_liters)} L</dd></div><div><dt>Carradas</dt><dd>{pipaNumber(delivery.loads)}</dd></div>{delivery.level_after_percent != null && <div><dt>Nível informado após a entrega</dt><dd>{delivery.level_after_percent}%{delivery.level_after_percent === 100 ? ' · Caixa completada' : ''}</dd></div>}</dl></section>
      {delivery.notes && <section><h3>Observações / motivo</h3><p>{delivery.notes}</p></section>}
      <section className="pipa-delivery-audit"><h3>Auditoria</h3><dl><div><dt>Registrado em</dt><dd>{pipaDateTime(delivery.recorded_at)}</dd></div><div><dt>Usuário responsável pelo registro</dt><dd className="pipa-audit-user">{delivery.recorded_by || '—'}</dd></div>{delivery.source === 'gps' && delivery.latitude != null && <><div><dt>Localização da descarga</dt><dd>{Number(delivery.latitude).toFixed(6)}, {Number(delivery.longitude).toFixed(6)}</dd></div><div><dt>Precisão do GPS</dt><dd>{delivery.accuracy_m == null ? '—' : `${Math.round(delivery.accuracy_m)} m`}</dd></div></>}</dl></section>
    </div>
  </MunicipalDrawer>;
}
