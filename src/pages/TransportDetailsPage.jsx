import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, Clock, MapPin, Info, Instagram, Pencil, MessageCircle, Share2, Bus, Bike, Car, CarTaxiFront, Truck } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { nomeDoTipoTransporte, iconeDoTipoTransporte } from '@/lib/transportTypes';
import { whatsappNumber } from '@/lib/utils';
import { showAppError } from '@/lib/appError';

const TRANSPORT_ICONS = { Bike, CarTaxiFront, Car, Truck, Bus };

const TransportDetailsPage = () => {
  const { id } = useParams();
  const [transport, setTransport] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);

  // Admin/master editam qualquer serviço; embaixador puro só os da própria
  // cidade (a cidade DO ITEM, não a do seletor).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const canEdit = Boolean(
    user?.is_admin || user?.is_master ||
    (isPureAmbassador && transport?.city_id &&
      myActiveCityIds.some((cid) => String(cid) === String(transport.city_id)))
  );

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

  const fetchTransport = useCallback(async () => {
    const { data, error } = await supabase
      .from('transport')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      showAppError({ title: "Erro ao buscar transporte", description: error.message, variant: "destructive" });
      navigate('/servicos');
    } else {
      setTransport(data);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchTransport();
  }, [fetchTransport]);

  const waNumber = whatsappNumber(transport?.phone);
  const TypeIcon = TRANSPORT_ICONS[iconeDoTipoTransporte(transport?.vehicle_type)] || Bus;
  const typeName = nomeDoTipoTransporte(transport?.vehicle_type);

  const handleWhatsApp = () => {
    if (!waNumber) return;
    const texto = `Olá! Vi o transporte "${transport.name}" no Trombone Cidadão e gostaria de informações sobre a viagem para ${transport.destination || 'meu destino'}.`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(texto)}`, '_blank');
  };

  // Web Share quando existe (no app nativo e no celular abre a folha do
  // sistema, com WhatsApp/Telegram/e-mail juntos); nos navegadores de desktop
  // que nao implementam, cai para copiar o link. Nao ha um terceiro caminho:
  // um botao que nao faz nada seria pior que nenhum botao.
  const handleShare = async () => {
    const url = window.location.href;
    const texto = `${transport.name}${transport.destination ? ` — destino ${transport.destination}` : ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: transport.name, text: texto, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // usuario fechou a folha
      }
    }
    try {
      await navigator.clipboard.writeText(`${texto}\n${url}`);
    } catch {
      showAppError({ title: 'Não foi possível compartilhar', variant: 'destructive' });
    }
  };

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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link to="/servicos">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para o Guia de Serviços
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleShare}>
              <Share2 className="w-4 h-4" /> Compartilhar
            </Button>
            {canEdit && (
              <Link to={`/servicos/gerenciar?edit=${transport.id}&type=transport`}>
                <Button variant="outline" className="gap-2 border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                  <Pencil className="w-4 h-4" /> Editar serviço
                </Button>
              </Link>
            )}
          </div>
        </div>

        <Card className="overflow-hidden border-border shadow-lg">
          <div className="relative">
            {transport.image_url ? (
              <img alt={transport.name} className="h-64 w-full object-cover" src={transport.image_url} />
            ) : (
              /* Sem foto cadastrada o <img> quebrava e sobrava um retangulo com
                 o alt text. A ilustracao do tipo de veiculo ocupa o mesmo
                 espaco e ainda informa: da para ver que e mototaxi antes de
                 ler qualquer texto. */
              <div className="h-64 w-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-secondary/15">
                <TypeIcon className="w-24 h-24 text-primary/50" strokeWidth={1.25} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6">
              {typeName && (
                <span className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-white/90 text-primary text-xs font-bold">
                  <TypeIcon className="w-3.5 h-3.5" /> {typeName}
                </span>
              )}
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
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg">Contato</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`tel:${transport.phone}`} className="text-lg font-semibold text-primary hover:underline">
                      {transport.phone}
                    </a>
                    {waNumber && (
                      <button
                        type="button"
                        onClick={handleWhatsApp}
                        title="Chamar no WhatsApp"
                        aria-label="Chamar no WhatsApp"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#25D366] text-white text-xs font-bold hover:brightness-95 transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    )}
                  </div>
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