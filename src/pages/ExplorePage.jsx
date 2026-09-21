import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, Map, Megaphone, FileSignature, Compass, Construction, Route, BarChart3, Briefcase, Newspaper, Building, ShieldCheck } from 'lucide-react';
import CitySelector from '@/components/CitySelector';
import SectionPageHeader from '@/components/SectionPageHeader';
import CityEventCard from '@/components/agora/CityEventCard';
import SuggestedProfiles from '@/components/SuggestedProfiles';
import { useCity } from '@/contexts/CityContext';
import { useCityEvents } from '@/hooks/useCityEvents';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const groups = [
  { title: 'Participe', items: [
    ['/mapa', 'Broncas da comunidade', 'Veja problemas e apoie o que importa.', Megaphone],
    ['/abaixo-assinados', 'Abaixo-assinados', 'Some sua voz às causas da comunidade.', FileSignature],
    ['/missoes', 'Missões', 'Encontre uma forma de ajudar e veja suas conquistas.', Compass],
  ] },
  { title: 'Acompanhe a cidade', items: [
    ['/obras-publicas', 'Obras públicas', 'Consulte o andamento das obras.', Construction],
    ['/mapa-pavimentacao', 'Ruas e pavimentação', 'Conheça a situação das ruas.', Route],
  ] },
  { title: 'Informações e serviços', items: [
    ['/guia-da-cidade', 'Guia da Cidade', 'Comércio, serviços, turismo e transporte em um só lugar.', Briefcase],
    ['/noticias', 'Notícias', 'Leia as novidades da cidade.', Newspaper],
    ['/imoveis-alugados', 'Imóveis públicos alugados', 'Consulte imóveis e contratos públicos.', Building],
  ] },
];

export default function ExplorePage() {
  const { activeCityId, activeCityName, activeCity } = useCity();
  const { user } = useAuth();
  const radar = useCityEvents(activeCityId, { limite: 3 });
  return (
    <div className="mx-auto w-full max-w-[100rem] px-3 py-5 sm:px-5 lg:px-8 lg:py-8">
      <Helmet><title>Explorar — Trombone Cidadão</title></Helmet>
      <SectionPageHeader inlineChildren title="Explore sua cidade" description="Encontre informações, acompanhe mudanças e escolha como participar.">
        <CitySelector scope="global" />
      </SectionPageHeader>
      <Link to="/mapa" className="group relative flex h-[4.25rem] w-full items-center gap-3 overflow-hidden rounded-2xl text-left text-white shadow-sm">
        {activeCity?.civic_thumbnail_url ? <img src={activeCity.civic_thumbnail_url} alt={`Paisagem de ${activeCityName || 'sua cidade'}`} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-brand" />}
        <span className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-black/10" />
        <span className="relative flex min-w-0 flex-1 items-center gap-2.5 px-3.5"><Map className="h-5 w-5 shrink-0" /><span className="min-w-0"><strong className="block truncate text-sm font-extrabold">{activeCityName || 'Todas as cidades'}</strong><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/80">Ver mapa da cidade</span></span></span>
        <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>
      <section className="mt-6 max-w-6xl" aria-labelledby="explore-radar">
        <div className="mb-2 flex items-center justify-between gap-3"><h2 id="explore-radar" className="text-base font-extrabold text-content-primary sm:text-lg">Acontecendo agora</h2><Link to="/agora" className="inline-flex shrink-0 items-center py-1 text-xs font-bold text-brand sm:text-sm">Abrir Radar →</Link></div>
        {!activeCityId ? <p className="text-sm text-content-secondary">Escolha uma cidade para ver os alertas locais.</p>
          : radar.carregando ? <p role="status" className="text-sm text-content-secondary">Carregando alertas…</p>
          : radar.indisponivel || radar.erro ? <div role="alert" className="text-sm text-content-secondary">Não foi possível carregar os alertas. <button type="button" className="min-h-11 font-semibold text-brand" onClick={radar.recarregar}>Tentar novamente</button></div>
          : radar.eventos.length ? <div className="grid gap-2 md:grid-cols-3">{radar.eventos.map(evento => <CityEventCard key={evento.id} evento={evento} compact />)}</div>
          : <p className="rounded-2xl border border-edge-subtle p-3 text-sm text-content-secondary">Nenhum alerta ativo nesta cidade.</p>}
      </section>
      <section className="mt-6 max-w-6xl" aria-labelledby="explore-statistics">
        <div className="mb-2 flex items-center justify-between gap-3"><h2 id="explore-statistics" className="text-base font-extrabold text-content-primary sm:text-lg">Estatísticas</h2><Link to="/estatisticas" className="inline-flex shrink-0 items-center py-1 text-xs font-bold text-brand sm:text-sm">Ver estatísticas →</Link></div>
        <Link to="/estatisticas" className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3 transition-colors hover:border-brand/40 hover:bg-surface-subtle">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtleBg text-brand"><BarChart3 className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-content-primary">Indicadores da cidade</strong><span className="mt-0.5 block text-xs leading-snug text-content-secondary">Veja a participação da comunidade e os resultados das ações.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary transition group-hover:translate-x-0.5" />
        </Link>
      </section>
      <SuggestedProfiles cityId={activeCityId} limit={4} className="mt-6 max-w-6xl" />
      {groups.map(group => <section key={group.title} className="mt-6 max-w-6xl">
        <h2 className="mb-2 text-base font-extrabold text-content-primary sm:text-lg">{group.title}</h2>
        <div className="grid gap-2 md:grid-cols-3">{group.items.map(([to, title, description, Icon]) => (
          <Link key={to} to={to === '/missoes' && !user ? '/login' : to} state={to === '/missoes' && !user ? { from: { pathname: to } } : undefined} className="group flex items-start gap-2.5 rounded-2xl border border-edge-subtle bg-surface-raised p-3 transition-colors hover:border-brand/40 hover:bg-surface-subtle">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-brand"><Icon className="h-4 w-4" /></span>
            <span className="min-w-0"><strong className="block text-sm font-extrabold text-content-primary">{title}</strong><span className="mt-0.5 block text-xs leading-snug text-content-secondary">{description}</span></span>
          </Link>
        ))}</div>
      </section>)}
      <Link to={user?.is_ambassador ? '/embaixador' : '/seja-embaixador'} className="mt-6 flex items-center gap-3 rounded-2xl border border-edge-subtle p-4 text-content-primary">
        <ShieldCheck className="h-5 w-5 shrink-0 text-brand" /><span className="flex-1"><strong className="block text-sm font-extrabold">{user?.is_ambassador ? 'Área do embaixador' : 'Ajude sua cidade a participar'}</strong><span className="mt-0.5 block text-xs text-content-secondary">{user?.is_ambassador ? 'Acesse suas cidades e contribuições pendentes.' : 'Conheça o programa de embaixadores.'}</span></span><ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
