import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Map, List, Search, SlidersHorizontal, Building, HardHat, CheckSquare, Wrench, MapPin, Activity, AlertTriangle, Check, PauseCircle, PlusCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import WorksMapView from '@/components/WorksMapView';
import { formatCurrency, formatTimeAgo, cn } from '@/lib/utils';
import TelaDeMapa from '@/components/map/TelaDeMapa';
import { useTelaLarga } from '@/hooks/useTelaLarga';
import { Link } from 'react-router-dom';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { showAppError } from '@/lib/appError';
import CartoesDeMapa from '@/components/map/CartoesDeMapa';
import LimparFiltros from '@/components/map/LimparFiltros';
import { useFocoDeRua, dentroDoFoco } from '@/hooks/useFocoDeRua';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
import { WorkEditModal } from '@/pages/admin/ManageWorksPage';

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


// Obra concluída sai da visão padrão (mapa e lista).
//
// O mapa existe para ACOMPANHAR obra — quem abre quer saber o que está parado,
// atrasado ou em andamento na rua dele. Concluídas nunca mudam de novo e, em
// cidade com histórico longo, são a maioria dos pinos: enterravam as três ou
// quatro que ainda importam num mar de verde.
//
// Não é remoção: continuam no banco e voltam assim que alguém marca "Concluída"
// no filtro de status — daí o filtro passa a mandar sozinho, e o padrão sai da
// frente.
const HIDDEN_BY_DEFAULT_STATUS = 'completed';

// O recorte zerado. Existe como constante para o estado inicial e o botão
// "Limpar filtros" não divergirem — um filtro que o botão esquece de apagar é
// pior que botão nenhum, porque a tela passa a afirmar que está limpa.
const FILTROS_VAZIOS = { area: [], contractor: [], status: [], bairro: [] };

// As cores dos pinos, repetidas aqui para a contagem do painel poder servir de
// legenda. A fonte continua sendo `getStatusInfo` em WorksMapView — se um dia
// as duas divergirem, quem manda é o mapa, e é lá que a cor tem de ser trocada
// primeiro.
const COR_DA_SITUACAO = {
  planned: 'bg-purple-500',
  tendered: 'bg-orange-500',
  'in-progress': 'bg-blue-500',
  stalled: 'bg-amber-500',
  unfinished: 'bg-red-500',
  completed: 'bg-green-500',
};

