import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Bus, Landmark, Building, ShoppingCart, Mail, Search, ArrowRight, PlusCircle, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import CitySelector from '@/components/CitySelector';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ServicesPage = () => {
  const [streetSearch, setStreetSearch] = useState('');
  const [selectedBairro, setSelectedBairro] = useState('all');
  const [selectedDestination, setSelectedDestination] = useState('all');
  const { toast } = useToast();
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
  const [streetsData, setStreetsData] = useState([]);

  const fetchData = useCallback(async () => {
    let transportQuery = supabase.from('transport').select('*');
    if (activeCityId) transportQuery = transportQuery.eq('city_id', activeCityId);
    const { data: transportData, error: transportError } = await transportQuery;
    if (transportError) toast({ title: "Erro ao buscar transportes", description: transportError.message, variant: "destructive" });
    else setTransportOptions(transportData);

    let spotsQuery = supabase.from('tourist_spots').select('*');
    if (activeCityId) spotsQuery = spotsQuery.eq('city_id', activeCityId);
    const { data: spotsData, error: spotsError } = await spotsQuery;
    if (spotsError) toast({ title: "Erro ao buscar pontos turísticos", description: spotsError.message, variant: "destructive" });
    else setTouristSpots(spotsData);

    let directoryQuery = supabase.from('directory').select('*').eq('status', 'approved');
    if (activeCityId) directoryQuery = directoryQuery.eq('city_id', activeCityId);
    const { data: directoryData, error: directoryError } = await directoryQuery;
    if (directoryError) toast({ title: "Erro ao buscar guia comercial", description: directoryError.message, variant: "destructive" });
    else {
      setDirectory({
        public: directoryData.filter(d => d.type === 'public'),
        commerce: directoryData.filter(d => d.type === 'commerce'),
      });
    }

    let streetsQuery = supabase.from('pavement_streets').select('*');
    if (activeCityId) streetsQuery = streetsQuery.eq('city_id', activeCityId);
    const { data: streets, error: streetsError } = await streetsQuery;
    if (streetsError) toast({ title: "Erro ao buscar ruas", description: streetsError.message, variant: "destructive" });
    else setStreetsData(streets);

  }, [toast, activeCityId]);

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

  const bairros = useMemo(() => {
    const uniqueBairros = [...new Set(streetsData.map(street => street.bairro).filter(Boolean))];
    return uniqueBairros.sort((a, b) => a.localeCompare(b));
  }, [streetsData]);

  const filteredStreets = useMemo(() => {
    return streetsData.filter(street => {
      const searchMatch = street.name.toLowerCase().includes(streetSearch.toLowerCase()) || (street.cep && street.cep.includes(streetSearch));
      const bairroMatch = selectedBairro === 'all' || street.bairro === selectedBairro;
      return searchMatch && bairroMatch;
    });
  }, [streetSearch, selectedBairro, streetsData]);

  const filteredTransport = useMemo(() => {
    if (selectedDestination === 'all') {
      return transportOptions;
    }
    return transportOptions.filter(option => option.destination === selectedDestination);
  }, [selectedDestination, transportOptions]);

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
      if (selectedDestination !== 'all') {
        doc.text(`Destino: ${selectedDestination}`, 14, 32);
      }

      const rows = filteredTransport.map((t) => [
        t.name || '-',
        t.destination || '-',
        t.schedule || '-',
        t.phone || '-',
      ]);

      doc.autoTable({
        head: [['Transporte', 'Destino', 'Horários', 'Contato']],
        body: rows,
        startY: selectedDestination !== 'all' ? 38 : 32,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [182, 23, 34] },
        columnStyles: { 2: { cellWidth: 60 } },
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
      toast({ title: 'Download concluído!' });
    } catch (error) {
      toast({ title: 'Erro ao gerar PDF', description: error.message, variant: 'destructive' });
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
        className="container max-w-[88rem] mx-auto w-full px-4 py-12"
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
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-card border border-border h-auto">
            <TabsTrigger value="tourist" className="gap-2 py-2"><Landmark className="w-4 h-4" /> Pontos Turísticos</TabsTrigger>
            <TabsTrigger value="transport" className="gap-2 py-2"><Bus className="w-4 h-4" /> Transportes</TabsTrigger>
            <TabsTrigger value="directory" className="gap-2 py-2"><Phone className="w-4 h-4" /> Guia Comercial</TabsTrigger>
            <TabsTrigger value="streets" className="gap-2 py-2"><Mail className="w-4 h-4" /> Ruas e CEPs</TabsTrigger>
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
                <p className="text-muted-foreground text-sm">Filtre por destino para encontrar sua viagem.</p>
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
                  {filteredTransport.map((option) => (
                    <motion.div key={option.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                      <Card className="h-full flex flex-col justify-between hover:border-primary transition-colors">
                        <CardHeader className="p-4 md:p-6">
                          <CardTitle className="flex items-center gap-2 md:gap-3 text-sm md:text-base">
                            <Bus className="w-4 h-4 md:w-6 md:h-6 text-primary" />
                            {option.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 md:px-6 py-0">
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
                  ))}
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

          <TabsContent value="streets" className="mt-8">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Consulta de Ruas e CEPs</CardTitle>
                <p className="text-muted-foreground text-sm">Pesquise pelo nome da rua, CEP ou filtre por bairro.</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Digite o nome da rua ou CEP..."
                      className="pl-10"
                      value={streetSearch}
                      onChange={(e) => setStreetSearch(e.target.value)}
                    />
                  </div>
                  <Combobox 
                    value={selectedBairro} 
                    onChange={setSelectedBairro}
                    options={[
                      { value: "all", label: "Todos os bairros" },
                      ...bairros.map(bairro => ({ value: bairro, label: bairro }))
                    ]}
                    placeholder="Filtrar por bairro"
                    searchPlaceholder="Buscar bairro..."
                    className="sm:w-[200px]"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                  {filteredStreets.length > 0 ? (
                    filteredStreets.map((street, index) => (
                      <div key={street.id || index} className="p-3 bg-background rounded-md border border-border flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div>
                          <p className="font-medium text-foreground">{street.name}</p>
                          <p className="text-sm text-muted-foreground">{street.bairro}</p>
                        </div>
                        <p className="text-sm text-primary font-mono bg-primary/10 px-2 py-1 rounded">{street.cep}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhuma rua encontrada para os filtros selecionados.</p>
                  )}
                </div>
              </CardContent>
            </Card>
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