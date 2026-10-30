import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import TreeAdoptionRequests from '@/components/arborization/TreeAdoptionRequests';
import TreeNurseriesManagement from '@/components/arborization/TreeNurseriesManagement';
import CommunityTreeReview from '@/components/arborization/CommunityTreeReview';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cityStateUf } from '@/lib/cityLocation';
import { municipalContextPath } from '@/lib/municipalAccess';
import { TERRITORIAL_BASE } from '@/lib/territorialAccess';

export default function TreeAdoptionManagementPage({ section = 'requests' }) {
  const workspace = useOutletContext();
  const { user } = useAuth();
  const access = usePermissions();
  const { cities, loadingCities, activeCityId } = useCity();
  const [params] = useSearchParams();
  const municipal = Boolean(workspace?.municipality);
  // Gestores do inventário sem vínculo municipal usam a mesma fila, limitada
  // às suas cidades. No painel, a prefeitura ativa define o escopo da tela.
  const allowedCities = cities.filter(city => access.isMaster || (access.canWrite('arborization') && access.treeAssignments.some(row => String(row.city_id) === String(city.id))));
  const requestedCity = params.get('cidade');
  const city = municipal
    ? { ...workspace.municipality.cidade, id: workspace.municipality.city_id }
    : allowedCities.find(row => String(row.id) === String(requestedCity || activeCityId)) || allowedCities[0];

  if (!municipal && (access.loading || loadingCities)) return <p role="status" className="page-shell-fluid py-8">Abrindo atendimento…</p>;
  if (!municipal && access.error) return <div className="page-shell-fluid space-y-3 py-8"><p role="alert">Não foi possível verificar seu acesso ao atendimento.</p><Button onClick={access.refreshPermissions}>Tentar novamente</Button></div>;
  if ((municipal && !workspace.canAttendTreeAdoption) || (!municipal && requestedCity && !allowedCities.some(row => String(row.id) === requestedCity)) || !city) return <p role="alert" className="page-shell-fluid py-8">Sem acesso ao atendimento de arborização desta cidade.</p>;

  const cityLabel = [city.name, cityStateUf(city)].filter(Boolean).join(' · ');
  return <main className="tree-adoption-management-page page-shell-fluid" style={{ paddingInline: 'clamp(1rem, 2vw, 2rem)' }}>
    <Helmet><title>{section === 'community' ? 'Árvores da comunidade' : section === 'nurseries' ? 'Viveiros e mudas' : 'Solicitações'} · Adote uma árvore | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold text-brand">Atendimento municipal · {cityLabel}</p>
      {(municipal ? workspace.inventoryModules?.includes('arborization') : allowedCities.length > 0) && <Button asChild variant="outline" size="sm"><Link to={municipalContextPath(`${TERRITORIAL_BASE}/arborizacao`, city.id, workspace?.activeChannelId)}>Voltar ao inventário</Link></Button>}
    </div>
    <div className="tree-adoption-management-panel rounded-xl border border-edge-subtle bg-surface-raised">
      {section === 'community' ? <CommunityTreeReview key={`${user?.id}:${city.id}:${workspace?.activeChannelId || ''}`} cityId={city.id} /> : section === 'nurseries' ? <TreeNurseriesManagement key={`${user?.id}:${city.id}:${workspace?.activeChannelId || ''}`} cityId={city.id} city={city} /> : <TreeAdoptionRequests key={`${user?.id}:${city.id}:${workspace?.activeChannelId || ''}`} cityId={city.id} city={city} management headingLevel={1} />}
    </div>
  </main>;
}
