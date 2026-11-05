import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, Bookmark, Briefcase, Building, Check, Compass, Construction, FileSignature, LayoutGrid, Megaphone, Newspaper, Radio, Route, Search, ShieldCheck, Sprout, Trees, X } from 'lucide-react';
import CitySelector from '@/components/CitySelector';
import ActionCard from '@/components/journeys/ActionCard';
import { useCity } from '@/contexts/CityContext';
import { useCityEvents } from '@/hooks/useCityEvents';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const journeys = [
  { id: 'resolver', title: 'Resolver um problema', description: 'Registre, apoie e acompanhe.', icon: Megaphone, actions: [
    { to: '/mapa?criar_bronca=1', title: 'Registrar uma bronca', description: 'Mostre o problema e onde ele acontece.', icon: Megaphone, keywords: 'denunciar reportar poste iluminação esgoto buraco' },
    { to: '/mapa', title: 'Ver broncas da comunidade', description: 'Encontre um relato e some seu apoio.', icon: Bookmark, keywords: 'mapa problemas apoiar' },
    { to: '/seguindo', title: 'Acompanhar minhas causas', description: 'Reencontre o que você salvou e veja novidades.', icon: Compass, keywords: 'salvos favoritos pessoas seguindo atualizações' },
    { to: '/abaixo-assinados', title: 'Apoiar um abaixo-assinado', description: 'Participe de uma causa da cidade.', icon: FileSignature, keywords: 'petição assinatura' },
  ] },
  { id: 'cuidar', title: 'Cuidar da cidade', description: 'Faça parte de uma mudança.', icon: Sprout, actions: [
    { to: '/adoteumaarvore', title: 'Pedir uma muda ou plantio', description: 'Conheça as opções para adotar uma árvore.', icon: Sprout, keywords: 'adoção adote árvore plantar viveiro fornecedor' },
    { to: '/arvores-da-comunidade', title: 'Árvores da comunidade', description: 'Cadastre sua árvore e registre os cuidados.', icon: Trees, keywords: 'minhas árvores regar diário cuidar foto' },
    { to: '/mapa-arborizacao', title: 'Consultar as árvores da cidade', description: 'Explore o mapa da arborização urbana.', icon: Trees, keywords: 'inventário espécie poda' },
    { to: '/missoes', title: 'Encontrar uma missão', description: 'Escolha uma forma de ajudar.', icon: Compass, keywords: 'patrulha rota coleção', requiresAuth: true },
  ] },
  { id: 'informacoes', title: 'Encontrar informações', description: 'O que você precisa, mais perto.', icon: Search, actions: [
    { to: '/guia-da-cidade', title: 'Guia da cidade', description: 'Encontre comércio, serviços e transporte.', icon: Briefcase, keywords: 'turismo telefone horário contato endereço ônibus' },
    { to: '/obras-publicas', title: 'Obras públicas', description: 'Veja o andamento das obras.', icon: Construction, keywords: 'construção reforma' },
    { to: '/mapa-pavimentacao', title: 'Ruas e pavimentação', description: 'Consulte a situação das ruas.', icon: Route, keywords: 'asfalto calçamento' },
    { to: '/agora', title: 'Radar da cidade', description: 'Acompanhe acontecimentos e avisos locais.', icon: Radio, keywords: 'alerta água energia trânsito evento agora' },
    { to: '/noticias', title: 'Notícias', description: 'Leia as novidades da cidade.', icon: Newspaper, keywords: 'jornal informação' },
    { to: '/imoveis-alugados', title: 'Imóveis públicos alugados', description: 'Consulte os imóveis e contratos públicos.', icon: Building, keywords: 'aluguel contrato prefeitura' },
    { to: '/estatisticas', title: 'Indicadores da cidade', description: 'Veja a participação e os resultados.', icon: BarChart3, keywords: 'estatísticas números dados' },
  ] },
];

