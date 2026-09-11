import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Phone, Instagram, Building, ShoppingCart } from 'lucide-react';
import { whatsappNumber } from '@/lib/utils';
import ServicesRankingSidebar from '@/components/ServicesRankingSidebar';
import { showAppError } from '@/lib/appError';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const DirectoryDetailsPage = () => {
  const { id } = useParams();
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
  const initialPosition = item.location ? { lat: item.location.coordinates[1], lng: item.location.coordinates[0] } : null;

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
        <div className="mb-8">
          <Link to="/servicos">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Guia da Cidade
            </Button>
          </Link>
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
              </CardHeader>
              <CardContent className="space-y-4">
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
                {item.instagram_url && (
                  <a href={item.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-lg hover:text-primary transition-colors">
                    <Instagram className="w-6 h-6 text-muted-foreground" />
                    <span>Ver no Instagram</span>
                  </a>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Localização</CardTitle>
              </CardHeader>
              <CardContent>
                {initialPosition ? (
                  <div className="h-80 w-full rounded-lg overflow-hidden border">
                    <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                      <LocationPickerMap initialPosition={initialPosition} readOnly={true} />
                    </Suspense>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Localização não disponível no mapa.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="hidden lg:block">
            <ServicesRankingSidebar currentServiceType="directory" currentServiceId={id} />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default DirectoryDetailsPage;
