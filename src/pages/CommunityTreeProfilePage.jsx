import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCommunityTree } from '@/hooks/useCommunityTrees';
import { supabase } from '@/lib/customSupabaseClient';
import { COMMUNITY_TREE_STATUS, communityRpc, communityTreePath } from '@/lib/communityTrees';
import { CommunityCareForm, useCommunityAction } from '@/components/arborization/CommunityTreeForms';
import { CommunityCareReportDialog, CommunityPrivacyDialog, CommunityReviewDialog, CommunityShareDialog } from '@/components/arborization/CommunityTreeDialogs';
import { CommunityDeleteDialog } from '@/components/arborization/CommunityTreeOwnerActions';
import CommunityTreeProfileHero from '@/components/arborization/CommunityTreeProfileHero';
import CommunityTreeDiary from '@/components/arborization/CommunityTreeDiary';
import CommunityTreeAbout from '@/components/arborization/CommunityTreeAbout';
import CommunityTreeComments from '@/components/arborization/CommunityTreeComments';
import CommunityTreeGallery from '@/components/arborization/CommunityTreeGallery';
import '@/components/arborization/communityTrees.css';
import '@/components/arborization/treeExperience.css';
import '@/components/arborization/communityTreeProfileSimple.css';

export default function CommunityTreeProfilePage() {
  const { id } = useParams(), { user } = useAuth(); const result = useCommunityTree(id, user?.id);
  const navigate = useNavigate(), location = useLocation();
  const [params, setParams] = useSearchParams();
  const [editingCare, setEditingCare] = useState(null), [deleteTarget, setDeleteTarget] = useState(null);
  const [modal, setModal] = useState(null), [report, setReport] = useState(null), [notice, setNotice] = useState(location.state?.notice || '');
  const [careBusy, setCareBusy] = useState(false);
  const [diaryEntryId, setDiaryEntryId] = useState(null);
  const [careAction, setCareAction] = useState('watering'), [careFilter, setCareFilter] = useState('all');
  const openCare = (type = 'watering') => { setEditingCare(null); setCareAction(type); setModal('care'); };
  const editCare = care => { setEditingCare(care); setCareAction(care.action); setModal('care'); };
  useEffect(() => { setModal(null); setReport(null); setNotice(location.state?.notice || ''); setCareBusy(false); setEditingCare(null); setDeleteTarget(null); }, [id, user?.id]);
  useEffect(() => { setCareFilter('all'); setDiaryEntryId(null); }, [id, user?.id]);
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
  return <main className="page-shell-fluid community-page community-profile-page tree-experience tree-profile-simple">
    <Helmet><title>{tree.name} | Árvores da comunidade</title><meta name="description" content={`Acompanhe os cuidados com ${tree.name} em ${tree.city_name}.`} />{!shareable && <meta name="robots" content="noindex" />}</Helmet>
    <CommunityTreeProfileHero tree={tree} care={result.care} onCare={() => openCare()} onPhoto={() => openCare('growth')} onPrivacy={() => setModal('privacy')} onReview={() => setModal('review')} onShare={() => setModal('share')} onDelete={() => setDeleteTarget({ type: 'tree' })} />
    {(tree.is_owner || tree.can_review) && (tree.status !== 'approved' || !tree.public_profile) && <div className={`community-owner-notice is-${tree.status}`}><span className={`community-status is-${tree.status}`}>{COMMUNITY_TREE_STATUS[tree.status]}</span><p>{tree.status === 'pending' ? 'Você já pode registrar cuidados durante a análise.' : tree.status === 'rejected' ? tree.review_note || 'Confira os dados e envie novamente para análise.' : tree.public_profile ? 'Perfil público aprovado. Registre os cuidados e compartilhe a evolução.' : 'Acompanhamento privado. Só você e a equipe municipal podem acessar.'}</p>{tree.is_owner && tree.status === 'rejected' && <Button asChild size="sm" variant="outline"><Link to={`${communityTreePath(id)}/editar`}>Corrigir cadastro</Link></Button>}</div>}
    {(notice || action.error) && <p role={action.error ? 'alert' : 'status'} className={action.error ? 'community-error' : 'community-notice'}>{action.error || notice}</p>}
    <div className="tree-profile-body"><div className="tree-profile-main">
      <CommunityTreeDiary key={`${tree.id}:${user?.id || 'visitor'}`} tree={tree} entries={result.care} user={user}
        filter={careFilter} onFilterChange={setCareFilter} selectedId={diaryEntryId} onSelect={setDiaryEntryId}
        onRecord={() => openCare()} onEdit={editCare} onDelete={care => setDeleteTarget({ type: 'care', care })}
        onPrivacy={care => action.run(() => communityRpc(supabase, 'set_community_care_privacy', { p_id: care.id, p_public: !care.is_public }))}
        onReport={setReport} busy={action.busy} more={result.more} onLoadMore={result.loadMore} onRetryPhotos={result.refresh} onShare={() => setModal('share')} />
      <div id="tree-photos" className="tree-profile-photos"><CommunityTreeGallery compact key={tree.id} tree={tree} care={result.care} onAddPhoto={() => openCare('growth')} onShare={() => setModal('share')} onRetryPhotos={result.refresh} onEditCare={editCare} /></div>
      {shareable && <CommunityTreeComments compact key={`${tree.id}:${user?.id || 'visitor'}`} tree={tree} user={user} />}
    </div><aside className="tree-profile-sidebar"><CommunityTreeAbout key={tree.id} tree={tree} /></aside></div>
    <Dialog open={modal === 'care'} onOpenChange={open => { if (!open && !careBusy) setModal(null); }}><DialogContent className="community-dialog sm:max-w-lg" onEscapeKeyDown={event => { if (careBusy) event.preventDefault(); }} onInteractOutside={event => { if (careBusy) event.preventDefault(); }}><DialogHeader><DialogTitle>{editingCare ? 'Editar cuidado' : 'Um novo cuidado'}{!editingCare && ` para ${tree.name}`}</DialogTitle><DialogDescription>Guarde esse momento no diário. Foto e observação são opcionais.</DialogDescription></DialogHeader><CommunityCareForm key={editingCare?.id || careAction} initialCare={editingCare} tree={tree} initialAction={careAction} userId={user?.id} onBusyChange={setCareBusy} onCancel={() => setModal(null)} onSaved={savedId => { setModal(null); setNotice(editingCare ? 'Cuidado atualizado.' : 'Cuidado salvo no diário.'); setDiaryEntryId(savedId || editingCare?.id || null); setCareFilter('all'); setEditingCare(null); result.refresh(); }} /></DialogContent></Dialog>
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
