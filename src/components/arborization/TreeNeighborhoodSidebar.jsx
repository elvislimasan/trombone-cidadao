import React, { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Loader2, Search, Trees, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { treeNameKey } from '@/lib/treeInventory';

function NeighborhoodList({ rows, maximum }) {
  return <ol className="arborization-neighborhood-list">
    {rows.map((row, index) => <li key={row.name}>
      <span className="arborization-neighborhood-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <div className="arborization-neighborhood-label"><span>{row.name}</span><strong>{row.count.toLocaleString('pt-BR')}<span className="sr-only"> {row.count === 1 ? 'árvore' : 'árvores'}</span></strong></div>
        <div className="arborization-neighborhood-track" aria-hidden="true"><span style={{ width: `${maximum ? row.count / maximum * 100 : 0}%` }} /></div>
      </div>
    </li>)}
  </ol>;
}

export default function TreeNeighborhoodSidebar({ neighborhoods, unidentified = 0, loading, error }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const highlights = neighborhoods.filter(row => row.count > 0).slice(0, 5);
  const total = neighborhoods.reduce((sum, row) => sum + row.count, unidentified);
  const maximum = neighborhoods[0]?.count || 0;
  const results = useMemo(() => neighborhoods.filter(row => treeNameKey(row.name).includes(treeNameKey(search))), [neighborhoods, search]);

  return <aside className="arborization-neighborhood-sidebar" aria-labelledby="arborization-neighborhood-title">
    <div className="arborization-neighborhood-heading"><span className="arborization-chart-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="arborization-neighborhood-title">Árvores cadastradas</h2><p>Distribuição por bairro</p></div></div>
    {loading ? <p role="status" className="arborization-neighborhood-empty"><Loader2 className="h-4 w-4 animate-spin" />Carregando bairros…</p> : error ? <p className="arborization-neighborhood-empty">A distribuição por bairro está indisponível.</p> : <>
      <div className="arborization-neighborhood-total"><Trees className="h-5 w-5" aria-hidden="true" /><strong>{total.toLocaleString('pt-BR')}</strong><span>{total === 1 ? 'árvore viva no filtro' : 'árvores vivas no filtro'}</span></div>
      <h3 className="arborization-neighborhood-caption">Principais bairros</h3>
      {highlights.length ? <NeighborhoodList rows={highlights} maximum={maximum} /> : <p className="arborization-neighborhood-empty">Ainda não há árvores vivas com bairro identificado neste filtro.</p>}
      {unidentified > 0 && <p className="arborization-neighborhood-footnote">{unidentified.toLocaleString('pt-BR')} {unidentified === 1 ? 'árvore sem bairro identificado' : 'árvores sem bairro identificado'}.</p>}
    </>}
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setSearch(''); }}>
      <DialogTrigger asChild><Button className="arborization-neighborhood-more" disabled={loading || Boolean(error)}>Ver mais<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></DialogTrigger>
      <DialogContent hideClose placement="right" className="arborization-neighborhood-drawer" overlayClassName="bg-black/40 arborization-neighborhood-overlay" data-testid="tree-neighborhood-drawer">
        <div className="arborization-drawer-header"><div className="min-w-0"><p className="arborization-neighborhood-caption">Inventário de arborização</p><DialogTitle>Árvores cadastradas por bairro</DialogTitle></div><DialogClose asChild><Button size="icon" variant="ghost" aria-label="Fechar bairros"><X className="h-5 w-5" /></Button></DialogClose></div>
        <DialogDescription className="arborization-drawer-description">Consulte todos os bairros, do maior para o menor número de árvores vivas nos filtros aplicados.</DialogDescription>
        <label className="arborization-drawer-search"><span className="sr-only">Buscar bairro</span><Search className="h-4 w-4" aria-hidden="true" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar bairro…" /></label>
        <p role="status" className="arborization-drawer-result-count">{results.length} {results.length === 1 ? 'bairro encontrado' : 'bairros encontrados'}</p>
        <div className="arborization-drawer-scroll">
          {results.length ? <NeighborhoodList rows={results} maximum={maximum} /> : <p className="arborization-neighborhood-empty">Nenhum bairro encontrado{search.trim() ? ' para esta busca' : ''}.</p>}
        </div>
        <div className="arborization-drawer-footer"><p>{unidentified.toLocaleString('pt-BR')} {unidentified === 1 ? 'árvore viva sem bairro identificado' : 'árvores vivas sem bairro identificado'}.</p><p>A contagem depende do levantamento realizado e não representa a cobertura vegetal.</p></div>
      </DialogContent>
    </Dialog>
  </aside>;
}
