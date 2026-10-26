import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, CalendarDays, ChevronDown, ChevronRight, Clock3, FileText, Heart, Home, Image as ImageIcon, Info, Landmark, Leaf, Loader2, Map, MapPin, MessageSquare, MoreHorizontal, Pencil, QrCode, Ruler, Scissors, Sprout, Trees, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, FormDialogContent } from '@/components/ui/dialog';
import FullscreenMapPanel from '@/components/map/FullscreenMapPanel';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import TreeMap from '@/components/arborization/TreeMap';
import TreePhoto from '@/components/arborization/TreePhoto';
import { useCanManageArborization } from '@/hooks/useCanManageArborization';
import { supabase } from '@/lib/customSupabaseClient';
import { TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, TREE_PLANTED_BY, TREE_SERVICES, treeLabel } from '@/lib/arborization';
import { loadTreeHistory, treeTimeline, uploadTreePhoto } from '@/lib/treeInventory';
import { SIDEWALK_SUITABILITY, withTreeSpecies } from '@/lib/treeSpecies';
import { useIsMobile } from '@/hooks/useIsMobile';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const dateLabel = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR') : 'Não informada';
const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';

function TreeContent({ id }) {
  const mobile = useIsMobile();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [tree, setTree] = useState(null), [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [history, setHistory] = useState(null), [historyError, setHistoryError] = useState('');
  const [revision, setRevision] = useState(0), [editing, setEditing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false), [careError, setCareError] = useState('');
  const [care, setCare] = useState({ service_type: '', performed_on: '', notes: '' });
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const [downloadingQr, setDownloadingQr] = useState(false);
  const mapTrees = useMemo(() => tree ? [{ ...tree, service_requests: history?.reports.length ?? null }] : [], [tree, history?.reports.length]);
  const { canManage } = useCanManageArborization(tree?.city_id);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    supabase.from('city_trees').select('*').eq('id', id).maybeSingle().then(async ({ data, error: fetchError }) => {
      if (fetchError) throw fetchError;
      if (!cancelled) setTree(data);
      if (data) {
        const [result, species] = await Promise.allSettled([
          supabase.from('cities').select('id,name').eq('id', data.city_id).maybeSingle(),
          data.species_id ? supabase.from('city_tree_species').select('*').eq('id', data.species_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!cancelled && result.status === 'fulfilled' && !result.value.error) setCity(result.value.data);
        if (!cancelled && species.status === 'fulfilled' && !species.value.error) setTree(withTreeSpecies(data, species.value.data));
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
    setSaving(true); setNotice(''); setCareError('');
    try {
      const { error: saveError } = await supabase.from('city_tree_care').insert({ tree_id: id, ...care, notes: care.notes.trim() || null });
      if (saveError) throw saveError;
      setCare({ service_type: '', performed_on: '', notes: '' }); setCareOpen(false); setHistoryExpanded(true); setRevision(value => value + 1); setNotice('Serviço registrado no histórico.');
    } catch { setCareError('Não foi possível registrar o serviço. Verifique a data e sua permissão na cidade.'); }
    finally { setSaving(false); }
  };
  const retry = <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button>;
  const downloadQr = async () => {
    if (downloadingQr) return;
    setDownloadingQr(true); setNotice('');
    try { const { downloadTreeQrCode } = await import('@/lib/treeQrCode'); await downloadTreeQrCode(tree, city?.name); }
    catch { setNotice('Não foi possível baixar o QR Code. Tente novamente.'); }
    finally { setDownloadingQr(false); }
  };
  if (loading) return <main className="page-shell-fluid flex min-h-64 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Carregando árvore…</main>;
  if (error || !tree) return <main className="page-shell-fluid space-y-4 py-8"><p role="alert">{error || 'Árvore não encontrada.'}</p>{error && retry}<Link className="block underline" to="/mapa-arborizacao">Voltar ao mapa de arborização</Link></main>;
  const timeline = history ? treeTimeline(tree, history.care, history.reports, history.updates) : [];
  const age = tree.estimated_birth_year ? new Date().getFullYear() - tree.estimated_birth_year : null;
  return <main className="page-shell-fluid tree-profile-page" data-testid="tree-page">
    <Helmet><title>{treeLabel(tree)} — Arborização</title><meta name="description" content={`Consulte o cadastro de ${treeLabel(tree)}, sua localização e o histórico de cuidados e solicitações de serviço.`} /></Helmet>
    <nav className="tree-profile-breadcrumb" aria-label="Navegação estrutural"><Link to="/" aria-label="Início"><Home className="h-3.5 w-3.5" /></Link><ChevronRight aria-hidden="true" /><Link to="/mapa-arborizacao">Mapa de arborização</Link><ChevronRight aria-hidden="true" /><span>Inventário de arborização</span><ChevronRight aria-hidden="true" /><span>{city?.name || 'Cidade'}</span><ChevronRight aria-hidden="true" /><span aria-current="page">{treeLabel(tree)}</span></nav>
    {mobile && <div className="tree-profile-mobile-topbar"><Link to="/mapa-arborizacao"><ArrowLeft className="h-4 w-4" />Mapa de arborização</Link><DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Mais opções da árvore" disabled={downloadingQr}>{downloadingQr ? <Loader2 className="h-5 w-5 animate-spin" /> : <MoreHorizontal className="h-5 w-5" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={downloadingQr} onSelect={downloadQr}><QrCode className="mr-2 h-4 w-4" />Baixar QR Code para impressão</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}
    <header className="tree-profile-header">
      <div className="tree-profile-heading"><div className="tree-profile-identity"><span className="tree-profile-title-icon"><Trees aria-hidden="true" /></span><div className="min-w-0"><h1>{treeLabel(tree)}</h1><p className="tree-profile-subtitle">{[city?.name, tree.neighborhood].filter(Boolean).join(' · ') || 'Localização não informada'}</p>{tree.scientific_name && <p className="tree-profile-scientific">{tree.scientific_name}</p>}</div></div><div className="tree-profile-badges" aria-label="Características da árvore"><span className={`tree-profile-badge tree-profile-badge--${tree.status}`}><Heart aria-hidden="true" />{TREE_STATUS[tree.status]?.label || 'Situação não informada'}</span>{TREE_ORIGINS[tree.origin] && <span className="tree-profile-badge"><Leaf aria-hidden="true" />{TREE_ORIGINS[tree.origin]}</span>}{TREE_ACTIONS[tree.maintenance_action] && (!mobile || tree.maintenance_action !== 'nenhuma') && <span className="tree-profile-badge"><Trees aria-hidden="true" />{TREE_ACTIONS[tree.maintenance_action]}</span>}</div></div>
      {canManage && <div className="tree-profile-header-actions">
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar árvore</Button>
        <Dialog open={careOpen} onOpenChange={open => { if (!saving) { setCareOpen(open); setCareError(''); } }}>
          <DialogTrigger asChild><Button variant="outline" className="tree-profile-service-action"><Scissors className="h-4 w-4" />Registrar serviço</Button></DialogTrigger>
          <FormDialogContent className="tree-profile-care-dialog sm:max-w-2xl">
            <form onSubmit={recordCare} className="tree-profile-care-form" aria-label="Registrar serviço realizado">
              <DialogTitle className="tree-profile-section-title"><Scissors aria-hidden="true" />Registrar serviço realizado</DialogTitle>
              <DialogDescription className="tree-profile-description">Registre aqui os cuidados realizados por sua equipe. O evento será adicionado à linha do tempo.</DialogDescription>
              {careError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{careError}</p>}
              <fieldset disabled={saving} className="tree-profile-care-fields">
                <label>Serviço<select required className={selectClass} value={care.service_type} onChange={event => setCare(current => ({ ...current, service_type: event.target.value }))}><option value="" disabled>Selecione o serviço realizado</option>{Object.entries(TREE_SERVICES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Data de realização<Input required type="date" max={new Date().toLocaleDateString('en-CA')} value={care.performed_on} onChange={event => setCare(current => ({ ...current, performed_on: event.target.value }))} /></label>
                <label className="tree-profile-care-notes">Observações públicas<textarea className={selectClass} placeholder="Descreva o serviço realizado, observações e demais informações…" maxLength={5000} value={care.notes} onChange={event => setCare(current => ({ ...current, notes: event.target.value }))} /><span className="tree-profile-character-count">{care.notes.length}/5000</span></label>
                <Button type="submit" className="tree-profile-save-care" disabled={saving}><FileText className="h-4 w-4" />{saving ? 'Registrando…' : 'Registrar no histórico'}</Button>
              </fieldset>
            </form>
          </FormDialogContent>
        </Dialog>
      </div>}
    </header>
    {notice && <p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
    <div className="tree-profile-qr-action mb-4 flex flex-wrap gap-2"><Button variant="outline" disabled={downloadingQr} onClick={downloadQr}>{downloadingQr ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}Baixar QR Code para impressão</Button></div>
    <div className="tree-profile-grid">
      <div className="tree-profile-column">
      <section className="tree-profile-card tree-profile-overview" aria-label="Dados da árvore">
        <TreePhoto tree={tree} className="tree-profile-photo" captionClassName="tree-profile-photo-caption" fallback={<figure className="tree-profile-photo tree-profile-photo-placeholder"><div className="tree-profile-photo-empty"><Trees className="h-12 w-12" aria-hidden="true" /><span>Foto ainda não cadastrada</span>{mobile && canManage && <Button type="button" variant="outline" size="sm" onClick={() => setEditing('photo')}>Adicionar foto</Button>}</div></figure>}>{photo => <Button type="button" variant="secondary" onClick={() => setPhotoOpen(photo)}><ImageIcon className="h-4 w-4" />Ver imagem completa</Button>}</TreePhoto>
        <div className="tree-profile-summary-heading"><h2 className="tree-profile-section-title"><Leaf aria-hidden="true" />Resumo da árvore</h2><p className="tree-profile-description">Informações gerais e características registradas no inventário.</p></div>
        {mobile && <dl className="tree-profile-mobile-highlights">{[['Bairro', MapPin, tree.neighborhood || 'Não identificado'], ['Altura / copa', Ruler, `${tree.height_m ?? '—'} m / ${tree.crown_diameter_m ?? '—'} m`], ['Manejo', Scissors, TREE_ACTIONS[tree.maintenance_action]], ['Prazo', Clock3, dateLabel(tree.maintenance_due_at)]].map(([label, Icon, value]) => <div key={label}><Icon className="h-4 w-4" /><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        <details open className="tree-profile-all-data"><summary className="tree-profile-all-data-toggle">Todos os dados do cadastro<ChevronDown className="h-4 w-4" /></summary>
        <dl className="tree-profile-facts">{[
          ['Cadastro na plataforma', CalendarDays, dateLabel(tree.created_at)], ['Situação', Heart, TREE_STATUS[tree.status]?.label],
          ['Bairro', MapPin, tree.neighborhood || 'Não identificado'], ['Endereço', Map, tree.address || 'Não informado'],
          ['Origem', Leaf, TREE_ORIGINS[tree.origin]], ['Data do plantio', CalendarDays, dateLabel(tree.planted_at)],
          ['Responsável pelo plantio', User, TREE_PLANTED_BY[tree.planted_by] || 'Não informado'], ['Idade estimada', Sprout, age == null ? 'Não informada' : `${age} anos${age >= 100 ? ' · Centenária' : ''}`],
          ['Sítio histórico', Landmark, tree.is_historic_site ? 'Sim' : 'Não'], ['Altura / copa', Ruler, `${tree.height_m ?? '—'} m / ${tree.crown_diameter_m ?? '—'} m`],
          ['Manejo necessário', Trees, TREE_ACTIONS[tree.maintenance_action]], ['Prazo do manejo', Clock3, dateLabel(tree.maintenance_due_at)],
        ].map(([label, Icon, value]) => <div key={label} className="tree-profile-fact"><span className="tree-profile-fact-icon"><Icon aria-hidden="true" /></span><div className="min-w-0"><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
        </details>
        {tree.notes && <p className="whitespace-pre-wrap break-words text-sm">{tree.notes}</p>}
        {(tree.species_summary || tree.species_aliases?.length > 0 || tree.planting_guidance || (tree.sidewalk_suitability !== 'nao_avaliada' && tree.sidewalk_suitability)) && <div className="space-y-3 border-t pt-4">
          <h2 className="tree-profile-section-title"><Leaf aria-hidden="true" />Sobre a espécie</h2>
          {!!tree.species_aliases?.length && <p className="break-words text-sm"><strong>Outros nomes:</strong> {tree.species_aliases.join(', ')}</p>}
          {tree.species_summary && <p className="whitespace-pre-wrap break-words text-sm">{tree.species_summary}</p>}
          <p className="text-sm"><strong>Plantio em calçada:</strong> {SIDEWALK_SUITABILITY[tree.sidewalk_suitability] || 'Não avaliada'}</p>
          {tree.planting_guidance && <p className="whitespace-pre-wrap break-words text-sm">{tree.planting_guidance}</p>}
        </div>}
      </section>
      </div>
      <div className="tree-profile-column">
      <section className="tree-profile-card tree-profile-location" aria-labelledby="tree-location-title"><div className="tree-profile-location-map" data-testid="tree-profile-map"><FullscreenMapPanel title="Localização da árvore" buttonLabel="Ver no mapa maior" buttonClassName="tree-profile-map-expand" header={<div className="min-w-0"><h2 id="tree-location-title" className="tree-profile-section-title"><MapPin aria-hidden="true" />Localização da árvore</h2><p className="tree-profile-description">Veja no mapa a localização desta árvore{tree.neighborhood ? ` no bairro ${tree.neighborhood}` : ''}.</p></div>}><TreeMap trees={mapTrees} /></FullscreenMapPanel></div>{mobile && <div className="tree-profile-map-address"><MapPin className="h-4 w-4 shrink-0" /><div><p>{tree.address || 'Endereço não informado'}</p><p>{tree.neighborhood || 'Bairro não identificado'} · {city?.name}</p></div></div>}</section>
      <section className="tree-profile-card tree-profile-history" aria-label="Linha do tempo da árvore">
        <details className="tree-profile-history-disclosure" open={!mobile || historyExpanded} onToggle={event => { if (mobile) setHistoryExpanded(event.currentTarget.open); }}>
          <summary className="tree-profile-history-toggle"><Clock3 className="h-5 w-5" /><span><strong>Histórico e cuidados</strong><span>{history ? `${history.care.length} serviços · ${history.reports.length} solicitações` : 'Registros desta árvore'}</span></span><ChevronDown className="h-4 w-4" /></summary>
        <h2 className="tree-profile-section-title"><Clock3 aria-hidden="true" />Linha do tempo</h2><p className="tree-profile-description">Histórico de registros, serviços realizados e eventos relacionados a esta árvore.</p>
        {historyError ? <div role="alert" className="space-y-2"><p>{historyError}</p>{retry}</div> : !history ? <p role="status">Carregando histórico…</p> : <>
          <ol className="tree-profile-timeline">{timeline.map(entry => {
            const Icon = entry.id === 'registration' ? FileText : entry.reportId ? MessageSquare : Scissors;
            return <li key={entry.id}><div className="tree-profile-event"><span className="tree-profile-event-icon"><Icon aria-hidden="true" /></span><div className="min-w-0"><time dateTime={entry.date}>{dateLabel(entry.date)}</time><h3>{entry.title}</h3><span className="tree-profile-event-source">{entry.source}</span>{entry.description && <p>{entry.description}</p>}{entry.reportId && <Link to={`/bronca/${entry.reportId}`}>Ver bronca vinculada<ChevronRight className="h-3 w-3" /></Link>}</div></div></li>;
          })}</ol>
          {!history.care.length && <p className="tree-profile-empty-history">Nenhum serviço registrado pela equipe municipal até o momento.</p>}
          <div className="tree-profile-history-summary"><Info className="h-4 w-4" aria-hidden="true" /><div><p>{history.reports.length} solicitações vinculadas · {history.care.length} serviços registrados pela equipe</p><p className="tree-profile-history-caption">Conforme dados da plataforma e das broncas relacionadas.</p></div></div>
        </>}
        </details>
      </section>
      </div>
    </div>
    {photoOpen && <Dialog open onOpenChange={open => { if (!open) setPhotoOpen(false); }}><DialogContent className="tree-profile-photo-dialog" aria-describedby={undefined}><DialogTitle>{photoOpen.illustrative ? `Imagem ilustrativa de ${tree.common_name}` : `Foto de ${tree.common_name}`}</DialogTitle><img src={photoOpen.url} alt={photoOpen.illustrative ? photoOpen.alt : `Foto completa de ${tree.common_name}`} />{photoOpen.illustrative && <p className="text-sm text-muted-foreground">{photoOpen.caption}</p>}</DialogContent></Dialog>}
    {editing && canManage && <TreeFormDialog tree={tree} initialStep={editing === 'photo' ? 1 : 0} city={city} cityId={tree.city_id} onClose={() => setEditing(false)} onSave={saveTree}
      onSpeciesChanged={species => setTree(current => current?.species_id === species.id ? withTreeSpecies(current, species) : current)} />}
  </main>;
}

export default function TreePage() { const { id } = useParams(); return <TreeContent key={id} id={id} />; }
