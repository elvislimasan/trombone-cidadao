import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Leaf, Loader2, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CitySelector from '@/components/CitySelector';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCommunityTreeList } from '@/hooks/useCommunityTrees';
import { COMMUNITY_TREE_STATUS, communityTreePath } from '@/lib/communityTrees';
import '@/components/arborization/communityTrees.css';

function CommunityDirectory() {
  const context = useCityView(); const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const cityId = params.has('cidade') ? params.get('cidade') || null : context.cityId;
  const city = context.cities.find(row => String(row.id) === String(cityId));
  const mine = params.get('aba') === 'minhas';
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [cityId, mine, user?.id]);
  const list = useCommunityTreeList({ cityId, mode: mine ? 'mine' : 'public', page, enabled: !mine || Boolean(user), identity: user?.id });
  const newPath = `/arvores-da-comunidade/nova${cityId ? `?cidade=${cityId}` : ''}`;
  const cityContext = { ...context, cityId, city, cityName: city?.name || '', setCityId: id => setParams(current => { const next = new URLSearchParams(current); next.set('cidade', id ? String(id) : ''); return next; }) };
  return <CityViewProvider value={cityContext}><main className="page-shell-fluid community-page">
    <Helmet><title>Árvores da comunidade | Trombone Cidadão</title><meta name="description" content="Conheça árvores cuidadas pelos cidadãos, registre os cuidados e acompanhe seu crescimento." /></Helmet>
    <Link to="/mapa-arborizacao" className="community-back"><ArrowLeft size={16} />Mapa de arborização</Link>
    <header className="community-page-heading"><div><p className="community-eyebrow"><Sprout size={16} />Um cuidado que cresce</p><h1>Árvores da comunidade</h1><p>Cadastre uma árvore, acompanhe os cuidados e compartilhe sua evolução.</p></div><Button asChild><Link to={newPath}><Plus size={18} />Cadastrar uma árvore</Link></Button></header>
    <div className="community-directory-toolbar"><nav className="community-tabs" aria-label="Árvores da comunidade">{[['publicas', 'Explorar'], ['minhas', 'Minhas árvores']].map(([key, title]) => <button type="button" key={key} aria-current={mine === (key === 'minhas') ? 'page' : undefined} onClick={() => setParams(current => { const next = new URLSearchParams(current); if (key === 'minhas') next.set('aba', key); else next.delete('aba'); return next; })}>{title}</button>)}</nav><CitySelector /></div>
    {mine && !user ? <section className="community-empty"><Sprout size={32} /><h2>Suas árvores, seus cuidados</h2><p>Entre para cadastrar e acompanhar suas árvores.</p><Button asChild><Link to="/login" state={{ from: { pathname: '/arvores-da-comunidade', search: `?aba=minhas${cityId ? `&cidade=${cityId}` : ''}` } }}>Entrar na minha conta</Link></Button></section> : list.loading ? <p role="status" className="community-loading"><Loader2 size={22} className="animate-spin" />Carregando árvores…</p> : list.error ? <section role="alert" className="community-empty"><p>{list.error}</p><Button variant="outline" onClick={list.refresh}>Tentar novamente</Button></section> : !list.rows.length ? <section className="community-empty"><Leaf size={34} /><h2>{mine ? 'Sua primeira árvore começa aqui' : page ? 'Não há mais árvores nesta página' : 'Novas histórias vão criar raízes aqui'}</h2><p>{mine ? 'Cadastre uma árvore que você plantou ou já acompanha.' : 'Os perfis aparecem após a aprovação da equipe municipal.'}</p><Button asChild><Link to={newPath}>Cadastrar uma árvore<ArrowRight size={17} /></Link></Button></section> : <div className="community-tree-grid">{list.rows.map(tree => <Link key={tree.id} to={communityTreePath(tree.id)} className="community-tree-card">
      <div className="community-tree-card-photo">{tree.photo_url ? <img src={tree.photo_url} alt={`Árvore ${tree.name}`} loading="lazy" /> : <Sprout size={50} />}{mine && <span className={`community-status is-${tree.status}`}>{COMMUNITY_TREE_STATUS[tree.status]}</span>}</div>
      <div className="community-tree-card-copy"><h2>{tree.name}</h2><p>{tree.species_name || 'Espécie a identificar'} · {tree.city_name}</p><footer><span>{tree.care_count} {Number(tree.care_count) === 1 ? 'cuidado registrado' : 'cuidados registrados'}</span><ArrowRight size={18} /></footer></div>
    </Link>)}</div>}
    {(page > 0 || list.rows.length === 24) && <nav className="community-pagination" aria-label="Páginas de árvores"><Button variant="outline" disabled={page === 0 || list.loading} onClick={() => setPage(current => current - 1)}>Anterior</Button><span>Página {page + 1}</span><Button variant="outline" disabled={list.rows.length < 24 || list.loading} onClick={() => setPage(current => current + 1)}>Próxima</Button></nav>}
  </main></CityViewProvider>;
}

export default function CommunityTreesPage() { return <CityViewProvider><CommunityDirectory /></CityViewProvider>; }
