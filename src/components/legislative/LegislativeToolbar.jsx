import React, { useEffect, useId, useState } from 'react';
import { CalendarDays, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { legislativeDate, LEGISLATIVE_GROUPS, LEGISLATIVE_TOPICS } from '@/lib/legislative';
import LegislativeResponsivePanel from './LegislativeResponsivePanel';
import LegislativeViewMenu from './LegislativeViewMenu';

const filterKeys = ['grupo', 'parlamentar', 'vereador', 'tipo', 'tema', 'territorio', 'local', 'cadastro'];

export default function LegislativeToolbar({ params, update, data, filters, simple = false, territory = false, directory = false, presentation, overview = false, profile = false, periodOnly = false, hidePeriod = false }) {
  const primaryKey = territory ? 'territorio' : 'busca', hasSearch = !periodOnly && (!simple || territory);
  const [search, setSearch] = useState(territory ? filters.territory : filters.search);
  const [panel, setPanel] = useState(null), [draft, setDraft] = useState({}), [error, setError] = useState('');
  const formId = useId(), inputId = useId(), periodId = useId();
  useEffect(() => { setSearch(territory ? filters.territory : filters.search); }, [filters.search, filters.territory, territory]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const firstYear = data?.source?.first_year || 2025;
  const presets = [{ label: `Desde ${firstYear}`, start: `${firstYear}-01-01`, end: today }, { label: 'Este ano', start: `${today.slice(0, 4)}-01-01`, end: today }, { label: 'Este mês', start: `${today.slice(0, 7)}-01`, end: today }];
  const periodLabel = presets.find(item => item.start === filters.start && item.end === filters.end)?.label || `${legislativeDate(filters.start)} – ${legislativeDate(filters.end)}`;
  const linked = data?.councilors?.find(person => person.id === filters.councilorId);
  const selectedPerson = filters.parliamentarianId || linked?.parliamentarian_id || (filters.councilorId ? `profile:${filters.councilorId}` : '');
  const chips = [
    !simple && !directory && filters.group && ['grupo', LEGISLATIVE_GROUPS[filters.group]],
    !simple && !directory && selectedPerson && [params.has('parlamentar') ? 'parlamentar' : 'vereador', data?.parliamentarians?.find(person => person.id === Number(selectedPerson))?.name || linked?.name || 'Vereador selecionado'],
    !simple && !directory && filters.typeId && ['tipo', data?.types?.find(type => type.id === filters.typeId)?.data.name || 'Tipo oficial'],
    !simple && !directory && filters.topic && ['tema', LEGISLATIVE_TOPICS[filters.topic]],
    !territory && !directory && filters.territory && ['territorio', filters.territory],
    params.get('local') && ['local', 'Local selecionado'],
    directory && params.get('cadastro') === 'todos' && ['cadastro', 'Todos os cadastros'],
  ].filter(item => item && !periodOnly);
  const advanced = !periodOnly && (!simple || territory);
  const openPanel = value => {
    setError('');setDraft({ start: filters.start, end: filters.end, group: filters.group || '', person: String(selectedPerson), type: String(filters.typeId || ''), topic: filters.topic || '', territory: filters.territory, status: params.get('cadastro') || 'ativos' });setPanel(value);
  };
  const close = () => setPanel(null);
  const clear = () => { update(Object.fromEntries(filterKeys.map(key => [key, null])));close(); };
  const apply = event => {
    event.preventDefault();
    if (panel === 'period') {
      if (!draft.start || !draft.end || draft.end < draft.start) { setError('Selecione um período com a data final igual ou posterior à inicial.');return; }
      update({ inicio: draft.start, fim: draft.end });
    } else if (directory) update({ cadastro: draft.status === 'todos' ? 'todos' : null });
    else update({ grupo: draft.group, parlamentar: draft.person.startsWith('profile:') ? null : draft.person, vereador: draft.person.startsWith('profile:') ? draft.person.slice(8) : null, tipo: draft.type, tema: draft.topic, ...(!territory ? { territorio: draft.territory } : {}) });
    close();
  };
  const fields = panel === 'period' ? <>
    <div className="legislative-period-presets">{presets.map(item => <Button key={item.label} type="button" variant={draft.start === item.start && draft.end === item.end ? 'default' : 'outline'} onClick={() => { setError('');setDraft(current => ({ ...current, start: item.start, end: item.end })); }}>{item.label}</Button>)}</div>
    <div className="legislative-date-fields"><label>De<input type="date" name="inicio" required value={draft.start || ''} onChange={event => { setError('');setDraft(current => ({ ...current, start: event.target.value })); }} /></label><label>Até<input type="date" name="fim" required value={draft.end || ''} onChange={event => { setError('');setDraft(current => ({ ...current, end: event.target.value })); }} /></label></div>
  </> : directory ? <label>Situação no cadastro<select aria-label="Situação no cadastro" value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}><option value="ativos">Ativos no cadastro da Câmara</option><option value="todos">Todos os cadastros</option></select></label> : <>
    {!simple && <>
      <label>Grupo<select aria-label="Grupo de propostas" value={draft.group} onChange={event => setDraft(current => ({ ...current, group: event.target.value }))}><option value="">Todos os grupos</option>{Object.entries(LEGISLATIVE_GROUPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Vereador<select aria-label="Vereador das propostas" value={draft.person} onChange={event => setDraft(current => ({ ...current, person: event.target.value }))}><option value="">Todos os autores</option>{draft.person?.startsWith('profile:') && <option value={draft.person}>Perfil selecionado</option>}{data?.parliamentarians?.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    </>}
    {!territory && <label>Rua ou bairro<input name="territorio" maxLength={200} value={draft.territory || ''} onChange={event => setDraft(current => ({ ...current, territory: event.target.value }))} placeholder="Nome do local" /></label>}
    {!simple && <details className="legislative-advanced-fields"><summary>Tipo oficial e tema</summary><div>
      <label>Tipo oficial<select value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value }))}><option value="">Todos os tipos</option>{data?.types?.map(type => <option key={type.id} value={type.id}>{type.data.name}</option>)}</select></label>
      <label>Tema revisado<select value={draft.topic} onChange={event => setDraft(current => ({ ...current, topic: event.target.value }))}><option value="">Todos os temas</option>{Object.entries(LEGISLATIVE_TOPICS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div></details>}
  </>;
  const footer = <><Button type="button" variant="ghost" onClick={panel === 'period' ? () => { setError('');setDraft(current => ({ ...current, ...presets[0] })); } : clear}>{panel === 'period' ? 'Restaurar' : 'Limpar filtros'}</Button><Button type="submit" form={formId}>Aplicar</Button></>;
  const content = <form id={formId} className="legislative-filter-form" onSubmit={apply}>{fields}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form>;
  return <div className="legislative-toolbar-wrap">
    <div className={`legislative-toolbar ${!hasSearch ? 'legislative-toolbar-without-search' : ''}`}>
      {hasSearch && <form className="legislative-search" role="search" onSubmit={event => { event.preventDefault();update({ [primaryKey]: search.trim() }); }}>
        <label htmlFor={inputId} className="sr-only">{directory ? 'Buscar vereador' : territory ? 'Buscar rua ou bairro' : 'Buscar proposta, rua ou bairro'}</label>
        <Search size={18} aria-hidden="true" /><input id={inputId} name={primaryKey} maxLength={200} autoComplete="off" value={search} placeholder={directory ? 'Buscar vereador' : territory ? 'Rua ou bairro' : overview ? 'Buscar proposta, rua ou bairro' : 'Assunto, rua ou bairro'} onChange={event => setSearch(event.target.value)} />
        {search && <button type="button" className="legislative-icon-button" aria-label="Limpar busca" onClick={() => { setSearch('');update({ [primaryKey]: null }); }}><X size={16} /></button>}
        <button type="submit" className="legislative-search-submit" aria-label={territory ? 'Buscar rua ou bairro' : 'Buscar proposta'}><Search size={18} /></button>
      </form>}
      <div className="legislative-toolbar-controls">
        {!directory && !hidePeriod && <LegislativeResponsivePanel title={periodOnly ? 'Período de propostas e presenças' : 'Período'} open={panel === 'period'} onOpenChange={open => open ? openPanel('period') : close()} footer={footer} trigger={<Button variant="outline" className="legislative-toolbar-button legislative-period-button" aria-label="Selecionar período" aria-describedby={periodId} title={periodLabel}><CalendarDays size={17} /><span id={periodId}>{periodLabel}</span><ChevronDown size={14} /></Button>}>{panel === 'period' && content}</LegislativeResponsivePanel>}
        {advanced && !territory && <LegislativeResponsivePanel title={overview ? 'Filtros de propostas' : 'Filtros'} open={panel === 'filters'} onOpenChange={open => open ? openPanel('filters') : close()} footer={footer} trigger={<Button variant="outline" className="legislative-toolbar-button" aria-label="Abrir filtros"><SlidersHorizontal size={17} /><span>{overview ? 'Filtrar propostas' : 'Filtros'}</span>{chips.length > 0 && <span className="legislative-filter-count">{chips.length}</span>}</Button>}>{panel === 'filters' && content}</LegislativeResponsivePanel>}
        {presentation && !periodOnly && <LegislativeViewMenu presentation={presentation} summary={overview || profile} distribution={overview} />}
      </div>
    </div>
    {chips.length > 0 && <div className="legislative-filter-chips" aria-label="Filtros aplicados">{chips.map(([key, label]) => <button type="button" key={key} onClick={() => update({ [key]: null, ...(key === 'parlamentar' || key === 'vereador' ? { parlamentar: null, vereador: null } : {}) })} aria-label={`Remover filtro ${label}`}><span>{label}</span><X size={13} /></button>)}<button type="button" className="legislative-clear-filters" onClick={clear}>Limpar</button></div>}
  </div>;
}
