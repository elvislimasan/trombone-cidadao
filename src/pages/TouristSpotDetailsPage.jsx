import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Phone, MapPin, Info, Maximize, Video, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const TouristSpotDetailsPage = () => {
  const { id } = useParams();
  const [spot, setSpot] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchSpot = useCallback(async () => {
    const { data, error } = await supabase
      .from('tourist_spots')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      toast({ title: "Erro ao buscar ponto turístico", description: error.message, variant: "destructive" });
      navigate('/servicos');
    } else {
      setSpot(data);
    }
  }, [id, toast, navigate]);

  useEffect(() => {
    fetchSpot();
  }, [fetchSpot]);

  if (!spot) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Carregando...</h1>
      </div>
    );
  }

  const photos = spot.gallery?.filter(item => item.type === 'image') || [];
  const videos = spot.gallery?.filter(item => item.type === 'video') || [];

  return (
    <>
      <Helmet>
        <title>{spot.name} - Guia de Pontos Turísticos</title>
        <meta name="description" content={`Detalhes sobre o ponto turístico ${spot.name}.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="mb-8">
          <Link to="/servicos">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para o Guia de Serviços
            </Button>
          </Link>
        </div>

        <Card className="overflow-hidden border-border shadow-lg">
          <div className="relative">
            <img alt={spot.name} className="h-80 w-full object-cover" src={spot.image_url} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="text-4xl font-bold text-white">{spot.name}</h1>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 text-primary p-3 rounded-lg">
                    <Info className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Sobre o Local</h3>
                    <p className="text-muted-foreground">{spot.long_description}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="bg-secondary/10 text-secondary p-3 rounded-lg">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Endereço</h3>
                    <p className="text-muted-foreground">{spot.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-secondary/10 text-secondary p-3 rounded-lg">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Contato</h3>
                    <p className="text-muted-foreground">{spot.phone}</p>
                  </div>
                </div>
              </div>
            </div>

            {(photos.length > 0 || videos.length > 0) && (
              <div className="mt-10 pt-6 border-t border-border">
                <h2 className="text-2xl font-bold mb-4">Galeria</h2>
                {photos.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary" /> Fotos</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {photos.map((photo, index) => (
                        <Dialog key={index}>
                          <DialogTrigger asChild>
                            <motion.div
                              className="relative group cursor-pointer overflow-hidden rounded-lg"
                              whileHover={{ scale: 1.05 }}
                              transition={{ type: 'spring', stiffness: 300 }}
                            >
                              <img src={photo.url} alt={photo.description} className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize className="w-8 h-8 text-white" />
                              </div>
                            </motion.div>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl p-0">
                            <img src={photo.url} alt={photo.description} className="w-full h-auto max-h-[80vh] object-contain" />
                          </DialogContent>
                        </Dialog>
                      ))}
                    </div>
                  </div>
                )}

                {videos.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-primary" /> Vídeos</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {videos.map((video, index) => (
                        <div key={index} className="aspect-video rounded-lg overflow-hidden">
                          <iframe
                            className="w-full h-full"
                            src={video.url}
                            title={video.description}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          ></iframe>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default TouristSpotDetailsPage;