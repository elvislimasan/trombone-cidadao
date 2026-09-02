import { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Loader2, Search, X, MapPin, ChevronDown, LocateFixed, Check,
  SlidersHorizontal, ChevronRight, Megaphone, CheckCircle2, Clock, PlusCircle,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';
import { useReportUpdate } from '@/hooks/useReportUpdate';
import ReportUpdateModal from '@/components/report/ReportUpdateModal';
import TelaDeMapa from '@/components/map/TelaDeMapa';
import { useTelaLarga } from '@/hooks/useTelaLarga';
import { useFocoDeRua } from '@/hooks/useFocoDeRua';
import CartoesDeMapa from '@/components/map/CartoesDeMapa';
import ReportModal from '@/components/ReportModal';
import { useCreateReport } from '@/hooks/useCreateReport';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { statusDaConsulta, statusInicialDoMapa } from '@/lib/mapReportFilters';

const MapView = lazy(() => import('@/components/MapView'));
// Carregado sob demanda: quem só consulta o mapa não paga pelo peso dos hooks
// de GPS contínuo, voz e alertas.

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { id: 'all',         label: 'Todas' },
  { id: 'active',      label: 'Ativas' },
  { id: 'pending',     label: 'Pendentes' },
  { id: 'in-progress', label: 'Em Andamento' },
  { id: 'resolved',    label: 'Resolvidas' },
];

const CATEGORIES = [
  { id: 'all',               label: 'Todas' },
  { id: 'iluminacao',        label: 'Iluminação' },
  { id: 'buracos',           label: 'Buracos' },
  { id: 'esgoto',            label: 'Esgoto' },
  { id: 'limpeza',           label: 'Limpeza' },
  { id: 'poda',              label: 'Poda' },
  { id: 'vazamento-de-agua', label: 'Vazamento' },
  { id: 'outros',            label: 'Outros' },
];


// ─── Small helpers ────────────────────────────────────────────────────────────

const FilterChip = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/30 rounded-full text-xs font-semibold px-2.5 py-1">
    {label}
    <button type="button" onClick={onRemove} className="hover:opacity-70">
      <X size={11} />
    </button>
  </span>
);

