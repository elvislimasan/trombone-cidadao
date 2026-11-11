import React from 'react';
import { Droplets, MapPin, Pencil, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { pipaDateTime, pipaNumber } from '@/lib/pipa';
import PipaWaterStatus from './PipaWaterStatus';
import PipaProviderBadge from './PipaProviderBadge';

export default function PipaTankDetails({ tank, level, onClose, onOpen, canRequest, canEdit }) {
  if (!tank) return null;
  const facts = [
    ['Código do sistema', tank.system_code],
    ...(tank.official_code ? [['Código do órgão', tank.official_code]] : []),
    ['Localidade', tank.locality],
    ['Abastecimento habitual', <PipaProviderBadge provider={tank.provider} />],
    ['Capacidade', `${pipaNumber(tank.capacity_liters)} L`],
    ['Consumo médio', tank.emptying_days ? `${tank.emptying_days} dias (partindo cheia)` : 'Não configurado'],
    ['Última entrega', pipaDateTime(level?.lastDelivery)],
    ...(level?.emptyAt ? [['Esvaziamento estimado', pipaDateTime(level.emptyAt)]] : []),
  ];

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent aria-label="Caixa selecionada" className="pipa-tank-details max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-x-hidden overflow-y-auto rounded-2xl border-edge-subtle bg-surface-raised p-0">
      <div className="p-5 sm:p-6">
        <div className="border-b border-edge-subtle pb-4 pr-6">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand" />Caixa d’água</DialogTitle>
          <DialogDescription className="sr-only">Dados e ações da caixa selecionada no mapa.</DialogDescription>
        </div>

        <div className="mt-4 flex min-w-0 items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-edge-subtle bg-surface-subtle"><Droplets className="h-7 w-7 text-brand" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-bold leading-6">{tank.name}</h3>
            <p className="mt-1 break-words text-sm leading-5 text-content-secondary">{tank.address || 'Endereço não informado'}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-edge-subtle bg-surface-subtle p-3">
          <PipaWaterStatus level={level} />
          {level?.urgent && <span className="pipa-badge" data-tone="urgent">Solicitação urgente em aberto</span>}
          {level?.reason && <details className="text-xs text-content-secondary"><summary className="cursor-pointer">Sobre a estimativa</summary><p className="mt-2 leading-5">{level.reason}</p></details>}
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-edge-subtle pt-4 min-[420px]:grid-cols-2">
          {facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] leading-4 text-content-secondary">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium leading-5">{value || '—'}</dd></div>)}
        </dl>

        <details className="mt-5 rounded-xl border border-edge-subtle bg-surface-subtle p-4">
          <summary className="cursor-pointer text-sm font-semibold">Responsável pela caixa</summary>
          <p className="mt-3 text-xs text-content-secondary">Dados pessoais restritos à equipe autorizada.</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-2">
            {[['Nome', tank.responsible_name], ['CPF', tank.responsible_document], ['Telefone', tank.responsible_phone], ['Endereço', tank.responsible_address]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] text-content-secondary">{label}</dt><dd className="mt-0.5 break-words text-sm">{value || '—'}</dd></div>)}
          </dl>
        </details>

        {(canEdit || canRequest) && <div className="mt-5 space-y-2 border-t border-edge-subtle pt-4">
          {canEdit && <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Button variant="outline" size="sm" onClick={() => onOpen('tank', tank)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar caixa</Button>
            <Button variant="outline" size="sm" onClick={() => onOpen('manual', { tank_id: tank.id, channel_id: tank.channel_id })}><Truck className="mr-1.5 h-3.5 w-3.5" />Registrar entrega</Button>
          </div>}
          {canRequest && <Button size="sm" className="w-full" onClick={() => onOpen('request', { tank_id: tank.id, channel_id: tank.channel_id, requester_name: tank.responsible_name, requester_phone: tank.responsible_phone })}><Plus className="mr-1.5 h-3.5 w-3.5" />Solicitar água</Button>}
        </div>}
      </div>
    </DialogContent>
  </Dialog>;
}
