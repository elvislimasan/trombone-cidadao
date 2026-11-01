import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Droplets, Eye, EyeOff, Flag, Loader2, MapPin, MessageSquare, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCommunityTree } from '@/hooks/useCommunityTrees';
import { supabase } from '@/lib/customSupabaseClient';
import { COMMUNITY_CARE_ACTIONS, COMMUNITY_TREE_STATUS, communityRpc, communityTreePath } from '@/lib/communityTrees';
import { CommunityCareForm, useCommunityAction } from '@/components/arborization/CommunityTreeForms';
import { CommunityCareReportDialog, CommunityPrivacyDialog, CommunityReviewDialog, CommunityShareDialog } from '@/components/arborization/CommunityTreeDialogs';
import { TreeJourneyNav } from '@/components/arborization/TreeJourney';
import { CareOwnerActions, CommunityDeleteDialog } from '@/components/arborization/CommunityTreeOwnerActions';
import CommunityTreeProfileHero from '@/components/arborization/CommunityTreeProfileHero';
import CommunityTreeComments from '@/components/arborization/CommunityTreeComments';
import CommunityTreeGallery from '@/components/arborization/CommunityTreeGallery';
import '@/components/arborization/communityTrees.css';
const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const dateLabel = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR') : '';

export default function CommunityTreeProfilePage() {
  const { id } = useParams(), { user } = useAuth(); const result = useCommunityTree(id, user?.id);
  const navigate = useNavigate(), location = useLocation();
  const [params, setParams] = useSearchParams();
  const [editingCare, setEditingCare] = useState(null), [deleteTarget, setDeleteTarget] = useState(null);
  const [modal, setModal] = useState(null), [report, setReport] = useState(null), [notice, setNotice] = useState(location.state?.notice || '');
  const [careBusy, setCareBusy] = useState(false);
  const [careAction, setCareAction] = useState('watering'), [careFilter, setCareFilter] = useState('all');
  const openCare = (type = 'watering') => { setEditingCare(null); setCareAction(type); setModal('care'); };
  const editCare = care => { setEditingCare(care); setCareAction(care.action); setModal('care'); };
  useEffect(() => { setModal(null); setReport(null); setNotice(location.state?.notice || ''); setCareBusy(false); setEditingCare(null); setDeleteTarget(null); }, [id, user?.id]);
  useEffect(() => { setCareFilter('all'); }, [id, user?.id]);
  useEffect(() => {
    if (!result.tree?.is_owner) return;
    const requested = params.get('acao');
    if (!['foto', 'privacidade', 'cuidar'].includes(requested)) return;
    if (requested === 'foto' || requested === 'cuidar') { setEditingCare(null); setCareAction(requested === 'foto' ? 'growth' : 'watering'); setModal('care'); } else setModal('privacy');
    setParams(current => { const next = new URLSearchParams(current); next.delete('acao'); return next; }, { replace: true });
  }, [result.tree?.id, result.tree?.is_owner, params, setParams]);
  const action = useCommunityAction(() => result.refresh());
  const tree = result.tree;
  if (result.loading) return <main className="page-shell-fluid community-page"><p role="status" className="community-loading"><Loader2 size={23} className="animate-spin" />Carregando árvore…</p></main>;
  if (result.error || !tree) return <main className="page-shell-fluid community-page"><section className="community-empty"><Sprout size={36} /><h1>{result.error ? 'Não foi possível abrir esta árvore' : 'Perfil indisponível'}</h1><p>{result.error || 'O perfil pode estar em análise ou reservado ao cidadão que fez o cadastro.'}</p>{result.error && <Button variant="outline" onClick={result.refresh}>Tentar novamente</Button>}{!user && <Button asChild><Link to="/login" state={{ from: { pathname: communityTreePath(id) } }}>Entrar na minha conta</Link></Button>}<Link to="/arvores-da-comunidade" className="community-text-button">Árvores da comunidade</Link></section></main>;
  const shareable = tree.status === 'approved' && tree.public_profile;
  const icons = { watering: Droplets, growth: Sprout, observation: MessageSquare };
  const visibleCare = result.care.filter(care => careFilter === 'all' || care.action === careFilter);
  return <main className="page-shell-fluid community-page community-profile-page">
    <Helmet><title>{tree.name} | Árvores da comunidade</title><meta name="description" content={`Acompanhe os cuidados com ${tree.name} em ${tree.city_name}.`} />{!shareable && <meta name="robots" content="noindex" />}</Helmet>
    <CommunityTreeProfileHero tree={tree} onCare={() => openCare()} onPhoto={() => openCare('growth')} onPrivacy={() => setModal('privacy')} onReview={() => setModal('review')} onShare={() => setModal('share')} onDelete={() => setDeleteTarget({ type: 'tree' })} />
    <TreeJourneyNav cityId={tree.city_id} active={tree.is_owner ? 'care' : undefined} />
    {(tree.is_owner || tree.can_review) && (tree.status !== 'approved' || !tree.public_profile) && <div className={`community-owner-notice is-${tree.status}`}><span className={`community-status is-${tree.status}`}>{COMMUNITY_TREE_STATUS[tree.status]}</span><p>{tree.status === 'pending' ? 'Você já pode registrar cuidados durante a análise.' : tree.status === 'rejected' ? tree.review_note || 'Confira os dados e envie novamente para análise.' : tree.public_profile ? 'Perfil público aprovado. Registre os cuidados e compartilhe a evolução.' : 'Acompanhamento privado. Só você e a equipe municipal podem acessar.'}</p>{tree.is_owner && tree.status === 'rejected' && <Button asChild size="sm" variant="outline"><Link to={`${communityTreePath(id)}/editar`}>Corrigir cadastro</Link></Button>}</div>}
    {(notice || action.error) && <p role={action.error ? 'alert' : 'status'} className={action.error ? 'community-error' : 'community-notice'}>{action.error || notice}</p>}
    <div className="community-profile-grid"><aside className="community-profile-overview"><h2 className="community-profile-about-title">Sobre esta árvore</h2><dl className="community-profile-facts"><div><dt>Primeiro registro</dt><dd>{dateLabel(tree.created_at)}</dd></div>{tree.planted_on && <div><dt>Data do plantio</dt><dd>{dateLabel(tree.planted_on)}</dd></div>}<div><dt>Localização pública</dt><dd><MapPin size={15} />{tree.location_visibility === 'exact' ? tree.address || tree.city_name : tree.city_name}</dd></div><div><dt>Cuidados registrados</dt><dd>{tree.care_count}</dd></div></dl>
      {tree.location_visibility === 'exact' && tree.latitude != null && <div className="community-profile-map"><Suspense fallback={<Loader2 className="animate-spin" />}><LocationPickerMap initialPosition={{ lat: tree.latitude, lng: tree.longitude }} initialZoom={16} readOnly /></Suspense></div>}
      {tree.is_owner && !shareable && <p className="community-muted"><EyeOff size={16} />O compartilhamento fica disponível quando o perfil estiver aprovado e público.</p>}
      <CommunityTreeGallery key={tree.id} tree={tree} care={result.care} onAddPhoto={() => openCare('growth')} />
    </aside><section className="community-timeline" aria-labelledby="community-care-heading"><header><h2 id="community-care-heading">Diário da árvore</h2></header>
      {result.care.length > 0 && <div className="community-care-filters" role="group" aria-label="Filtrar diário por cuidado">{[['all', 'Todos'], ...Object.entries(COMMUNITY_CARE_ACTIONS)].map(([key, label]) => <button type="button" key={key} aria-pressed={careFilter === key} onClick={() => setCareFilter(key)}>{label}</button>)}</div>}
      {!result.care.length ? <div className="community-empty"><Droplets size={31} /><h3>{tree.is_owner ? 'Registre o primeiro cuidado' : 'A história está começando'}</h3><p>{tree.is_owner ? 'Uma rega, uma foto ou uma observação já fazem parte dessa história.' : 'Os cuidados públicos aparecerão aqui.'}</p></div> : !visibleCare.length ? <div className="community-empty"><Sprout size={28} /><h3>Nenhum registro deste tipo no histórico carregado</h3><p>Veja todos os cuidados ou carregue mais registros abaixo.</p><Button variant="outline" onClick={() => setCareFilter('all')}>Ver todos os cuidados</Button></div> : <ol className="community-care-list">{visibleCare.map(care => { const Icon = icons[care.action] || Sprout; return <li key={care.id} className={care.is_hidden ? 'is-hidden' : ''}><article className="community-care-card"><header><span className="community-care-icon"><Icon size={21} /></span><div><h3>{COMMUNITY_CARE_ACTIONS[care.action]}</h3><time dateTime={care.performed_on}>{dateLabel(care.performed_on)}</time></div>{tree.is_owner && <span className="community-care-visibility">{care.is_hidden ? 'Ocultado pela equipe' : care.is_public ? (shareable ? 'Público' : 'Público após aprovação') : 'Só no meu acompanhamento'}</span>}</header>{care.notes && <p className="community-care-notes">{care.notes}</p>}{care.photo_url && <a href={care.photo_url} target="_blank" rel="noreferrer" aria-label={`Ampliar foto do cuidado em ${dateLabel(care.performed_on)}`}><img className="community-care-photo" src={care.photo_url} alt={`Registro de ${COMMUNITY_CARE_ACTIONS[care.action].toLowerCase()} em ${dateLabel(care.performed_on)}`} loading="lazy" /></a>}{care.is_hidden && care.hidden_reason && <p className="community-muted">Orientação da equipe: {care.hidden_reason}</p>}<footer>{tree.is_owner ? <><CareOwnerActions care={care} onEdit={editCare} onDelete={entry => setDeleteTarget({ type: 'care', care: entry })} /><button type="button" className="community-text-button" disabled={action.busy} onClick={() => action.run(() => communityRpc(supabase, 'set_community_care_privacy', { p_id: care.id, p_public: !care.is_public }))}>{care.is_public ? <EyeOff size={15} /> : <Eye size={15} />}{care.is_public ? 'Guardar só para mim' : (shareable ? 'Tornar público' : 'Tornar público após aprovação')}</button></> : <>{user ? <button type="button" className="community-text-button" onClick={() => setReport(care)}><Flag size={15} />Denunciar registro</button> : <Link className="community-text-button" to="/login" state={{ from: { pathname: communityTreePath(id) } }}><Flag size={15} />Denunciar registro</Link>}</>}</footer></article></li>; })}</ol>}
      {result.more && <Button variant="outline" onClick={result.loadMore}>Carregar mais cuidados</Button>}
    {shareable && <CommunityTreeComments key={`${tree.id}:${user?.id || 'visitor'}`} tree={tree} user={user} />}
    </section></div>
    <Dialog open={modal === 'care'} onOpenChange={open => { if (!open && !careBusy) setModal(null); }}><DialogContent className="community-dialog sm:max-w-lg" onEscapeKeyDown={event => { if (careBusy) event.preventDefault(); }} onInteractOutside={event => { if (careBusy) event.preventDefault(); }}><DialogHeader><DialogTitle>{editingCare ? 'Editar cuidado' : 'Um novo cuidado'}{!editingCare && ` para ${tree.name}`}</DialogTitle><DialogDescription>Guarde esse momento no diário. Foto e observação são opcionais.</DialogDescription></DialogHeader><CommunityCareForm key={editingCare?.id || careAction} initialCare={editingCare} tree={tree} initialAction={careAction} userId={user?.id} onBusyChange={setCareBusy} onCancel={() => setModal(null)} onSaved={() => { setModal(null); setNotice(editingCare ? 'Cuidado atualizado.' : 'Cuidado salvo no diário.'); setEditingCare(null); result.refresh(); }} /></DialogContent></Dialog>
    {deleteTarget && <CommunityDeleteDialog tree={tree} care={deleteTarget.care} userId={user?.id} onClose={() => setDeleteTarget(null)} onDeleted={deleted => {
      const message = deleted.cleanupPending ? 'Registro excluído. Não foi possível confirmar a remoção das fotos.' : deleteTarget.type === 'tree' ? 'Árvore excluída.' : 'Cuidado excluído.';
      setDeleteTarget(null);
      if (deleteTarget.type === 'tree') navigate('/arvores-da-comunidade?aba=minhas', { replace: true, state: { notice: message } });
      else { setNotice(message); result.refresh(); }
    }} />}
    {modal === 'privacy' && <CommunityPrivacyDialog tree={tree} onClose={() => setModal(null)} onSaved={result.refresh} />}
    {modal === 'review' && <CommunityReviewDialog tree={tree} onClose={() => setModal(null)} onSaved={result.refresh} />}
    {modal === 'share' && <CommunityShareDialog tree={tree} care={result.care} onClose={() => setModal(null)} />}
    {report && <CommunityCareReportDialog care={report} onClose={() => setReport(null)} onSaved={() => setNotice('Denúncia enviada para revisão da equipe.')} />}
  </main>;
}