const SheetChip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border text-sm font-semibold px-4 py-1.5 transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-background text-foreground border-border hover:border-primary/40'
    }`}
  >
    {children}
  </button>
);

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

const BottomSheet = ({ open, onClose, title, children }) => {

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1002] flex flex-col justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-background rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200" style={{ maxHeight: 'calc(85vh - env(safe-area-inset-bottom, 0px))', paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0 border-b border-border">
          <span className="font-bold text-base">{title}</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── MapLoader ────────────────────────────────────────────────────────────────

const MapLoader = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm z-20">
    <Loader2 size={36} className="animate-spin text-primary" />
    <p className="text-sm text-muted-foreground font-medium">Carregando mapa…</p>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cities, loadingCities } = useCity();

  // Esta página consulta. A patrulha mora em /patrulhar, com mapa próprio.
  //
  // Até aqui as duas dividiam esta tela, e o preço eram quinze condicionais
  // `if (navMode)` espalhadas: não buscar clusters, não sincronizar cidade,
  // esconder loader, legenda, toque e chrome. Cada recurso novo de um dos modos
  // obrigava a reler os freios do outro. Agora cada tela faz uma coisa.
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  // ── City state ──
  const [mapCityId,   setMapCityId]   = useState(null);
  const [mapCityName, setMapCityName] = useState(null);
  const [mapGpsInitDone, setMapGpsInitDone] = useState(false);
  // Posicao do usuario obtida no init. Serve para o mapa montar ja centrado
  // nela, em vez de abrir em Floresta e saltar depois.
  const [initialUserPos, setInitialUserPos] = useState(null);
  // Vira true quando o GPS respondeu, foi negado ou expirou. O mapa so monta
  // depois disso: montar antes fixaria o centro em Floresta, e a posicao do
  // usuario chegaria tarde demais para evitar o salto. Sem permissao o mapa
  // abre normalmente na cidade, so um instante depois.
  const [geoSettled, setGeoSettled] = useState(false);
  const [citySheetOpen,  setCitySheetOpen]  = useState(false);
  const [citySearch,     setCitySearch]     = useState('');
  const [showAllCities,  setShowAllCities]  = useState(false);
  const [gpsLoading,     setGpsLoading]     = useState(false);
  const [nearbyLoading,  setNearbyLoading]  = useState(false);
  const [nearbyCities,   setNearbyCities]   = useState([]);

  // ── Filter state ──
  const statusInicial = statusInicialDoMapa(location.search);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [statusFilter,    setStatusFilter]    = useState(statusInicial);
  const [categoryFilter,  setCategoryFilter]  = useState('all');
  // pending changes inside sheet
  const [pendingStatus,   setPendingStatus]   = useState(statusInicial);
  const [pendingCategory, setPendingCategory] = useState('all');

  // Também cobre uma navegação para `?rua=` enquanto o mapa já está montado.
  // Depois disso a escolha é da pessoa: mudar o status não é desfeito enquanto
  // o parâmetro permanece na URL.
  const tinhaFocoNaUrl = useRef(Boolean(new URLSearchParams(location.search).get('rua')));
  useEffect(() => {
    const temFocoNaUrl = Boolean(new URLSearchParams(location.search).get('rua'));
    if (temFocoNaUrl && !tinhaFocoNaUrl.current) {
      setStatusFilter('all');
      setPendingStatus('all');
    }
    tinhaFocoNaUrl.current = temFocoNaUrl;
  }, [location.search]);

  // ── Search ──
  const [titleSearchInput, setTitleSearchInput] = useState('');
  const [titleSearchTerm,  setTitleSearchTerm]  = useState('');

  // ── Reports / map ──
  const [mapClusters, setMapClusters] = useState([]); // [{ isCluster, lat, lng, count, ids, report }]
  const [flyToTarget, setFlyToTarget] = useState(null);

  // REGISTRAR UMA BRONCA SEM SAIR DO MAPA
  //
  // No celular o "+" da barra de baixo resolve isso. No desktop não há barra de
  // baixo: quem estava olhando o mapa e via o problema que faltava tinha de ir
  // até o feed para registrá-lo. É o mesmo `ReportModal` e o mesmo
  // `useCreateReport` do feed — nenhuma regra de criação mora aqui.
  //
  // Não recarrega os pinos depois de criar, e isso é correto: a bronca nasce em
  // `pending_approval` e o mapa mostra o que já foi aprovado. Um refetch que
  // não traz nada de novo ensinaria que o envio falhou.
  const { user } = useAuth();
  const [criandoBronca, setCriandoBronca] = useState(false);
  const { createReport } = useCreateReport({ onCreated: () => setCriandoBronca(false) });

  // O recorte "só as broncas desta rua", vindo de `?rua=<id>` — o link que a
  // faixa de Minha Rua usa. Ver `useFocoDeRua`.
  const { foco: focoDeRua, limpar: limparFocoDeRua } = useFocoDeRua('report_ids');

  // Chegou o foco, o mapa vai até a rua. Sem isto, o recorte esconderia quase
  // tudo e deixaria a pessoa procurando o punhado que sobrou no zoom anterior.
  useEffect(() => {
    if (!focoDeRua?.centro) return;
    setFlyToTarget({ ...focoDeRua.centro, zoom: 17, nonce: Date.now() });
  }, [focoDeRua]);
  const [loading,     setLoading]     = useState(true);
  const [mapBounds,   setMapBounds]   = useState(null); // { minLat, maxLat, minLng, maxLng }
  const [mapZoom,     setMapZoom]     = useState(13);
  const cancelRef = useRef(false);

  // ── Atualização de bronca direto no mapa (sem sair da tela) ──
  const [updatingReport, setUpdatingReport] = useState(null);
  const [updatingReportUpdates, setUpdatingReportUpdates] = useState([]);

  // Open filter sheet: seed pending state from committed state
  const openFilterSheet = () => {
    setPendingStatus(statusFilter);
    setPendingCategory(categoryFilter);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setStatusFilter(pendingStatus);
    setCategoryFilter(pendingCategory);
    setFilterSheetOpen(false);
  };

  // ── Active filter chips ──
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (statusFilter !== 'active') {
      const s = STATUSES.find(s => s.id === statusFilter);
      if (s) chips.push({ key: 'status', label: s.label, clear: () => setStatusFilter('active') });
    }
    if (categoryFilter !== 'all') {
      const c = CATEGORIES.find(c => c.id === categoryFilter);
      if (c) chips.push({ key: 'cat', label: c.label, clear: () => setCategoryFilter('all') });
    }
    // O recorte por rua é um chip como os outros — e precisa ser, porque é o
    // mais fácil de esquecer que está ligado: ele chega pela URL, sem ninguém
    // ter tocado num filtro desta tela.
    if (focoDeRua) {
      chips.push({ key: 'rua', label: focoDeRua.nome || 'Uma rua', clear: limparFocoDeRua });
    }
    return chips;
  }, [statusFilter, categoryFilter, focoDeRua, limparFocoDeRua]);

  const clearAllFilters = () => {
    setStatusFilter('active');
    setCategoryFilter('all');
    limparFocoDeRua();
  };

  // ── selectMapCity ──
  //
  // `moverMapa` separa os dois usos. Quando o usuario ESCOLHE uma cidade no
  // seletor, o mapa precisa voar ate ela. Quando a cidade e apenas DETECTADA
  // pelo GPS, mover seria errado: o mapa acabou de montar na posicao do
  // usuario, e o voo para o centro da cidade em zoom 13 desfazia isso - o mapa
  // abria certo e um instante depois pulava para o nivel de cidade.
  const selectMapCity = useCallback(async (city, { moverMapa = true } = {}) => {
    setMapCityId(city ? city.id : null);
    setMapCityName(city ? (city.state?.uf ? `${city.name} · ${city.state.uf}` : city.name) : null);
    if (!city || !moverMapa) return;
    try {
      const uf = city.state?.uf || '';
      const q  = encodeURIComponent(`${city.name}${uf ? `, ${uf}, Brasil` : ', Brasil'}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=pt-BR&countrycodes=br`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.[0]?.lat && json?.[0]?.lon) {
        setFlyToTarget({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), zoom: 13, nonce: Date.now() });
      }
    } catch {}
  }, []);

  // ── GPS auto-init on mount ──
  useEffect(() => {
    if (mapGpsInitDone || !navigator.geolocation) {
      setMapGpsInitDone(true);
      setGeoSettled(true);
      return;
    }
    setMapGpsInitDone(true);

    // Rede de seguranca: em alguns navegadores o callback de erro nao dispara
    // quando o usuario ignora o prompt de permissao. Sem isso o mapa ficaria no
    // loader indefinidamente.
    const destravar = setTimeout(() => setGeoSettled(true), 4000);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        clearTimeout(destravar);
        // Guarda a posicao antes do reverse geocode: e ela que faz o mapa
        // montar ja no ponto do usuario. Sem isso a coordenada era usada so
        // para descobrir a cidade e descartada, e o mapa abria em Floresta ate
        // o MapView pedir GPS por conta propria - dai o salto na abertura.
        setInitialUserPos({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        });
        // Libera o mapa junto com a posicao, sem esperar o reverse geocode:
        // o nome da cidade e so rotulo, nao muda onde o mapa centra.
        setGeoSettled(true);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) return;
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          // Só rotula a cidade: o mapa ja esta na posicao do usuario, que fica
          // dentro dela. Voar para o centro em zoom 13 desfaria o
          // enquadramento que acabamos de aplicar.
          if (found) selectMapCity(found, { moverMapa: false });
        } catch {}
      },
      () => {
        // Permissao negada ou GPS indisponivel: segue sem a posicao.
        clearTimeout(destravar);
        setGeoSettled(true);
      },
      // maximumAge baixo: com 300000 (5 min) o navegador devolvia uma leitura
      // antiga em cache, geralmente de rede/Wi-Fi e com centenas de metros de
      // erro. Como e essa posicao que define onde o mapa MONTA, abrir no zoom
      // de rua sobre uma coordenada imprecisa colocava o usuario na quadra
      // errada. 30s ainda aproveita uma leitura recente sem pegar as velhas.
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );

    return () => clearTimeout(destravar);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda as coordenadas GPS mais recentes para recalcular nearby quando cidades carregam
  const gpsCoordsCacheRef = useRef(null);

  const buildNearby = useCallback((coords, cityList) => {
    if (!cityList.length) return;
    const doFetch = async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        const { name: curName, uf: curUf } = parseCityFromNominatim(json.address || {});
        const cur = matchCityInList(cityList, curName, curUf);
        const sameState = cityList
          .filter(c => (c.state?.uf || '') === curUf && (!cur || c.id !== cur.id))
          .slice(0, 4);
        setNearbyCities(cur ? [cur, ...sameState] : sameState);
      } catch {
        setNearbyCities([]);
      } finally {
        setNearbyLoading(false);
      }
    };
    doFetch();
  }, []);

  // ── Load nearby cities when city sheet opens ──
  useEffect(() => {
    if (!citySheetOpen) return;
    if (!navigator.geolocation) { setNearbyCities([]); return; }
    // Se já temos coordenadas em cache e cidades carregadas, recalcula direto
    if (gpsCoordsCacheRef.current && cities.length > 0) {
      setNearbyLoading(true);
      buildNearby(gpsCoordsCacheRef.current, cities);
      return;
    }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        gpsCoordsCacheRef.current = position.coords;
        buildNearby(position.coords, citiesRef.current);
      },
      () => { setNearbyLoading(false); setNearbyCities([]); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [citySheetOpen, cities, buildNearby]);

  // Recalcula nearby quando cidades chegam e sheet está aberto
  useEffect(() => {
    if (!citySheetOpen || cities.length === 0 || !gpsCoordsCacheRef.current) return;
    buildNearby(gpsCoordsCacheRef.current, cities);
  }, [cities, citySheetOpen, buildNearby]);

  // ── Fetch clusters (RPC espacial) ──
  const fetchClustersTimerRef = useRef(null);

  const fetchClusters = useCallback(async (bounds, zoom) => {
    if (!bounds) return;
    cancelRef.current = false;
    setLoading(true);
    try {
      const respostas = await Promise.all(statusDaConsulta(statusFilter).map((status) =>
        supabase.rpc('reports_map_clusters', {
          min_lat: bounds.minLat,
          max_lat: bounds.maxLat,
          min_lng: bounds.minLng,
          max_lng: bounds.maxLng,
          zoom: Math.round(zoom),
          status_filter: status,
          category_filter: categoryFilter === 'all' ? null : categoryFilter,
        })
      ));
      const erro = respostas.find((resposta) => resposta.error)?.error;
      if (erro) throw erro;
      const data = respostas.flatMap((resposta) => resposta.data || []);
      if (cancelRef.current) return;

      const mapped = (data || []).map(row => (
        row.is_cluster
          ? {
              isCluster: true,
              lat: row.cluster_lat,
              lng: row.cluster_lng,
              count: row.item_count,
              ids: row.report_ids,
              // Extensao do cluster: o MapView enquadra isso ao clicar, para o
              // numero do pin bater com o que aparece depois do zoom.
              bounds: Number.isFinite(row.min_lat_bound)
                ? {
                    minLat: row.min_lat_bound,
                    maxLat: row.max_lat_bound,
                    minLng: row.min_lng_bound,
                    maxLng: row.max_lng_bound,
                  }
                : null,
            }
          : {
              isCluster: false,
              lat: row.cluster_lat,
              lng: row.cluster_lng,
              count: 1,
              ids: row.report_ids,
              report: {
                id: row.report.id,
                title: row.report.title,
                description: row.report.description,
                status: row.report.status,
                created_at: row.report.created_at,
                category: row.report.category_id,
                categoryName: row.report.category_name || row.report.category_id,
                coverImage: row.report.cover_image,
                upvotes: row.report.upvotes,
                location: { lat: row.report.lat, lng: row.report.lng },
              },
            }
      ));

      setMapClusters(mapped);
    } catch (err) {
      console.error('[MapPage] fetch clusters error:', err);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  // Em navegação o mapa se move sozinho a cada leitura de GPS. Manter o fetch
  // por bounds aqui dispararia uma RPC por segundo indefinidamente — quem
  // alimenta os alertas é o useNavCorridor, que busca um raio de 2 km e só
  // repete depois de 1 km percorrido.
  useEffect(() => {
    if (!mapBounds) return;
    clearTimeout(fetchClustersTimerRef.current);
    fetchClustersTimerRef.current = setTimeout(() => {
      fetchClusters(mapBounds, mapZoom);
    }, 300);
    return () => clearTimeout(fetchClustersTimerRef.current);
  }, [mapBounds, mapZoom, fetchClusters]);

  // Abre o modal de atualização sobre o mapa. Busca as atualizações já
  // existentes da bronca porque o rate limit (1 envio por tipo a cada 7 dias)
  // é calculado a partir delas.
  const handleOpenUpdate = useCallback(async (report) => {
    setUpdatingReport(report);
    setUpdatingReportUpdates([]);
    const { data } = await supabase
      .from('report_updates')
      .select('id, author_id, update_type, created_at')
      .eq('report_id', report.id);
    setUpdatingReportUpdates(data || []);
  }, []);

  const reportUpdate = useReportUpdate(updatingReport, updatingReportUpdates, {
    onSuccess: ({ isAuthorOrAdmin, newStatus }) => {
      setUpdatingReport(null);
      // Recarrega os pins para refletir a eventual mudança de status
      if (mapBounds) fetchClusters(mapBounds, mapZoom);
    },
  });

  // Reajusta a cidade do filtro sem mover o mapa (usado após pan/zoom manual e após recentralização por GPS)
  const syncCityFromCoords = useCallback(async (coords) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR`
      );
      if (!res.ok) return;
      const json = await res.json();
      const { name, uf } = parseCityFromNominatim(json.address || {});
      const found = matchCityInList(citiesRef.current, name, uf);
      setMapCityId(prevId => {
        if (found && found.id !== prevId) {
          setMapCityName(found.state?.uf ? `${found.name} · ${found.state.uf}` : found.name);
          return found.id;
        }
        return prevId;
      });
    } catch {}
  }, []);

  // Debounce: só reconsulta a cidade depois que o usuário para de arrastar/zoomar por um tempo
  const boundsCityTimerRef = useRef(null);

  const handleBoundsChange = useCallback((bounds, zoom) => {
    if (!bounds) return;
    setMapBounds({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    });
    if (Number.isFinite(zoom)) setMapZoom(zoom);

    const center = bounds.getCenter?.();
    if (center) {
      clearTimeout(boundsCityTimerRef.current);
      boundsCityTimerRef.current = setTimeout(() => {
        syncCityFromCoords({ lat: center.lat, lng: center.lng });
      }, 1200);
    }
  }, [syncCityFromCoords]);

  useEffect(() => () => clearTimeout(boundsCityTimerRef.current), []);

  const visibleClusters = useMemo(() => {
    let itens = mapClusters;

    // O RECORTE POR RUA ATRAVESSA O CLUSTER, E ISSO NÃO É DETALHE
    //
    // A primeira versão descartava todo cluster, pelo mesmo motivo da busca por
    // título: a agregação não carrega o título das broncas que resume. Só que
    // ela carrega os IDS (`report_ids`, tanto no pino individual quanto no
    // agrupado) — e o resultado de descartar foi um mapa completamente vazio,
    // porque no zoom de bairro quase tudo chega agrupado.
    //
    // Com a interseção, o cluster sobrevive com a contagem RECORTADA: um grupo
    // de doze que tem três da rua aparece como três. Clicar nele continua
    // enquadrando a extensão dele, e no zoom seguinte os pinos se separam.
    // Manter a contagem original seria o erro oposto — mostrar doze onde a
    // faixa da rua prometeu três.
    if (focoDeRua) {
      itens = itens
        .map((item) => {
          const ids = (item.ids || []).map(String).filter((id) => focoDeRua.ids.has(id));
          if (ids.length === 0) return null;
          return item.isCluster ? { ...item, ids, count: ids.length } : item;
        })
        .filter(Boolean);
    }

    // A busca por título continua só entre pinos individuais: aqui não há o que
    // interseccionar — o cluster não traz o título de ninguém.
    const term = titleSearchTerm.trim().toLowerCase();
    if (!term) return itens;
    return itens.filter(item =>
      !item.isCluster && String(item.report?.title ?? '').toLowerCase().includes(term)
    );
  }, [mapClusters, titleSearchTerm, focoDeRua]);

  const totalVisibleCount = useMemo(
    () => visibleClusters.reduce((sum, item) => sum + item.count, 0),
    [visibleClusters]
  );

  // OS CARTÕES CONTAM A CIDADE, NÃO O RECORTE — E O RODAPÉ DIZ ISSO
  //
  // O mapa devolve CLUSTERS: um pino pode valer doze broncas e não carrega o
  // status de nenhuma delas. Somar por situação sobre o que está na tela daria
  // um número que muda a cada zoom e que subconta sempre — o tipo de estatística
  // que parece precisa e não é.
  //
  // A contagem da cidade é estável, é a mesma a qualquer zoom, e é a pergunta
  // que estes cartões de fato respondem: "como está minha cidade". O número do
  // recorte continua existindo, no painel da direita, com o rótulo dele.
  const [contagemDaCidade, setContagemDaCidade] = useState(null);

  useEffect(() => {
    let cancelado = false;
    const contar = (aplicar) => {
      let q = supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('moderation_status', 'approved')
        .neq('status', 'duplicate');
      if (mapCityId) q = q.eq('city_id', mapCityId);
      return aplicar ? aplicar(q) : q;
    };

    Promise.all([
      contar(),
      contar((q) => q.eq('status', 'pending')),
      contar((q) => q.eq('status', 'in-progress')),
      contar((q) => q.eq('status', 'resolved')),
    ]).then(([total, pendentes, andamento, resolvidas]) => {
      if (cancelado) return;
      setContagemDaCidade({
        total: total.count || 0,
        pendentes: pendentes.count || 0,
        andamento: andamento.count || 0,
        resolvidas: resolvidas.count || 0,
      });
    });

    return () => { cancelado = true; };
  }, [mapCityId]);

  // As cores dos quadrados são as dos pinos daquela situação — as mesmas da
  // legenda, na coluna da direita. É o que faz "Pendentes" e o ponto laranja do
  // mapa se reconhecerem sem ninguém explicar.
  const cartoesDaCidade = (
    <CartoesDeMapa
      cartoes={[
        { id: 'pending', Icone: Clock, cor: 'bg-status-pendingFg', rotulo: 'Pendentes', valor: contagemDaCidade?.pendentes ?? '—' },
        { id: 'progress', Icone: Megaphone, cor: 'bg-status-progressFg', rotulo: 'Em andamento', valor: contagemDaCidade?.andamento ?? '—' },
        { id: 'resolved', Icone: CheckCircle2, cor: 'bg-status-resolvedFg', rotulo: 'Resolvidas', valor: contagemDaCidade?.resolvidas ?? '—' },
      ]}
      rodape={`Em ${mapCityName || 'toda a base'} — o mapa abaixo mostra o recorte que está na tela.`}
    />
  );

  // Contagem por categoria para os chips. Deriva do que ja esta carregado - sem
  // requisicao extra. Clusters entram so em 'all': a agregacao nao carrega a
  // categoria de cada bronca, entao somar em outra chave inventaria numero.
  const handleTitleSearch = useCallback(() => {
    const next = titleSearchInput.trim();
    setTitleSearchTerm(next);
    if (!next) { setFlyToTarget(null); return; }
    const first = mapClusters.find(item =>
      !item.isCluster && String(item.report?.title ?? '').toLowerCase().includes(next.toLowerCase())
    );
    const loc = first?.report?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      setFlyToTarget({ lat: loc.lat, lng: loc.lng, zoom: 18, nonce: Date.now() });
    }
  }, [titleSearchInput, mapClusters]);

  const handleReportClick = useCallback(
    (report) => navigate(`/bronca/${report.id ?? report}`),
    [navigate]
  );

  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return cities;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
    const term = norm(citySearch.trim());
    return cities.filter(c =>
      norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term)
    );
  }, [cities, citySearch]);

  const handleGpsDetect = useCallback(() => {
    if (!navigator.geolocation || gpsLoading) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) throw new Error();
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          if (found) { selectMapCity(found); setCitySheetOpen(false); }
        } catch {}
        finally { setGpsLoading(false); }
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [gpsLoading, selectMapCity]);


  const telaLarga = useTelaLarga();


  // ── Render ──────────────────────────────────────────────────────────────────
  // As gavetas e o modal sao os MESMOS nas duas montagens: mudar a moldura nao
  // muda o que abre por cima dela. Ficam numa constante para que a versao de
  // colunas e a de celular nao guardem duas copias que divergem na primeira
  // correcao feita so num lado.
  const sobreposicoes = (
    <>
      {/* ══ Bottom Sheet: Filtros ══════════════════════════════════════════════ */}
      <BottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filtros">
        <div className="px-5 py-4 flex flex-col gap-6">
          {/* Status */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <SheetChip key={s.id} active={pendingStatus === s.id} onClick={() => setPendingStatus(s.id)}>
                  {s.label}
                </SheetChip>
              ))}
            </div>
          </div>

          {/* Categoria */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Categoria</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <SheetChip key={c.id} active={pendingCategory === c.id} onClick={() => setPendingCategory(c.id)}>
                  {c.label}
                </SheetChip>
              ))}
            </div>
          </div>

          {/* Apply */}
          <button
            type="button"
            onClick={applyFilters}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
          >
            Aplicar filtros
          </button>
        </div>
      </BottomSheet>

      {/* ══ Bottom Sheet: Cidade ══════════════════════════════════════════════ */}
      <BottomSheet open={citySheetOpen} onClose={() => { setCitySheetOpen(false); setShowAllCities(false); setCitySearch(''); }} title="Selecionar cidade">
        <div>
          {/* Search — sticky para ficar visível ao rolar */}
          <div className="sticky top-0 z-10 bg-background px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar cidade..."
                value={citySearch}
                onChange={e => setCitySearch(e.target.value)}
                className="bg-transparent outline-none text-sm flex-1 min-w-0"
              />
              {citySearch && (
                <button type="button" onClick={() => setCitySearch('')}>
                  <X size={14} className="text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* GPS / localização atual */}
          {!citySearch && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Localização atual</p>
              <button
                type="button"
                disabled={gpsLoading}
                onClick={handleGpsDetect}
                className="w-full flex items-center gap-3 py-2.5 text-sm font-semibold text-primary"
              >
                {gpsLoading
                  ? <Loader2 size={18} className="animate-spin shrink-0" />
                  : <LocateFixed size={18} className="shrink-0" />}
                <span>{mapCityName ?? (gpsLoading ? 'Detectando...' : 'Usar minha localização')}</span>
                {mapCityId && <Check size={16} className="ml-auto shrink-0 text-primary" />}
              </button>
            </div>
          )}

          {/* Cidades próximas */}
          {!citySearch && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Cidades próximas</p>
              {nearbyLoading ? (
                <div className="flex justify-center py-3">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : nearbyCities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">Ative o GPS para ver cidades próximas</p>
              ) : (
                <div className="flex flex-col gap-0">
                  {nearbyCities.slice(0, 3).map((city, i) => {
                    const isActive = String(mapCityId) === String(city.id);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => { selectMapCity(city); setCitySheetOpen(false); }}
                        className={`flex items-center gap-3 py-2.5 text-sm ${i > 0 ? 'border-t border-border/40' : ''} ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                      >
                        <MapPin size={15} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                        <span>
                          {city.name}
                          {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">- {city.state.uf}</span>}
                        </span>
                        {isActive && <Check size={15} className="ml-auto text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAllCities(true)}
                    className="flex items-center gap-1 py-2 text-sm font-semibold text-primary mt-1"
                  >
                    Ver todas as cidades
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lista filtrada — aparece quando há busca ou "Ver todas" foi clicado */}
          {(citySearch.trim() || showAllCities) && (
            <div>
              {loadingCities ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredCities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma cidade encontrada</p>
              ) : (
                (citySearch.trim() ? filteredCities : filteredCities.slice(0, 100)).map((city, i) => {
                  const isActive = String(mapCityId) === String(city.id);
                  return (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => { selectMapCity(city); setCitySheetOpen(false); setCitySearch(''); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                        i > 0 ? 'border-t border-border/40' : ''
                      } ${isActive ? 'font-semibold text-primary bg-primary/5' : 'text-foreground hover:bg-muted'}`}
                    >
                      <span className="flex-1 truncate">
                        {city.name}
                        {city.state?.uf && <span className="ml-2 text-xs text-muted-foreground">{city.state.uf}</span>}
                      </span>
                      {isActive && <Check size={15} className="shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </BottomSheet>

      {updatingReport && (
        <ReportUpdateModal
          onClose={() => { setUpdatingReport(null); reportUpdate.reset(); }}
          onSubmit={reportUpdate.submit}
          submitting={reportUpdate.submitting}
          disabledTypes={reportUpdate.disabledTypes}
          cam={reportUpdate.cam}
          selectedType={reportUpdate.updateType}
          onSelectType={reportUpdate.setUpdateType}
          message={reportUpdate.message}
          onMessageChange={reportUpdate.setMessage}
        />
      )}
    </>
  );

  // ── Colunas, a partir de 1100px ───────────────────────────────────────────
  //
  // Mesma moldura do mapa de pavimentacao: filtros a esquerda, mapa ocupando a
  // altura da janela, legenda a direita. O celular NAO passa por aqui — a tela
  // cheia com controles flutuando por cima continua sendo o certo la, e o
  // `return` abaixo e o mesmo de sempre.
  if (telaLarga) {
    return (
      <TelaDeMapa
        titulo="Mapa de Broncas"
        subtitulo="O que os moradores registraram, e em que pé está cada coisa"
        tituloDaAba="Mapa de Broncas - Trombone Cidadao"
        descricaoSeo="Veja no mapa as broncas registradas pelos moradores, por status e categoria."
        filtrosLigados={activeFilterChips.length}
        /* O selo carrega o total; os cartões, a repartição. Repetir o total num
           cartão seria dizer o mesmo número duas vezes lado a lado. */
        destaque={
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700">
            <Megaphone className="h-4 w-4" />
            {contagemDaCidade?.total ?? '—'} {contagemDaCidade?.total === 1 ? 'bronca registrada' : 'broncas registradas'}
          </span>
        }
        estatisticas={cartoesDaCidade}
        acoes={user && (
          <Button size="sm" variant="outline" className="gap-1.5 border-tc-red/30 text-xs text-tc-red hover:bg-tc-red/5" onClick={() => setCriandoBronca(true)}>
            <PlusCircle className="h-3.5 w-3.5" /> Registrar bronca
          </Button>
        )}
        filtros={
          <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm">
            <button
              type="button"
              onClick={() => { setCitySheetOpen(true); setCitySearch(''); }}
              className="flex w-full items-center gap-1.5 rounded-full border border-edge-subtle px-2.5 py-1.5 text-xs font-bold text-content-primary hover:border-brand/40"
            >
              <MapPin size={13} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate text-left">{mapCityName ?? 'Selecionar cidade'}</span>
              <ChevronDown size={13} className="shrink-0 opacity-60" />
            </button>

            {/* O RECORTE POR RUA PRECISA SE ANUNCIAR
                Ele chega pela URL, sem ninguém ter mexido em filtro nenhum
                nesta tela. Um mapa que mostra sete pinos onde havia quinhentos,
                sem dizer por quê, lê como mapa quebrado. */}
            {focoDeRua && (
              <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-subtleBg px-2.5 py-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-brand-subtleFg">
                    Só {focoDeRua.nome || 'esta rua'}
                  </p>

                  {/* O atalho da página da rua começa em "Todas", para a lista
                      corresponder ao número que foi tocado. A pessoa ainda pode
                      estreitar por status ou categoria aqui embaixo. */}
                  {focoDeRua.ids.size === 0 ? (
                    <p className="text-[10px] leading-tight text-content-tertiary">
                      Nenhuma bronca aprovada nesta rua.
                    </p>
                  ) : (
                    <>
                      {totalVisibleCount < focoDeRua.ids.size && (
                        <p className="text-[10px] leading-tight text-content-tertiary">
                          {focoDeRua.ids.size} nesta rua ·{' '}
                          {focoDeRua.ids.size - totalVisibleCount} fora dos filtros atuais
                          {statusFilter !== 'active' ? '' : ' (o status está em "Ativas")'}.
                        </p>
                      )}
                      {!focoDeRua.preciso && (
                        <p className="text-[10px] leading-tight text-content-tertiary">
                          Sem traçado cadastrado: o recorte é um raio em volta do ponto da rua.
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button type="button" onClick={limparFocoDeRua} aria-label="Ver a cidade inteira">
                  <X size={13} className="text-content-tertiary hover:text-content-primary" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-lg border border-edge-subtle bg-surface-subtle px-2.5 py-2">
              <Search size={14} className="shrink-0 text-content-tertiary" />
              <input
                value={titleSearchInput}
                onChange={e => setTitleSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTitleSearch(); }}
                placeholder="Buscar bronca"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {titleSearchInput && (
                <button type="button" onClick={() => { setTitleSearchInput(''); setTitleSearchTerm(''); setFlyToTarget(null); }}>
                  <X size={13} className="text-content-tertiary hover:text-content-primary" />
                </button>
              )}
            </div>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">Status</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-edge-subtle bg-surface-subtle px-2.5 py-2 text-sm text-content-primary"
              >
                {STATUSES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">Categoria</span>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-edge-subtle bg-surface-subtle px-2.5 py-2 text-sm text-content-primary"
              >
                {CATEGORIES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>

            {activeFilterChips.length > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-auto rounded-lg border border-edge-subtle px-2.5 py-2 text-xs font-bold text-content-secondary hover:bg-surface-subtle"
              >
                Limpar filtros
              </button>
            )}
          </div>
        }
        mapa={
          <>
            {(loading || !geoSettled) && <MapLoader />}
            {geoSettled && (
              <Suspense fallback={<MapLoader />}>
                <div className="absolute inset-0">
                  <MapView
                    clusters={visibleClusters}
                    /* A LEGENDA É UMA SÓ, E ELA MORA NA COLUNA
                       O MapView desenha uma legenda flutuante sobre o canto do
                       mapa — certo na tela cheia do celular, onde não existe
                       coluna. Aqui existe, e ela repetia palavra por palavra o
                       cartão da direita: duas legendas idênticas na mesma tela
                       fazem a pessoa procurar a diferença entre elas. */
                    showLegend={false}
                    initialCenter={initialUserPos}
                    onReportClick={handleReportClick}
                    onUpvote={() => {}}
                    flyToTarget={flyToTarget}
                    onBoundsChange={handleBoundsChange}
                    onRecenter={syncCityFromCoords}
                    onUpdateClick={handleOpenUpdate}
                    /* Só admin e master: embaixador modera pela tela de
                       moderação, que tem o contexto que este balão não tem. A
                       autoridade continua sendo a policy — isto só evita a
                       viagem até a página para descobrir que não dá. */
                    onEditClick={(user?.is_admin || user?.is_master)
                      ? (r) => navigate(`/bronca/${r.id}`, { state: { openEditModal: true } })
                      : undefined}
                  />
                </div>
              </Suspense>
            )}
          </>
        }
        painel={
          <div className="grid gap-3">
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <p className="flex items-center gap-2.5 text-sm font-bold text-content-primary">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
                Broncas visiveis
              </p>
              <p className="mt-3 text-3xl font-extrabold leading-none text-content-primary tabular-nums">
                {loading ? '—' : totalVisibleCount}
              </p>
              <p className="mt-1 text-xs text-content-secondary">
                No recorte atual do mapa e dos filtros.
              </p>
            </section>

            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">Legenda</p>
              <ul className="mt-2 grid gap-1.5">
                {[
                  ['bg-status-pendingFg', 'Pendente'],
                  ['bg-status-progressFg', 'Em andamento'],
                  ['bg-status-resolvedFg', 'Resolvido'],
                ].map(([cor, rotulo]) => (
                  <li key={rotulo} className="flex items-center gap-2 text-xs text-content-secondary">
                    <span className={`h-2.5 w-2.5 rounded-full ${cor}`} /> {rotulo}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        }
      >
        {sobreposicoes}
        {criandoBronca && (
          <ReportModal onClose={() => setCriandoBronca(false)} onSubmit={createReport} />
        )}
      </TelaDeMapa>
    );
  }

  return (
    <div className="flex flex-col bg-background flex-1 min-h-0 overflow-hidden">

      {/* ── Mapa em tela cheia, com os controles flutuando por cima ──
          Antes busca/cidade/chips empilhavam acima e empurravam o mapa para
          baixo. Flutuando, o mapa ganha ~100px de altura util.
          z-[700] fica abaixo dos controles do Leaflet (800) e do BottomNav
          (900), entao nada aqui cobre a navegacao.
          pointer-events-none no container + auto nos filhos: o espaco vazio
          entre os controles continua arrastavel como mapa. */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {(loading || !geoSettled) && <MapLoader />}
        {/* Só monta o mapa depois que o GPS resolveu: o Leaflet fixa o centro
            na montagem, entao montar antes deixaria o mapa preso em Floresta e
            a posicao do usuario chegaria tarde, causando o salto na abertura. */}
        {geoSettled && (
        <Suspense fallback={<MapLoader />}>
          <div className="absolute inset-0">
            <MapView
              clusters={visibleClusters}
              initialCenter={initialUserPos}
              onReportClick={handleReportClick}
              onUpvote={() => {}}
              flyToTarget={flyToTarget}
              onBoundsChange={handleBoundsChange}
              onRecenter={syncCityFromCoords}
              onUpdateClick={handleOpenUpdate}
            />
          </div>
        </Suspense>
        )}

        <div className="absolute inset-x-0 top-0 z-[700] pointer-events-none flex flex-col gap-2 pt-2">

      {/* ── Top bar: search + filtros ── */}
      <div className="flex-shrink-0 pointer-events-auto px-3 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border shadow-lg rounded-full px-3 py-1.5">
          <Search size={15} className="text-muted-foreground flex-shrink-0" />
          <input
            value={titleSearchInput}
            onChange={e => setTitleSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleSearch(); }}
            placeholder="Buscar bronca..."
            className="bg-transparent outline-none text-sm flex-1 min-w-0"
          />
          {titleSearchInput && (
            <button type="button" onClick={() => { setTitleSearchInput(''); setTitleSearchTerm(''); setFlyToTarget(null); }}>
              <X size={14} className="text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openFilterSheet}
          className="flex-shrink-0 flex items-center gap-1.5 bg-card/95 backdrop-blur-sm border border-border shadow-lg rounded-full px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
        >
          <SlidersHorizontal size={14} />
          <span className="text-xs">Filtros</span>
          {(statusFilter !== 'active' || categoryFilter !== 'all') && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* ── City pill + active filter chips ── */}
      <div className="flex-shrink-0 pointer-events-auto px-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setCitySheetOpen(true); setCitySearch(''); }}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card/95 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary/40 transition-colors shadow-lg"
        >
          <MapPin size={13} className="text-primary flex-shrink-0" />
          <span className="truncate max-w-[160px]">{mapCityName ?? 'Selecionar cidade'}</span>
          <ChevronDown size={13} className="opacity-60 flex-shrink-0" />
        </button>

        {activeFilterChips.map(chip => (
          <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />
        ))}

        {activeFilterChips.length > 0 && (
          <button type="button" onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-primary transition-colors ml-auto">
            Limpar tudo
          </button>
        )}
      </div>

        </div>

      </div>

      {/* ── Bottom bar: contagem ──
          A entrada da patrulha saiu daqui para o hub de missões: este mapa é
          para consultar, e o botão de agir vivia escondido atrás dele. */}
      <div className="flex-shrink-0 bg-background border-t border-border px-4 py-2.5 flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">
          {loading ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : (
            `${totalVisibleCount} ${totalVisibleCount === 1 ? 'bronca visível' : 'broncas visíveis'}`
          )}
        </span>
      </div>

      {sobreposicoes}
    </div>
  );
}
