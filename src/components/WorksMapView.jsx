import { MapBaseLayer, MAP_LAYER } from '@/components/map/MapDisplayControls';
import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect, useCallback } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { HardHat, PauseCircle, CheckCircle, Calendar, X, CalendarClock, DollarSign, Building, Landmark, UserCheck, Info, FileText, Video, Camera, ListChecks, Newspaper, Clock, Loader2, Wrench, FileCheck, LocateFixed, Layers, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatCurrency, formatCnpj, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';
import { useCityView } from '@/contexts/CityContext';
import { geocodeCity } from '@/lib/geocodeCity';
import { createMapPin, ICON_SIZE } from '@/components/map/pinIcon';
import { showAppError } from '@/lib/appError';

// Status de obra -> sufixo do token --pin-work-*. Fora dessa lista cai em
// 'unknown', o cinza neutro.
const WORK_STATUS_TOKEN = {
  planned: 'planned',
  tendered: 'tendered',
  'in-progress': 'progress',
  stalled: 'stalled',
  unfinished: 'unfinished',
  completed: 'completed',
};

// Capacete de obra, sem equivalente no design system (la os icones sao por
// categoria de bronca). currentColor recebe o token de fg via createMapPin.
const WorkIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v5Z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
  </svg>
);

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

// Recentraliza o mapa nas obras carregadas sempre que a lista muda
// (ex.: ao trocar a cidade no seletor). Se não houver obras na cidade,
// centraliza na própria cidade selecionada (forward geocode). Sem isso,
// o mapa fica preso no center inicial (Floresta).
const FitToWorks = ({ works, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (works || [])
      .filter((w) => w.location && Number.isFinite(w.location.lat) && Number.isFinite(w.location.lng))
      .map((w) => [w.location.lat, w.location.lng]);

    if (pts.length > 0) {
      const key = 'works:' + pts.map((p) => p.join(',')).sort().join('|');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      try {
        if (pts.length === 1) {
          map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: true });
        } else {
          map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], animate: true });
        }
      } catch (e) { /* noop */ }
      return;
    }

    // Sem obras: centraliza na cidade ativa (se houver).
    if (activeCity?.name) {
      const key = 'city:' + activeCity.name + '|' + (activeCity.state?.uf || '');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      geocodeCity(activeCity.name, activeCity.state?.uf).then((coord) => {
        if (cancelled || !coord) return;
        try { map.setView([coord.lat, coord.lng], 13, { animate: true }); } catch {}
      });
    }
    return () => { cancelled = true; };
  }, [works, activeCity, map]);
  return null;
};