const searchable = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export default function ExplorePage() {
  const { activeCityId } = useCity();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const selected = journeys.find(item => item.id === params.get('jornada')) || journeys[0];
  const showAll = params.get('todas') === '1';
  const radar = useCityEvents(activeCityId, { limite: 1, escopo: 'abertos' });
  const results = useMemo(() => {
    const actions = search.trim() || showAll ? journeys.flatMap(item => item.actions) : selected.actions;
    const words = searchable(search.trim()).split(/\s+/).filter(Boolean);
    return actions.filter(action => words.every(word => searchable([action.title, action.description, action.keywords].join(' ')).includes(word)));
  }, [search, selected, showAll]);
  const updateSearch = value => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set('q', value); else next.delete('q'); return next; }, { replace: true });
  const selectJourney = id => setParams(previous => { const next = new URLSearchParams(previous); next.set('jornada', id); next.delete('q'); next.delete('todas'); return next; });
  const toggleAll = () => setParams(previous => { const next = new URLSearchParams(previous); if (showAll) next.delete('todas'); else next.set('todas', '1'); next.delete('q'); return next; });

  return (
    <div className="page-shell-fluid min-w-0 space-y-6 py-5 sm:py-7" data-testid="explore-journeys">
      <Helmet><title>Explorar — Trombone Cidadão</title></Helmet>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-brand">Explore sua cidade</p><h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-content-primary sm:text-3xl">O que você quer fazer?</h1><p className="mt-2 text-sm leading-6 text-content-secondary">Escolha um caminho. A gente ajuda no próximo passo.</p></div>
        <CitySelector scope="global" />
      </header>

      <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised px-4 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
        <Search className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
        <label htmlFor="explore-function-search" className="sr-only">Buscar uma função</label>
        <input id="explore-function-search" type="search" value={search} onChange={event => updateSearch(event.target.value)} placeholder="Busque por árvore, rua, serviço…" className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-content-primary outline-none placeholder:text-content-tertiary [&::-webkit-search-cancel-button]:appearance-none" />
        {search && <button type="button" onClick={() => updateSearch('')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Limpar busca"><X className="h-4 w-4" /></button>}
      </div>

      <section aria-label="Escolha seu objetivo" className="grid gap-2 md:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6rem), 1fr))' }}>
        {journeys.map(({ id, title, description, icon: Icon }) => {
          const active = !showAll && !search.trim() && selected.id === id;
          return <button key={id} type="button" aria-pressed={active} aria-controls="explore-actions" onClick={() => selectJourney(id)} className={`relative flex min-h-32 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 md:min-h-24 md:flex-row md:justify-start md:gap-3 md:p-4 md:text-left ${active ? 'border-brand/40 bg-brand-subtleBg' : 'border-edge-subtle bg-surface-raised hover:border-brand/30 hover:bg-surface-subtle'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-brand text-content-onBrand' : 'bg-surface-subtle text-brand'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 break-words md:flex-1"><span className="block text-sm font-bold leading-5 text-content-primary md:text-base">{title}</span><span className="mt-1 hidden text-sm leading-5 text-content-secondary md:block">{description}</span></span>
            {active && <Check className="absolute right-2 top-2 h-3.5 w-3.5 shrink-0 text-brand md:static md:h-4 md:w-4" aria-hidden="true" />}
          </button>;
        })}
      </section>

      <section id="explore-actions" aria-labelledby="explore-actions-title" className="rounded-3xl border border-edge-subtle bg-surface-subtle/50 p-4 sm:p-6">
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1"><h2 id="explore-actions-title" className="text-base font-bold text-content-primary sm:text-lg">{search.trim() ? 'Resultados da busca' : showAll ? 'Todas as funções' : selected.title}</h2><p className={search.trim() ? 'mt-1 text-sm text-content-secondary' : 'sr-only'} role="status">{search.trim() ? `${results.length} ${results.length === 1 ? 'opção encontrada' : 'opções encontradas'}` : 'Escolha por onde começar.'}</p></div>
          <button type="button" onClick={toggleAll} aria-label={showAll ? 'Voltar aos objetivos' : 'Ver todas as funções'} aria-expanded={showAll} aria-controls="explore-actions" className="inline-flex min-h-12 max-w-[50%] items-center gap-2 rounded-xl px-2 text-sm font-semibold text-brand hover:bg-brand-subtleBg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><LayoutGrid className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{showAll ? 'Ver objetivos' : <><span className="sm:hidden">Ver todas</span><span className="hidden sm:inline">Ver todas as funções</span></>}</span></button>
        </div>
        {results.length ? <div className="grid gap-3 lg:grid-cols-2 3xl:grid-cols-3">{results.map((action, index) => <ActionCard key={action.to} {...action} primary={!search.trim() && !showAll && index === 0} to={action.requiresAuth && !user ? '/login' : action.to} state={action.requiresAuth && !user ? { from: { pathname: action.to } } : undefined} />)}</div>
          : <div className="rounded-2xl border border-dashed border-edge-default bg-surface-raised px-5 py-8 text-center"><Search className="mx-auto h-7 w-7 text-content-tertiary" aria-hidden="true" /><h3 className="mt-3 text-base font-bold text-content-primary">Nenhuma função encontrada</h3><p className="mt-2 text-sm text-content-secondary">Tente outro termo ou escolha um dos objetivos acima.</p><button type="button" onClick={() => updateSearch('')} className="mt-4 min-h-12 rounded-xl px-4 text-sm font-semibold text-brand hover:bg-brand-subtleBg">Limpar busca</button></div>}
      </section>

      <footer className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-edge-subtle pt-3">
        {!radar.carregando && !radar.erro && radar.eventos?.length > 0 && <Link to="/agora" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-content-secondary hover:text-brand"><Radio className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />Acontecendo agora<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>}
        <Link to={user?.is_ambassador ? '/embaixador' : '/seja-embaixador'} className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-content-secondary hover:text-brand"><ShieldCheck className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{user?.is_ambassador ? 'Minha área de embaixador' : 'Conheça o programa de embaixadores'}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
