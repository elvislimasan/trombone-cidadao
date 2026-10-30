import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { useCommunityTree } from '@/hooks/useCommunityTrees';
import { communityTreePath } from '@/lib/communityTrees';
import { CommunityTreeRegistrationForm } from '@/components/arborization/CommunityTreeForms';

function Registration({ initial }) {
  const { user } = useAuth(), { cities, activeCityId, loadingCities } = useCity(); const [params] = useSearchParams(); const navigate = useNavigate();
  if (loadingCities) return <p role="status" className="community-loading"><Loader2 className="animate-spin" />Carregando cidades…</p>;
  return <CommunityTreeRegistrationForm cities={cities} initial={initial} initialCityId={params.get('cidade') || activeCityId} userId={user.id} onCancel={() => navigate(initial ? communityTreePath(initial.id) : '/arvores-da-comunidade?aba=minhas')} onSaved={id => navigate(communityTreePath(id), { replace: true })} />;
}

function EditRegistration({ id }) {
  const { user } = useAuth(); const result = useCommunityTree(id, user?.id);
  if (result.loading) return <p role="status" className="community-loading"><Loader2 className="animate-spin" />Abrindo cadastro…</p>;
  if (result.error) return <section role="alert" className="community-empty"><p>{result.error}</p><Button onClick={result.refresh}>Tentar novamente</Button></section>;
  if (!result.tree?.is_owner || result.tree.status !== 'rejected') return <section className="community-empty"><p>Este cadastro não está disponível para correção.</p><Button asChild variant="outline"><Link to={communityTreePath(id)}>Voltar à árvore</Link></Button></section>;
  return <><p className="community-notice">Orientação da equipe: {result.tree.review_note}</p><Registration initial={result.tree} /></>;
}

export default function CommunityTreeRegistrationPage() {
  const { user } = useAuth(), { id } = useParams(); const [params] = useSearchParams();
  const pathname = id ? `${communityTreePath(id)}/editar` : '/arvores-da-comunidade/nova';
  return <main className="page-shell-fluid community-page"><Helmet><title>{id ? 'Corrigir cadastro' : 'Cadastrar árvore'} | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet><Link className="community-back" to="/arvores-da-comunidade?aba=minhas"><ArrowLeft size={16} />Minhas árvores</Link><header className="community-page-heading"><div><p className="community-eyebrow"><Sprout size={16} />Árvores da comunidade</p><h1>{id ? 'Corrigir cadastro' : 'Cadastrar uma árvore'}</h1><p>Foto, localização e um cuidado que continua com você.</p></div></header>
    {!user ? <section className="community-empty"><Sprout size={34} /><h2>Entre para cadastrar sua árvore</h2><p>Você poderá acompanhar a análise e registrar os cuidados.</p><Button asChild><Link to="/login" state={{ from: { pathname, search: params.toString() ? `?${params}` : '' } }}>Entrar na minha conta</Link></Button></section> : id ? <EditRegistration id={id} /> : <Registration />}
  </main>;
}
