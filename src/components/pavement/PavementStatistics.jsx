import React, { useMemo, useState } from 'react';
import { ChevronRight, Download, FileText, Map as MapIcon, MapPin, Route, Waypoints } from 'lucide-react';
import { cepsDaRua } from '@/lib/pavementReport';
import { formatarKm, percentual, resumoPorBairro, SITUACOES } from '@/lib/pavementLength';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PavementReportsPanel from '@/components/pavement/PavementReportsPanel';
import PavementNeighborhoodTable from '@/components/pavement/PavementNeighborhoodTable';
import CouncilorRankingCard from '@/components/pavement/CouncilorRankingCard';

export default function PavementStatistics({ streets, resumo, loading, reports, cityId, cityName, updatedAt, filters, onQualityFilter }) {
  const [exportOpen,setExportOpen] = useState(false);
  const neighborhoods = useMemo(() => resumoPorBairro(streets), [streets]);
  const quality = [
    {label:'Sem nome oficial',count:streets.filter(street=>street.is_unnamed || !street.name?.trim()).length,Icon:FileText,tone:'rose',filter:'nome'},
    {label:'Sem CEP',count:streets.filter(street=>cepsDaRua(street).length===0).length,Icon:MapPin,tone:'blue',filter:'cep'},
    {label:'Sem traçado no mapa',count:resumo.ruasSemTracado,Icon:Waypoints,tone:'purple'},
  ];
  const situations = [...SITUACOES, {id:'unknown',rotulo:'Sem informação',token:'unknown'}].filter(item=>item.id!=='unknown' || resumo.ruasPorSituacao.unknown>0);
  const cards = [
    {label:'Ruas cadastradas',value:streets.length.toLocaleString('pt-BR'),Icon:Route,tone:'rose',note:'No recorte selecionado'},
    {label:'Extensão mapeada',value:resumo.temTracado?formatarKm(resumo.metros):'Sem medição',Icon:MapIcon,tone:'blue',note:'Somente ruas com traçado'},
    {label:'Pavimentadas',value:resumo.ruasPorSituacao.paved || 0,Icon:Route,tone:'green',share:percentual(resumo.ruasPorSituacao.paved,streets.length)},
    {label:'Sem pavimentação',value:resumo.ruasPorSituacao.unpaved || 0,Icon:Route,tone:'orange',share:percentual(resumo.ruasPorSituacao.unpaved,streets.length)},
  ];
  return <section data-testid="pavement-statistics" className="pavement-dashboard" aria-label="Estatísticas de ruas e pavimentações" aria-busy={loading}>
    <div className="pavement-dashboard-heading"><div><h1>Ruas e pavimentações</h1><p>Acompanhe os indicadores de ruas e pavimentações de {cityName}, conforme os filtros selecionados.</p></div><Button variant="outline" className="h-9 shrink-0 gap-2 border-brand/30 text-xs text-brand" onClick={()=>setExportOpen(true)}><Download className="h-3.5 w-3.5" />Exportar relatório</Button></div>
    {filters}
    <div className="pavement-dashboard-cards" aria-label="Indicadores de ruas">{cards.map(({label,value,Icon,tone,note,share})=><article key={label} className="pavement-dashboard-card"><span className={`pavement-dashboard-icon pavement-tone-${tone}`}><Icon /></span><div className="min-w-0 flex-1"><p className="pavement-dashboard-value">{loading?'—':value}</p><h2>{label}</h2>{share===undefined?<p className="pavement-dashboard-card-note">{note}</p>:<div className="pavement-dashboard-card-progress"><span>{share}% do total</span><div><span className={`pavement-tone-fill-${tone}`} style={{width:`${share}%`}} /></div></div>}</div></article>)}</div>
    {loading ? <p role="status" className="py-8 text-sm text-content-secondary">Carregando estatísticas…</p>:<>
      {!streets.length && <p role="status" className="rounded-xl border border-edge-subtle p-4 text-sm text-content-secondary">Nenhuma rua encontrada para os filtros selecionados.</p>}
      <div className="pavement-dashboard-summary">
        <section className="pavement-dashboard-distribution" aria-label="Distribuição da pavimentação"><div className="flex flex-wrap justify-between gap-2"><h2>Situação da pavimentação</h2><span className="text-xs text-content-secondary">Total: <strong className="text-content-primary">{streets.length} ruas</strong></span></div><p>Percentuais por quantidade de ruas. A extensão considera apenas os traçados cadastrados.</p>
          <div className="pavement-dashboard-stacked-bar" role="img" aria-label={situations.map(item=>`${item.rotulo}: ${resumo.ruasPorSituacao[item.id] || 0} ruas`).join('; ')}>{situations.map(item=><span key={item.id} className={`ponto-legenda-pav--${item.token}`} style={{flex:resumo.ruasPorSituacao[item.id] || 0}} />)}</div>
          <ul className="pavement-dashboard-distribution-legend">{situations.map(item=>{const count=resumo.ruasPorSituacao[item.id] || 0;return <li key={item.id}><span className={`ponto-legenda-pav--${item.token}`} /><div><h3>{item.rotulo}</h3><p><strong>{count} {count===1?'rua':'ruas'} · {percentual(count,streets.length)}%</strong><span> · {resumo.porSituacao[item.id]>0 || count===0?formatarKm(resumo.porSituacao[item.id]):'Sem medição'}</span></p></div></li>;})}</ul>
        </section>
        <section className="pavement-dashboard-quality" aria-label="Qualidade do cadastro"><h2>Qualidade do cadastro</h2><p>Ruas que precisam de complementação.</p><ul>{quality.map(({label,count,Icon,tone,filter})=><li key={label}>{filter?<button type="button" onClick={()=>onQualityFilter(filter)} aria-label={`Filtrar ruas ${label.toLowerCase()}`}><span className={`pavement-quality-icon pavement-tone-${tone}`}><Icon /></span><span>{label}</span><strong>{count}</strong><ChevronRight className="h-3.5 w-3.5 text-content-tertiary" /></button>:<div><span className={`pavement-quality-icon pavement-tone-${tone}`}><Icon /></span><span>{label}</span><strong>{count}</strong></div>}</li>)}</ul></section>
      </div>
      <PavementNeighborhoodTable neighborhoods={neighborhoods} streets={streets} cityName={cityName} updatedAt={updatedAt} reports={reports} />
      <CouncilorRankingCard streets={streets} cityId={cityId} cityName={cityName} compact />
      <p className="pavement-dashboard-footnote">{updatedAt && `Atualizado em ${updatedAt}. `}{resumo.ruasSemTracado} {resumo.ruasSemTracado===1?'rua sem traçado não entra':'ruas sem traçado não entram'} no cálculo de quilômetros.</p>
    </>}
    <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Exportar relatório</DialogTitle><DialogDescription>Selecione o conteúdo. Os arquivos respeitam os filtros das estatísticas.</DialogDescription></DialogHeader><PavementReportsPanel {...reports} selectId="tipo-relatorio-estatisticas" detalhado atualizadoEm={updatedAt} /></DialogContent></Dialog>
  </section>;
}
