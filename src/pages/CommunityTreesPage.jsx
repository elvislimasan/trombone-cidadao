import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, Leaf, Loader2, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCommunityTreeList } from '@/hooks/useCommunityTrees';
import TreeCollectionIntro, { TreeCollectionToolbar } from '@/components/arborization/TreeCollectionIntro';
import CommunityTreeCard from '@/components/arborization/CommunityTreeCard';
import { CommunityShareDialog } from '@/components/arborization/CommunityTreeDialogs';
import { CommunityDeleteDialog } from '@/components/arborization/CommunityTreeOwnerActions';
import { TreeJourneyNav } from '@/components/arborization/TreeJourney';
import '@/components/arborization/communityTrees.css';

function CommunityDirectory() {
  const context = useCityView(); const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const cityId = params.has('cidade') ? params.get('cidade') || null : context.cityId;
  const city = context.cities.find(row => String(row.id) === String(cityId));
  const mine = params.get('aba') === 'minhas';
  const location = useLocation();
  const [deleting, setDeleting] = useState(null), [notice, setNotice] = useState(location.state?.notice || '');
  const [sharing, setSharing] = useState(null);
  const [page, setPage] = useState(0);
  useEffect(() => { setDeleting(null); setSharing(null); }, [cityId, mine, user?.id]);
  useEffect(() => { setPage(0); }, [cityId, mine, user?.id]);
  const list = useCommunityTreeList({ cityId, mode: mine ? 'mine' : 'public', page, enabled: !mine || Boolean(user), identity: user?.id });
  const newPath = `/arvores-da-comunidade/nova${cityId ? `?cidade=${cityId}` : ''}`;
  const cityContext = { ...context, cityId, city, cityName: city?.name || '', setCityId: id => setParams(current => { const next = new URLSearchParams(current); next.set('cidade', id ? String(id) : ''); return next; }) };
  return <CityViewProvider value={cityContext}><main className="page-shell-fluid community-page tree-collection-scope">
    <Helmet><title>Árvores da comunidade | Trombone Cidadão</title><meta name="description" content="Conheça árvores cuidadas pelos cidadãos, registre os cuidados e acompanhe seu crescimento." /></Helmet>
    <TreeCollectionToolbar />
    <TreeCollectionIntro title={mine ? 'Minhas árvores' : 'Árvores da comunidade'} description={mine ? 'Pequenos cuidados. Novas histórias.' : 'Uma cidade mais verde, feita por todos.'} photo={mine ? 'rega' : 'tree'}><Button asChild><Link to={newPath}><Plus size={18} />Cadastrar árvore</Link></Button></TreeCollectionIntro>
    <TreeJourneyNav cityId={cityId} active={mine ? 'care' : undefined} />
    {notice && <p role="status" className="community-notice">{notice}</p>}
    <div className="tree-collection-listbar"><h2>{mine ? 'Seu jardim' : 'Explore a comunidade'}</h2><button type="button" onClick={() => setParams(current => { const next = new URLSearchParams(current); if (mine) next.delete('aba'); else next.set('aba', 'minhas'); return next; })}>{mine ? 'Explorar comunidade' : 'Ver minhas árvores'}<ArrowRight size={16} aria-hidden="true" /></button></div>
    {mine && !user ? <section className="community-empty"><Sprout size={32} /><h2>Suas árvores, seus cuidados</h2><p>Entre para cadastrar e acompanhar suas árvores.</p><Button asChild><Link to="/login" state={{ from: { pathname: '/arvores-da-comunidade', search: `?aba=minhas${cityId ? `&cidade=${cityId}` : ''}` } }}>Entrar na minha conta</Link></Button></section> : list.loading ? <p role="status" className="community-loading"><Loader2 size={22} className="animate-spin" />Carregando árvores…</p> : list.error ? <section role="alert" className="community-empty"><p>{list.error}</p><Button variant="outline" onClick={list.refresh}>Tentar novamente</Button></section> : !list.rows.length ? <section className="community-empty"><Leaf size={34} /><h2>{mine ? 'Sua primeira árvore começa aqui' : page ? 'Não há mais árvores nesta página' : 'Novas histórias vão criar raízes aqui'}</h2><p>{mine ? 'Cadastre uma árvore que você plantou ou já acompanha.' : 'Os perfis aparecem após a aprovação da equipe municipal.'}</p><Button asChild><Link to={newPath}>Cadastrar uma árvore<ArrowRight size={17} /></Link></Button></section> : <div className="community-tree-grid">{list.rows.map(tree => <CommunityTreeCard key={tree.id} tree={tree} mine={mine} onDelete={setDeleting} onShare={setSharing} />)}</div>}
    {sharing && <CommunityShareDialog tree={sharing} care={[]} onClose={() => setSharing(null)} />}
    {deleting && user && <CommunityDeleteDialog tree={deleting} userId={user.id} onClose={() => setDeleting(null)} onDeleted={result => { setDeleting(null); setNotice(result.cleanupPending ? 'Cadastro excluído. Não foi possível confirmar a remoção das fotos.' : 'Árvore excluída.'); list.refresh(); }} />}
    {(page > 0 || list.rows.length === 24) && <nav className="community-pagination" aria-label="Páginas de árvores"><Button variant="outline" disabled={page === 0 || list.loading} onClick={() => setPage(current => current - 1)}>Anterior</Button><span>Página {page + 1}</span><Button variant="outline" disabled={list.rows.length < 24 || list.loading} onClick={() => setPage(current => current + 1)}>Próxima</Button></nav>}
  </main></CityViewProvider>;
}

export default function CommunityTreesPage() { return <CityViewProvider><CommunityDirectory /></CityViewProvider>; }
