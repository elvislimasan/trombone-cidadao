import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Bookmark, Users, ArrowUpRight, User, MapPin, Newspaper } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SavedReports from '@/components/SavedReports';
import FollowingPeople from '@/components/FollowingPeople';
import PersonalUpdates from '@/components/PersonalUpdates';

export default function FollowingActivityPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = ['broncas', 'pessoas'].includes(params.get('aba')) ? params.get('aba') : 'novidades';
  const changeTab = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('aba', value); return next; });
  return <main className="page-shell-fluid following-page">
    <Helmet><title>Acompanhando — Trombone Cidadão</title></Helmet>
    <header className="personal-page-heading"><span className="personal-eyebrow">Sua comunidade por perto</span><h1>Acompanhando</h1><p>Veja o que mudou, reencontre broncas salvas e acompanhe pessoas.</p></header>
    {loading ? <p role="status" className="personal-list-state">Carregando sua conta…</p>
      : !user ? <section className="personal-list-state personal-guest"><span className="personal-empty-icon"><Bookmark size={28} aria-hidden="true" /></span><h2>Tenha suas causas por perto</h2><p>Entre para salvar broncas e acompanhar sua comunidade.</p><div className="flex flex-wrap justify-center gap-3"><Button asChild className="min-h-12"><Link to="/login" state={{ from: { pathname: '/seguindo', search: `?${params.toString()}` } }}>Entrar para acompanhar</Link></Button><Button asChild variant="outline" className="min-h-12"><Link to="/explorar">Explorar a cidade</Link></Button></div></section>
        : <div className="following-layout">
          <Tabs value={tab} onValueChange={changeTab} className="min-w-0" key={user.id}>
            <TabsList aria-label="Conteúdo acompanhado" className="personal-following-tabs">
              <TabsTrigger value="novidades"><Bell size={17} aria-hidden="true" />Novidades</TabsTrigger>
              <TabsTrigger value="broncas"><Bookmark size={17} aria-hidden="true" />Salvas</TabsTrigger>
              <TabsTrigger value="pessoas"><Users size={17} aria-hidden="true" />Pessoas</TabsTrigger>
            </TabsList>
            <TabsContent value="novidades"><PersonalUpdates /></TabsContent>
            <TabsContent value="broncas"><div className="personal-panel-intro"><h2>Broncas salvas</h2><p>Relatos que você guardou para consultar o andamento.</p></div><SavedReports /></TabsContent>
            <TabsContent value="pessoas"><FollowingPeople /></TabsContent>
          </Tabs>
          <aside className="following-sidebar" aria-label="Outros caminhos">
            <h2>Continue por aqui</h2>
            {[
              { to: '/perfil', title: 'Minhas participações', description: 'Broncas, árvores e pedidos', Icon: User },
              { to: '/salvos-outros', title: 'Outros itens salvos', description: 'Obras e notícias guardadas', Icon: Newspaper },
              { to: '/mapa', title: 'Explorar o mapa', description: 'Veja os relatos na cidade', Icon: MapPin },
            ].map(({ to, title, description, Icon }) => <Link to={to} key={to}><span className="personal-journey-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}
          </aside>
        </div>}
  </main>;
}
