import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Instagram, Landmark, Loader2, Mail, MapPin, MessageCircle, Navigation, Pencil, Phone, ShieldCheck, User, UserPlus } from 'lucide-react';

import BackButton from '@/components/BackButton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { autoresDaRua, autoresDoProjeto, chaveDeAutor, normalizarFotos, rotaDoVereador, slugDeVereador, tituloVisivelDoDocumento } from '@/lib/pavementStreetHistory';
import { streetPath } from '@/lib/shareUtils';
import { showAppError, showAppNotice } from '@/lib/appError';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export default function CouncilorProfilePage() {
  const { cityId, slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [councilor, setCouncilor] = useState(null);
  const [streets, setStreets] = useState([]);
  const [cityName, setCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [accountIdentity, setAccountIdentity] = useState(null);
  const [requestStatus, setRequestStatus] = useState(null);
  const [managedPage, setManagedPage] = useState(null);
  const [requestingLink, setRequestingLink] = useState(false);
  const [autoRequestAttempted, setAutoRequestAttempted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [profileResult, streetsResult, cityResult] = await Promise.all([
      supabase.from('councilors').select('*').eq('city_id', cityId).eq('slug', slug).maybeSingle(),
      supabase.from('pavement_streets').select('id, slug, name, city_id, historical_documents, historical_photos, bairro:bairros!pavement_streets_bairro_id_fkey(name)').eq('city_id', cityId),
      supabase.from('cities').select('name, states(uf)').eq('id', cityId).maybeSingle(),
    ]);

    const matchingStreets = (streetsResult.data || []).filter((street) =>
      autoresDaRua(street).some((author) => slugDeVereador(author) === slug)
    );
    const inferredName = matchingStreets.flatMap(autoresDaRua).find((author) => slugDeVereador(author) === slug);
    const profile = profileResult.data || (inferredName ? {
      id: null,
      city_id: Number(cityId),
      name: inferredName,
      normalized_name: chaveDeAutor(inferredName),
      slug,
    } : null);

    setCouncilor(profile);
    setStreets(matchingStreets);
    setCityName(cityResult.data ? `${cityResult.data.name}${cityResult.data.states?.uf ? ` - ${cityResult.data.states.uf}` : ''}` : '');
    if (profile?.id) {
      const { data } = await supabase.rpc('get_councilor_account_identity', { p_councilor_id: profile.id });
      setAccountIdentity(data || null);
      if (user?.id) {
        const [{ data: ownRequest }, { data: existingManagedPage }] = await Promise.all([
          supabase
            .from('councilor_link_requests')
            .select('status')
            .eq('councilor_id', profile.id)
            .eq('requester_id', user.id)
            .maybeSingle(),
          supabase
            .from('councilors')
            .select('id, name, city_id, slug')
            .eq('user_id', user.id)
            .neq('id', profile.id)
            .limit(1)
            .maybeSingle(),
        ]);
        setRequestStatus(ownRequest?.status || null);
        setManagedPage(existingManagedPage || null);
      } else {
        setRequestStatus(null);
        setManagedPage(null);
      }
    } else {
      setAccountIdentity(null);
      setRequestStatus(null);
      setManagedPage(null);
    }
    setLoading(false);
  }, [cityId, slug, user?.id]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = Boolean(user?.is_admin || user?.is_master);
  const hasActiveLink = Boolean(
    councilor?.user_id
    && ['linked', 'verified'].includes(councilor?.claim_status)
  );
  const isOwner = Boolean(
    user?.id
    && councilor?.user_id === user.id
    && ['linked', 'verified'].includes(councilor?.claim_status)
  );
  const canEditPage = Boolean(councilor?.id && (isAdmin || isOwner));
  const managePageHref = isAdmin
    ? `/admin/vereadores?editar=${councilor?.id}`
    : isOwner
      ? `/perfil/pagina-legislativa/${councilor?.id}`
      : null;

  const requestLink = useCallback(async () => {
    const returnLocation = {
      pathname: `/vereadores/${cityId}/${slug}`,
      search: '?solicitar_vinculo=1',
    };
    if (!user) {
      try { sessionStorage.setItem('tc_post_login_redirect', `${returnLocation.pathname}${returnLocation.search}`); } catch {}
      navigate('/cadastro', { state: { from: returnLocation } });
      return;
    }
    if (!councilor?.id || councilor.claim_status !== 'unclaimed' || requestStatus === 'pending' || managedPage) return;

    setRequestingLink(true);
    const { error } = await supabase.rpc('request_councilor_link', { p_councilor_id: councilor.id });
    setRequestingLink(false);
    if (error) {
      showAppError({ title: 'Não foi possível enviar a solicitação', description: `${error.message}. Confira se a migration 247 foi aplicada.`, variant: 'destructive' });
      return;
    }
    setRequestStatus('pending');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('solicitar_vinculo');
    setSearchParams(nextParams, { replace: true });
    showAppNotice({ title: 'Solicitação enviada', description: 'Um administrador vai conferir a identidade antes de liberar a página.' });
  }, [cityId, slug, user, councilor, requestStatus, managedPage, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    if (
      searchParams.get('solicitar_vinculo') === '1'
      && user
      && councilor?.id
      && councilor.claim_status === 'unclaimed'
      && requestStatus !== 'pending'
      && !managedPage
      && !autoRequestAttempted
    ) {
      setAutoRequestAttempted(true);
      requestLink();
    }
  }, [searchParams, user, councilor, requestStatus, managedPage, autoRequestAttempted, requestLink]);

  const socialUrl = useMemo(() => {
    const raw = councilor?.instagram_url || '';
    return raw && !/^https?:\/\//i.test(raw) ? `https://instagram.com/${raw.replace(/^@/, '')}` : raw;
  }, [councilor?.instagram_url]);

  const streetActivities = useMemo(() => {
    const councilorKey = chaveDeAutor(councilor?.name);
    return streets.map((street) => {
      const project = (street.historical_documents || []).find((document) =>
        autoresDoProjeto(document).some((author) => chaveDeAutor(author) === councilorKey)
      );
      const honoreePhoto = normalizarFotos(street).find((photo) => photo.subject === 'honoree');
      return { ...street, honoreePhoto, projectTitle: project ? tituloVisivelDoDocumento(project) : 'Projeto de denominação' };
    });
  }, [streets, councilor?.name]);

  const councilorFirstName = String(councilor?.name || '').trim().split(/\s+/)[0] || 'vereador';

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  if (!councilor) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <User className="mx-auto h-10 w-10 text-content-tertiary" />
      <h1 className="mt-3 text-2xl font-extrabold">Vereador não encontrado</h1>
      <Button asChild variant="outline" className="mt-5"><Link to="/mapa-pavimentacao">Voltar ao mapa de ruas</Link></Button>
    </div>
  );

  const profilePhoto = councilor.photo_url || accountIdentity?.profile?.avatar_url;
  const linkedProfile = accountIdentity?.profile || null;
  const initials = councilor.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const hasPublicContacts = Boolean(hasActiveLink && (councilor.phone || councilor.email || socialUrl));

  return (
    <div className="min-h-screen bg-surface-subtle pb-16">
      <Helmet>
        <title>{councilor.name} — Ruas e projetos | Trombone Cidadão</title>
        <meta name="description" content={`${councilor.name} aparece como autor de ${streets.length} projetos de denominação de ruas em ${cityName}.`} />
      </Helmet>

      <main className="mx-auto w-full max-w-[112rem] px-3 py-2 sm:px-5 sm:py-6 lg:px-8">
        <div className="mb-3 hidden sm:block"><BackButton paraOnde="/mapa-pavimentacao" /></div>

        <section className="relative overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
          <Landmark className="pointer-events-none absolute -bottom-7 right-0 h-44 w-44 text-brand/[0.035] sm:h-56 sm:w-56" />
          <div className="relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:p-6 lg:grid-cols-[7rem_minmax(0,1fr)_auto] lg:items-center">
            {profilePhoto ? (
              <img src={profilePhoto} alt={councilor.name} className="h-[5.5rem] w-[5.5rem] rounded-2xl object-cover shadow-sm sm:h-28 sm:w-28" />
            ) : (
              <span className="flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-2xl bg-brand text-2xl font-black text-content-onBrand sm:h-28 sm:w-28">{initials}</span>
            )}

            <div className="min-w-0 self-center">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">Perfil legislativo</p>
                {councilor.claim_status === 'verified' && <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold text-success-fg"><ShieldCheck className="h-3 w-3" /> Verificado</span>}
              </div>
              <h1 className="mt-1 break-words text-2xl font-black leading-tight tracking-tight text-content-primary sm:text-3xl">{councilor.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-secondary sm:text-sm">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-brand" /> {cityName}</span>
                {councilor.party && <><span>•</span><strong className="text-content-primary">{councilor.party}</strong></>}
              </div>
              {accountIdentity?.profile?.username && <Link to={`/u/${accountIdentity.profile.username}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">@{accountIdentity.profile.username} <ArrowRight className="h-3 w-3" /></Link>}
            </div>

            <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-1 lg:max-w-[17rem] lg:justify-end">
              {canEditPage && managePageHref && <Button asChild variant="outline" size="sm" className="flex-1 gap-2 rounded-full bg-surface-raised lg:flex-none"><Link to={managePageHref}><Pencil className="h-4 w-4" /> Editar perfil</Link></Button>}
              {councilor.id && councilor.claim_status === 'unclaimed' && !isAdmin && managedPage && <Button asChild variant="outline" size="sm" className="h-auto flex-1 gap-2 rounded-full border-success-border bg-success-bg py-2 text-success-fg"><Link to={rotaDoVereador(managedPage.city_id, managedPage.slug)}><ShieldCheck className="h-4 w-4" /> Você já gerencia uma página</Link></Button>}
            </div>
          </div>

          <div className="relative border-t border-edge-subtle bg-surface-base/75 px-4 py-3 text-center sm:px-6">
            <Navigation className="mx-auto h-4 w-4 text-success-fg" />
            <strong className="mt-1 block text-lg font-black text-content-primary">{streets.length}</strong>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-content-secondary sm:text-[10px]">Ruas nomeadas</span>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <section id="ruas-nomeadas" className="rounded-3xl border border-edge-subtle bg-surface-raised shadow-sm lg:col-span-8">
            <div className="flex items-center justify-between gap-3 border-b border-edge-subtle px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Building2 className="h-[18px] w-[18px]" /></span><div className="min-w-0"><h2 className="text-sm font-extrabold text-content-primary sm:text-base">Confira as ruas nomeadas por {councilorFirstName}</h2><p className="truncate text-xs text-content-secondary">Projetos de denominação registrados</p></div></div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1 text-xs text-brand"><Link to="/mapa-pavimentacao">Ver mapa <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
            </div>
            <div className="divide-y divide-edge-subtle px-3 sm:px-5">
              {streetActivities.map((street) => (
                <Link key={street.id} to={streetPath(street)} className="group flex min-w-0 items-center gap-3 px-1 py-3.5 sm:px-2">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-subtle text-brand">
                    <Navigation className="h-5 w-5" />
                    {street.honoreePhoto?.url && (
                      <img
                        src={street.honoreePhoto.url}
                        alt={street.honoreePhoto.caption || `Foto do homenageado de ${street.name}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        onError={(event) => event.currentTarget.remove()}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-content-primary">{street.name}</span><span className="mt-0.5 block truncate text-xs text-content-secondary">{street.projectTitle} · {street.bairro?.name || cityName}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              ))}
              {streetActivities.length === 0 && <div className="py-10 text-center"><Navigation className="mx-auto h-8 w-8 text-content-tertiary" /><p className="mt-2 text-sm text-content-secondary">Nenhuma atuação vinculada até agora.</p></div>}
            </div>
          </section>

          <aside className="grid content-start gap-4 lg:col-span-4">
            <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><User className="h-[18px] w-[18px]" /></span><h2 className="text-base font-extrabold text-content-primary">Sobre</h2></div>
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-content-secondary">{councilor.biography || 'Este perfil foi criado automaticamente a partir dos projetos de lei cadastrados no mapa de ruas. As informações biográficas ainda podem ser complementadas.'}</p>
              {councilor.claim_status === 'unclaimed' && <div className="mt-5 border-t border-edge-subtle pt-4">
                {councilor.claim_status === 'unclaimed' && <p className="rounded-xl bg-surface-subtle px-3 py-2.5 text-xs leading-relaxed text-content-secondary">Página criada a partir do acervo. Nenhuma conta responsável foi vinculada.</p>}
              </div>}
            </section>

            {hasActiveLink && (
              <section className="rounded-3xl border border-success-border/70 bg-surface-raised p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success-fg"><ShieldCheck className="h-5 w-5" /></span>
                    <div>
                      <h2 className="text-base font-extrabold text-content-primary">Conta responsável</h2>
                      <p className="text-xs text-content-secondary">Vínculo ativo com esta página</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-success-bg px-2.5 py-1 text-[10px] font-extrabold text-success-fg">
                    {councilor.claim_status === 'verified' ? 'Verificado' : 'Vinculado'}
                  </span>
                </div>

                {linkedProfile ? (
                  <div className="mt-4 rounded-2xl border border-edge-subtle bg-surface-subtle/50 p-3">
                    <div className="flex items-center gap-3">
                      {linkedProfile.avatar_url ? (
                        <img src={linkedProfile.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-content-onBrand">{String(linkedProfile.name || councilor.name).charAt(0).toUpperCase()}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-content-primary">{linkedProfile.name}</p>
                        <p className="truncate text-xs text-content-secondary">@{linkedProfile.username}</p>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-2 rounded-xl bg-surface-raised">
                      <Link to={`/u/${linkedProfile.username}`}>Ver perfil público <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-surface-subtle px-3 py-2.5 text-xs leading-relaxed text-content-secondary">A página possui uma conta responsável, mas ela ainda não disponibilizou um perfil público.</p>
                )}

                <p className="mt-3 text-[11px] leading-4 text-content-tertiary">Biografia e canais desta página são mantidos pela conta vinculada. Os registros legislativos continuam baseados no acervo público.</p>
              </section>
            )}

            {hasPublicContacts && <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-status-pendingBg text-status-pendingFg"><MessageCircle className="h-[18px] w-[18px]" /></span><div><h2 className="text-base font-extrabold text-content-primary">Canais públicos</h2><p className="text-xs text-content-secondary">Informados pelo responsável</p></div></div>
              <div className="mt-4 grid gap-2 text-sm">
                {councilor.phone && <a className="flex items-center gap-3 rounded-xl border border-edge-subtle px-3 py-3 text-content-secondary hover:border-brand/30 hover:text-brand" href={`tel:${councilor.phone}`}><Phone className="h-4 w-4" /><span className="truncate">{councilor.phone}</span></a>}
                {councilor.email && <a className="flex items-center gap-3 rounded-xl border border-edge-subtle px-3 py-3 text-content-secondary hover:border-brand/30 hover:text-brand" href={`mailto:${councilor.email}`}><Mail className="h-4 w-4" /><span className="truncate">{councilor.email}</span></a>}
                {socialUrl && <a className="flex items-center gap-3 rounded-xl border border-edge-subtle px-3 py-3 text-content-secondary hover:border-brand/30 hover:text-brand" href={socialUrl} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4" /> Instagram <ArrowRight className="ml-auto h-4 w-4" /></a>}
              </div>
            </section>}

            {councilor.id && councilor.claim_status === 'unclaimed' && !isAdmin && !managedPage && (
              <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-4 text-center shadow-sm sm:p-5">
                <p className="text-xs leading-relaxed text-content-secondary">Você é este vereador ou representa o gabinete?</p>
                <Button size="sm" variant="ghost" className="mt-2 gap-2 rounded-full text-brand" disabled={requestStatus === 'pending' || requestingLink} onClick={requestLink}>
                  {requestingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : requestStatus === 'pending' ? <CheckCircle2 className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {requestingLink ? 'Enviando...' : requestStatus === 'pending' ? 'Reivindicação enviada' : requestStatus === 'rejected' ? 'Reenviar reivindicação' : 'Reivindicar perfil'}
                </Button>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
