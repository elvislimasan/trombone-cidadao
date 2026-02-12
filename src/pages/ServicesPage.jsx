import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Bus, Landmark, Building, ShoppingCart, Mail, Search, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ServicesPage = () => {
  const [streetSearch, setStreetSearch] = useState('');
  const [selectedBairro, setSelectedBairro] = useState('all');
  const [selectedDestination, setSelectedDestination] = useState('all');
  const { toast } = useToast();

  const [transportOptions, setTransportOptions] = useState([]);
  const [touristSpots, setTouristSpots] = useState([]);
  const [directory, setDirectory] = useState({ public: [], commerce: [] });
  const [streetsData, setStreetsData] = useState([]);

  const fetchData = useCallback(async () => {
    const { data: transportData, error: transportError } = await supabase.from('transport').select('*');
    if (transportError) toast({ title: "Erro ao buscar transportes", description: transportError.message, variant: "destructive" });
    else setTransportOptions(transportData);

    const { data: spotsData, error: spotsError } = await supabase.from('tourist_spots').select('*');
    if (spotsError) toast({ title: "Erro ao buscar pontos turísticos", description: spotsError.message, variant: "destructive" });
    else setTouristSpots(spotsData);

    const { data: directoryData, error: directoryError } = await supabase.from('directory').select('*').eq('status', 'approved');
    if (directoryError) toast({ title: "Erro ao buscar guia comercial", description: directoryError.message, variant: "destructive" });
    else {
      setDirectory({
        public: directoryData.filter(d => d.type === 'public'),
        commerce: directoryData.filter(d => d.type === 'commerce'),
      });
    }

    const { data: streets, error: streetsError } = await supabase.from('pavement_streets').select('*');
    if (streetsError) toast({ title: "Erro ao buscar ruas", description: streetsError.message, variant: "destructive" });
    else setStreetsData(streets);

  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <meta name="description" content="Encontre informações úteis sobre Floresta-PE: pontos turísticos, transportes e guia comercial." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl gradient-text">
            Guia de Serviços de Floresta
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre a cidade em um só lugar.
          </p>
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
                <div className="mb-6">
                  <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue placeholder="Filtrar por destino..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Destinos</SelectItem>
                      {transportDestinations.map(dest => (
                        <SelectItem key={dest} value={dest}>{dest}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={selectedBairro} onValueChange={setSelectedBairro}>
                    <SelectTrigger className="sm:w-[200px]">
                      <SelectValue placeholder="Filtrar por bairro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os bairros</SelectItem>
                      {bairros.map(bairro => (
                        <SelectItem key={bairro} value={bairro}>{bairro}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

export default ServicesPage;