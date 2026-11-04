import React, { useMemo, useState } from 'react';
import { CalendarDays, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogDescription, FormDialogContent } from '@/components/ui/dialog';
import { treePlanningRows } from '@/lib/treePlanning';

export default function TreePlanningReport({ trees, cities, cityName, loading, onDownload, busy }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState('all');
  const rows = useMemo(() => treePlanningRows(trees), [trees]);
  const years = [...new Set(rows.map(row => row.year))];
  const filtered = rows.filter(row => year === 'all' || String(row.year) === year);
  const pending = filtered.reduce((sum, row) => sum + row.planned, 0);
  const planted = filtered.reduce((sum, row) => sum + row.planted, 0);
  return <>
    <Button variant="outline" disabled={loading} onClick={() => { setYear('all'); setOpen(true); }}><CalendarDays className="mr-2 h-4 w-4" />Planejamento anual</Button>
    <Dialog open={open} onOpenChange={setOpen}><FormDialogContent className="sm:!max-w-5xl overflow-y-auto">
      <DialogTitle>Planejamento anual de arborização</DialogTitle><DialogDescription>Plantios por ano previsto, bairro e rua. Considera os filtros aplicados ao inventário.</DialogDescription>
      <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1.5 text-sm font-medium">Ano previsto<select className="arborization-select min-h-11" value={year} onChange={event => setYear(event.target.value)}><option value="all">Todos os anos</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <Button disabled={!filtered.length || busy} onClick={() => onDownload(year)}><Download className="mr-2 h-4 w-4" />Exportar relatório CSV</Button></div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{pending.toLocaleString('pt-BR')}</p><p className="text-sm">Plantios previstos pendentes</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{planted.toLocaleString('pt-BR')}</p><p className="text-sm">Plantios realizados</p></div></div>
      {year !== 'all' && cityName && <p className="rounded-xl bg-surface-subtle p-4 text-sm">O planejamento cadastrado prevê o plantio de <strong>{pending.toLocaleString('pt-BR')} {pending === 1 ? 'árvore' : 'árvores'}</strong> em {year} em {cityName}. Os números refletem os registros e filtros desta consulta.</p>}
      {filtered.length ? <>
        <div className="space-y-3 sm:hidden">{filtered.map(row => <article key={row.key} className="min-w-0 rounded-xl border p-4"><p className="text-xs text-muted-foreground">{row.year} · {cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id}</p><h3 className="mt-1 break-words font-semibold">{row.street}</h3><p className="break-words text-sm text-muted-foreground">{row.neighborhood}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt>Previstos pendentes</dt><dd className="font-semibold text-blue-700 dark:text-blue-300">{row.planned}</dd></div><div><dt>Realizados</dt><dd className="font-semibold text-emerald-700 dark:text-emerald-300">{row.planted}</dd></div>{row.unconfirmed > 0 && <div className="col-span-2"><dt>Sem confirmação</dt><dd>{row.unconfirmed}</dd></div>}</dl></article>)}</div>
        <div className="hidden max-h-[45dvh] overflow-auto rounded-xl border sm:block"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface-raised"><tr>{['Ano', 'Cidade', 'Bairro', 'Rua', 'Previstos pendentes', 'Realizados', 'Sem confirmação'].map(label => <th key={label} className="p-3 font-semibold">{label}</th>)}</tr></thead><tbody>{filtered.map(row => <tr key={row.key} className="border-t"><td className="p-3">{row.year}</td><td className="p-3">{cities.find(city => String(city.id) === String(row.city_id))?.name || row.city_id}</td><td className="p-3">{row.neighborhood}</td><td className="p-3">{row.street}</td><td className="p-3">{row.planned}</td><td className="p-3">{row.planted}</td><td className="p-3">{row.unconfirmed}</td></tr>)}</tbody></table></div>
      </> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum plantio com ano previsto neste resultado. Cadastre um plantio planejado ou ajuste os filtros.</p>}
      <p className="text-xs text-muted-foreground">Cada ponto representa uma árvore. Registre a data do plantio e altere o cadastro para árvore existente para confirmar a execução. O ano previsto permanece no histórico.</p>
    </FormDialogContent></Dialog>
  </>;
}
