import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, Users } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SectionPageHeader from '@/components/SectionPageHeader';
import SavedReports from '@/components/SavedReports';
import FollowingPeople from '@/components/FollowingPeople';
import PersonalUpdates from '@/components/PersonalUpdates';

export default function FollowingActivityPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'pessoas' ? 'pessoas' : 'broncas';
  const changeTab = value => setParams(previous => { const next = new URLSearchParams(previous); next.set('aba', value); return next; });
  return <div className="mx-auto w-full min-w-0 max-w-[100rem] overflow-x-hidden px-3 py-5 sm:px-5 lg:px-6 lg:py-6">
    <Helmet><title>Acompanhando — Trombone Cidadão</title></Helmet>
    <div className="mx-auto w-full min-w-0 max-w-5xl">
    <SectionPageHeader title="Acompanhando" description="Reencontre broncas salvas e veja as publicações das pessoas que você segue." />
    {loading ? <p role="status" className="text-sm text-content-secondary">Carregando…</p>
      : !user ? <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-6 text-center sm:p-10"><Bookmark className="mx-auto h-9 w-9 text-brand" /><h2 className="mt-4 text-xl font-bold text-content-primary">Tenha suas causas por perto</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-secondary">Entre para salvar broncas e seguir pessoas da comunidade. Você pode continuar explorando a cidade sem uma conta.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild><Link to="/login" state={{ from: { pathname: '/seguindo', search: `?aba=${tab}` } }}>Entrar para acompanhar</Link></Button><Button asChild variant="outline"><Link to="/explorar">Explorar a cidade</Link></Button></div></section>
      : <>
        <PersonalUpdates />
        <Tabs value={tab} onValueChange={changeTab} className="w-full min-w-0">
          <TabsList className="mb-5 grid h-auto min-w-0 w-full max-w-full grid-cols-2 rounded-xl bg-surface-sunken p-1">
            <TabsTrigger value="broncas" className="min-h-11 gap-2 rounded-lg text-sm"><Bookmark className="h-4 w-4" />Broncas salvas</TabsTrigger>
            <TabsTrigger value="pessoas" className="min-h-11 gap-2 rounded-lg text-sm"><Users className="h-4 w-4" />Pessoas</TabsTrigger>
          </TabsList>
          <TabsContent value="broncas" className="min-w-0 w-full max-w-full"><SavedReports /></TabsContent>
          <TabsContent value="pessoas" className="min-w-0 w-full max-w-full"><FollowingPeople /></TabsContent>
        </Tabs>
        <Link to="/salvos-outros" className="mt-6 flex min-h-11 items-center justify-center rounded-xl border border-edge-subtle px-4 text-sm font-semibold text-content-secondary hover:text-brand">Ver obras e notícias salvas →</Link>
      </>}
    </div>
  </div>;
}
