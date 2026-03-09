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
  const [works, setWorks] = useState([]); // dataset para modo mapa
  const [filteredWorks, setFilteredWorks] = useState([]); // filtrado para mapa
  const [listWorks, setListWorks] = useState([]); // dataset paginado para lista
  const [listTotal, setListTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
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
  const listTopRef = useRef();

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
          id, title, description, status, location, start_date, expected_end_date, total_value, amount_spent, execution_percentage, last_update, thumbnail_url,
          work_category:work_category_id(id, name),
          work_area:work_area_id(id, name),
          bairro:bairro_id(id, name),
          contractor:contractor_id(id, name, cnpj)
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

  const fetchListWorks = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      let query = supabase
        .from('public_works')
        .select(`
          id, title, description, status, location, start_date, expected_end_date, total_value, amount_spent, execution_percentage, last_update, thumbnail_url,
          work_category:work_category_id(id, name),
          work_area:work_area_id(id, name),
          bairro:bairro_id(id, name),
          contractor:contractor_id(id, name, cnpj)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters.area.length > 0) {
        query = query.in('work_area_id', filters.area);
      }
      if (filters.contractor.length > 0) {
        query = query.in('contractor_id', filters.contractor);
      }
      if (filters.bairro.length > 0) {
        query = query.in('bairro_id', filters.bairro);
      }

      const offset = (page - 1) * pageSize;
      const { data, error, count } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;
      const formattedData = (data || []).map(w => ({
        ...w,
        location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null
      }));
      setListWorks(formattedData);
      setListTotal(count || 0);
    } catch (error) {
      toast({
        title: "Erro ao carregar lista de obras",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast, searchTerm, filters.area, filters.contractor, filters.status, filters.bairro, pageSize]);

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
    if (view === 'list') {
      setCurrentPage(1);
      fetchListWorks(1);
    }
  }, [searchTerm, filters, works, view, fetchListWorks]);
  
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  
  useEffect(() => {
    if (view === 'list' && listTopRef.current) {
      listTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [currentPage, view]);
  
  useEffect(() => {
    if (view === 'list') {
      fetchListWorks(currentPage);
    }
  }, [view, currentPage, fetchListWorks]);
  
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

      <Card className="mb-6 p-4 relative z-[800]">
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
            <>
            <div ref={listTopRef} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listWorks.length > 0 ? listWorks.map(work => {
                const statusInfo = getStatusInfo(work.status);
                const progress = Number.isFinite(work.execution_percentage) ? Math.max(0, Math.min(100, work.execution_percentage)) : 0;
                return (
                  <Card key={work.id} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
                    <div className="relative h-36 w-full bg-muted">
                      {work.thumbnail_url ? (
                        <img src={work.thumbnail_url} alt={work.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <HardHat className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-semibold bg-white/85 backdrop-blur border">
                        <span className={`${statusInfo.color} flex items-center gap-1`}>
                          <statusInfo.icon className="w-3 h-3" />
                          {statusInfo.text}
                        </span>
                      </div>
                    </div>
                    <CardContent className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold mb-1 line-clamp-2">{work.title}</h3>
                      {work.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{work.description}</p>}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Execução</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className="bg-tc-red h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2 mt-auto">
                        {work.total_value && <p className="col-span-2"><strong>Valor:</strong> {formatCurrency(work.total_value)}</p>}
                        {work.contractor?.name && <p className="col-span-2"><strong>Construtora:</strong> {work.contractor.name}</p>}
                        {work.last_update && <p className="col-span-2"><strong>Última Atualização:</strong> {formatTimeAgo(work.last_update)}</p>}
                      </div>
                    </CardContent>
                    <div className="p-4 pt-0 flex gap-2 mt-auto">
                      <Link to={`/obras-publicas/${work.id}`} className="flex-1"><Button className="w-full">Mais Detalhes</Button></Link>
                    </div>
                  </Card>
                );
              }) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nenhuma obra encontrada com os filtros selecionados.</p>
                </div>
              )}
            </div>
            {filteredWorks.length > 0 && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  Exibindo {Math.min(filteredWorks.length, startIndex + 1)}–{Math.min(filteredWorks.length, startIndex + pageSize)} de {filteredWorks.length}
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:overflow-x-auto sm:max-w-[70vw]">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Anterior</Button>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <Button
                        key={i}
                        variant={currentPage === i + 1 ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(i + 1)}
                        className="flex-shrink-0"
                      >
                        {i + 1}
                      </Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Próxima</Button>
                </div>
              </div>
            )}
            </>
          )}
        </motion.div>
      </AnimatePresence>}
    </div>
  </>;
};


export default PublicWorksPage;
