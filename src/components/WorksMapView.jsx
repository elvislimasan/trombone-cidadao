import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { HardHat, PauseCircle, CheckCircle, Calendar, X, CalendarClock, DollarSign, Building, Landmark, UserCheck, Info, FileText, Video, Camera, ListChecks, Newspaper, Clock, Loader2, Wrench, FileCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatCurrency, formatCnpj } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

const WorksMapView = forwardRef(({ works }, ref) => {
  const [selectedWork, setSelectedWork] = useState(null);
  const [workMedia, setWorkMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const mapRef = useRef();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { mode } = useMapModeToggle();

  const fetchWorkMedia = useCallback(async (workId) => {
    if (!workId) return;
    setLoadingMedia(true);
    const { data, error } = await supabase
      .from('public_work_media')
      .select('*')
      .eq('work_id', workId)
      .order('created_at');
    
    if (error) {
      toast({ title: "Erro ao buscar mídias da obra", description: error.message, variant: "destructive" });
    } else {
      setWorkMedia(data || []);
    }
    setLoadingMedia(false);
  }, [toast]);

  useEffect(() => {
    if (selectedWork) {
      fetchWorkMedia(selectedWork.id);
    } else {
      setWorkMedia([]);
    }
  }, [selectedWork, fetchWorkMedia]);

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

  const getStatusInfo = (status) => {
    switch (status) {
      case 'planned':
        return { icon: CalendarClock, color: 'bg-purple-500', markerColor: '#a855f7', text: 'Prevista' };
      case 'tendered':
        return { icon: FileText, color: 'bg-orange-500', markerColor: '#f97316', text: 'Licitada' };
      case 'in-progress':
        return { icon: HardHat, color: 'bg-blue-500', markerColor: '#3b82f6', text: 'Em Andamento' };
      case 'stalled':
        return { icon: PauseCircle, color: 'bg-amber-500', markerColor: '#f59e0b', text: 'Paralisada' };
      case 'unfinished':
        return { icon: Wrench, color: 'bg-red-500', markerColor: '#ef4444', text: 'Inacabada' };
      case 'completed':
        return { icon: CheckCircle, color: 'bg-green-500', markerColor: '#22c55e', text: 'Concluída' };
      default:
        return { icon: HardHat, color: 'bg-gray-500', markerColor: '#6b7280', text: 'Desconhecido' };
    }
  };

  const createWorkMarkerIcon = (status) => {
    const { markerColor } = getStatusInfo(status);
    const iconHtml = `
      <div style="
        background-color: ${markerColor};
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v5Z"/>
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/>
        </svg>
      </div>
    `;
    return L.divIcon({
      html: iconHtml,
      className: 'custom-work-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A';
  
  const getFundingSourceText = (sources) => {
    if (!sources || sources.length === 0) return 'Não informada';
    const sourceMap = { federal: 'Federal', state: 'Estadual', municipal: 'Municipal' };
    return sources.map(s => sourceMap[s] || s).join(', ');
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

  const DetailItem = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50">
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
        <p className="text-sm font-medium text-foreground break-words leading-relaxed">{value || 'Não informado'}</p>
      </div>
    </div>
  );

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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
            <Popup>{work.title}</Popup>
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
                className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto border border-border" 
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
                      {selectedWork.description && (
                        <p className="text-muted-foreground text-sm mt-3 leading-relaxed">{selectedWork.description}</p>
                      )}
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
                <div className="p-6 space-y-6">
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
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Valores</h4>
                    <DetailItem icon={DollarSign} label="Valor Total" value={formatCurrency(selectedWork.total_value)} />
                    <DetailItem icon={DollarSign} label="Valor Gasto" value={formatCurrency(selectedWork.amount_spent)} />
                    </div>

                    {/* Seção: Construtora */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Construtora</h4>
                      <DetailItem icon={Building} label="Nome" value={selectedWork.contractor?.name} />
                      {selectedWork.contractor?.cnpj && (
                        <DetailItem icon={FileCheck} label="CNPJ" value={formatCnpj(selectedWork.contractor.cnpj)} />
                      )}
                    </div>

                    {/* Seção: Recursos */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Recursos</h4>
                    <DetailItem icon={Landmark} label="Fonte do Recurso" value={getFundingSourceText(selectedWork.funding_source)} />
                    {selectedWork.parliamentary_amendment?.has && (
                      <DetailItem icon={UserCheck} label="Emenda Parlamentar" value={selectedWork.parliamentary_amendment.author} />
                    )}
                    </div>

                    {/* Seção: Cronograma */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Cronograma</h4>
                      <DetailItem icon={Calendar} label="Data de Início" value={formatDate(selectedWork.start_date)} />
                    {selectedWork.execution_period_days && <DetailItem icon={Clock} label="Prazo de Execução" value={`${selectedWork.execution_period_days} dias`} />}
                      {selectedWork.status === 'in-progress' && <DetailItem icon={Calendar} label="Previsão de Conclusão" value={formatDate(selectedWork.expected_end_date)} />}
                      {selectedWork.status === 'completed' && <DetailItem icon={Calendar} label="Data de Inauguração" value={formatDate(selectedWork.inauguration_date)} />}
                      {(selectedWork.status === 'stalled' || selectedWork.status === 'unfinished') && <DetailItem icon={Calendar} label="Data de Paralisação" value={formatDate(selectedWork.stalled_date)} />}
                    <DetailItem icon={Calendar} label="Última Atualização" value={formatDate(selectedWork.last_update)} />
                    </div>

                    {/* Seção: Outras Informações */}
                    {selectedWork.other_details && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Outras Informações</h4>
                        <DetailItem icon={ListChecks} label="Detalhes Adicionais" value={selectedWork.other_details} />
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
                  
                  <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-border">
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
                </div>
              </motion.div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 z-[900]">
        <MapModeToggle />
      </div>

      {!isSingleWorkView && (
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