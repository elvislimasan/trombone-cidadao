import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Check, X, MapPin, FileText, Megaphone, Loader2, ShieldCheck, Eye, Image as ImageIcon, Route, Building, Briefcase, Settings, ChevronDown, Inbox, PartyPopper, LayoutDashboard, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/customSupabaseClient';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { showAppError } from '@/lib/appError';
import UserDashboardPage from '@/pages/UserDashboardPage';

const AmbassadorPage = () => {
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [area, setArea] = useState('gestao');
  const [managementTab, setManagementTab] = useState('cities');

  // Menu "Gerenciar": só os módulos que o usuário pode alterar. Sem nenhum,
  // o menu inteiro some.
  const manageLinks = [
    { module: 'works',    to: '/obras/gerenciar',            Icon: ImageIcon, label: 'Obras públicas' },
    { module: 'pavement', to: '/pavimentacao/gerenciar',     Icon: Route,     label: 'Pavimentação' },
    { module: 'rentals',  to: '/imoveis-alugados/gerenciar', Icon: Building,  label: 'Imóveis alugados' },
    { module: 'services', to: '/servicos/gerenciar',         Icon: Briefcase, label: 'Serviços' },
  ].filter((l) => canWrite(l.module));
  const navigate = useNavigate();
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(
    user ? user.has_seen_ambassador_onboarding === false : false
  );

  // State for "Minhas Cidades"
  const [myCities, setMyCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // State for "Broncas pendentes"
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // State for "Atualizações pendentes"
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  // State for "Mídias de Obra pendentes"
  const [pendingWorkMedia, setPendingWorkMedia] = useState([]);
  const [loadingWorkMedia, setLoadingWorkMedia] = useState(true);

  // Access guard
  const canAccess = user && (user.is_ambassador || user.is_master || user.is_admin);

  const fetchMyCities = useCallback(async () => {
    if (!user?.id) {
      setMyCities([]);
      setLoadingCities(false);
      return;
    }
    setLoadingCities(true);
    const { data, error } = await supabase
      .from('ambassador_cities')
      .select('id, city_id, status, cities(id, name, state_id, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (error) {
      showAppError({ title: 'Erro ao buscar cidades', description: error.message, variant: 'destructive' });
    } else {
      setMyCities(data || []);
    }
    setLoadingCities(false);
  }, [user?.id]);

  const fetchPendingReports = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingReports([]);
      setLoadingReports(false);
      return;
    }
    setLoadingReports(true);
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, category_id, created_at, moderation_status, city_id, category:category_id(name)')
      .in('city_id', cityIds)
      .eq('moderation_status', 'pending_approval')
      // Sinal aberto usa 'pending_approval' para ficar FORA do feed, não para
      // pedir aprovação: ele não tem foto nem descrição para julgar — é uma
      // missão esperando alguém ir ao local.
      //
      // Sem este filtro os dois sentidos colidiam: o que mantinha o sinal
      // escondido era o que o colocava aqui, e aprovar publicava no feed uma
      // linha vazia. Foi o que aconteceu antes da migração 175, que agora
      // impede pelo banco.
      .or('signal_status.is.null,signal_status.in.(done,empty)')
      .order('created_at', { ascending: true });

    if (error) {
      showAppError({ title: 'Erro ao buscar broncas', description: error.message, variant: 'destructive' });
    } else {
      setPendingReports(data || []);
    }
    setLoadingReports(false);
  }, []);

  const fetchPendingUpdates = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingUpdates([]);
      setLoadingUpdates(false);
      return;
    }
    setLoadingUpdates(true);
    // Get report_updates where the parent report is in my cities
    const { data, error } = await supabase
      .from('report_updates')
      .select(
        'id, report_id, update_type, message, status, created_at, ' +
        'author:profiles!report_updates_author_id_fkey(name), ' +
        'report:reports!report_updates_report_id_fkey(id, title, city_id)'
      )
      .eq('status', 'pending_moderation')
      .order('created_at', { ascending: true });

    if (error) {
      showAppError({ title: 'Erro ao buscar atualizações', description: error.message, variant: 'destructive' });
    } else {
      // Filter client-side by city
      const cityIdSet = new Set(cityIds);
      const filtered = (data || []).filter(u => u.report && cityIdSet.has(u.report.city_id));
      setPendingUpdates(filtered);
    }
    setLoadingUpdates(false);
  }, []);

  const fetchPendingWorkMedia = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingWorkMedia([]);
      setLoadingWorkMedia(false);
      return;
    }
    setLoadingWorkMedia(true);
    // Get public_work_media where the parent work is in my cities
    const { data, error } = await supabase
      .from('public_work_media')
      .select(
        'id, url, type, status, created_at, contributor_id, work_id, ' +
        'work:public_works(id, title, city_id), ' +
        'contributor:profiles!contributor_id(name)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      showAppError({ title: 'Erro ao buscar mídias de obra', description: error.message, variant: 'destructive' });
    } else {
      // Filter client-side by city
      const cityIdSet = new Set(cityIds);
      const filtered = (data || []).filter(m => cityIdSet.has(m.work?.city_id));
      setPendingWorkMedia(filtered);
    }
    setLoadingWorkMedia(false);
  }, []);

  useEffect(() => {
    if (canAccess) fetchMyCities();
  }, [canAccess, fetchMyCities]);

  useEffect(() => {
    if (canAccess && !loadingCities) {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
      fetchPendingUpdates(cityIds);
      fetchPendingWorkMedia(cityIds);
    }
  }, [canAccess, myCities, loadingCities, fetchPendingReports, fetchPendingUpdates, fetchPendingWorkMedia]);

  const handleReportAction = async (reportId, newStatus) => {
    setActionLoadingId(`report-${reportId}-${newStatus}`);
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: newStatus, ...(newStatus === 'approved' ? { status: 'pending' } : {}) })
      .eq('id', reportId);

    if (error) {
      showAppError({ title: 'Erro ao processar bronca', description: error.message, variant: 'destructive' });
    } else {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
    }
    setActionLoadingId(null);
  };

  const handleUpdateAction = async (updateId, newStatus) => {
    setActionLoadingId(`update-${updateId}-${newStatus}`);
    const { error } = await supabase
      .from('report_updates')
      .update({ status: newStatus === 'approved' ? 'pending' : 'rejected' })
      .eq('id', updateId);

    if (error) {
      showAppError({ title: 'Erro ao processar atualização', description: error.message, variant: 'destructive' });
    } else {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingUpdates(cityIds);
    }
    setActionLoadingId(null);
  };

  const handleWorkMediaAction = async (item, newStatus) => {
    setActionLoadingId(`wm-${item.id}-${newStatus}`);
    try {
      if (newStatus === 'approved') {
        const { error } = await supabase.from('public_work_media')
          .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_comment: null })
          .eq('id', item.id);
        if (error) throw error;
      } else {
        if (item.contributor_id) {
          // best-effort: se a RLS de notifications bloquear o embaixador,
          // não impedir a rejeição da mídia.
          try {
            await supabase.from('notifications').insert({
              user_id: item.contributor_id,
              type: 'work_media_rejected',
              message: `A mídia enviada para a obra "${item.work?.title || 'desconhecida'}" não foi aprovada.`,
              work_id: item.work_id,
              is_read: false,
            });
          } catch (notifErr) {
            console.error('Falha ao notificar rejeição de mídia:', notifErr);
          }
        }
        const { error: delErr } = await supabase.from('public_work_media').delete().eq('id', item.id);
        if (delErr) throw delErr;
        try {
          const url = new URL(item.url);
          const parts = url.pathname.split('/work-media/');
          const storagePath = parts[1];
          if (storagePath) await supabase.storage.from('work-media').remove([decodeURIComponent(storagePath)]);
        } catch (_) {}
      }
      const cityIds = myCities.map((c) => c.city_id);
      fetchPendingWorkMedia(cityIds);
    } catch (err) {
      showAppError({ title: 'Erro ao moderar mídia', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const UPDATE_TYPE_LABELS = {
    still_here: 'O problema ainda está aqui',
    being_solved: 'O problema está sendo resolvido',
    solved: 'O problema foi resolvido',
  };

  const getCityNameById = (cityId) => {
    const found = myCities.find(c => c.city_id === cityId);
    if (!found) return '';
    const city = found.cities;
    return city ? `${city.name} - ${city.states?.uf || ''}` : '';
  };

  const totalPending = pendingReports.length + pendingUpdates.length + pendingWorkMedia.length;
  const managementSections = [
    { value: 'cities', label: 'Minhas cidades', mobileLabel: 'Cidades', Icon: MapPin, count: myCities.length },
    { value: 'reports', label: 'Broncas pendentes', mobileLabel: 'Broncas', Icon: FileText, count: pendingReports.length },
    { value: 'updates', label: 'Atualizações pendentes', mobileLabel: 'Atualizações', Icon: Megaphone, count: pendingUpdates.length },
    { value: 'work-media', label: 'Mídias de obra', mobileLabel: 'Mídias', Icon: ImageIcon, count: pendingWorkMedia.length },
  ];

  const pendingByCity = (cityId) => ({
    reports: pendingReports.filter((item) => item.city_id === cityId).length,
    updates: pendingUpdates.filter((item) => item.report?.city_id === cityId).length,
    workMedia: pendingWorkMedia.filter((item) => item.work?.city_id === cityId).length,
  });

  const handleDismissOnboarding = async () => {
    setShowOnboardingBanner(false);
    await supabase
      .from('profiles')
      .update({ has_seen_ambassador_onboarding: true })
      .eq('id', user.id);
  };

  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Helmet>
        <title>Painel do Embaixador - Trombone Cidadão</title>
        <meta name="description" content="Painel do embaixador para moderar broncas e atualizações da sua cidade." />
      </Helmet>

      <div className="mx-auto w-full max-w-[100rem] px-3 py-6 sm:px-5 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl bg-gradient-to-r from-[#171717] via-[#26070b] to-[#7f1220] p-5 text-white shadow-elevation-2 md:p-6"
        >
          <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Central do embaixador</p>
                <h1 className="mt-1 text-xl font-extrabold md:text-2xl">Cuide da participação nas suas cidades</h1>
                <p className="mt-1.5 max-w-2xl text-sm text-white/70">Modere contribuições, acompanhe pendências e gerencie os módulos sob sua responsabilidade.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-xl tabular-nums">{loadingCities ? '—' : myCities.length}</strong><span className="text-[10px] text-white/60">cidades</span></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-xl tabular-nums">{loadingReports || loadingUpdates || loadingWorkMedia ? '—' : totalPending}</strong><span className="text-[10px] text-white/60">pendências</span></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><strong className="block text-xl tabular-nums">{manageLinks.length}</strong><span className="text-[10px] text-white/60">módulos</span></div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            {totalPending > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold"><Inbox className="h-4 w-4 text-amber-300" /> {totalPending} {totalPending === 1 ? 'item aguardando' : 'itens aguardando'} moderação</span>
            ) : !loadingReports && !loadingUpdates && !loadingWorkMedia ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold"><PartyPopper className="h-4 w-4 text-amber-300" /> Tudo em dia</span>
            ) : null}

            {manageLinks.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-auto gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <Settings className="h-4 w-4" /> Gerenciar <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {manageLinks.map(({ to, Icon, label }) => (
                    <DropdownMenuItem asChild key={to}>
                      <Link to={to} className="cursor-pointer gap-2"><Icon className="h-4 w-4" /> {label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </motion.div>

        <Tabs value={area} onValueChange={setArea} className="mt-5">
          <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 rounded-xl bg-surface-sunken p-1">
            <TabsTrigger value="gestao" className="gap-2 rounded-lg py-2.5"><ShieldCheck className="h-4 w-4" /> Gestão das cidades</TabsTrigger>
            <TabsTrigger value="atividade" className="gap-2 rounded-lg py-2.5"><LayoutDashboard className="h-4 w-4" /> Minha atividade</TabsTrigger>
          </TabsList>

          <TabsContent value="gestao" className="mt-5">

        {showOnboardingBanner && (
          <Card className="mb-6 border-tc-red/30 bg-tc-red/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-tc-red shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-foreground">
                Bem-vindo ao seu painel! Em <strong>Minhas Cidades</strong> você vê onde atua;
                em <strong>Broncas Pendentes</strong> e <strong>Atualizações Pendentes</strong> você
                aprova ou rejeita o que chega da sua cidade. Ações de cadastro (obras, pavimentação,
                imóveis, serviços) ficam no menu <strong>Gerenciar</strong>, no topo.
              </p>
              <button
                type="button"
                onClick={handleDismissOnboarding}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </CardContent>
          </Card>
        )}

        <Tabs value={managementTab} onValueChange={setManagementTab} className="w-full lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          <aside className="mb-5 min-w-0 lg:sticky lg:top-24 lg:mb-0">
            <div className="hidden px-1 pb-3 lg:block">
              <p className="text-xs font-extrabold uppercase tracking-wider text-content-tertiary">Área de trabalho</p>
              <p className="mt-1 text-sm text-content-secondary">Escolha uma fila para revisar.</p>
            </div>
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-surface-sunken p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:items-stretch lg:overflow-visible">
              {managementSections.map(({ value, label, mobileLabel, Icon, count }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="min-w-fit flex-1 justify-start gap-2 rounded-xl px-3 py-2.5 text-xs data-[state=active]:bg-brand data-[state=active]:text-content-onBrand lg:w-full lg:flex-none lg:text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">{mobileLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-surface-raised/80 px-1.5 py-0.5 text-[10px] font-extrabold text-content-secondary">
                    {count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {manageLinks.length > 0 && (
              <div className="mt-3 hidden rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm lg:block">
                <p className="text-xs font-bold text-content-primary">Cadastros e módulos</p>
                <p className="mt-1 text-xs leading-relaxed text-content-tertiary">Acesse as ferramentas que você pode editar.</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-3 w-full justify-between">
                      Gerenciar módulos <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {manageLinks.map(({ to, Icon, label }) => (
                      <DropdownMenuItem asChild key={to}>
                        <Link to={to} className="cursor-pointer gap-2"><Icon className="h-4 w-4" /> {label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </aside>

          {/* ABA: Minhas Cidades */}
          <TabsContent value="cities" className="m-0 min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Cidades sob sua responsabilidade</h2>
                <p className="mt-1 text-sm text-content-secondary">Acompanhe a carga de moderação de cada município.</p>
              </div>
              {!loadingCities && <Badge variant="outline">{myCities.length} {myCities.length === 1 ? 'cidade' : 'cidades'}</Badge>}
            </div>
            {loadingCities ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando cidades...</span>
              </div>
            ) : myCities.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <MapPin className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-muted-foreground">Nenhuma cidade atribuída</p>
                  <p className="text-muted-foreground text-sm">Você ainda não é embaixador ativo de nenhuma cidade.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {myCities.map((ac) => {
                  const city = ac.cities;
                  const cityPending = pendingByCity(ac.city_id);
                  const cityPendingTotal = cityPending.reports + cityPending.updates + cityPending.workMedia;
                  const firstPendingTab = cityPending.reports > 0
                    ? 'reports'
                    : cityPending.updates > 0
                      ? 'updates'
                      : 'work-media';
                  return (
                    <motion.div
                      key={ac.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="h-full overflow-hidden border-edge-subtle bg-surface-raised transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
                        <CardHeader className="border-b border-edge-subtle bg-surface-subtle/50 p-5 pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                              <MapPin className="h-5 w-5" />
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-1 text-[11px] font-bold text-success-fg">
                              <Check className="h-3 w-3" /> Ativo
                            </span>
                          </div>
                          <CardTitle className="pt-3 text-lg">{city?.name || '—'}</CardTitle>
                          <CardDescription>{city?.states?.uf ? `Estado: ${city.states.uf}` : 'Estado desconhecido'}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-5">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'Broncas', value: cityPending.reports },
                              { label: 'Atualiz.', value: cityPending.updates },
                              { label: 'Mídias', value: cityPending.workMedia },
                            ].map(({ label, value }) => (
                              <div key={label} className="rounded-xl bg-surface-subtle px-2 py-2.5">
                                <p className={`text-lg font-extrabold leading-none tabular-nums ${value ? 'text-brand' : 'text-content-tertiary'}`}>{value}</p>
                                <p className="mt-1 text-[10px] font-semibold text-content-tertiary">{label}</p>
                              </div>
                            ))}
                          </div>

                          {cityPendingTotal > 0 ? (
                            <button
                              type="button"
                              onClick={() => setManagementTab(firstPendingTab)}
                              className="mt-4 flex w-full items-center justify-between rounded-xl border border-brand/20 bg-brand-subtleBg px-3 py-2.5 text-left text-xs font-bold text-brand-subtleFg transition-colors hover:bg-brand/15"
                            >
                              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {cityPendingTotal} {cityPendingTotal === 1 ? 'item pendente' : 'itens pendentes'}</span>
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          ) : (
                            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-success-fg"><PartyPopper className="h-4 w-4" /> Moderação em dia</p>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA: Broncas Pendentes */}
          <TabsContent value="reports" className="m-0 min-w-0">
            <div className="mb-4">
              <h2 className="text-xl font-extrabold text-content-primary">Broncas aguardando moderação</h2>
              <p className="mt-1 text-sm text-content-secondary">Revise o conteúdo antes que ele apareça para a cidade.</p>
            </div>
            {loadingReports ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando broncas...</span>
              </div>
            ) : pendingReports.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma bronca pendente!</p>
                  <p className="text-muted-foreground text-sm">Todas as broncas da sua cidade já foram moderadas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingReports.map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="border-border overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch min-h-[90px]">
                          <div className="w-1.5 shrink-0 bg-blue-500" />
                          <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm md:text-base text-foreground truncate">
                                {report.title}
                              </h3>
                              <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                                {report.category?.name && (
                                  <span className="px-2 py-0.5 bg-muted rounded-full">{report.category.name}</span>
                                )}
                                <span>{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                                {report.city_id && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {getCityNameById(report.city_id)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs"
                                onClick={() => navigate(`/bronca/${report.id}`, { state: { moderation: true } })}
                              >
                                <Eye className="w-3 h-3 mr-1" /> Ver
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                disabled={!!actionLoadingId}
                                onClick={() => handleReportAction(report.id, 'rejected')}
                              >
                                {actionLoadingId === `report-${report.id}-rejected` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><X className="w-3 h-3 mr-1" /> Rejeitar</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={!!actionLoadingId}
                                onClick={() => handleReportAction(report.id, 'approved')}
                              >
                                {actionLoadingId === `report-${report.id}-approved` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Check className="w-3 h-3 mr-1" /> Aprovar</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA: Atualizações Pendentes */}
          <TabsContent value="updates" className="m-0 min-w-0">
            <div className="mb-4">
              <h2 className="text-xl font-extrabold text-content-primary">Atualizações aguardando moderação</h2>
              <p className="mt-1 text-sm text-content-secondary">Confira as novidades enviadas pelos cidadãos sobre cada bronca.</p>
            </div>
            {loadingUpdates ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando atualizações...</span>
              </div>
            ) : pendingUpdates.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <Megaphone className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma atualização pendente!</p>
                  <p className="text-muted-foreground text-sm">Todas as atualizações da sua cidade já foram moderadas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingUpdates.map((update) => (
                  <motion.div
                    key={update.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="border-border overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch min-h-[90px]">
                          <div className="w-1.5 shrink-0 bg-orange-500" />
                          <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground mb-0.5">
                                Bronca: <span className="font-medium text-foreground">{update.report?.title || '—'}</span>
                              </p>
                              {update.update_type && (
                                <span className="inline-block text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full mb-1">
                                  {UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                                </span>
                              )}
                              {update.message && (
                                <p className="text-sm text-muted-foreground italic line-clamp-2">"{update.message}"</p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                <span>Por: {update.author?.name || 'Anônimo'}</span>
                                <span>{new Date(update.created_at).toLocaleDateString('pt-BR')}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                disabled={!!actionLoadingId}
                                onClick={() => handleUpdateAction(update.id, 'rejected')}
                              >
                                {actionLoadingId === `update-${update.id}-rejected` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><X className="w-3 h-3 mr-1" /> Rejeitar</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={!!actionLoadingId}
                                onClick={() => handleUpdateAction(update.id, 'approved')}
                              >
                                {actionLoadingId === `update-${update.id}-approved` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Check className="w-3 h-3 mr-1" /> Aprovar</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA: Mídias de Obra Pendentes */}
          <TabsContent value="work-media" className="m-0 min-w-0">
            <div className="mb-4">
              <h2 className="text-xl font-extrabold text-content-primary">Mídias de obras aguardando moderação</h2>
              <p className="mt-1 text-sm text-content-secondary">Avalie fotos e vídeos enviados para documentar o andamento das obras.</p>
            </div>
            {loadingWorkMedia ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando mídias...</span>
              </div>
            ) : pendingWorkMedia.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma mídia pendente!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pendingWorkMedia.map((m) => (
                  <Card key={m.id} className="overflow-hidden">
                    <div className="aspect-video bg-black/5">
                      {m.type === 'video' ? (
                        <video src={m.url} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium truncate">{m.work?.title || 'Obra'}</p>
                      <p className="text-[11px] text-muted-foreground">Por {m.contributor?.name || 'Cidadão'}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-red-600 border-red-300 hover:bg-red-50"
                          disabled={!!actionLoadingId} onClick={() => handleWorkMediaAction(m, 'rejected')}>
                          {actionLoadingId === `wm-${m.id}-rejected` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3 mr-1" /> Rejeitar</>}
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={!!actionLoadingId} onClick={() => handleWorkMediaAction(m, 'approved')}>
                          {actionLoadingId === `wm-${m.id}-approved` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Aprovar</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
          </TabsContent>

          <TabsContent value="atividade" className="mt-6">
            <UserDashboardPage embedded />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default AmbassadorPage;
