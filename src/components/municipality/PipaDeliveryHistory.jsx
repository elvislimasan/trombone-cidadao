import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Droplets, History, MoreHorizontal, Eye, MapPin, PenLine, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MunicipalEmptyState, MunicipalPagination } from './MunicipalPageUi';
import PipaDeliveryDetails from './PipaDeliveryDetails';
import PipaFilterBar from './PipaFilterBar';
import PipaMetric from './PipaMetric';
import { pipaNumber, PIPA_PROVIDERS } from '@/lib/pipa';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Fortaleza', day:'2-digit', month:'short' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Fortaleza', hour:'2-digit', minute:'2-digit' });
const summaryDate = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit'});
const compactNumber = new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1});
const dateText = value => dateFormat.format(new Date(value)).replace('.', '');
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
function Source({ source }) { const Icon = source === 'gps' ? MapPin : PenLine; return <span className="pipa-source-badge" data-source={source}><Icon size={11}/>{source === 'gps' ? 'GPS' : 'Manual'}</span>; }

export default function PipaDeliveryHistory({ rows, deliveries, filters, filterLabels, onReset, canEdit, onManual }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [selectedId, setSelectedId] = useState('');
  const filtered = useMemo(() => {
    const needle=normalize(query).trim();
    return rows.filter(row => !needle || normalize([row.destination_name,row.locality,row.driver_name,row.plate].join(' ')).includes(needle)).slice().sort((a,b)=>b.delivered_at.localeCompare(a.delivered_at));
  }, [rows, query]);
  const filtersKey=filterLabels.join('|');
  useEffect(()=>setPage(1),[query,filtersKey]);
  const current=Math.min(page,Math.max(1,Math.ceil(filtered.length/20))), visible=filtered.slice((current-1)*20,current*20);
  const liters=filtered.reduce((sum,row)=>sum+Number(row.liters),0), loads=filtered.reduce((sum,row)=>sum+Number(row.loads),0);
  const municipalLoads=filtered.filter(row=>row.provider==='prefeitura').reduce((sum,row)=>sum+Number(row.loads),0), armyLoads=loads-municipalLoads;
  const last=filtered[0], selected=deliveries.find(row=>row.id===selectedId);
  const launch = delivery => { setSelectedId(''); onManual({channel_id:delivery.channel_id,tank_id:delivery.tank_id || '',driver_id:delivery.driver_id}); };
  const menu = delivery => <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Ações do abastecimento de ${delivery.destination_name}`}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setSelectedId(delivery.id)}><Eye size={14} className="mr-2"/>Ver detalhes</DropdownMenuItem>{delivery.tank_id && canEdit(delivery.channel_id) && <DropdownMenuItem onSelect={()=>launch(delivery)}><Plus size={14} className="mr-2"/>Lançar outra entrega</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>;
  return <section className="pipa-delivery-history">
    <div className="pipa-history-heading"><h2><History size={19} aria-hidden="true" />Histórico de abastecimentos</h2><span>{filtered.length} {filtered.length===1?'registro':'registros'}</span></div>
    <div className="pipa-history-summary">
      <PipaMetric icon={Truck} label="Abastecimentos" value={pipaNumber(filtered.length)} detail={`${pipaNumber(loads)} ${loads===1?'carrada':'carradas'} no período`} />
      <PipaMetric icon={Droplets} tone="water" label="Volume entregue" value={<>{compactNumber.format(liters)} <em>L</em></>} detail={`${pipaNumber(municipalLoads)} prefeitura · ${pipaNumber(armyLoads)} exército`} />
      <PipaMetric icon={Clock3} tone="amber" label="Última entrega" value={last?summaryDate.format(new Date(last.delivered_at)):'—'} detail={last?timeFormat.format(new Date(last.delivered_at)):'Sem registros no período'} />
    </div>
    <PipaFilterBar search={query} onSearch={setQuery} placeholder="Buscar destino, pipeiro ou placa" labels={filterLabels} onClear={()=>{setQuery('');onReset();}}>{filters}</PipaFilterBar>
    {filtered.length ? <div className="pipa-history-records">
      <div className="pipa-table-scroll pipa-deliveries-desktop"><table className="pipa-table pipa-deliveries-table"><colgroup><col style={{width:'31%'}}/><col style={{width:'13%'}}/><col style={{width:'25%'}}/><col style={{width:'14%'}}/><col style={{width:'11%'}}/><col style={{width:'6%'}}/></colgroup><thead><tr>{['Destino','Quando','Pipeiro / veículo','Volume','Registro',''].map((heading,index)=><th key={index} scope="col">{heading || <span className="sr-only">Ações</span>}</th>)}</tr></thead><tbody>{visible.map(delivery=><tr key={delivery.id} onClick={()=>setSelectedId(delivery.id)}>
        <td><button type="button" className="pipa-history-destination" title={delivery.destination_name} onClick={()=>setSelectedId(delivery.id)}>{delivery.destination_name}</button>{!normalize(delivery.destination_name).includes(normalize(delivery.locality)) && <span className="pipa-history-cell-meta" title={delivery.locality}>{delivery.locality}</span>}</td>
        <td><time dateTime={delivery.delivered_at}>{dateText(delivery.delivered_at)}</time><span className="pipa-history-cell-meta">{timeFormat.format(new Date(delivery.delivered_at))}</span></td>
        <td><span className="pipa-history-driver" title={delivery.driver_name}>{delivery.driver_name}</span><span className="pipa-history-cell-meta">{delivery.plate} · {PIPA_PROVIDERS[delivery.provider]}</span></td>
        <td><strong className="pipa-history-volume">{pipaNumber(delivery.liters)} <small>L</small></strong><span className="pipa-history-cell-meta">{delivery.loads} {delivery.loads===1?'carrada':'carradas'}</span></td><td><Source source={delivery.source}/></td><td onClick={event=>event.stopPropagation()}>{menu(delivery)}</td>
      </tr>)}</tbody></table></div>
      <div className="pipa-deliveries-mobile">{visible.map(delivery=><article key={delivery.id}><button type="button" className="pipa-history-mobile-record" onClick={()=>setSelectedId(delivery.id)}><strong>{delivery.destination_name}</strong><span>{dateText(delivery.delivered_at)} · {timeFormat.format(new Date(delivery.delivered_at))} · {delivery.driver_name}</span><span className="pipa-history-mobile-footer"><strong className="pipa-history-volume">{pipaNumber(delivery.liters)} <small>L</small></strong><Source source={delivery.source}/></span></button>{menu(delivery)}</article>)}</div>
      <MunicipalPagination page={current} total={filtered.length} pageSize={20} onPageChange={setPage}/>
    </div> : <div className="pipa-history-records"><MunicipalEmptyState title={query?'Nenhum abastecimento para esta busca':'Nenhum abastecimento no período'}/></div>}
    {selected && <PipaDeliveryDetails delivery={selected} onClose={()=>setSelectedId('')} onManual={selected.tank_id && canEdit(selected.channel_id) ? launch : undefined}/>}
  </section>;
}
