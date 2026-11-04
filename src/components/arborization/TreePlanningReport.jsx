import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogDescription, FormDialogContent } from '@/components/ui/dialog';
import { treePlanningRows, treeStreetKey, treeStreetName } from '@/lib/treePlanning';
import { filterTrees, TREE_PLANTED_BY } from '@/lib/arborization';

export default function TreePlanningReport({ trees, cities, cityName, loading, onDownload, busy, initialFilters = {}, open: controlledOpen, onOpenChange, hideTrigger = false }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = value => { if (controlledOpen === undefined) setInternalOpen(value); onOpenChange?.(value); };
  const [year, setYear] = useState('all');
  const [neighborhood, setNeighborhood] = useState('all');
  const [street, setStreet] = useState('all');
  const [plantedBy, setPlantedBy] = useState('all');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const { planningYear = '', neighborhood: initialNeighborhood = 'all', street: initialStreet = 'all', plantedBy: initialPlantedBy = 'all' } = initialFilters;
  useEffect(() => { if (open) { setYear(planningYear || 'all'); setNeighborhood(initialNeighborhood); setStreet(initialStreet); setPlantedBy(initialPlantedBy); setPdfError(''); } }, [open, planningYear, initialNeighborhood, initialStreet, initialPlantedBy]);
  const allRows = useMemo(() => treePlanningRows(trees), [trees]);
  const scopedTrees = useMemo(() => filterTrees(trees, { planningYear: year === 'all' ? '' : year, neighborhood, street, plantedBy }), [trees, year, neighborhood, street, plantedBy]);
  const rows = useMemo(() => treePlanningRows(scopedTrees), [scopedTrees]);
  const years = [...new Set(allRows.map(row => row.year))];
  const neighborhoods = [...new Set(allRows.map(row => row.neighborhood))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const streets = [...new Map(trees.filter(tree => tree.planting_year && (neighborhood === 'all' || (neighborhood === 'unidentified' ? !tree.neighborhood : tree.neighborhood === neighborhood)) && treeStreetName(tree)).map(tree => [treeStreetKey(tree), treeStreetName(tree)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const filtered = rows.filter(row => year === 'all' || String(row.year) === year);
  const pending = filtered.reduce((sum, row) => sum + row.planned, 0);
  const planted = filtered.reduce((sum, row) => sum + row.planted, 0);
  const total = filtered.reduce((sum, row) => sum + row.total, 0);
  const unconfirmed = filtered.reduce((sum, row) => sum + row.unconfirmed, 0);
  const exportPdf = async () => {
    setPdfBusy(true); setPdfError('');
    try {
      const { downloadTreePlanningPdf } = await import('@/lib/treePlanningPdf');
      const scope = [`Ano: ${year === 'all' ? 'todos' : year}`, `Bairro: ${neighborhood === 'all' ? 'todos' : neighborhood}`, `Rua: ${street === 'all' ? 'todas' : streets.find(([key]) => key === street)?.[1] || 'selecionada'}`, `Responsável: ${plantedBy === 'all' ? 'todos' : TREE_PLANTED_BY[plantedBy]}`].join(' | ');
      await downloadTreePlanningPdf({ trees: scopedTrees, cities, cityName, scope });
    } catch (error) { setPdfError(error.message || 'Não foi possível gerar o PDF. Tente novamente.'); }
    finally { setPdfBusy(false); }
  };
  return <>
    {!hideTrigger && <Button variant="outline" disabled={loading} onClick={() => setOpen(true)}><CalendarDays className="mr-2 h-4 w-4" />Planejamento anual</Button>}
    <Dialog open={open} onOpenChange={setOpen}><FormDialogContent className="tree-planning-report sm:!max-w-5xl overflow-y-auto">
      <DialogTitle>Planejamento anual de arborização</DialogTitle><DialogDescription>Planejamento completo por ano previsto, bairro e rua, incluindo os plantios já realizados.</DialogDescription>
      <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1.5 text-sm font-medium">Ano previsto<select className="arborization-select min-h-11" value={year} onChange={event => setYear(event.target.value)}><option value="all">Todos os anos</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!filtered.length || busy || pdfBusy} onClick={() => onDownload(year, scopedTrees)}><Download className="mr-2 h-4 w-4" />Exportar relatório CSV</Button><Button className="arborization-report-export" disabled={!filtered.length || busy || pdfBusy} onClick={exportPdf}><FileText className="mr-2 h-4 w-4" />{pdfBusy ? 'Gerando PDF…' : 'Exportar PDF'}</Button></div></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1.5 text-sm">Bairro do relatório<select className="arborization-select min-h-11" value={neighborhood} onChange={event => { setNeighborhood(event.target.value); setStreet('all'); }}><option value="all">Todos os bairros</option>{neighborhoods.map(name => <option key={name} value={name === 'Sem bairro identificado' ? 'unidentified' : name}>{name}</option>)}</select></label><label className="grid gap-1.5 text-sm">Rua do relatório<select className="arborization-select min-h-11" value={street} onChange={event => setStreet(event.target.value)}><option value="all">Todas as ruas</option><option value="unidentified">Sem rua identificada</option>{streets.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="grid gap-1.5 text-sm">Responsável pelo plantio<select className="arborization-select min-h-11" value={plantedBy} onChange={event => setPlantedBy(event.target.value)}><option value="all">Todos</option>{Object.entries(TREE_PLANTED_BY).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
      {pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}
      <div className="grid grid-cols-3 gap-3"><div className="rounded-xl border p-4"><p className="text-2xl font-bold">{total.toLocaleString('pt-BR')}</p><p className="text-sm">Total previsto</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{pending.toLocaleString('pt-BR')}</p><p className="text-sm">Pendentes</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{planted.toLocaleString('pt-BR')}</p><p className="text-sm">Realizados do plano</p></div></div>
      {unconfirmed > 0 && <p className="text-sm text-muted-foreground">{unconfirmed} {unconfirmed === 1 ? 'registro sem confirmação de plantio' : 'registros sem confirmação de plantio'}, incluindo árvores retiradas sem execução confirmada.</p>}
      {year !== 'all' && cityName && <p className="rounded-xl bg-surface-subtle p-4 text-sm">O planejamento cadastrado prevê <strong>{total.toLocaleString('pt-BR')} {total === 1 ? 'árvore' : 'árvores'}</strong> para {year} em {cityName}, conforme os filtros deste relatório. Dessas, {pending.toLocaleString('pt-BR')} aguardam plantio e {planted.toLocaleString('pt-BR')} têm execução confirmada.</p>}
      {filtered.length ? <>
        <div className="space-y-3 sm:hidden">{filtered.map(row => <article key={row.key} className="min-w-0 rounded-xl border p-4"><p className="text-xs text-muted-foreground">{row.year} · {cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id}</p><h3 className="mt-1 break-words font-semibold">{row.street}</h3><p className="break-words text-sm text-muted-foreground">{row.neighborhood}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt>Previstos pendentes</dt><dd className="font-semibold text-blue-700 dark:text-blue-300">{row.planned}</dd></div><div><dt>Realizados</dt><dd className="font-semibold text-emerald-700 dark:text-emerald-300">{row.planted}</dd></div>{row.unconfirmed > 0 && <div className="col-span-2"><dt>Sem confirmação</dt><dd>{row.unconfirmed}</dd></div>}</dl></article>)}</div>
        <div className="hidden max-h-[45dvh] overflow-auto rounded-xl border sm:block"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface-raised"><tr>{['Ano', 'Cidade', 'Bairro', 'Rua', 'Previstos pendentes', 'Realizados', 'Sem confirmação'].map(label => <th key={label} className="p-3 font-semibold">{label}</th>)}</tr></thead><tbody>{filtered.map(row => <tr key={row.key} className="border-t"><td className="p-3">{row.year}</td><td className="p-3">{cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id}</td><td className="p-3">{row.neighborhood}</td><td className="p-3">{row.street}</td><td className="p-3">{row.planned}</td><td className="p-3">{row.planted}</td><td className="p-3">{row.unconfirmed}</td></tr>)}</tbody></table></div>
      </> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum plantio com ano previsto neste resultado. Cadastre um plantio planejado ou ajuste os filtros.</p>}
      <p className="text-xs text-muted-foreground">Cada ponto representa uma árvore. Registre a data do plantio e altere o cadastro para árvore existente para confirmar a execução. O ano previsto permanece no histórico.</p>
    </FormDialogContent></Dialog>
  </>;
}
