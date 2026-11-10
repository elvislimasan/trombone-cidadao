import React from 'react';
import { ClipboardList, Droplets, RefreshCw, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pipaNumber, PIPA_PROVIDERS } from '@/lib/pipa';

export default function PipaDriverOverview({ driver, monthlyLoads, quota, onRefresh, refreshing = false }) {
  const exceeded = quota != null && monthlyLoads > quota;
  const progress = quota > 0 ? Math.min(100, monthlyLoads / quota * 100) : 0;
  return <div className="pipa-driver-overview">
    <section className="pipa-vehicle-card" aria-label="Meu caminhão">
      <div className="pipa-vehicle-heading"><span className="pipa-driver-eyebrow"><Truck size={15} aria-hidden="true" />Meu caminhão</span>{onRefresh && <Button type="button" variant="ghost" size="icon" aria-label="Atualizar entregas" disabled={refreshing} onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></Button>}</div>
      <div className="pipa-vehicle-info">
        <strong className="pipa-vehicle-plate">{driver.plate}</strong>
        <span className="pipa-vehicle-capacity"><Droplets size={16} aria-hidden="true" />{pipaNumber(driver.capacity_liters)} L</span>
      </div>
      <img className="pipa-vehicle-image" src="/images/operacao-pipa/caminhao-pipa.png" alt="Caminhão-pipa com tanque de água" width="1536" height="1024" decoding="async" />
      <div className="pipa-vehicle-footer"><span className="pipa-vehicle-driver" title={driver.name}>{driver.name}</span><span className="pipa-vehicle-provider">{PIPA_PROVIDERS[driver.provider]}</span></div>
    </section>
    <section className="pipa-driver-month" aria-label="Abastecimentos do mês">
      <div className="pipa-driver-month-heading"><h2><ClipboardList size={16} aria-hidden="true" />Meu mês</h2></div>
      <dl className="pipa-driver-month-values">
        <div className="pipa-driver-month-delivered"><dt>Carradas entregues</dt><dd>{pipaNumber(monthlyLoads)}<Droplets size={23} aria-hidden="true" /></dd></div>
        <div><dt>Cota do mês</dt><dd className={quota == null ? 'pipa-quota-unset' : ''}>{quota == null ? 'Não definida' : pipaNumber(quota)}</dd></div>
      </dl>
      {quota > 0 && <div className="pipa-driver-quota-bar" role="progressbar" aria-label="Cota mensal utilizada" aria-valuemin={0} aria-valuemax={quota} aria-valuenow={Math.min(monthlyLoads, quota)} aria-valuetext={`${pipaNumber(monthlyLoads)} de ${pipaNumber(quota)} carradas`}><span style={{ width: `${progress}%` }} /></div>}
      {exceeded && <p className="pipa-driver-quota-exceeded">Cota ultrapassada em {pipaNumber(monthlyLoads - quota)} carradas.</p>}
    </section>
  </div>;
}
