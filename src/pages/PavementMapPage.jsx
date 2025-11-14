
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Route as Road, ThumbsDown, Filter, Search, X, Mail, Circle, Square, Map, List, LocateFixed, RefreshCw, HardHat, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PavementMapView from '@/components/PavementMapView';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import WorksMapView from '@/components/WorksMapView';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const PavementMapPage = () => {
  const [streetData, setStreetData] = useState([]);
  const [allWorks, setAllWorks] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [streetListModal, setStreetListModal] = useState({ isOpen: false, title: '', streets: [] });
  const mapViewRef = useRef();
  const { toast } = useToast();

  const fetchStreets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)');
    if (error) {
      toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(s => ({
        ...s,
        location: s.location ? { lat: s.location.coordinates[1], lng: s.location.coordinates[0] } : null,
      }));
      setStreetData(formattedData);
      if (data.length > 0) {
        const mostRecent = data.reduce((latest, street) => {
            const streetDate = new Date(street.updated_at || 0);
            return streetDate > latest ? streetDate : latest;
        }, new Date(0));
        if (mostRecent.getTime() > 0) setLastUpdate(mostRecent.toISOString());
      }
    }
  }, [toast]);

  const fetchWorks = useCallback(async () => {
    const { data, error } = await supabase.from('public_works').select('id, title, description, status, location');
    if (error) toast({ title: "Erro ao buscar obras", description: error.message, variant: "destructive" });
    else {
        const formattedWorks = data.map(w => ({
            ...w,
            location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null,
        }));
        setAllWorks(formattedWorks);
    }
  }, [toast]);

  useEffect(() => {
    fetchStreets();
    fetchWorks();
  }, [fetchStreets, fetchWorks]);

  const handleWorkClick = (workId) => {
    setSelectedWorkId(workId);
  };

  const handleStreetListClick = (statusType, title) => {
    const streets = streetData.filter(s => s.status === statusType);
    setStreetListModal({ isOpen: true, title, streets });
  };

  const handleGoToStreet = (location) => {
    if (mapViewRef.current && location) {
      mapViewRef.current.goToLocation(location);
    }
    setStreetListModal({ isOpen: false, title: '', streets: [] });
  };

  const filteredStreets = streetData.filter(street => {
    const searchMatch = searchTerm === '' || street.name.toLowerCase().includes(searchTerm.toLowerCase()) || (street.bairro && street.bairro.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (statusFilter === 'all') return searchMatch;
    return searchMatch && street.status === statusFilter;
  });

  const stats = {
    total: streetData.length,
    paved: streetData.filter(s => s.status === 'paved').length,
    partially_paved: streetData.filter(s => s.status === 'partially_paved').length,
    unpaved: streetData.filter(s => s.status === 'unpaved').length,
  };

  const statusData = [
    { name: 'Pavimentadas', value: stats.paved, fill: '#374151' },
    { name: 'Parcialmente', value: stats.partially_paved, fill: '#6b7280' },
    { name: 'Não Pavimentada', value: stats.unpaved, fill: '#d97706' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  const selectedWork = allWorks.find(w => w.id === selectedWorkId);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover text-popover-foreground p-2 border border-border rounded-md shadow-lg">
          <p className="label font-bold">{`${label}`}</p>
          <p className="intro text-sm">{`Total: ${payload[0].value} ruas`}</p>
        </div>
      );
    }
    return null;
  };

  const getFilterLabel = () => {
    switch (statusFilter) {
      case 'paved': return 'Ruas Pavimentadas';
      case 'unpaved': return 'Ruas Sem Pavimentação';
      case 'partially_paved': return 'Ruas Parcialmente Pavimentadas';
      default: return 'Todos';
    }
  };

  return (
    <>
      <Helmet>
        <title>Mapa de Pavimentação - Trombone Cidadão</title>
        <meta name="description" content="Acompanhe o status da pavimentação das ruas de Floresta-PE e veja os relatórios." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto px-4 py-12"
      >
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-tc-red mb-4">
            Mapa de Pavimentação
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Visualize o status da pavimentação, acompanhe o progresso e acesse relatórios detalhados sobre a infraestrutura de Floresta-PE.
          </p>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}
            </p>
          )}
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="bg-card border border-border p-4 rounded-lg flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleStreetListClick('paved', 'Ruas Pavimentadas')}>
            <div className="p-3 rounded-full bg-gray-800/20 text-gray-800 dark:text-gray-300"><HardHat className="w-6 h-6" /></div>
            <div><p className="text-2xl font-bold">{stats.paved}</p><p className="text-sm text-muted-foreground">Ruas Pavimentadas</p></div>
          </motion.div>
          <motion.div variants={itemVariants} className="bg-card border border-border p-4 rounded-lg flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleStreetListClick('partially_paved', 'Ruas Parcialmente Pavimentadas')}>
            <div className="p-3 rounded-full bg-gray-500/20 text-gray-500 dark:text-gray-400"><Construction className="w-6 h-6" /></div>
            <div><p className="text-2xl font-bold">{stats.partially_paved}</p><p className="text-sm text-muted-foreground">Parcialmente Pavimentadas</p></div>
          </motion.div>
          <motion.div variants={itemVariants} className="bg-card border border-border p-4 rounded-lg flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleStreetListClick('unpaved', 'Ruas Sem Pavimentação')}>
            <div className="p-3 rounded-full bg-amber-600/20 text-amber-600"><ThumbsDown className="w-6 h-6" /></div>
            <div><p className="text-2xl font-bold">{stats.unpaved}</p><p className="text-sm text-muted-foreground">Ruas Sem Pavimentação</p></div>
          </motion.div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="search" className="text-sm font-medium text-muted-foreground">Pesquisar por rua ou bairro</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input id="search" type="text" placeholder="Ex: Rua da Matriz ou Centro..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} list="street-list" />
                <datalist id="street-list">
                  {streetData.map(street => <option key={street.id} value={street.name} />)}
                </datalist>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Filtrar por Status</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between"><span>{getFilterLabel()}</span><Filter className="w-4 h-4 text-muted-foreground" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-card text-foreground border border-border z-[1000]">
                  <DropdownMenuLabel className="text-tc-red">Status</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                    <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="paved">Pavimentadas</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="partially_paved">Parcialmente Pavimentadas</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="unpaved">Sem Pavimentação</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden min-h-[600px]">
            <PavementMapView ref={mapViewRef} streets={filteredStreets} onWorkClick={handleWorkClick} />
          </motion.div>
          <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6 flex flex-col">
            <h3 className="font-semibold mb-4 text-center text-foreground text-lg">Relatório de Pavimentação</h3>
            <div className="flex-grow h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--accent))' }}
                    content={<CustomTooltip />}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">Total de ruas mapeadas: {stats.total}</p>
          </motion.div>
        </div>
      </motion.div>

      <Dialog open={!!selectedWorkId} onOpenChange={(open) => !open && setSelectedWorkId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          {selectedWork && (
            <>
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-tc-red">{selectedWork.title}</DialogTitle>
                <DialogDescription>Detalhes da obra vinculada.</DialogDescription>
              </DialogHeader>
              <div className="flex-grow overflow-hidden">
                <WorksMapView works={[selectedWork]} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={streetListModal.isOpen} onOpenChange={(open) => !open && setStreetListModal({ isOpen: false, title: '', streets: [] })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-tc-red">
              <List className="w-6 h-6" />
              {streetListModal.title}
            </DialogTitle>
            <DialogDescription>
              Lista de ruas para a categoria selecionada. Clique em uma rua para localizá-la no mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <ul className="space-y-2">
              {streetListModal.streets.map(street => (
                <li key={street.id}>
                  <button 
                    onClick={() => handleGoToStreet(street.location)}
                    className="w-full text-left p-3 rounded-md hover:bg-muted transition-colors flex justify-between items-center"
                  >
                    <div>
                      <p>{street.name}</p>
                      {street.bairro && <p className="text-xs text-muted-foreground">{street.bairro.name}</p>}
                    </div>
                    <LocateFixed className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PavementMapPage;
