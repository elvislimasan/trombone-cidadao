import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Bus, Bike, Car, CarTaxiFront, Truck, Landmark, Building, ShoppingCart, ArrowRight, PlusCircle, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import CitySelector from '@/components/CitySelector';
import { TIPOS_TRANSPORTE, nomeDoTipoTransporte, iconeDoTipoTransporte } from '@/lib/transportTypes';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { showAppError } from '@/lib/appError';

// Componentes lucide dos tipos de transporte. O modulo de tipos guarda so o
// nome do icone (para nao importar React); a resolucao acontece aqui, onde ja
// se desenha.
const TRANSPORT_ICONS = { Bike, CarTaxiFront, Car, Truck, Bus };

const ServicesPage = () => {
  const [selectedDestination, setSelectedDestination] = useState('all');
  const [selectedVehicleType, setSelectedVehicleType] = useState('all');
  const { cityId: activeCityId, cityName: activeCityName } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();

  // Mesma regra de imóveis alugados/pavimentação: admin/master gerenciam
  // qualquer cidade; embaixador puro só com uma cidade sua selecionada.
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageServices = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('services')
  );

  const [transportOptions, setTransportOptions] = useState([]);
  const [touristSpots, setTouristSpots] = useState([]);
  const [directory, setDirectory] = useState({ public: [], commerce: [] });

  const fetchData = useCallback(async () => {
    let transportQuery = supabase.from('transport').select('*');
    if (activeCityId) transportQuery = transportQuery.eq('city_id', activeCityId);
    const { data: transportData, error: transportError } = await transportQuery;
    if (transportError) showAppError({ title: "Erro ao buscar transportes", description: transportError.message, variant: "destructive" });
    else setTransportOptions(transportData);

    let spotsQuery = supabase.from('tourist_spots').select('*');
    if (activeCityId) spotsQuery = spotsQuery.eq('city_id', activeCityId);
    const { data: spotsData, error: spotsError } = await spotsQuery;
    if (spotsError) showAppError({ title: "Erro ao buscar pontos turísticos", description: spotsError.message, variant: "destructive" });
    else setTouristSpots(spotsData);

    let directoryQuery = supabase.from('directory').select('*').eq('status', 'approved');
    if (activeCityId) directoryQuery = directoryQuery.eq('city_id', activeCityId);
    const { data: directoryData, error: directoryError } = await directoryQuery;
    if (directoryError) showAppError({ title: "Erro ao buscar guia comercial", description: directoryError.message, variant: "destructive" });
    else {
      setDirectory({
        public: directoryData.filter(d => d.type === 'public'),
        commerce: directoryData.filter(d => d.type === 'commerce'),
      });
    }

  }, [activeCityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

  const transportDestinations = useMemo(() => {
    return [...new Set(transportOptions.map(item => item.destination).filter(Boolean))].sort();
  }, [transportOptions]);

  // So os tipos que existem na cidade — oferecer "Tuk Tuk" onde nao ha nenhum
  // e prometer um filtro que sempre volta vazio.
  const transportVehicleTypes = useMemo(() => {
    const presentes = new Set(transportOptions.map((t) => t.vehicle_type).filter(Boolean));
    return TIPOS_TRANSPORTE.filter((t) => presentes.has(t.id));
  }, [transportOptions]);

  const filteredTransport = useMemo(() => {
    return transportOptions.filter((option) => {
      const destinationMatch = selectedDestination === 'all' || option.destination === selectedDestination;
      const typeMatch = selectedVehicleType === 'all' || option.vehicle_type === selectedVehicleType;
      return destinationMatch && typeMatch;
    });
  }, [selectedDestination, selectedVehicleType, transportOptions]);

  const [downloadingTransport, setDownloadingTransport] = useState(false);

  const handleDownloadTransportPdf = () => {
    setDownloadingTransport(true);
    try {
      const doc = new jsPDF();
      const title = `Transportes e Lotações${activeCityName ? ` — ${activeCityName}` : ''}`;
      doc.setFontSize(16);
      doc.text(title, 14, 18);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26);
      const filtrosAtivos = [
        selectedDestination !== 'all' ? `Destino: ${selectedDestination}` : null,
        selectedVehicleType !== 'all' ? `Tipo: ${nomeDoTipoTransporte(selectedVehicleType)}` : null,
      ].filter(Boolean);
      if (filtrosAtivos.length > 0) {
        doc.text(filtrosAtivos.join('  ·  '), 14, 32);
      }

      const rows = filteredTransport.map((t) => [
        t.name || '-',
        nomeDoTipoTransporte(t.vehicle_type) || '-',
        t.destination || '-',
        t.schedule || '-',
        t.phone || '-',
      ]);

      doc.autoTable({
        head: [['Transporte', 'Tipo', 'Destino', 'Horários', 'Contato']],
        body: rows,
        startY: filtrosAtivos.length > 0 ? 38 : 32,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [182, 23, 34] },
        columnStyles: { 3: { cellWidth: 50 } },
      });

      // Observação pedida: direciona o público para a lista sempre atualizada.
      const afterTableY = (doc.lastAutoTable?.finalY || 40) + 10;
      doc.setFontSize(9);
      doc.setTextColor(100);
      const note = doc.splitTextToSize(
        'Observação: os horários podem mudar sem aviso prévio. Para conferir a lista de lotações sempre atualizada, acesse o site do Trombone Cidadão: trombonecidadao.com.br',
        180
      );
      doc.text(note, 14, afterTableY);

      doc.save(`transportes_lotacoes_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      showAppError({ title: 'Erro ao gerar PDF', description: error.message, variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloadingTransport(false), 500);
    }
  };

  const DirectoryCard = ({ item }) => (
    <Card className="overflow-hidden">
      <div className="flex">
        <div className="w-1/3 min-w-[80px]">
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        </div>
        <div className="w-2/3 p-3 md:p-4 flex flex-col justify-center min-w-0">
          <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{item.name}</h3>
          <p className="text-[10px] md:text-sm text-muted-foreground flex items-center gap-1.5 mt-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" /> {item.address}</p>
          <p className="text-[10px] md:text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="w-3 h-3 flex-shrink-0" /> {item.phone}</p>
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <Helmet>
        <title>Serviços - Trobone Cidadão</title>
        <meta name="description" content={`Encontre informações úteis sobre ${activeCityName || 'sua cidade'}: pontos turísticos, transportes e guia comercial.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8"
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl gradient-text">
            Guia de Serviços{activeCityName ? ` de ${activeCityName}` : ''}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre a cidade em um só lugar.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <CitySelector />
            {canManageServices && (
              <Link to="/servicos/gerenciar">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                  <PlusCircle className="w-3.5 h-3.5" /> Adicionar item
                </Button>
              </Link>
            )}
          </div>
        </div>

        <Tabs defaultValue="tourist" className="w-full">
          {/* A aba "Ruas e CEPs" saiu daqui em ago/2026. A consulta lia
              pavement_streets, uma tabela alimentada a mao por cidade, e so
              tinha resposta para Floresta — em qualquer outra cidade era uma
              busca que nunca achava nada. O Google resolve isso melhor e para
              o Brasil inteiro; a tabela continua servindo o mapa de
              pavimentacao, que e o uso real dela. */}
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 bg-card border border-border h-auto">
            <TabsTrigger value="tourist" className="gap-2 py-2"><Landmark className="w-4 h-4" /> Pontos Turísticos</TabsTrigger>
            <TabsTrigger value="transport" className="gap-2 py-2"><Bus className="w-4 h-4" /> Transportes</TabsTrigger>
            <TabsTrigger value="directory" className="gap-2 py-2"><Phone className="w-4 h-4" /> Guia Comercial</TabsTrigger>
          </TabsList>

          <TabsContent value="tourist" className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              {touristSpots.map((spot, index) => (
                <motion.div key={spot.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}>
                  <Card className="overflow-hidden h-full flex flex-col border-border hover:shadow-lg transition-shadow">
                    <img alt={spot.name} className="h-40 md:h-48 w-full object-cover" src={spot.image_url} />
                    <CardHeader className="p-4 md:p-6">
                      <CardTitle className="text-base md:text-xl text-foreground line-clamp-1">{spot.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow px-4 md:px-6 py-0">
                      <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-3">{spot.short_description}</p>
                    </CardContent>
                    <div className="p-4 md:p-6 pt-0 mt-4">
                      <Link to={`/servicos/ponto-turistico/${spot.id}`}>
                        <Button className="w-full h-9 md:h-10 text-xs md:text-sm">
                          Saiba Mais <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="transport" className="mt-8">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Opções de Transporte</CardTitle>
                <p className="text-muted-foreground text-sm">Filtre por destino ou tipo de transporte para encontrar sua viagem.</p>
              </CardHeader>
              <CardContent>
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Combobox
                    value={selectedDestination}
                    onChange={setSelectedDestination}
                    options={[
                      { value: "all", label: "Todos os Destinos" },
                      ...transportDestinations.map(dest => ({ value: dest, label: dest }))
                    ]}
                    placeholder="Filtrar por destino..."
                    searchPlaceholder="Buscar destino..."
                    className="w-full sm:w-[280px]"
                  />
                  {transportVehicleTypes.length > 0 && (
                    <Combobox
                      value={selectedVehicleType}
                      onChange={setSelectedVehicleType}
                      options={[
                        { value: "all", label: "Todos os Tipos" },
                        ...transportVehicleTypes.map((t) => ({ value: t.id, label: t.name }))
                      ]}
                      placeholder="Filtrar por tipo..."
                      searchPlaceholder="Buscar tipo..."
                      className="w-full sm:w-[220px]"
                    />
                  )}
                  {filteredTransport.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={handleDownloadTransportPdf}
                      disabled={downloadingTransport}
                      className="gap-2 w-full sm:w-auto"
                    >
                      {downloadingTransport
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Download className="w-4 h-4" />}
                      Baixar lista em PDF
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {filteredTransport.map((option) => {
                    const TypeIcon = TRANSPORT_ICONS[iconeDoTipoTransporte(option.vehicle_type)] || Bus;
                    const typeName = nomeDoTipoTransporte(option.vehicle_type);
                    return (
                    <motion.div key={option.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                      <Card className="h-full flex flex-col justify-between hover:border-primary transition-colors">
                        <CardHeader className="p-4 md:p-6">
                          <CardTitle className="flex items-center gap-2 md:gap-3 text-sm md:text-base">
                            <TypeIcon className="w-4 h-4 md:w-6 md:h-6 text-primary shrink-0" />
                            {option.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 md:px-6 py-0">
                          {typeName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded-full bg-primary/10 text-primary text-[10px] md:text-xs font-semibold">
                              <TypeIcon className="w-3 h-3" /> {typeName}
                            </span>
                          )}
                          <p className="text-[10px] md:text-sm text-muted-foreground">Destino: <span className="font-semibold text-foreground">{option.destination}</span></p>
                          <p className="text-[10px] md:text-sm text-muted-foreground mt-1">{option.schedule}</p>
                        </CardContent>
                        <div className="p-4 md:p-6 pt-0 mt-4">
                           <Link to={`/servicos/transporte/${option.id}`}>
                            <Button className="w-full h-8 md:h-10 text-[10px] md:text-sm">
                              Ver Detalhes <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-2" />
                            </Button>
                          </Link>
                        </div>
                      </Card>
                    </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="directory" className="mt-8 space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><Building className="w-6 h-6 text-primary" /> Serviços Públicos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {directory.public.map((item) => <DirectoryCard key={item.id} item={item} />)}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><ShoppingCart className="w-6 h-6 text-secondary" /> Comércio Local</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {directory.commerce.map((item) => <DirectoryCard key={item.id} item={item} />)}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
};

// Filtro de cidade local a esta tela — ver os servicos de outra cidade e uma
// consulta, nao uma mudanca de onde o usuario mora.
export default function ServicesPageWithCityView() {
  return (
    <CityViewProvider>
      <ServicesPage />
    </CityViewProvider>
  );
}
