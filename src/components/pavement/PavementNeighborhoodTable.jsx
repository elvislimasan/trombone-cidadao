import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatarKm, percentual } from '@/lib/pavementLength';
import { montarRelatorio } from '@/lib/pavementReport';

export default function PavementNeighborhoodTable({ neighborhoods, streets, cityName, updatedAt, reports }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('nome');
  const [direction, setDirection] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const rows = useMemo(() => neighborhoods.filter(row => normalize(row.nome).includes(normalize(search))).sort((a,b) => direction * (sort === 'nome' ? a.nome.localeCompare(b.nome,'pt-BR') : a[sort]-b[sort])), [neighborhoods,search,sort,direction]);
  const pages = Math.max(1,Math.ceil(rows.length/pageSize));
  const currentPage = Math.min(page,pages);
  const start = (currentPage-1)*pageSize;
  const changeSort = key => { setDirection(key===sort ? -direction : key==='nome' ? 1 : -1); setSort(key); setPage(1); };
  const report = () => {
    const ids = new Set(rows.map(row=>row.id));
    const selectedStreets = streets.filter(street=>ids.has(street.bairro_id ? String(street.bairro_id) : 'sem-bairro'));
    return ({ ...montarRelatorio('panorama',selectedStreets,{ cidade:cityName, atualizadoEm:updatedAt, filtros:[...(reports.filtrosAtivos || []), ...(search ? [`Bairro: ${search}`] : [])] }),
    tipo:'bairros', subtitulo:'Resumo por bairro', titulo:`Pavimentação por bairro — ${cityName}`, secoes:[{titulo:'Pavimentação por bairro',colunas:['Bairro','Ruas','Pavimentadas','Parcialmente','Sem pavimentação','Sem informação','Extensão','% pavimentadas'],linhas:rows.map(row=>[row.nome,row.ruas,row.ruasPorSituacao.paved,row.ruasPorSituacao.partially_paved,row.ruasPorSituacao.unpaved,row.ruasPorSituacao.unknown,row.temTracado?formatarKm(row.metros):'Sem medição',`${percentual(row.ruasPorSituacao.paved,row.ruas)}%`])}] });
  };
  return <section className="pavement-dashboard-table" aria-label="Pavimentação por bairro">
    <div className="pavement-dashboard-table-toolbar"><h2>Pavimentação por bairro</h2><div className="relative min-w-0 flex-1 sm:max-w-[17rem]"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-content-tertiary" /><Input className="h-8 pl-8 text-xs" aria-label="Buscar bairro nas estatísticas" placeholder="Buscar bairro…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><div className="flex gap-2"><button className="pavement-export-button" disabled={reports.downloading || !rows.length} onClick={()=>reports.onDownloadCsv(report())}><Download className="h-3.5 w-3.5" />Baixar CSV</button><button className="pavement-export-button pavement-export-primary" disabled={reports.downloading || !rows.length} onClick={()=>reports.onDownloadPdf(report())}><FileText className="h-3.5 w-3.5" />Baixar PDF</button></div></div>
    <div className="overflow-x-auto"><table><caption className="sr-only">Ruas e extensão por bairro nos filtros selecionados</caption><thead><tr>{[['nome','Bairro'],['ruas','Ruas'],[null,'Pavimentadas'],[null,'Parcialmente'],[null,'Sem pavimentação'],[null,'Sem informação'],['metros','Extensão'],[null,'% pavimentadas']].map(([key,label])=><th key={label} scope="col" aria-sort={key===sort ? direction===1?'ascending':'descending':undefined}>{key ? <button onClick={()=>changeSort(key)}>{label}{key===sort ? direction===1?<ArrowUp />:<ArrowDown />:<ArrowDown className="opacity-30" />}</button>:label}</th>)}</tr></thead><tbody>{rows.slice(start,start+pageSize).map(row=><tr key={row.id}><th scope="row">{row.nome}</th><td>{row.ruas}</td><td>{row.ruasPorSituacao.paved}</td><td>{row.ruasPorSituacao.partially_paved}</td><td>{row.ruasPorSituacao.unpaved}</td><td>{row.ruasPorSituacao.unknown}</td><td className="whitespace-nowrap">{row.temTracado?formatarKm(row.metros):'Sem medição'}</td><td><div className="flex items-center gap-2"><div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-success-fg" style={{width:`${percentual(row.ruasPorSituacao.paved,row.ruas)}%`}} /></div><span className="w-9 text-right tabular-nums">{percentual(row.ruasPorSituacao.paved,row.ruas)}%</span></div></td></tr>)}{!rows.length && <tr><td colSpan={8} className="py-6 text-center text-content-tertiary">Nenhum bairro encontrado.</td></tr>}</tbody></table></div>
    <div className="pavement-dashboard-pagination"><label>Linhas por página:<select aria-label="Bairros por página" value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);}}>{[10,25,50].map(size=><option key={size}>{size}</option>)}</select></label><span>{rows.length ? start+1 : 0}–{Math.min(start+pageSize,rows.length)} de {rows.length}</span><button aria-label="Página anterior de bairros" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}><ChevronLeft /></button><button aria-label="Próxima página de bairros" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}><ChevronRight /></button></div>
  </section>;
}