// `mostrarLegenda`: a legenda flutuante é a da tela cheia do celular. Onde a
// página já tem uma coluna com as situações e as cores — o mapa de obras em
// desktop —, ela vira uma segunda cópia da mesma informação no mesmo lugar.
const WorksMapView = forwardRef(({ works, mostrarLegenda = true, podeGerir = false }, ref) => {
  const [camada, setCamada] = useState(MAP_LAYER.STANDARD);
  const [selectedWork, setSelectedWork] = useState(null);
  const [workMedia, setWorkMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [loadingLastUpdatedAt, setLoadingLastUpdatedAt] = useState(false);
  const [paidTotal, setPaidTotal] = useState(null);
  const mapRef = useRef();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode } = useMapModeToggle();
  const { city: activeCity } = useCityView();

  const fetchWorkModalData = useCallback(async (workId) => {
    if (!workId) return;
    setLoadingMedia(true);
    setLoadingLastUpdatedAt(true);

    try {
      const [workRes, mediaRes, measurementsRes] = await Promise.all([
        supabase.from('public_works').select('last_update, created_at').eq('id', workId).maybeSingle(),
        supabase.from('public_work_media').select('*').eq('work_id', workId).order('created_at'),
        supabase
          .from('public_work_measurements')
          .select('updated_at, created_at, payments:public_work_payments(created_at, payment_date, value)')
          .eq('work_id', workId)
          .order('created_at', { ascending: false }),
      ]);

      if (mediaRes.error) {
        showAppError({ title: "Erro ao buscar mídias da obra", description: mediaRes.error.message, variant: "destructive" });
        setWorkMedia([]);
      } else {
        setWorkMedia(mediaRes.data || []);
      }

      if (workRes.error) {
        showAppError({ title: "Erro ao buscar dados da obra", description: workRes.error.message, variant: "destructive" });
      }

      if (measurementsRes.error) {
        showAppError({ title: "Erro ao buscar fases da obra", description: measurementsRes.error.message, variant: "destructive" });
      }

      let computedPaidTotal = 0;
      const candidates = [];
      const workRow = workRes.data || null;
      if (workRow?.last_update) candidates.push(new Date(workRow.last_update));
      if (workRow?.created_at) candidates.push(new Date(workRow.created_at));

      (measurementsRes.data || []).forEach((m) => {
        if (m?.updated_at) candidates.push(new Date(m.updated_at));
        if (m?.created_at) candidates.push(new Date(m.created_at));
        (m?.payments || []).forEach((p) => {
          if (p?.created_at) candidates.push(new Date(p.created_at));
          const v = Number(p?.value);
          if (Number.isFinite(v) && v > 0) computedPaidTotal += v;
        });
      });

      (mediaRes.data || []).forEach((m) => {
        if (m?.updated_at) candidates.push(new Date(m.updated_at));
        if (m?.created_at) candidates.push(new Date(m.created_at));
      });

      const valid = candidates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
      if (valid.length === 0) setLastUpdatedAt(null);
      else setLastUpdatedAt(new Date(Math.max(...valid.map((d) => d.getTime()))));

      setPaidTotal(computedPaidTotal > 0 ? computedPaidTotal : null);
    } finally {
      setLoadingMedia(false);
      setLoadingLastUpdatedAt(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWork) {
      fetchWorkModalData(selectedWork.id);
    } else {
      setWorkMedia([]);
      setLastUpdatedAt(null);
      setPaidTotal(null);
    }
  }, [selectedWork, fetchWorkModalData]);

  useImperativeHandle(ref, () => ({
    goToLocation: (location) => {
      if (mapRef.current) {
        mapRef.current.flyTo([location.lat, location.lng], 18);
        const work = works.find(w => w.location.lat === location.lat && w.location.lng === location.lng);
        if (work) {
          setSelectedWork(work);
        }
      }
    }
  }));

  /**
   * Centraliza o mapa na posição do usuário.
   *
   * Sem isto, quem abre o mapa de obras cai na vista que enquadra TODAS as
   * obras da cidade (FitToWorks) e tem que arrastar até o próprio bairro para
   * saber o que tem por perto — que é a pergunta que a maioria das pessoas
   * chega fazendo.
   *
   * Não marca posição nem altera filtro: só move a câmera. Falha em silêncio
   * quando a permissão é negada — o mapa continua utilizável, e um toast de
   * erro para uma ação que a pessoa pode simplesmente não repetir só atrapalha.
   */
  const recenterToUser = useCallback(() => {
    if (!mapRef.current || !navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        try {
          mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.6 });
        } catch {}
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'planned':
        return { icon: CalendarClock, color: 'bg-purple-500', text: 'Prevista' };
      case 'tendered':
        return { icon: FileText, color: 'bg-orange-500', text: 'Licitada' };
      case 'in-progress':
        return { icon: HardHat, color: 'bg-blue-500', text: 'Em Andamento' };
      case 'stalled':
        return { icon: PauseCircle, color: 'bg-amber-500', text: 'Paralisada' };
      case 'unfinished':
        return { icon: Wrench, color: 'bg-red-500', text: 'Inacabada' };
      case 'completed':
        return { icon: CheckCircle, color: 'bg-green-500', text: 'Concluída' };
      default:
        return { icon: HardHat, color: 'bg-gray-500', text: 'Desconhecido' };
    }
  };

  const createWorkMarkerIcon = (status) => {
    const token = WORK_STATUS_TOKEN[status] || 'unknown';
    return createMapPin({
      cacheKey: `work|${token}`,
      bgToken: `--pin-work-${token}-bg`,
      fgToken: `--pin-work-${token}-fg`,
      icon: <WorkIcon />,
    });
  };

  const getFundingSourceText = (sources) => {
    if (!sources || sources.length === 0) return null;
    const sourceMap = { 
      federal: 'Federal', 
      state: 'Estadual', 
      estadual: 'Estadual', // Adicionar para caso já esteja traduzido
      municipal: 'Municipal',
      unknown: null // Ignorar 'unknown'
    };
    // Remover duplicatas e valores nulos/undefined, traduzir e filtrar
    const uniqueSources = [...new Set(sources)]
      .map(s => sourceMap[s?.toLowerCase()] || s)
      .filter(s => s && s !== 'unknown' && s !== null && s !== undefined);
    
    // Remover duplicatas novamente após tradução (caso tenha "state" e "estadual" juntos)
    const finalSources = [...new Set(uniqueSources)];
    
    return finalSources.length > 0 ? finalSources.join(', ') : null;
  };

  const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    let videoId = null;
    if (url.includes('youtube.com/watch?v=')) {
      videoId = url.split('v=')[1].split('&')[0];
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  };

  const DetailItem = ({ icon: Icon, label, value }) => {
    // Não renderizar se o valor for vazio, null, undefined, "N/A", "Não informado" ou string vazia
    const isEmpty = !value || value === 'N/A' || value === 'Não informado' || value === 'Não informada' || (typeof value === 'string' && value.trim() === '');
    if (isEmpty) return null;
    
    return (
      <div className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
          <p className="text-sm font-medium text-foreground break-words leading-relaxed">{value}</p>
        </div>
      </div>
    );
  };

  const handleDetailsClick = (work) => {
    navigate(`/obras-publicas/${work.id}`);
  };

  const isSingleWorkView = works.length === 1 && selectedWork;

  const photos = workMedia.filter(m => m.type === 'image');
  const videos = workMedia.filter(m => m.type === 'video' || m.type === 'video_url');
  const documents = workMedia.filter(m => m.type === 'pdf');

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={isSingleWorkView && selectedWork.location ? [selectedWork.location.lat, selectedWork.location.lng] : FLORESTA_COORDS} zoom={isSingleWorkView ? 17 : INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <MapController mapRef={mapRef} />
        <MapScrollLock mode={mode} />
        {!isSingleWorkView && <FitToWorks works={works} activeCity={activeCity} />}
        <MapBaseLayer layer={camada} />
        {works.map((work) => (
          work.location &&
          <Marker
            key={work.id}
            position={[work.location.lat, work.location.lng]}
            icon={createWorkMarkerIcon(work.status)}
            eventHandlers={{
              click: () => setSelectedWork(work),
              dblclick: (e) => {
                e.originalEvent.stopPropagation();
                setSelectedWork(work);
              },
            }}
          >
            {/* O BALÃO ERA SÓ O TÍTULO
                Clicar no pino já levava à página da obra, mas isso não estava
                escrito em lugar nenhum — e quem administra tinha de sair para o
                menu, achar "gerenciar" e procurar a obra na lista para corrigir
                uma data. Os dois caminhos agora começam aqui. */}
            <Popup>
              <div className="min-w-[10rem] p-0.5">
                <p className="text-sm font-bold leading-tight text-tc-red">{work.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={(e) => { e.stopPropagation(); navigate(`/obras-publicas/${work.id}`); }}
                  >
                    Detalhes
                  </Button>
                  {podeGerir && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        // `editWorkId` é a porta que ManageWorksPage já lê para
                        // abrir uma obra específica — não é uma convenção nova.
                        navigate('/obras/gerenciar', { state: { editWorkId: work.id } });
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <AnimatePresence>
        {selectedWork && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[2000]" 
              onClick={() => setSelectedWork(null)}
            >
          <motion.div
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.9, opacity: 0 }} 
                className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-hidden border border-border flex flex-col" 
                onClick={(e) => e.stopPropagation()}
          >
                <div className="p-6 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-2xl font-bold text-foreground mb-3">{selectedWork.title}</h2>
                      <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold text-white shadow-md ${getStatusInfo(selectedWork.status).color}`}>
                        {React.createElement(getStatusInfo(selectedWork.status).icon, { className: "w-4 h-4" })}
                    {getStatusInfo(selectedWork.status).text}
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedWork(null)} 
                      className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors flex-shrink-0 ml-4"
                      aria-label="Fechar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              <Tabs defaultValue="details" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6 gap-2 bg-muted/40 p-1.5 rounded-xl">
                      <TabsTrigger value="details" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"><Info className="w-4 h-4" /></TabsTrigger>
                      <TabsTrigger value="photos" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"><Camera className="w-4 h-4" /></TabsTrigger>
                      <TabsTrigger value="videos" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"><Video className="w-4 h-4" /></TabsTrigger>
                      <TabsTrigger value="docs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"><FileText className="w-4 h-4" /></TabsTrigger>
                </TabsList>
                    <TabsContent value="details" className="space-y-6">
                      <div className="space-y-6">
                    {selectedWork.execution_percentage > 0 && (
                      <div className="bg-muted/30 rounded-xl p-5 border border-border/50 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-semibold text-foreground">Progresso da Execução</span>
                          <span className="text-sm font-bold text-tc-red">{selectedWork.execution_percentage}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3.5 overflow-hidden">
                          <div className="bg-tc-red h-3.5 rounded-full transition-all" style={{ width: `${selectedWork.execution_percentage}%` }}></div>
                        </div>
                      </div>
                    )}
                    
                    {/* Seção: Valores */}
                    {(selectedWork.total_value || selectedWork.amount_spent) && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Valores</h4>
                        <DetailItem icon={DollarSign} label="Valor Total" value={selectedWork.total_value ? formatCurrency(selectedWork.total_value) : null} />
                        <DetailItem
                          icon={DollarSign}
                          label="Valor Pago"
                          value={paidTotal != null ? formatCurrency(paidTotal) : selectedWork.amount_spent ? formatCurrency(selectedWork.amount_spent) : null}
                        />
                      </div>
                    )}

                    {/* Seção: Construtora */}
                    {(selectedWork.contractor?.name || selectedWork.contractor?.cnpj) && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Construtora</h4>
                        <DetailItem icon={Building} label="Nome" value={selectedWork.contractor?.name} />
                        {selectedWork.contractor?.cnpj && (
                          <DetailItem icon={FileCheck} label="CNPJ" value={formatCnpj(selectedWork.contractor.cnpj)} />
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
                    <TabsContent value="photos" className="space-y-4">
                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pb-3">
                      {photos.length > 0 ? photos.map((photo, index) => (
                        <img key={index} src={photo.url} alt={photo.name} className="w-full h-auto rounded-xl object-cover aspect-square shadow-sm hover:shadow-md transition-shadow" />
                      )) : (
                        <div className="col-span-2 text-center py-12">
                          <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">Nenhuma foto disponível.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                    <TabsContent value="videos" className="space-y-4">
                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4 pb-3">
                      {videos.length > 0 ? videos.map((video, index) => {
                        if (video.type === 'video_url') {
                          const embedUrl = getYouTubeEmbedUrl(video.url);
                          return embedUrl ? (
                            <div key={index} className="aspect-video rounded-xl overflow-hidden shadow-sm">
                              <iframe className="w-full h-full" src={embedUrl} title={video.name} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            </div>
                          ) : (
                            <a key={index} href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-tc-red hover:underline p-3.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                              <Video className="w-5 h-5" /> Ver vídeo {index + 1} (link externo)
                            </a>
                          );
                        }
                        return (
                          <video key={index} controls src={video.url} className="w-full rounded-xl shadow-sm" />
                        );
                      }) : (
                        <div className="text-center py-12">
                          <Video className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">Nenhum vídeo disponível.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                    <TabsContent value="docs" className="space-y-2.5">
                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-2.5 pb-3">
                      {documents.length > 0 ? documents.map((doc, index) => (
                        <a key={index} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-tc-red hover:underline p-3.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                          <FileText className="w-5 h-5 flex-shrink-0" /> 
                          <span className="truncate flex-1">{doc.name || `Documento ${index + 1}`}</span>
                        </a>
                      )) : (
                        <div className="text-center py-12">
                          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">Nenhum documento disponível.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
                </div>

                <div
                  className="border-t border-border p-4 bg-card flex items-center"
                  style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
                >
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDetailsClick(selectedWork);
                    }} 
                    className="w-full bg-tc-red text-white py-3.5 px-5 rounded-xl font-semibold hover:bg-tc-red/90 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    style={{ pointerEvents: 'auto', touchAction: 'auto' }}
                  >
                    <Info className="w-5 h-5" />
                    Ver Mais Detalhes
                  </button>
                </div>
              </motion.div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 z-[800]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              recenterToUser();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
            title="Ir para minha posição"
            aria-label="Ir para minha posição"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
          <div className="h-px w-full bg-border" />
          {/* Entra na mesma pilha dos outros controles, e não como pílula solta:
              o estilo daqui é quadrado e sem sombra, e um botão redondo no meio
              da coluna leria como algo de outro sistema. Por isso não se usa o
              `MapLayerToggle` aqui — só a camada, que é o que precisa ser único. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCamada((atual) => (atual === MAP_LAYER.SATELLITE ? MAP_LAYER.STANDARD : MAP_LAYER.SATELLITE));
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
            title={camada === MAP_LAYER.SATELLITE ? 'Mapa padrão' : 'Satélite'}
            aria-label={camada === MAP_LAYER.SATELLITE ? 'Usar mapa padrão' : 'Usar mapa de satélite'}
          >
            <Layers className="w-4 h-4" />
          </button>
          <div className="h-px w-full bg-border" />
          <MapModeToggle className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none hover:bg-muted/60" />
        </div>
      </div>

      {!isSingleWorkView && mostrarLegenda && (
        <div className="absolute left-2 sm:left-4 bottom-2 sm:bottom-3 bg-card/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border z-[700] max-w-[200px] pointer-events-auto">
          <h4 className="font-semibold text-sm mb-2.5">Legenda</h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-purple-500 rounded-full flex-shrink-0"></div><span className="truncate">Prevista</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-orange-500 rounded-full flex-shrink-0"></div><span className="truncate">Licitada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div><span className="truncate">Em Andamento</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-amber-500 rounded-full flex-shrink-0"></div><span className="truncate">Paralisada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div><span className="truncate">Inacabada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div><span className="truncate">Concluída</span></div>
          </div>
        </div>
      )}
    </div>
  );
});

export default WorksMapView;
