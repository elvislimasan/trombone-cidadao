import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Phone, Instagram, Building, ShoppingCart, Pencil, Navigation, Clock, Share2, MessageCircle, Route, ExternalLink, ImageOff, ChevronRight } from 'lucide-react';
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

  const waNumber = whatsappNumber(item.phone);
  const phoneLink = waNumber ? `https://wa.me/${waNumber}` : `tel:${item.phone || ''}`;
  const initialPosition = guideLocation(item.location) || guideLocation(item.address);
  const instagramUrl = normalizarInstagram(item.instagram_url);
  const guideMetadata = item.guide_metadata || {};
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

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="min-w-0 space-y-6">
            <article className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
              <div className="relative bg-surface-subtle">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="aspect-[16/8] max-h-[36rem] w-full object-cover" /> : <div className="flex aspect-[16/7] max-h-[25rem] items-center justify-center bg-gradient-to-br from-brand-subtleBg to-surface-subtle"><Building className="h-20 w-20 text-brand/25" /></div>}
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
                {item.category?.name && <span className="absolute bottom-4 left-4 rounded-full border border-white/30 bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur sm:left-6">{item.category.name}</span>}
              </div>
              <div className="p-5 sm:p-7 lg:p-8">
                <div className="flex items-start gap-4">
                  <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-subtleBg text-brand sm:flex">
                    {item.type === 'public' ? <Building className="h-6 w-6" /> : <ShoppingCart className="h-6 w-6" />}
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-black tracking-tight text-content-primary sm:text-4xl">{item.name}</h1>
                    {(guideMetadata.destination || item.address) && <p className="mt-2 flex items-start gap-2 text-sm text-content-secondary sm:text-base"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{guideMetadata.destination || item.address}</p>}
                  </div>
                </div>

                {item.description && <div className="mt-6 border-t border-edge-subtle pt-5"><p className="whitespace-pre-wrap leading-7 text-content-secondary">{item.description}</p></div>}

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {item.phone && <a href={phoneLink} target={waNumber ? '_blank' : undefined} rel={waNumber ? 'noopener noreferrer' : undefined} className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 hover:bg-brand-subtleBg">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm">{waNumber ? <MessageCircle className="h-5 w-5" /> : <Phone className="h-5 w-5" />}</span><span className="min-w-0"><span className="block text-xs font-semibold text-content-tertiary">{waNumber ? 'WhatsApp' : 'Telefone'}</span><span className="block truncate font-bold text-content-primary">{item.phone}</span></span>
                  </a>}
                  {instagramUrl && <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 hover:bg-brand-subtleBg"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Instagram className="h-5 w-5" /></span><span><span className="block text-xs font-semibold text-content-tertiary">Rede social</span><span className="flex items-center gap-1 font-bold text-content-primary">Instagram <ExternalLink className="h-3.5 w-3.5" /></span></span></a>}
                  {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 hover:bg-brand-subtleBg"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Navigation className="h-5 w-5" /></span><span><span className="block text-xs font-semibold text-content-tertiary">Como chegar</span><span className="font-bold text-content-primary">Traçar rota</span></span></a>}
                </div>
              </div>
            </article>

            {(guideMetadata.origin || guideMetadata.destination || guideMetadata.departure_time || guideMetadata.arrival_time || guideMetadata.schedule) && <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-5 shadow-elevation-1 sm:p-7" aria-labelledby="route-title">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Route className="h-5 w-5" /></span><div><h2 id="route-title" className="text-xl font-black text-content-primary">Trajeto e horários</h2><p className="text-sm text-content-tertiary">Informações para planejar sua viagem</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(guideMetadata.origin || guideMetadata.destination) && <div className="rounded-2xl bg-surface-subtle p-4 sm:col-span-2"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Saída</p><p className="mt-1 font-bold text-content-primary">{guideMetadata.origin || 'Não informada'}</p></div><ChevronRight className="h-5 w-5 text-brand" /><div><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Chegada</p><p className="mt-1 font-bold text-content-primary">{guideMetadata.destination || 'Não informada'}</p></div></div></div>}
                {guideMetadata.departure_time && <DetailTile icon={Clock} label="Horário de saída" value={guideMetadata.departure_time} />}
                {guideMetadata.arrival_time && <DetailTile icon={Clock} label="Horário de chegada" value={guideMetadata.arrival_time} />}
                {guideMetadata.schedule && <div className="rounded-2xl border border-edge-subtle p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-content-tertiary">Dias e observações</p><p className="mt-2 whitespace-pre-wrap text-content-secondary">{guideMetadata.schedule}</p></div>}
              </div>
            </section>}

            {guideMetadata.secondary_image_url && <section className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1"><div className="border-b border-edge-subtle px-5 py-4 sm:px-7"><h2 className="text-xl font-black">Mais informações</h2></div><div className="p-4 sm:p-6"><img src={guideMetadata.secondary_image_url} alt={`Informações adicionais sobre ${item.name}`} className="max-h-[44rem] w-full rounded-2xl bg-surface-subtle object-contain" /></div></section>}

            <section className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1" aria-labelledby="location-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge-subtle px-5 py-4 sm:px-7"><div><h2 id="location-title" className="flex items-center gap-2 text-xl font-black"><MapPin className="h-5 w-5 text-brand" /> Localização</h2>{item.address && <p className="mt-1 text-sm text-content-tertiary">{item.address}</p>}</div>{directionsUrl && <Button asChild variant="outline" className="gap-2 rounded-xl"><a href={directionsUrl} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" /> Traçar rota</a></Button>}</div>
              {initialPosition ? <div className="h-[22rem] w-full"><Suspense fallback={<div className="flex h-full items-center justify-center bg-muted animate-pulse">Carregando mapa...</div>}><LocationPickerMap initialPosition={initialPosition} initialZoom={14} readOnly /></Suspense></div> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-8 text-center text-content-tertiary"><MapPin className="h-8 w-8 opacity-35" /><p>Localização ainda não marcada no mapa.</p>{canEdit && <Button type="button" variant="link" onClick={() => setLocationOpen(true)}>Adicionar localização</Button>}</div>}
            </section>
          </main>

          <aside className="hidden xl:sticky xl:top-24 xl:block">
            <ServicesRankingSidebar currentServiceId={id} />
          </aside>
        </div>
        {related.length > 0 && <section className="mt-10" aria-labelledby="related-guide-title">
          <div className="mb-4"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">Continue explorando</p><h2 id="related-guide-title" className="mt-1 text-2xl font-black">{item.category?.name}</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {related.map((entry) => <Link key={entry.id} to={`/guia-da-cidade/guia/${entry.id}`} className="group overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-elevation-2">
              {entry.image_url ? <img src={entry.image_url} alt="" className="h-40 w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-40 items-center justify-center bg-surface-subtle"><ImageOff className="h-8 w-8 text-content-tertiary/40" /></div>}
              <div className="p-4"><h3 className="font-bold text-content-primary">{entry.name}</h3>{entry.address && <p className="mt-1 line-clamp-2 text-sm text-content-tertiary">{entry.address}</p>}<span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand">Ver detalhes <ChevronRight className="h-3.5 w-3.5" /></span></div>
            </Link>)}
          </div>
        </section>}
      </motion.div>
      {canEdit && <DirectoryEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} categories={categories} allowedCityIds={user.is_admin || user.is_master ? undefined : ambassadorCityIds} onSaved={fetchItem} />}
      {canEdit && <DirectoryLocationDialog open={locationOpen} onOpenChange={setLocationOpen} item={item} onSaved={fetchItem} />}
    </>
  );
};

const DetailTile = ({ icon: Icon, label, value }) => <div className="flex items-center gap-3 rounded-2xl bg-surface-subtle p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Icon className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-content-tertiary">{label}</p><p className="font-black text-content-primary">{value}</p></div></div>;

export default DirectoryDetailsPage;
