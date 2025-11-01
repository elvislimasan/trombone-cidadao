import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { HardHat, PauseCircle, CheckCircle, Calendar, X, CalendarClock, DollarSign, Building, Landmark, UserCheck, Info, FileText, Video, Camera, ListChecks, Newspaper, Clock, Loader2, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
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
    <div className="flex items-start text-xs">
      <Icon className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div>
        <span className="font-semibold text-foreground">{label}:</span>
        <span className="text-muted-foreground ml-1">{value || 'Não informado'}</span>
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
            }}
          >
            <Popup>{work.title}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <AnimatePresence>
        {selectedWork && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute top-4 right-4 bg-card rounded-xl shadow-2xl border border-border max-w-sm z-[1000] w-full flex flex-col max-h-[calc(100%-2rem)]"
          >
            <div className="flex-shrink-0 p-4 border-b border-border">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedWork.title}</h3>
                  <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusInfo(selectedWork.status).color}`}>
                    {React.createElement(getStatusInfo(selectedWork.status).icon, { className: "w-3 h-3" })}
                    {getStatusInfo(selectedWork.status).text}
                  </div>
                </div>
                <button onClick={() => setSelectedWork(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-muted-foreground text-sm">{selectedWork.description}</p>
            </div>
            
            <div className="flex-grow overflow-y-auto">
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-4 m-2">
                  <TabsTrigger value="details"><Info className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="photos"><Camera className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="videos"><Video className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="docs"><FileText className="w-4 h-4" /></TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="p-4 text-sm">
                  <div className="space-y-3">
                    {selectedWork.execution_percentage > 0 && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-foreground">Execução</span>
                          <span className="text-xs font-bold text-tc-red">{selectedWork.execution_percentage}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5">
                          <div className="bg-tc-red h-2.5 rounded-full" style={{ width: `${selectedWork.execution_percentage}%` }}></div>
                        </div>
                      </div>
                    )}
                    <DetailItem icon={DollarSign} label="Valor Total" value={formatCurrency(selectedWork.total_value)} />
                    <DetailItem icon={DollarSign} label="Valor Gasto" value={formatCurrency(selectedWork.amount_spent)} />
                    <DetailItem icon={Building} label="Construtora" value={selectedWork.contractor?.name} />
                    <DetailItem icon={Landmark} label="Fonte do Recurso" value={getFundingSourceText(selectedWork.funding_source)} />
                    {selectedWork.parliamentary_amendment?.has && (
                      <DetailItem icon={UserCheck} label="Emenda Parlamentar" value={selectedWork.parliamentary_amendment.author} />
                    )}
                    <DetailItem icon={Calendar} label="Início" value={formatDate(selectedWork.start_date)} />
                    {selectedWork.execution_period_days && <DetailItem icon={Clock} label="Prazo de Execução" value={`${selectedWork.execution_period_days} dias`} />}
                    {selectedWork.status === 'in-progress' && <DetailItem icon={Calendar} label="Previsão" value={formatDate(selectedWork.expected_end_date)} />}
                    {selectedWork.status === 'completed' && <DetailItem icon={Calendar} label="Inauguração" value={formatDate(selectedWork.inauguration_date)} />}
                    {selectedWork.status === 'stalled' && <DetailItem icon={Calendar} label="Paralisação" value={formatDate(selectedWork.stalled_date)} />}
                    {selectedWork.status === 'unfinished' && <DetailItem icon={Calendar} label="Paralisação" value={formatDate(selectedWork.stalled_date)} />} {/* Assuming stalled_date for unfinished */}
                    <DetailItem icon={Calendar} label="Última Atualização" value={formatDate(selectedWork.last_update)} />
                    {selectedWork.other_details && <DetailItem icon={ListChecks} label="Outros Detalhes" value={selectedWork.other_details} />}
                  </div>
                </TabsContent>
                <TabsContent value="photos" className="p-4">
                  {loadingMedia ? <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /> : (
                    <div className="grid grid-cols-2 gap-2">
                      {photos.length > 0 ? photos.map((photo, index) => (
                        <img key={index} src={photo.url} alt={photo.name} className="w-full h-auto rounded-md object-cover aspect-square" />
                      )) : <p className="col-span-2 text-xs text-muted-foreground text-center">Nenhuma foto disponível.</p>}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="videos" className="p-4">
                  {loadingMedia ? <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /> : (
                    <div className="space-y-4">
                      {videos.length > 0 ? videos.map((video, index) => {
                        if (video.type === 'video_url') {
                          const embedUrl = getYouTubeEmbedUrl(video.url);
                          return embedUrl ? (
                            <div key={index} className="aspect-video rounded-lg overflow-hidden">
                              <iframe className="w-full h-full" src={embedUrl} title={video.name} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            </div>
                          ) : (
                            <a key={index} href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-tc-red hover:underline">
                              <Video className="w-4 h-4" /> Ver vídeo {index + 1} (link externo)
                            </a>
                          );
                        }
                        return (
                          <video key={index} controls src={video.url} className="w-full rounded-lg" />
                        );
                      }) : <p className="text-xs text-muted-foreground text-center">Nenhum vídeo disponível.</p>}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="docs" className="p-4">
                  {loadingMedia ? <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /> : (
                    <div className="space-y-2">
                      {documents.length > 0 ? documents.map((doc, index) => (
                        <a key={index} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-tc-red hover:underline p-2 rounded-md hover:bg-muted">
                          <FileText className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{doc.name || `Documento ${index + 1}`}</span>
                        </a>
                      )) : <p className="text-xs text-muted-foreground text-center">Nenhum documento disponível.</p>}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
            <div className="flex-shrink-0 p-4 border-t border-border">
              <button onClick={() => handleDetailsClick(selectedWork)} className="w-full bg-tc-red text-white py-2 px-4 rounded-lg font-semibold hover:bg-tc-red/90 transition-colors flex items-center justify-center gap-2">
                <Info className="w-4 h-4" />
                Ver Mais Detalhes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isSingleWorkView && (
        <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border z-[1000]">
          <h4 className="font-semibold text-sm mb-2">Legenda</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-purple-500 rounded-full"></div><span>Prevista</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-orange-500 rounded-full"></div><span>Licitada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div><span>Em Andamento</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-amber-500 rounded-full"></div><span>Paralisada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-red-500 rounded-full"></div><span>Inacabada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span>Concluída</span></div>
          </div>
        </div>
      )}
    </div>
  );
});

export default WorksMapView;