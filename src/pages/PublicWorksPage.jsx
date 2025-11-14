import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Map, List, Search, SlidersHorizontal, Building, HardHat, CheckSquare, Wrench, MapPin, Activity, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import WorksMapView from '@/components/WorksMapView';
import { formatCurrency, formatTimeAgo, cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const MultiSelectFilter = ({ triggerIcon, triggerLabel, items, selectedItems, onSelectionChange, searchPlaceholder }) => {
  const Icon = triggerIcon;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span>{triggerLabel}</span>
            {selectedItems.length > 0 && <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-2">{selectedItems.length}</span>}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem key={item.id} onSelect={() => onSelectionChange(item.id)}>
                  <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedItems.includes(item.id) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                    <Check className={cn("h-4 w-4")} />
                  </div>
                  <span>{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};


const PublicWorksPage = () => {
  const [view, setView] = useState('map');
  const [works, setWorks] = useState([]);
  const [filteredWorks, setFilteredWorks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    area: [],
    contractor: [],
    status: [],
    bairro: [],
  });
  const [filterOptions, setFilterOptions] = useState({
    areas: [],
    contractors: [],
    bairros: [],
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const mapViewRef = useRef();

  const workStatuses = {
    'planned': 'Prevista',
    'tendered': 'Licitada',
    'in-progress': 'Em Andamento',
    'stalled': 'Paralisada',
    'unfinished': 'Inacabada',
    'completed': 'Concluída',
  };

  const workStatusesAsArray = Object.entries(workStatuses).map(([value, label]) => ({ id: value, name: label }));

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [
        { data: areas, error: areaError },
        { data: contractors, error: conError },
        { data: bairros, error: bairroError }
      ] = await Promise.all([
        supabase.from('work_areas').select('id, name'),
        supabase.from('contractors').select('id, name'),
        supabase.from('bairros').select('id, name'),
      ]);

      if (areaError) throw areaError;
      if (conError) throw conError;
      if (bairroError) throw bairroError;

      setFilterOptions({
        areas: areas || [],
        contractors: contractors || [],
        bairros: bairros || [],
      });
    } catch (error) {
      toast({
        title: 'Erro ao carregar opções de filtro',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [toast]);

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_works')
        .select(`
          id, title, description, status, location, start_date, expected_end_date, total_value, amount_spent, execution_percentage, last_update,
          work_category:work_category_id(id, name),
          work_area:work_area_id(id, name),
          bairro:bairro_id(id, name),
          contractor:contractor_id(id, name)
        `).order('created_at', { ascending: false });

      if (error) throw error;
      const formattedData = data.map(w => ({
        ...w,
        location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null
      }));
      setWorks(formattedData);
      setFilteredWorks(formattedData);
    } catch (error) {
      toast({
        title: "Erro ao buscar obras públicas",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWorks();
    fetchFilterOptions();
  }, [fetchWorks, fetchFilterOptions]);

  useEffect(() => {
    let result = works;

    if (searchTerm) {
      result = result.filter(w => w.title.toLowerCase().includes(searchTerm.toLowerCase()) || w.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (filters.area.length > 0) {
      result = result.filter(w => w.work_area?.id && filters.area.includes(w.work_area.id));
    }
    if (filters.contractor.length > 0) {
      result = result.filter(w => w.contractor?.id && filters.contractor.includes(w.contractor.id));
    }
    if (filters.status.length > 0) {
      result = result.filter(w => filters.status.includes(w.status));
    }
    if (filters.bairro.length > 0) {
      result = result.filter(w => w.bairro?.id && filters.bairro.includes(w.bairro.id));
    }

    setFilteredWorks(result);
  }, [searchTerm, filters, works]);
  
  const handleMultiSelectFilterChange = (type, value) => {
    setFilters(prev => {
      const currentValues = prev[type];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(item => item !== value)
        : [...currentValues, value];
      return { ...prev, [type]: newValues };
    });
  };

  const getStatusInfo = status => ({
    'planned': { icon: HardHat, text: 'Prevista', color: 'text-purple-500' },
    'tendered': { icon: HardHat, text: 'Licitada', color: 'text-orange-500' },
    'in-progress': { icon: HardHat, text: 'Em Andamento', color: 'text-blue-500' },
    'stalled': { icon: HardHat, text: 'Paralisada', color: 'text-amber-500' },
    'unfinished': { icon: Wrench, text: 'Inacabada', color: 'text-red-500' },
    'completed': { icon: CheckSquare, text: 'Concluída', color: 'text-green-500' },
  })[status] || { icon: HardHat, text: 'N/A', color: 'text-gray-500' };

  return <>
    <Helmet>
      <title>Mapa de Obras Públicas - Trombone Cidadão</title>
      <meta name="description" content="Acompanhe o andamento das obras públicas em Floresta-PE em um mapa interativo." />
    </Helmet>
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-tc-red">Mapa de Obras Públicas</h1>
        <p className="mt-2 text-lg text-muted-foreground">Acompanhe com transparência o que está sendo construído na cidade de Floresta-PE</p>
      </motion.div>

      <Card className="mb-6 p-4 relative z-[1000]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative md:col-span-2 lg:col-span-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input placeholder="Buscar obra por nome ou descrição..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <MultiSelectFilter
            triggerIcon={Activity}
            triggerLabel="Filtrar por Status"
            items={workStatusesAsArray}
            selectedItems={filters.status}
            onSelectionChange={(id) => handleMultiSelectFilterChange('status', id)}
            searchPlaceholder="Buscar status..."
          />
          
          <MultiSelectFilter
            triggerIcon={MapPin}
            triggerLabel="Filtrar por Bairro"
            items={filterOptions.bairros}
            selectedItems={filters.bairro}
            onSelectionChange={(id) => handleMultiSelectFilterChange('bairro', id)}
            searchPlaceholder="Buscar bairro..."
          />

          <MultiSelectFilter
            triggerIcon={SlidersHorizontal}
            triggerLabel="Filtrar por Área"
            items={filterOptions.areas}
            selectedItems={filters.area}
            onSelectionChange={(id) => handleMultiSelectFilterChange('area', id)}
            searchPlaceholder="Buscar área..."
          />

          <MultiSelectFilter
            triggerIcon={Building}
            triggerLabel="Filtrar por Construtora"
            items={filterOptions.contractors}
            selectedItems={filters.contractor}
            onSelectionChange={(id) => handleMultiSelectFilterChange('contractor', id)}
            searchPlaceholder="Buscar construtora..."
          />

          <ToggleGroup type="single" value={view} onValueChange={value => value && setView(value)} className="border rounded-md justify-center">
            <ToggleGroupItem value="map" aria-label="Ver mapa" className="flex-1"><Map className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Ver lista" className="flex-1"><List className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Card>

      {loading ? <div className="text-center p-8">Carregando obras...</div> : <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
          {view === 'map' ? (
            <div className="h-[70vh] w-full rounded-xl overflow-hidden shadow-lg border">
              <WorksMapView ref={mapViewRef} works={filteredWorks} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorks.length > 0 ? filteredWorks.map(work => {
                const statusInfo = getStatusInfo(work.status);
                return (
                  <Card key={work.id} className="flex flex-col justify-between hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold mb-2">{work.title}</h3>
                        <div className={`flex items-center text-xs font-semibold ${statusInfo.color}`}>
                          <statusInfo.icon className="w-3 h-3 mr-1" />
                          {statusInfo.text}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{work.description}</p>
                      {work.execution_percentage > 0 && (
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Execução</span>
                            <span>{work.execution_percentage}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5"><div className="bg-tc-red h-1.5 rounded-full" style={{ width: `${work.execution_percentage}%` }}></div></div>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>Valor:</strong> {formatCurrency(work.total_value)}</p>
                        <p><strong>Construtora:</strong> {work.contractor?.name || 'N/A'}</p>
                        <p><strong>Última Atualização:</strong> {formatTimeAgo(work.last_update)}</p>
                      </div>
                    </CardContent>
                    <div className="p-4 border-t flex gap-2">
                      <Link to={`/obras-publicas/${work.id}`} className="flex-1"><Button size="sm" className="w-full">Mais Detalhes</Button></Link>
                    </div>
                  </Card>
                );
              }) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nenhuma obra encontrada com os filtros selecionados.</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>}
    </div>
  </>;
};

export default PublicWorksPage;