import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, Clock, MapPin, Info, Instagram } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const TransportDetailsPage = () => {
  const { id } = useParams();
  const [transport, setTransport] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchTransport = useCallback(async () => {
    const { data, error } = await supabase
      .from('transport')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      toast({ title: "Erro ao buscar transporte", description: error.message, variant: "destructive" });
      navigate('/servicos');
    } else {
      setTransport(data);
    }
  }, [id, toast, navigate]);

  useEffect(() => {
    fetchTransport();
  }, [fetchTransport]);

  if (!transport) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Carregando...</h1>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{transport.name} - Guia de Transportes</title>
        <meta name="description" content={`Detalhes sobre o serviço de transporte ${transport.name} para ${transport.destination}.`} />
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
            <img alt={transport.name} className="h-64 w-full object-cover" src={transport.image_url} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="text-4xl font-bold text-white">{transport.name}</h1>
              <p className="text-xl text-white/90">Destino: {transport.destination}</p>
            </div>
          </div>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 text-primary p-3 rounded-lg">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Contato</h3>
                  <p className="text-muted-foreground text-lg font-semibold text-primary">{transport.phone}</p>
                </div>
              </div>
              {transport.instagram && (
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 text-primary p-3 rounded-lg">
                    <Instagram className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Instagram</h3>
                    <a href={transport.instagram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground text-lg font-semibold text-primary hover:underline">
                      Visitar Perfil
                    </a>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 text-primary p-3 rounded-lg">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Horários</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{transport.schedule}</p>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-secondary/10 text-secondary p-3 rounded-lg">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Ponto de Partida e Detalhes</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{transport.details}</p>
                </div>
              </div>
               <div className="flex items-start gap-4">
                <div className="bg-secondary/10 text-secondary p-3 rounded-lg">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Observação</h3>
                  <p className="text-muted-foreground">Os horários e informações podem mudar. É sempre bom confirmar por telefone antes da sua viagem.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default TransportDetailsPage;