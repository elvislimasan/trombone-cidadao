import React, { useState } from 'react';
import { BarChart3, Droplets, MapPin, Truck, Users } from 'lucide-react';
import PipaTable from './PipaTable';
import PipaMetric from './PipaMetric';
import { MunicipalEmptyState } from './MunicipalPageUi';
import { pipaNumber } from '@/lib/pipa';

export default function PipaManagementStats({ stats }) {
  const [view, setView] = useState('overview');
  return <section className="pipa-report-workspace">
    <div className="pipa-report-metrics">{[['Carradas no período',stats.loads,Truck,'brand'],['Litros entregues',stats.liters,Droplets,'water'],['Caixas atendidas',stats.tanksServed,MapPin,'positive'],['Pipeiros com entregas',stats.byDriver.filter(d=>d.loads).length,Users,'amber']].map(([label,value,Icon,tone])=><PipaMetric key={label} label={label} value={pipaNumber(value)} icon={Icon} tone={tone} />)}</div>
    <nav className="pipa-report-tabs" aria-label="Detalhamento das estatísticas">{[['overview','Visão geral'],['drivers','Por pipeiro'],['localities','Por localidade']].map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</nav>
    {view==='overview' && <div className="pipa-report-overview"><section className="pipa-report-chart"><header><BarChart3 size={18}/><h2>Carradas por mês</h2></header>{stats.byMonth.length ? <div className="pipa-month-chart">{stats.byMonth.map(month=><div className="pipa-month-row" key={month.id}><span>{month.id.split('-').reverse().join('/')}</span><div className="pipa-month-bar" aria-label={`Prefeitura ${month.prefeitura}, Exército ${month.exercito}`}><span style={{background:'#0284c7',width:`${month.prefeitura/Math.max(...stats.byMonth.map(m=>m.loads),1)*100}%`}}/><span style={{background:'#63758b',width:`${month.exercito/Math.max(...stats.byMonth.map(m=>m.loads),1)*100}%`}}/></div><strong>{pipaNumber(month.loads)}</strong></div>)}</div> : <MunicipalEmptyState title="Sem entregas no período"/>}<div className="pipa-chart-legend"><span><i style={{background:'#0284c7'}}/>Prefeitura</span><span><i style={{background:'#63758b'}}/>Exército</span></div></section><section className="pipa-report-context"><h2>Panorama do abastecimento</h2><dl><div><dt>Caixas da prefeitura</dt><dd>{pipaNumber(stats.prefeituraTanks)}</dd></div><div><dt>Caixas do Exército</dt><dd>{pipaNumber(stats.exercitoTanks)}</dd></div><div><dt>Atendidas pela prefeitura no mês anterior</dt><dd>{pipaNumber(stats.deliveredLastMonth)}</dd></div><div><dt>Carradas nos últimos 12 meses</dt><dd>{pipaNumber(stats.annualLoads)}</dd></div></dl></section></div>}
    {view==='drivers' && <PipaTable headings={['Pipeiro','Carradas','Litros','Caixas','Localidades atendidas']} rows={stats.byDriver} render={driver=><tr key={driver.id}><td><strong>{driver.name}</strong><span className="pipa-cell-secondary">{driver.plate}</span></td><td>{pipaNumber(driver.loads)}</td><td>{pipaNumber(driver.liters)}</td><td>{driver.tanks}</td><td>{driver.localities.join(', ')||'—'}</td></tr>}/>}
    {view==='localities' && <PipaTable headings={['Localidade','Carradas','Litros','Caixas']} rows={stats.byLocality} render={row=><tr key={row.id}><td>{row.id}</td><td>{pipaNumber(row.loads)}</td><td>{pipaNumber(row.liters)}</td><td>{row.tanks}</td></tr>}/>}
  </section>;
}
