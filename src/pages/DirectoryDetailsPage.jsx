import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, MapPin, Phone, Instagram, Building, ShoppingCart, Pencil, Navigation, Clock, Share2, MessageCircle, Route, ExternalLink, ChevronRight, Maximize2 } from 'lucide-react';
import { whatsappNumber } from '@/lib/utils';
import ServicesRankingSidebar from '@/components/ServicesRankingSidebar';
import { showAppError } from '@/lib/appError';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { normalizarInstagram } from '@/lib/externalLinks';
import { guideLocation } from '@/lib/guideLocation';
import { compartilharLink } from '@/lib/shareLink';
import DirectoryEditDialog from '@/components/DirectoryEditDialog';
import DirectoryLocationDialog from '@/components/DirectoryLocationDialog';
import { guideJourneys, guideJourneyTitle, guidePhones } from '@/lib/guideDetails';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const DirectoryDetailsPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [ambassadorCityIds, setAmbassadorCityIds] = useState([]);

  const fetchItem = useCallback(async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('directory')
      .select('*, category:directory_categories(name)')
      .eq('id', id)
      .single();

    if (error) {
      showAppError({
        title: 'Erro ao buscar detalhes',
        description: 'Não foi possível carregar as informações. Tente novamente.',
        variant: 'destructive',
      });
      console.error(error);
    } else {
      let publicItem = data;
      if (!guideLocation(data.location) && data.legacy_source === 'tourist_spots' && data.legacy_source_id) {
        const { data: legacySpot } = await supabase.from('tourist_spots')
          .select('location')
          .eq('id', data.legacy_source_id)
          .maybeSingle();
        if (guideLocation(legacySpot?.location)) publicItem = { ...data, location: legacySpot.location };
      }
      setItem(publicItem);
      if (data.status === 'approved' && data.category_id && data.city_id) {
        const { data: relatedData } = await supabase.from('directory')
          .select('id, name, image_url, address')
          .eq('status', 'approved')
          .eq('city_id', data.city_id)
          .or(`category_id.eq.${data.category_id},category_ids.cs.{${data.category_id}}`)
          .neq('id', data.id)
          .order('name')
          .limit(6);
        setRelated(relatedData || []);
      } else {
        setRelated([]);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  useEffect(() => {
    supabase.rpc('increment_views', { table_name: 'directory', item_id: id });
  }, [id]);

  useEffect(() => {
    supabase.from('directory_categories').select('*').eq('active', true).order('sort_order').order('name')
      .then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (!user?.is_ambassador || user.is_admin || user.is_master) {
      setAmbassadorCityIds([]);
      return;
    }
    supabase.from('ambassador_cities').select('city_id').eq('user_id', user.id).eq('status', 'active')
      .then(({ data }) => setAmbassadorCityIds((data || []).map((row) => row.city_id)));
  }, [user]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  if (!item) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Item não encontrado</h1>
        <p className="text-muted-foreground">O item que você está procurando não existe ou foi removido.</p>
        <Link to="/guia-da-cidade">
          <Button className="mt-4">Voltar ao Guia da Cidade</Button>
        </Link>
      </div>
    );
  }

  const initialPosition = guideLocation(item.location) || guideLocation(item.address);
  const instagramUrl = normalizarInstagram(item.instagram_url);
  const guideMetadata = item.guide_metadata || {};
  const phones = guidePhones(item);
  const journeys = guideJourneys(guideMetadata);
  const directionsUrl = initialPosition
    ? `https://www.google.com/maps/dir/?api=1&destination=${initialPosition.lat},${initialPosition.lng}`
    : item.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.address)}`
      : null;
  const canEdit = Boolean(user && canWrite('services') && (
    user.is_admin || user.is_master ||
    (user.is_ambassador && ambassadorCityIds.some((cityId) => String(cityId) === String(item.city_id)))
  ));
  const backTo = item.category_id
    ? `/guia-da-cidade/categoria/${encodeURIComponent(item.category_id)}?cidade=${item.city_id ?? 'todas'}`
    : `/guia-da-cidade?cidade=${item.city_id ?? 'todas'}`;
  const handleShare = async () => {
    const version = item.updated_at ? `?v=${encodeURIComponent(item.updated_at)}` : '';
    const publicOrigin = /^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://trombonecidadao.com.br';
    const shareUrl = `${publicOrigin}/share/guia/${encodeURIComponent(item.id)}${version}`;
    await compartilharLink({ title: item.name, text: `${item.name} no Guia da Cidade`, url: shareUrl });
  };
  const canonicalUrl = `https://trombonecidadao.com.br/guia-da-cidade/guia/${encodeURIComponent(item.id)}`;
  const socialImage = item.image_url || guideMetadata.secondary_image_url || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/site-media/shared/thumbnail.jpg`;

  return (
    <>
      <Helmet>
        <title>{`${item.name} - Guia da Cidade`}</title>
        <meta name="description" content={`Detalhes sobre ${item.name}: ${item.address}`} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${item.name} - Guia da Cidade`} />
        <meta property="og:description" content={`Detalhes sobre ${item.name}: ${item.address}`} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={socialImage} />
        <meta property="og:image:alt" content={item.name} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${item.name} - Guia da Cidade`} />
        <meta name="twitter:description" content={`Detalhes sobre ${item.name}: ${item.address}`} />
        <meta name="twitter:image" content={socialImage} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="page-shell-fluid pb-16 pt-5 sm:pt-7"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-content-secondary transition-colors hover:text-brand">
              <ArrowLeft className="h-4 w-4" />
              {item.category?.name ? `Voltar a ${item.category.name}` : 'Voltar ao Guia da Cidade'}
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={handleShare}><Share2 className="h-4 w-4" /> Compartilhar</Button>
            {canEdit && (
              <Button type="button" className="h-10 gap-2 rounded-xl" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Editar local</Button>
            )}
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
          <main className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            <article className={`overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 ${item.image_url ? 'md:grid md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]' : ''}`}>
              {item.image_url && <button type="button" className="group relative flex h-52 w-full items-center justify-center overflow-hidden bg-surface-subtle text-left sm:h-64 md:h-full md:min-h-[21rem] md:max-h-[30rem]" onClick={() => setImageOpen(true)} aria-label={`Ampliar foto de ${item.name}`}>
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-visible:opacity-100"><Maximize2 className="h-3.5 w-3.5" /> </span>
              </button>}
              <div className="p-5 sm:p-7 lg:p-8">
                {item.category?.name && <span className="mb-4 inline-flex rounded-full border border-brand/20 bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand">{item.category.name}</span>}
                <div className="flex items-start gap-4">
                  <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-subtleBg text-brand sm:flex">
                    {item.type === 'public' ? <Building className="h-6 w-6" /> : <ShoppingCart className="h-6 w-6" />}
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-black tracking-tight text-content-primary sm:text-4xl">{item.name}</h1>
                  </div>
                </div>

                {item.description && <div className="mt-6 border-t border-edge-subtle pt-5"><p className="whitespace-pre-wrap leading-7 text-content-secondary">{item.description}</p></div>}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {phones.map((phone) => {
                    const waNumber = whatsappNumber(phone);
                    const href = waNumber ? `https://wa.me/${waNumber}` : `tel:${phone}`;
                    return <a key={phone} href={href} target={waNumber ? '_blank' : undefined} rel={waNumber ? 'noopener noreferrer' : undefined} className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 hover:bg-brand-subtleBg">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm">{waNumber ? <MessageCircle className="h-5 w-5" /> : <Phone className="h-5 w-5" />}</span><span className="min-w-0"><span className="block text-xs font-semibold text-content-tertiary">{waNumber ? 'WhatsApp' : 'Telefone'}</span><span className="block truncate font-bold text-content-primary">{phone}</span></span>
                    </a>;
                  })}
                  {instagramUrl && <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 hover:bg-brand-subtleBg"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Instagram className="h-5 w-5" /></span><span><span className="block text-xs font-semibold text-content-tertiary">Rede social</span><span className="flex items-center gap-1 font-bold text-content-primary">Instagram <ExternalLink className="h-3.5 w-3.5" /></span></span></a>}
                </div>
              </div>
            </article>

            {journeys.length > 0 && <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5" aria-labelledby="route-title">
              <div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Route className="h-5 w-5" /></span><div><h2 id="route-title" className="text-lg font-black text-content-primary">Trajeto e horários</h2><p className="text-sm text-content-tertiary">Informações para planejar sua viagem</p></div></div>
              <div className="grid gap-4 lg:grid-cols-2">{journeys.map((journey, index) => <article key={index} className="grid content-start gap-3 rounded-2xl border border-edge-subtle p-4">
                <h3 className="text-sm font-extrabold text-brand">{guideJourneyTitle(journey, index)}</h3>
                {journey.origin && journey.destination && <div className="rounded-2xl bg-surface-subtle p-4"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Saída</p><p className="mt-1 font-bold text-content-primary">{journey.origin}</p></div><ChevronRight className="h-5 w-5 text-brand" /><div><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Chegada</p><p className="mt-1 font-bold text-content-primary">{journey.destination}</p></div></div></div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {journey.origin && !journey.destination && <DetailTile icon={MapPin} label="Saída" value={journey.origin} />}
                  {journey.destination && !journey.origin && <DetailTile icon={MapPin} label="Destino" value={journey.destination} />}
                  {journey.departure_time && <DetailTile icon={Clock} label="Horário de saída" value={journey.departure_time} />}
                  {journey.arrival_time && <DetailTile icon={Clock} label="Horário de chegada" value={journey.arrival_time} />}
                  {journey.boarding_location && <DetailTile icon={MapPin} label="Local de embarque" value={journey.boarding_location} />}
                  {journey.dropoff_location && <DetailTile icon={MapPin} label="Local de desembarque" value={journey.dropoff_location} />}
                </div>
                {journey.schedule && <div className="rounded-2xl border border-edge-subtle p-4"><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Dias e observações</p><p className="mt-2 whitespace-pre-wrap text-content-secondary">{journey.schedule}</p></div>}
              </article>)}</div>
            </section>}

            {guideMetadata.secondary_image_url && <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1"><div className="border-b border-edge-subtle px-5 py-4"><h2 className="text-lg font-black">Mais informações</h2></div><div className="p-4"><img src={guideMetadata.secondary_image_url} alt={`Informações adicionais sobre ${item.name}`} className="max-h-[44rem] w-full rounded-xl bg-surface-subtle object-contain" /></div></section>}

          </main>

          <aside className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1" aria-labelledby="location-title">
              <div className="border-b border-edge-subtle p-5"><h2 id="location-title" className="flex items-center gap-2 text-lg font-black"><MapPin className="h-5 w-5 text-brand" /> Localização</h2>{item.address && <p className="mt-2 text-sm leading-5 text-content-tertiary">{item.address}</p>}{directionsUrl && <Button asChild variant="outline" size="sm" className="mt-4 gap-2 rounded-xl"><a href={directionsUrl} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" /> Traçar rota</a></Button>}</div>
              {initialPosition ? <div className="h-[17rem] w-full sm:h-[20rem] lg:h-[17rem]"><Suspense fallback={<div className="flex h-full items-center justify-center bg-muted animate-pulse">Carregando mapa...</div>}><LocationPickerMap initialPosition={initialPosition} initialZoom={17} readOnly /></Suspense></div> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-8 text-center text-content-tertiary"><MapPin className="h-8 w-8 opacity-35" /><p>Localização ainda não marcada no mapa.</p>{canEdit && <Button type="button" variant="link" onClick={() => setLocationOpen(true)}>Adicionar localização</Button>}</div>}
            </section>

            <div className="hidden xl:block">
              <ServicesRankingSidebar currentServiceId={id} />
            </div>
          </aside>
        {related.length > 0 && <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5 lg:col-start-1 lg:row-start-2" aria-labelledby="related-guide-title">
          <div className="mb-4"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">Continue explorando</p><h2 id="related-guide-title" className="mt-1 text-xl font-black">{item.category?.name}</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((entry) => <Link key={entry.id} to={`/guia-da-cidade/guia/${entry.id}`} className="group flex min-h-24 overflow-hidden rounded-xl border border-edge-subtle bg-surface-subtle transition-all hover:border-brand/30 hover:bg-brand-subtleBg">
              {entry.image_url && <img src={entry.image_url} alt="" className="w-24 shrink-0 bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:w-28" />}
              <div className="flex min-w-0 flex-1 flex-col justify-center p-4"><h3 className="line-clamp-2 font-bold text-content-primary">{entry.name}</h3>{entry.address && <p className="mt-1 line-clamp-1 text-sm text-content-tertiary">{entry.address}</p>}<span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand">Ver detalhes <ChevronRight className="h-3.5 w-3.5" /></span></div>
            </Link>)}
          </div>
        </section>}
        </div>
      </motion.div>
      {canEdit && <DirectoryEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} categories={categories} allowedCityIds={user.is_admin || user.is_master ? undefined : ambassadorCityIds} onSaved={fetchItem} />}
      {canEdit && <DirectoryLocationDialog open={locationOpen} onOpenChange={setLocationOpen} item={item} onSaved={fetchItem} />}
      {item.image_url && <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl overflow-hidden p-2 sm:p-3">
          <DialogHeader className="sr-only"><DialogTitle>Foto de {item.name}</DialogTitle><DialogDescription>Imagem ampliada do local cadastrado no Guia da Cidade.</DialogDescription></DialogHeader>
          <div className="flex max-h-[86dvh] min-h-56 items-center justify-center overflow-hidden rounded-xl bg-surface-sunken">
            <img src={item.image_url} alt={item.name} className="max-h-[86dvh] max-w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>}
    </>
  );
};

const DetailTile = ({ icon: Icon, label, value }) => <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface-subtle p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-content-tertiary">{label}</p><p className="break-words font-black text-content-primary">{value}</p></div></div>;

export default DirectoryDetailsPage;
