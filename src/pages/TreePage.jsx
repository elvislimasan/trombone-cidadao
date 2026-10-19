import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, CalendarDays, ChevronRight, Clock3, FileText, Heart, Image as ImageIcon, Info, Landmark, Leaf, Loader2, Map, MapPin, MessageSquare, Pencil, Ruler, Scissors, Sprout, Trees, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import FullscreenMapPanel from '@/components/map/FullscreenMapPanel';
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
  const [photoOpen, setPhotoOpen] = useState(false);
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
  return <main className="page-shell-fluid tree-profile-page" data-testid="tree-page">
    <Helmet><title>{tree.common_name} — Arborização</title><meta name="description" content={`Consulte o cadastro de ${tree.common_name}, sua localização e o histórico de cuidados e solicitações de serviço.`} /></Helmet>
    <nav className="tree-profile-breadcrumb" aria-label="Navegação estrutural"><Link to="/mapa-arborizacao"><ArrowLeft className="h-3.5 w-3.5" />Mapa de arborização</Link><ChevronRight className="h-3 w-3" aria-hidden="true" /><span>Inventário de arborização · {city?.name || 'Cidade'}</span></nav>
    <header className="tree-profile-header"><div className="flex min-w-0 items-start gap-4"><span className="tree-profile-title-icon"><Trees aria-hidden="true" /></span><div className="min-w-0"><h1>{tree.common_name}</h1><p className="tree-profile-subtitle">{[city?.name, tree.neighborhood].filter(Boolean).join(' · ') || 'Localização não informada'}</p>{tree.scientific_name && <p className="tree-profile-scientific">{tree.scientific_name}</p>}</div></div>{canManage && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar árvore</Button>}</header>
    {notice && <p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
    <div className="tree-profile-grid">
      <section className="tree-profile-card tree-profile-overview" aria-label="Dados da árvore">
        <figure className="tree-profile-photo">{tree.photo_url ? <><img src={tree.photo_url} alt={`Foto de ${tree.common_name}`} /><Button type="button" variant="secondary" onClick={() => setPhotoOpen(true)}><ImageIcon className="h-4 w-4" />Ver imagem completa</Button></> : <div className="tree-profile-photo-empty"><Trees className="h-12 w-12" aria-hidden="true" /><span>Foto ainda não cadastrada</span></div>}</figure>
        <h2 className="tree-profile-section-title"><Leaf aria-hidden="true" />Sobre esta árvore</h2>
        <dl className="tree-profile-facts">{[
          ['Cadastro na plataforma', CalendarDays, dateLabel(tree.created_at)], ['Situação', Heart, TREE_STATUS[tree.status]?.label],
          ['Bairro', MapPin, tree.neighborhood || 'Não identificado'], ['Endereço', Map, tree.address || 'Não informado'],
          ['Origem', Leaf, TREE_ORIGINS[tree.origin]], ['Data do plantio', CalendarDays, dateLabel(tree.planted_at)],
          ['Responsável pelo plantio', User, TREE_PLANTED_BY[tree.planted_by] || 'Não informado'], ['Idade estimada', Sprout, age == null ? 'Não informada' : `${age} anos${age >= 100 ? ' · Centenária' : ''}`],
          ['Sítio histórico', Landmark, tree.is_historic_site ? 'Sim' : 'Não'], ['Altura / copa', Ruler, `${tree.height_m ?? '—'} m / ${tree.crown_diameter_m ?? '—'} m`],
          ['Manejo necessário', Trees, TREE_ACTIONS[tree.maintenance_action]], ['Prazo do manejo', Clock3, dateLabel(tree.maintenance_due_at)],
        ].map(([label, Icon, value]) => <div key={label} className="tree-profile-fact"><span className="tree-profile-fact-icon"><Icon aria-hidden="true" /></span><div className="min-w-0"><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
        {tree.notes && <p className="whitespace-pre-wrap break-words text-sm">{tree.notes}</p>}
        <section className="tree-profile-location" aria-labelledby="tree-location-title"><h3 id="tree-location-title" className="tree-profile-section-title"><MapPin aria-hidden="true" />Localização da árvore</h3><div className="tree-profile-location-map" data-testid="tree-profile-map"><FullscreenMapPanel title="Localização da árvore" buttonLabel="Ver no mapa maior" buttonClassName="left-3 top-3"><TreeMap trees={[tree]} /></FullscreenMapPanel></div></section>
      </section>
      <section className="tree-profile-card tree-profile-history" aria-label="Linha do tempo da árvore">
        <h2 className="tree-profile-section-title"><Clock3 aria-hidden="true" />Linha do tempo</h2><p className="tree-profile-description">Cuidados registrados pela equipe municipal e dados das broncas vinculadas. Solicitações e conclusões informadas aparecem com sua origem.</p>
        {historyError ? <div role="alert" className="space-y-2"><p>{historyError}</p>{retry}</div> : !history ? <p role="status">Carregando histórico…</p> : <>
          <ol className="tree-profile-timeline">{timeline.map(entry => {
            const Icon = entry.id === 'registration' ? FileText : entry.reportId ? MessageSquare : Scissors;
            return <li key={entry.id}><div className="tree-profile-event"><span className="tree-profile-event-icon"><Icon aria-hidden="true" /></span><div className="min-w-0"><time dateTime={entry.date}>{dateLabel(entry.date)}</time><h3>{entry.title}</h3><span className="tree-profile-event-source">{entry.source}</span>{entry.description && <p>{entry.description}</p>}{entry.reportId && <Link to={`/bronca/${entry.reportId}`}>Ver bronca vinculada<ChevronRight className="h-3 w-3" /></Link>}</div></div></li>;
          })}</ol>
          {!history.care.length && <p className="tree-profile-empty-history">Nenhum serviço registrado pela equipe municipal até o momento.</p>}
          <p className="tree-profile-history-summary"><Info className="h-4 w-4" aria-hidden="true" />{history.reports.length} solicitações vinculadas · {history.care.length} serviços registrados pela equipe</p>
        </>}
        {canManage && <form onSubmit={recordCare} className="tree-profile-care-form"><h3 className="tree-profile-section-title"><Scissors aria-hidden="true" />Registrar serviço realizado</h3><p className="tree-profile-description">Registre aqui os cuidados realizados por sua equipe. O evento será adicionado à linha do tempo.</p><fieldset disabled={saving} className="tree-profile-care-fields"><label>Serviço<select className={selectClass} value={care.service_type} onChange={event => setCare(current => ({ ...current, service_type: event.target.value }))}>{Object.entries(TREE_SERVICES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Data de realização<Input required type="date" max={new Date().toLocaleDateString('en-CA')} value={care.performed_on} onChange={event => setCare(current => ({ ...current, performed_on: event.target.value }))} /></label><label className="tree-profile-care-notes">Observações públicas<textarea className={selectClass} placeholder="Descreva o serviço realizado, observações e demais informações…" maxLength={5000} value={care.notes} onChange={event => setCare(current => ({ ...current, notes: event.target.value }))} /><span className="tree-profile-character-count">{care.notes.length}/5000</span></label><Button type="submit" disabled={saving}><FileText className="h-4 w-4" />{saving ? 'Registrando…' : 'Registrar no histórico'}</Button></fieldset></form>}
      </section>
    </div>
    {tree.photo_url && <Dialog open={photoOpen} onOpenChange={setPhotoOpen}><DialogContent className="tree-profile-photo-dialog" aria-describedby={undefined}><DialogTitle>Foto de {tree.common_name}</DialogTitle><img src={tree.photo_url} alt={`Foto completa de ${tree.common_name}`} /></DialogContent></Dialog>}
    {editing && canManage && <TreeFormDialog tree={tree} city={city} cityId={tree.city_id} onClose={() => setEditing(false)} onSave={saveTree} />}
  </main>;
}

export default function TreePage() { const { id } = useParams(); return <TreeContent key={id} id={id} />; }