const PublicWorksPage = () => {
  const [view, setView] = useState('map');
  const [works, setWorks] = useState([]); // dataset para modo mapa

  // "As obras desta rua", vindo de `?rua=<id>` — o link da faixa de Minha Rua.
  // Mesma geometria que contou o número que foi clicado (migração 228).
  const { foco: focoDeRua, limpar: limparFocoDeRua } = useFocoDeRua('work_ids');
  const [listWorks, setListWorks] = useState([]); // dataset paginado para lista
  const [listTotal, setListTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState(FILTROS_VAZIOS);
  const [filterOptions, setFilterOptions] = useState({
    areas: [],
    contractors: [],
    bairros: [],
  });
  const [loading, setLoading] = useState(true);
  const [editingWork, setEditingWork] = useState(null);
  const [editOptions, setEditOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const { cityId: activeCityId } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const mapViewRef = useRef();
  const telaLarga = useTelaLarga();
  // Quantos filtros estão ligados — é o número que a pílula "Filtros" mostra
  // quando a coluna é recolhida. Sem ele, alguém esconde a coluna, esquece o
  // recorte e lê o mapa filtrado achando que é a cidade inteira.
  // A busca conta como recorte: quem digitou "creche" e recolheu a coluna está
  // vendo tanto menos da cidade quanto quem marcou um bairro.
  const filtrosLigados = Object.values(filters)
    .reduce((total, valor) => total + (Array.isArray(valor) ? valor.length : 0), 0)
    + (searchTerm.trim() ? 1 : 0);

  // O foco de rua NÃO entra aqui: ele chega pela URL, tem banner próprio
  // explicando que existe e um "X" para sair. Apagá-lo junto faria o botão
  // desfazer, sem avisar, o recorte que a pessoa nem ligou nesta tela.
  const limparFiltros = useCallback(() => {
    setFilters(FILTROS_VAZIOS);
    setSearchTerm('');
  }, []);
  const listTopRef = useRef();

  // Admin/master gerenciam qualquer cidade. Embaixador puro só pode cadastrar
  // a primeira obra da(s) própria(s) cidade(s) ativa(s).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageWorks = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('works')
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

  // Ao trocar de cidade, limpa o bairro selecionado (era de outra cidade).
  const didMountCityRef = useRef(false);
  useEffect(() => {
    if (!didMountCityRef.current) { didMountCityRef.current = true; return; }
    setFilters((prev) => (prev.bairro.length ? { ...prev, bairro: [] } : prev));
  }, [activeCityId]);

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
      // Bairros filtrados pela cidade ativa. A tabela pode não ter city_id
      // (schema legado só-Floresta); nesse caso, faz fallback para todos.
      const fetchBairros = async () => {
        if (activeCityId) {
          const scoped = await supabase.from('bairros').select('id, name').eq('city_id', activeCityId);
          if (!scoped.error) return scoped;
          // coluna city_id inexistente → cai para lista completa
        }
        return supabase.from('bairros').select('id, name');
      };

      const [
        { data: categories, error: categoryError },
        { data: areas, error: areaError },
        { data: contractors, error: conError },
        { data: bairros, error: bairroError }
      ] = await Promise.all([
        supabase.from('work_categories').select('id, name'),
        supabase.from('work_areas').select('id, name'),
        supabase.from('contractors').select('id, name'),
        fetchBairros(),
      ]);

      if (categoryError) throw categoryError;
      if (areaError) throw areaError;
      if (conError) throw conError;
      if (bairroError) throw bairroError;

      setFilterOptions({
        areas: areas || [],
        contractors: contractors || [],
        bairros: bairros || [],
      });
      setEditOptions({
        categories: categories || [],
        areas: areas || [],
        contractors: contractors || [],
        bairros: bairros || [],
      });
    } catch (error) {
      showAppError({
        title: 'Erro ao carregar opções de filtro',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [activeCityId]);

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('public_works')
        .select(`
          id, title, description, status, location, start_date, expected_end_date, total_value, amount_spent, execution_percentage, last_update, thumbnail_url, is_complete,
          work_category:work_category_id(id, name),
          work_area:work_area_id(id, name),
          bairro:bairro_id(id, name),
          contractor:contractor_id(id, name, cnpj)
        `)
        .eq('is_complete', true)
        .order('created_at', { ascending: false });
      if (activeCityId) query = query.eq('city_id', activeCityId);

      const { data, error } = await query;

      if (error) throw error;
      const formattedData = data.map(w => ({
        ...w,
        location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null
      }));
      setWorks(formattedData);
    } catch (error) {
      showAppError({
        title: "Erro ao buscar obras públicas",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [activeCityId]);

  const fetchListWorks = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      let query = supabase
        .from('public_works')
        .select(`
          id, title, description, status, location, start_date, expected_end_date, total_value, amount_spent, execution_percentage, last_update, thumbnail_url, is_complete,
          work_category:work_category_id(id, name),
          work_area:work_area_id(id, name),
          bairro:bairro_id(id, name),
          contractor:contractor_id(id, name, cnpj)
        `, { count: 'exact' })
        .eq('is_complete', true)
        .order('created_at', { ascending: false });
      if (activeCityId) query = query.eq('city_id', activeCityId);
      // O recorte por rua vale para os DOIS modos. Sem esta linha, trocar para
      // a lista com `?rua=` ligado devolveria a cidade inteira sem avisar — e o
      // banner do painel continuaria dizendo que o recorte estava ativo.
      if (focoDeRua) query = query.in('id', [...focoDeRua.ids]);

      if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.trim();
        query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      } else {
        query = query.neq('status', HIDDEN_BY_DEFAULT_STATUS);
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
      showAppError({
        title: "Erro ao carregar lista de obras",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters.area, filters.contractor, filters.status, filters.bairro, pageSize, activeCityId, focoDeRua]);

  useEffect(() => {
    fetchWorks();
    fetchFilterOptions();
  }, [fetchWorks, fetchFilterOptions]);

  // O RECORTE SEM A SITUAÇÃO — É DELE QUE SAEM AS CONTAGENS
  //
  // Os cartões do topo contam E filtram, e contar sobre o resultado do próprio
  // filtro de situação fazia o contador se destruir ao ser usado: clicar em
  // "Concluídas" zerava "Em andamento", "Paralisadas" e "Inacabadas", e a tela
  // passava a afirmar que a cidade não tem obra parada nenhuma. Quem quisesse
  // trocar de situação lia três zeros e concluía que não havia o que ver.
  //
  // Aqui entram todos os outros recortes — busca, área, construtora, bairro e a
  // rua vinda da URL. A situação entra depois, em `filteredWorks`, que é o que
  // o mapa desenha.
  const worksDoRecorte = useMemo(() => {
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
    if (filters.bairro.length > 0) {
      result = result.filter(w => w.bairro?.id && filters.bairro.includes(w.bairro.id));
    }
    // Por último de propósito: o recorte por rua é o mais estreito de todos, e
    // aplicá-lo sobre o resultado dos outros deixa claro que ele SOMA, e não
    // substitui, o que já estava filtrado.
    if (focoDeRua) {
      result = result.filter(w => dentroDoFoco(focoDeRua, w.id));
    }

    return result;
  }, [works, searchTerm, filters.area, filters.contractor, filters.bairro, focoDeRua]);

  // O que o mapa e a lista mostram: o recorte acima, agora com a situação.
  // Sem filtro de situação marcado, vale o padrão da tela — concluída não
  // aparece.
  const filteredWorks = useMemo(() => (
    filters.status.length > 0
      ? worksDoRecorte.filter(w => filters.status.includes(w.status))
      : worksDoRecorte.filter(w => w.status !== HIDDEN_BY_DEFAULT_STATUS)
  ), [worksDoRecorte, filters.status]);

  // Mexer no recorte devolve a lista para a primeira página: a página 3 do
  // recorte anterior quase nunca existe no novo.
  useEffect(() => {
    if (view === 'list') {
      setCurrentPage(1);
      fetchListWorks(1);
    }
  }, [searchTerm, filters, view, fetchListWorks]);
  
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const startIndex = (currentPage - 1) * pageSize;

  const handleEditWork = useCallback(async (work) => {
    const { data, error } = await supabase
      .from('public_works')
      .select('*, bairro:bairro_id(id, name), work_category:work_category_id(id, name), work_area:work_area_id(id, name), contractor:contractor_id(id, name)')
      .eq('id', work.id)
      .single();
    if (error) {
      showAppError({ title: 'Erro ao carregar obra', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingWork(data);
  }, []);

  const handleSaveWork = useCallback(async (workToSave) => {
    const { id, location, manual_city_id, bairro, work_category, work_area, contractor, ...data } = workToSave;
    const resolvedCityId = manual_city_id || await resolveCityIdFromLocation(location);
    if (resolvedCityId == null) {
      showAppError({ title: 'Não foi possível identificar a cidade', description: 'Confira a localização do marcador.', variant: 'destructive' });
      return;
    }
    const payload = {
      ...data,
      city_id: resolvedCityId,
      location: location ? `POINT(${location.lng} ${location.lat})` : null,
      funding_source: Array.isArray(data.funding_source) ? data.funding_source : [],
    };
    ['bairro_id', 'work_category_id', 'work_area_id', 'contractor_id'].forEach((key) => {
      if (payload[key] === '') payload[key] = null;
    });
    const { error } = await supabase.from('public_works').update(payload).eq('id', id);
    if (error) {
      showAppError({ title: 'Erro ao salvar obra', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingWork(null);
    await fetchWorks();
  }, [fetchWorks, resolveCityIdFromLocation]);

  const workEditor = editingWork ? (
    <WorkEditModal
      work={editingWork}
      onSave={handleSaveWork}
      onClose={() => setEditingWork(null)}
      workOptions={editOptions}
      onWorkUpdated={fetchWorks}
      defaultCityId={activeCityId}
      canSelectCity={Boolean(user?.is_admin || user?.is_master)}
      onBairroCreated={(bairro) => setEditOptions((prev) => ({ ...prev, bairros: [...prev.bairros, bairro] }))}
    />
  ) : null;
  
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
  })[status] || { icon: HardHat, text: 'N/A', color: 'text-content-tertiary' };

  // ── Colunas, a partir de 1100px ───────────────────────────────────────────
  //
  // Mesma moldura do mapa de pavimentação e do mapa de broncas. Só no modo
  // MAPA: a lista tem paginação e cartões em grade, e não é uma tela de mapa —
  // espremê-la numa coluna central pioraria a leitura sem ganhar nada.
  //
  // O celular e o notebook estreito continuam pelo caminho de baixo, com o
  // cartão de filtros acima do mapa.
  if (telaLarga && view === 'map' && !loading && works.length > 0) {
    const contarPorSituacao = (lista) => lista.reduce((conta, obra) => {
      conta[obra.status] = (conta[obra.status] || 0) + 1;
      return conta;
    }, {});

    // DUAS CONTAGENS, DUAS PERGUNTAS DIFERENTES
    //
    // A legenda da coluna descreve os PINOS que estão no mapa — por isso conta
    // o que sobrou depois de todos os filtros. Os cartões do topo contam o
    // recorte SEM a situação: eles são o botão que troca de situação, e um
    // botão precisa dizer quantas obras vai mostrar ANTES de ser apertado.
    const porSituacao = contarPorSituacao(filteredWorks);
    const porSituacaoNoRecorte = contarPorSituacao(worksDoRecorte);

    return (
      <>
      <TelaDeMapa
        titulo="Mapa de Obras Públicas"
        subtitulo="O que está sendo construído na sua cidade, e em que pé está"
        tituloDaAba="Mapa de Obras Públicas - Trombone Cidadão"
        descricaoSeo="Acompanhe o andamento das obras públicas da sua cidade em um mapa interativo."
        filtrosLigados={filtrosLigados}
        /* O TOTAL VAI NO SELO, A REPARTIÇÃO VAI NOS CARTÕES
           Um cartão "Obras no recorte: 65" ao lado de um selo dizendo a mesma
           coisa seria a legenda duplicada de novo, em outro formato. O selo
           responde "quantas"; os cartões respondem "em que pé". */
        destaque={
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700">
            <HardHat className="h-4 w-4" />
            {filteredWorks.length} {filteredWorks.length === 1 ? 'obra no recorte' : 'obras no recorte'}
          </span>
        }
        /* A COLUNA DA DIREITA SÓ EXISTE ACIMA DE 1440px
           Até aqui, quem abrisse esta tela num notebook não via contagem
           nenhuma — nem no topo, nem na lateral que não cabe. As cores dos
           quadrados são as MESMAS dos pinos daquelas situações, então o cartão
           e o mapa se reconhecem sem ninguém explicar. */
        estatisticas={
          <CartoesDeMapa
            cartoes={[
              { id: 'in-progress', Icone: HardHat, cor: 'bg-blue-500', rotulo: 'Em andamento', valor: porSituacaoNoRecorte['in-progress'] || 0 },
              { id: 'stalled', Icone: PauseCircle, cor: 'bg-amber-500', rotulo: 'Paralisadas', valor: porSituacaoNoRecorte.stalled || 0 },
              { id: 'unfinished', Icone: AlertTriangle, cor: 'bg-red-500', rotulo: 'Inacabadas', valor: porSituacaoNoRecorte.unfinished || 0 },
              { id: 'completed', Icone: CheckSquare, cor: 'bg-green-500', rotulo: 'Concluídas', valor: porSituacaoNoRecorte.completed || 0 },
            ].map((cartao) => ({
              ...cartao,
              // Tocar no cartão é o mesmo que marcar aquela situação no filtro
              // de status — e tocar de novo desmarca. Sozinho é sozinho: o
              // cartão RESTRINGE a uma situação, em vez de acrescentar à seleção
              // atual, porque "quero ver só as paralisadas" é o que se quer
              // dizer ao apertar um número.
              ativo: filters.status.length === 1 && filters.status[0] === cartao.id,
              aoClicar: () => setFilters((atual) => ({
                ...atual,
                status: atual.status.length === 1 && atual.status[0] === cartao.id ? [] : [cartao.id],
              })),
            }))}
            rodape="Contagem sobre as obras filtradas, não sobre a cidade inteira."
          />
        }
        filtros={
          <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm">
            <CitySelector />

            {/* Chega pela URL, sem ninguém ter tocado num filtro desta tela —
                então precisa dizer que existe, ou o mapa quase vazio lê como
                mapa quebrado. */}
            {focoDeRua && (
              <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-subtleBg px-2.5 py-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-brand-subtleFg">
                    Só {focoDeRua.nome || 'esta rua'}
                  </p>
                  {focoDeRua.ids.size === 0 ? (
                    <p className="text-[10px] leading-tight text-content-tertiary">
                      Nenhuma obra cadastrada nesta rua.
                    </p>
                  ) : !focoDeRua.preciso && (
                    <p className="text-[10px] leading-tight text-content-tertiary">
                      Sem traçado cadastrado: o recorte é um raio em volta do ponto da rua.
                    </p>
                  )}
                </div>
                <button type="button" onClick={limparFocoDeRua} aria-label="Ver a cidade inteira">
                  <X size={13} className="text-content-tertiary hover:text-content-primary" />
                </button>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
              <Input
                placeholder="Buscar obra"
                className="h-9 pl-8 text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <MultiSelectFilter
              triggerIcon={Activity}
              triggerLabel="Status"
              items={workStatusesAsArray}
              selectedItems={filters.status}
              onSelectionChange={(id) => handleMultiSelectFilterChange('status', id)}
              searchPlaceholder="Buscar status..."
            />
            {filters.status.length === 0 && (
              <p className="text-[10px] leading-tight text-content-tertiary">
                Obras concluídas ficam ocultas. Marque “Concluída” para vê-las.
              </p>
            )}

            <MultiSelectFilter
              triggerIcon={MapPin}
              triggerLabel="Bairro"
              items={filterOptions.bairros}
              selectedItems={filters.bairro}
              onSelectionChange={(id) => handleMultiSelectFilterChange('bairro', id)}
              searchPlaceholder="Buscar bairro..."
            />

            <MultiSelectFilter
              triggerIcon={SlidersHorizontal}
              triggerLabel="Área"
              items={filterOptions.areas}
              selectedItems={filters.area}
              onSelectionChange={(id) => handleMultiSelectFilterChange('area', id)}
              searchPlaceholder="Buscar área..."
            />

            <MultiSelectFilter
              triggerIcon={Building}
              triggerLabel="Construtora"
              items={filterOptions.contractors}
              selectedItems={filters.contractor}
              onSelectionChange={(id) => handleMultiSelectFilterChange('contractor', id)}
              searchPlaceholder="Buscar construtora..."
            />

            {/* Fecha a lista de filtros: o último item da coluna é o que desfaz
                a coluna inteira. */}
            <LimparFiltros ligados={filtrosLigados} aoLimpar={limparFiltros} className="w-full" />

            <div className="mt-auto grid gap-2">
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={value => value && setView(value)}
                className="justify-center rounded-md border"
              >
                <ToggleGroupItem value="map" aria-label="Ver mapa" className="flex-1"><Map className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Ver lista" className="flex-1"><List className="h-4 w-4" /></ToggleGroupItem>
              </ToggleGroup>

              {canManageWorks && (
                <Link to="/obras/gerenciar" className="w-full">
                  <Button size="sm" variant="outline" className="w-full gap-1.5 border-tc-red/30 text-xs text-tc-red hover:bg-tc-red/5">
                    <PlusCircle className="h-3.5 w-3.5" /> Adicionar obra
                  </Button>
                </Link>
              )}
            </div>
          </div>
        }
        mapa={<WorksMapView ref={mapViewRef} works={filteredWorks} mostrarLegenda={false} podeGerir={canManageWorks} onEditWork={handleEditWork} />}
        /* SÓ A CONTAGEM MORA AQUI
           O cartão "Obras concluídas" que ficava abaixo era o cartão
           "Concluídas" da faixa do topo repetido em outro formato: mesmo
           número, mesmo verde, mesmo clique ligando o mesmo filtro. */
        painel={
          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
            <p className="flex items-center gap-2.5 text-sm font-bold text-content-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-pendingBg text-status-pendingFg">
                <HardHat className="h-4 w-4" />
              </span>
              Obras no recorte
            </p>
            <p className="mt-3 text-3xl font-extrabold leading-none text-content-primary tabular-nums">
              {filteredWorks.length}
            </p>

            {/* A CONTAGEM É A LEGENDA
                Eram dois blocos dizendo a mesma coisa: este, com os números
                por situação, e uma legenda flutuante sobre o mapa com as
                cores. Juntos, cada um contava metade da história e ocupava o
                espaço inteiro. Com a bolinha aqui, uma linha responde "que cor
                é essa" e "quantas são" de uma vez. */}
            <ul className="mt-3 grid gap-1.5 border-t border-edge-subtle pt-3">
              {workStatusesAsArray
                .filter((s) => porSituacao[s.id])
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_DA_SITUACAO[s.id] || 'bg-gray-500'}`} />
                    <span className="min-w-0 flex-1 truncate text-content-secondary">{s.name}</span>
                    <span className="shrink-0 font-bold text-content-primary tabular-nums">{porSituacao[s.id]}</span>
                  </li>
                ))}
            </ul>
          </section>
        }
      />
      {workEditor}
      </>
    );
  }

  return <>
    <Helmet>
      <title>Mapa de Obras Públicas - Trombone Cidadão</title>
      <meta name="description" content="Acompanhe o andamento das obras públicas da sua cidade em um mapa interativo." />
    </Helmet>
    <div className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-[900] text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-tc-red">Mapa de Obras Públicas</h1>
        <p className="mt-2 text-lg text-muted-foreground">Acompanhe com transparência o que está sendo construído na sua cidade</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <CitySelector />
          {canManageWorks && (
            <Link to="/obras/gerenciar">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                <PlusCircle className="w-3.5 h-3.5" /> Adicionar obra
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      {!loading && works.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <HardHat className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground mb-1">Nenhuma obra cadastrada</p>
          <p className="text-sm text-muted-foreground mb-4">
            Ainda não há obras públicas cadastradas {activeCityId ? 'para esta cidade' : ''}.
          </p>
          {canManageWorks && (
            <Link to="/obras/gerenciar">
              <Button className="gap-2">
                <PlusCircle className="w-4 h-4" /> Cadastrar primeira obra
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-6 p-4 relative z-[800]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative md:col-span-2 lg:col-span-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input placeholder="Buscar obra por nome ou descrição..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1">
                <MultiSelectFilter
                  triggerIcon={Activity}
                  triggerLabel="Filtrar por Status"
                  items={workStatusesAsArray}
                  selectedItems={filters.status}
                  onSelectionChange={(id) => handleMultiSelectFilterChange('status', id)}
                  searchPlaceholder="Buscar status..."
                />
                {filters.status.length === 0 && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Obras concluídas ficam ocultas. Marque "Concluída" no filtro para vê-las.
                  </p>
                )}
              </div>

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

            {/* O MESMO BOTÃO DA COLUNA LARGA
                No celular não há coluna nem pílula de contagem: o cartão de
                filtros é tudo o que existe, e sem esta linha a única saída de um
                recorte errado é reabrir os quatro seletores. */}
            {filtrosLigados > 0 && (
              <div className="mt-3 flex justify-end">
                <LimparFiltros ligados={filtrosLigados} aoLimpar={limparFiltros} />
              </div>
            )}
          </Card>

          {loading ? <div className="text-center p-8">Carregando obras...</div> : <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
          {view === 'map' ? (
            <div className="h-[70vh] w-full rounded-xl overflow-hidden shadow-lg border">
              <WorksMapView ref={mapViewRef} works={filteredWorks} podeGerir={canManageWorks} onEditWork={handleEditWork} />
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
        </>
      )}
    </div>
    {workEditor}
  </>;
};


// O filtro de cidade desta tela e local: explorar as obras de outra cidade nao
// muda o feed nem a cidade do header, e nao persiste ao sair.
export default function PublicWorksPageWithCityView() {


  return (
    <CityViewProvider>
      <PublicWorksPage />
    </CityViewProvider>
  );
}
