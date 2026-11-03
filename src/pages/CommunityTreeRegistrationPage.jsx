import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { useCommunityTree } from '@/hooks/useCommunityTrees';
import { communityTreePath } from '@/lib/communityTrees';
import { CommunityTreeRegistrationForm } from '@/components/arborization/CommunityTreeForms';
import TreeRegistrationHeader from '@/components/arborization/TreeRegistrationHeader';
import { TreeFormHelp } from '@/components/arborization/TreeFormLayout';
import '@/components/arborization/treeExperience.css';

function Registration({ initial }) {
  const { user } = useAuth(), { cities, activeCityId, loadingCities } = useCity(); const [params] = useSearchParams(); const navigate = useNavigate();
  if (loadingCities) return <p role="status" className="community-loading"><Loader2 className="animate-spin" />Carregando cidades…</p>;
  return <div className="tree-registration-layout tree-form-theme"><CommunityTreeRegistrationForm cities={cities} initial={initial} initialCityId={params.get('cidade') || activeCityId} userId={user.id} onCancel={() => navigate(initial ? communityTreePath(initial.id) : '/arvores-da-comunidade?aba=minhas')} onSaved={id => navigate(communityTreePath(id), { replace: true, state: { notice: initial ? 'Cadastro atualizado e enviado para análise.' : 'Árvore cadastrada. Você já pode registrar cuidados.' } })} /><TreeFormHelp title="Sua árvore, seu acompanhamento" items={[
    ['Uma foto para começar', 'Mostre a árvore e seu entorno para facilitar a análise.'],
    ['O local certo', 'Marque a árvore no mapa. O endereço pode ficar reservado.'],
    ['Um diário de cuidados', 'Registre regas, fotos e observações depois do cadastro.'],
  ]} /></div>;
}

function EditRegistration({ id }) {
  const { user } = useAuth(); const result = useCommunityTree(id, user?.id);
  if (result.loading) return <p role="status" className="community-loading"><Loader2 className="animate-spin" />Abrindo cadastro…</p>;
  if (result.error) return <section role="alert" className="community-empty"><p>{result.error}</p><Button onClick={result.refresh}>Tentar novamente</Button></section>;
  if (!result.tree?.is_owner) return <section className="community-empty"><p>Este cadastro não está disponível para edição.</p><Button asChild variant="outline"><Link to={communityTreePath(id)}>Voltar à árvore</Link></Button></section>;
  return <>{result.tree.review_note && <p className="community-notice">Orientação da equipe: {result.tree.review_note}</p>}<p className="community-notice">Alterações nos dados ou na foto de capa voltam para análise. O diário de cuidados será preservado.</p><Registration initial={result.tree} /></>;
}

export default function CommunityTreeRegistrationPage() {
  const { user } = useAuth(), { id } = useParams(); const [params] = useSearchParams();
  const pathname = id ? `${communityTreePath(id)}/editar` : '/arvores-da-comunidade/nova';
  return <main className="page-shell-fluid community-page tree-registration-page tree-experience"><Helmet><title>{id ? 'Editar árvore' : 'Cadastrar árvore'} | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet><TreeRegistrationHeader editing={Boolean(id)} treeId={id} cityId={params.get('cidade')} />
    {!user ? <section className="community-empty"><Sprout size={34} /><h2>Entre para cadastrar sua árvore</h2><p>Você poderá acompanhar a análise e registrar os cuidados.</p><Button asChild><Link to="/login" state={{ from: { pathname, search: params.toString() ? `?${params}` : '' } }}>Entrar na minha conta</Link></Button></section> : id ? <EditRegistration id={id} /> : <Registration />}
  </main>;
}
