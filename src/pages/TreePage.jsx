import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Loader2, Pencil, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import TreeMap from '@/components/arborization/TreeMap';
import { useCanManagePavement } from '@/hooks/useCanManagePavement';
import { supabase } from '@/lib/customSupabaseClient';
import { TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, TREE_PLANTED_BY, TREE_SERVICES } from '@/lib/arborization';
import { loadTreeHistory, treeTimeline, uploadTreePhoto } from '@/lib/treeInventory';

const dateLabel = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR') : 'Não informada';
const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';

function TreeContent({ id }) {
  const [tree, setTree] = useState(null), [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [history, setHistory] = useState(null), [historyError, setHistoryError] = useState('');
  const [revision, setRevision] = useState(0), [editing, setEditing] = useState(false);
  const [care, setCare] = useState({ service_type: 'poda', performed_on: '', notes: '' });
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const { canManage } = useCanManagePavement(tree?.city_id);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    supabase.from('city_trees').select('*').eq('id', id).maybeSingle().then(async ({ data, error: fetchError }) => {
      if (fetchError) throw fetchError;
      if (!cancelled) setTree(data);
      if (data) {
        const result = await supabase.from('cities').select('id,name').eq('id', data.city_id).maybeSingle();
        if (!cancelled && !result.error) setCity(result.data);
      }
    }).catch(() => { if (!cancelled) setError('Não foi possível carregar a árvore.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, revision]);
  useEffect(() => {
    let cancelled = false;
    setHistory(null); setHistoryError('');
    loadTreeHistory(supabase, id).then(data => { if (!cancelled) setHistory(data); })
      .catch(() => { if (!cancelled) setHistoryError('Não foi possível carregar o histórico de cuidados e solicitações.'); });
    return () => { cancelled = true; };
  }, [id, revision]);
  const saveTree = async (payload, treeId, photo) => {
    if (!canManage || treeId !== id) throw new Error('Sem permissão para editar esta árvore.');
    const uploaded = await uploadTreePhoto(supabase, photo, tree.city_id);
    const { error: saveError } = await supabase.from('city_trees').update({ ...payload, ...(uploaded ? { photo_url: uploaded.url } : {}) }).eq('id', id).eq('city_id', tree.city_id).select('id').single();
    if (saveError) { if (uploaded) await supabase.storage.from('tree-photos').remove([uploaded.path]); throw new Error('Não foi possível salvar a árvore.'); }
    setRevision(value => value + 1); setNotice('Árvore atualizada.');
  };
  const recordCare = async event => {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true); setNotice('');
    try {
      const { error: saveError } = await supabase.from('city_tree_care').insert({ tree_id: id, ...care, notes: care.notes.trim() || null });
      if (saveError) throw saveError;
      setCare({ service_type: 'poda', performed_on: '', notes: '' }); setRevision(value => value + 1); setNotice('Serviço registrado no histórico.');
    } catch { setNotice('Não foi possível registrar o serviço. Verifique a data e sua permissão na cidade.'); }
    finally { setSaving(false); }
  };
  const retry = <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button>;
  if (loading) return <main className="page-shell-fluid flex min-h-64 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Carregando árvore…</main>;
  if (error || !tree) return <main className="page-shell-fluid space-y-4 py-8"><p role="alert">{error || 'Árvore não encontrada.'}</p>{error && retry}<Link className="block underline" to="/mapa-arborizacao">Voltar ao mapa de arborização</Link></main>;
  const timeline = history ? treeTimeline(tree, history.care, history.reports, history.updates) : [];
  const age = tree.estimated_birth_year ? new Date().getFullYear() - tree.estimated_birth_year : null;
  return <main className="page-shell-fluid min-w-0 space-y-5 py-6" data-testid="tree-page">
    <Helmet><title>{tree.common_name} — Arborização</title><meta name="description" content={`Consulte o cadastro de ${tree.common_name}, sua localização e o histórico de cuidados e solicitações de serviço.`} /></Helmet>
    <Link to="/mapa-arborizacao" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Mapa de arborização</Link>
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-muted-foreground">Inventário de arborização · {city?.name || 'Cidade'}</p><h1 className="mt-1 flex items-center gap-2 break-words text-3xl font-bold"><Trees className="h-7 w-7 shrink-0 text-emerald-700" />{tree.common_name}</h1>{tree.scientific_name && <p className="mt-1 italic text-muted-foreground">{tree.scientific_name}</p>}</div>{canManage && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Editar árvore</Button>}</header>
    {notice && <p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="min-w-0 space-y-4 rounded-2xl border bg-surface-raised p-4 sm:p-6" aria-label="Dados da árvore">
        {tree.photo_url && <img src={tree.photo_url} alt={`Foto de ${tree.common_name}`} className="max-h-96 w-full rounded-xl object-cover" />}
        <h2 className="text-lg font-semibold">Sobre esta árvore</h2>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">{[
          ['Cadastro na plataforma', dateLabel(tree.created_at)], ['Situação', TREE_STATUS[tree.status]?.label],
          ['Bairro', tree.neighborhood || 'Não identificado'], ['Endereço', tree.address || 'Não informado'],
          ['Origem', TREE_ORIGINS[tree.origin]], ['Data do plantio', dateLabel(tree.planted_at)],
          ['Responsável pelo plantio', TREE_PLANTED_BY[tree.planted_by] || 'Não informado'], ['Idade estimada', age == null ? 'Não informada' : `${age} anos${age >= 100 ? ' · Centenária' : ''}`],
          ['Sítio histórico', tree.is_historic_site ? 'Sim' : 'Não'], ['Altura / copa', `${tree.height_m ?? '—'} m / ${tree.crown_diameter_m ?? '—'} m`],
          ['Manejo necessário', TREE_ACTIONS[tree.maintenance_action]], ['Prazo do manejo', dateLabel(tree.maintenance_due_at)],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl>
        {tree.notes && <p className="whitespace-pre-wrap break-words text-sm">{tree.notes}</p>}
        <div className="relative isolate h-64 overflow-hidden rounded-xl border"><TreeMap trees={[tree]} selected={null} position={{ latitude: tree.latitude, longitude: tree.longitude }} /></div>
      </section>
      <section className="min-w-0 space-y-4 rounded-2xl border bg-surface-raised p-4 sm:p-6" aria-label="Linha do tempo da árvore">
        <h2 className="text-lg font-semibold">Linha do tempo</h2><p className="text-sm text-muted-foreground">Cuidados registrados pela equipe municipal e dados das broncas vinculadas. Solicitações e conclusões informadas aparecem com sua origem.</p>
        {historyError ? <div role="alert" className="space-y-2"><p>{historyError}</p>{retry}</div> : !history ? <p role="status">Carregando histórico…</p> : <><p className="text-sm font-medium">{history.reports.length} solicitações vinculadas · {history.care.length} serviços registrados pela equipe</p><ol className="space-y-4 border-l-2 border-emerald-700/30 pl-4">{timeline.map(entry => <li key={entry.id} className="min-w-0 space-y-1"><time className="text-xs text-muted-foreground" dateTime={entry.date}>{dateLabel(entry.date)}</time><h3 className="font-semibold">{entry.title}</h3><p className="text-xs text-emerald-700 dark:text-emerald-400">{entry.source}</p>{entry.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.description}</p>}{entry.reportId && <Link to={`/bronca/${entry.reportId}`} className="inline-block text-sm underline">Ver bronca vinculada</Link>}</li>)}</ol>{!history.care.length && <p className="text-sm text-muted-foreground">Nenhum serviço registrado pela equipe municipal até o momento.</p>}</>}
        {canManage && <form onSubmit={recordCare} className="space-y-3 border-t pt-4"><h3 className="font-semibold">Registrar serviço realizado</h3><fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm">Serviço<select className={selectClass} value={care.service_type} onChange={event => setCare(current => ({ ...current, service_type: event.target.value }))}>{Object.entries(TREE_SERVICES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm">Data de realização<Input required type="date" max={new Date().toLocaleDateString('en-CA')} value={care.performed_on} onChange={event => setCare(current => ({ ...current, performed_on: event.target.value }))} /></label><label className="grid gap-1 text-sm sm:col-span-2">Observações públicas<textarea className={`${selectClass} h-24 py-2`} maxLength={5000} value={care.notes} onChange={event => setCare(current => ({ ...current, notes: event.target.value }))} /></label><Button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar no histórico'}</Button></fieldset></form>}
      </section>
    </div>
    {editing && canManage && <TreeFormDialog tree={tree} city={city} cityId={tree.city_id} onClose={() => setEditing(false)} onSave={saveTree} />}
  </main>;
}

export default function TreePage() { const { id } = useParams(); return <TreeContent key={id} id={id} />; }
