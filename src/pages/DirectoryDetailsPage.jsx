import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Phone, Instagram, Building, ShoppingCart, Pencil, Navigation, Clock, Info } from 'lucide-react';
import { whatsappNumber } from '@/lib/utils';
import ServicesRankingSidebar from '@/components/ServicesRankingSidebar';
import { showAppError } from '@/lib/appError';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { normalizarInstagram } from '@/lib/externalLinks';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const DirectoryDetailsPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchItem = useCallback(async () => {
    setLoading(true);
    
    await supabase.rpc('increment_views', { table_name: 'directory', item_id: id });

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
      setItem(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  if (!item) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Item não encontrado</h1>
        <p className="text-muted-foreground">O item que você está procurando não existe ou foi removido.</p>
        <Link to="/servicos">
          <Button className="mt-4">Voltar ao Guia da Cidade</Button>
        </Link>
      </div>
    );
  }

  const waNumber = whatsappNumber(item.phone);
  const phoneLink = waNumber ? `https://wa.me/${waNumber}` : `tel:${item.phone || ''}`;
  const initialPosition = item.location?.coordinates?.length >= 2
    ? { lat: Number(item.location.coordinates[1]), lng: Number(item.location.coordinates[0]) }
    : null;
  const instagramUrl = normalizarInstagram(item.instagram_url);
  const guideMetadata = item.guide_metadata || {};
  const directionsUrl = initialPosition
    ? `https://www.google.com/maps/dir/?api=1&destination=${initialPosition.lat},${initialPosition.lng}`
    : item.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.address)}`
      : null;
  const canEdit = Boolean(user && (user.is_admin || user.is_master || user.is_ambassador) && canWrite('services'));

  return (
    <>
      <Helmet>
        <title>{`${item.name} - Guia da Cidade`}</title>
        <meta name="description" content={`Detalhes sobre ${item.name}: ${item.address}`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link to="/servicos">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Guia da Cidade
            </Button>
          </Link>
          {canEdit && (
            <Button asChild className="gap-2">
              <Link to={`/admin/servicos?edit=${item.id}&type=directory`}><Pencil className="h-4 w-4" /> Editar local</Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="overflow-hidden">
              <img src={item.image_url} alt={item.name} className="w-full h-64 object-cover" />
              <CardHeader>
                <CardTitle className="text-3xl flex items-center gap-3">
                  {item.type === 'public' ? <Building className="w-8 h-8 text-primary" /> : <ShoppingCart className="w-8 h-8 text-secondary" />}
                  {item.name}
                </CardTitle>
                {item.category?.name && <p className="mt-2 text-sm font-semibold text-primary">{item.category.name}</p>}
                {guideMetadata.destination && <p className="mt-1 text-lg text-muted-foreground">Destino: {guideMetadata.destination}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                {item.description && (
                  <div className="flex items-start gap-3 text-base">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <p className="whitespace-pre-wrap">{item.description}</p>
                  </div>
                )}
                <div className="flex items-start gap-3 text-lg">
                  <MapPin className="w-6 h-6 text-muted-foreground mt-1 flex-shrink-0" />
                  <span>{item.address}</span>
                </div>
                {item.phone && (
                  <a href={phoneLink} target={waNumber ? '_blank' : undefined} rel={waNumber ? 'noopener noreferrer' : undefined} className="flex items-center gap-3 text-lg hover:text-primary transition-colors">
                    <Phone className="w-6 h-6 text-muted-foreground" />
                    <span>{item.phone}</span>
                  </a>
                )}
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-lg hover:text-primary transition-colors">
                    <Instagram className="w-6 h-6 text-muted-foreground" />
                    <span>Ver no Instagram</span>
                  </a>
                )}
                {guideMetadata.schedule && (
                  <div className="flex items-start gap-3 text-base">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div><p className="font-semibold">Horários</p><p className="whitespace-pre-wrap text-muted-foreground">{guideMetadata.schedule}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Localização</CardTitle>
              </CardHeader>
              <CardContent>
                {directionsUrl && (
                  <Button asChild className="mb-4 w-full gap-2 sm:w-auto">
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="h-4 w-4" /> Traçar rota
                    </a>
                  </Button>
                )}
                {initialPosition ? (
                  <div className="h-80 w-full rounded-lg overflow-hidden border">
                    <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                      <LocationPickerMap initialPosition={initialPosition} readOnly />
                    </Suspense>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Localização não disponível no mapa.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="hidden lg:block">
            <ServicesRankingSidebar currentServiceId={id} />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default DirectoryDetailsPage;
