import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { ThumbsUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';

const getCategoryIcon = (category) => {
  const icons = {
    'iluminacao': '💡',
    'buracos': '🕳️',
    'esgoto': '🚰',
    'limpeza': '🧹',
    'poda': '🌳',
    'outros': '📍'
  };
  return icons[category] || '📍';
};

const getStatusColor = (status) => {
  const colors = {
    'pending': '#f97316',
    'in-progress': '#3b82f6',
    'resolved': '#22c55e'
  };
  return colors[status] || '#6b7280';
};

const createMarkerIcon = (category, status) => {
  const iconHtml = `
    <div style="
      background-color: ${getStatusColor(status)};
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    ">
      ${getCategoryIcon(category)}
    </div>
  `;
  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
};

const MapView = ({ reports, onReportClick, onUpvote }) => {
  const formatDate = (dateString) => {
    if (!dateString || isNaN(new Date(dateString))) return 'Data inválida';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const MapFlyTo = () => {
    const map = useMap();
    useEffect(() => {
      if (reports.length > 0) {
        const firstReportLocation = reports[0].location;
        if (firstReportLocation && firstReportLocation.lat && firstReportLocation.lng) {
          map.flyTo([firstReportLocation.lat, firstReportLocation.lng], 15);
        }
      }
    }, [reports, map]);
    return null;
  };

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFlyTo />
        {reports.map((report) => {
          const location = report.location;
          if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
            return null;
          }
          return (
            <Marker
              key={report.id}
              position={[location.lat, location.lng]}
              icon={createMarkerIcon(report.category, report.status)}
            >
              <Popup>
                <div className="w-64">
                  <h3 className="font-bold text-base mb-1">{report.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{report.description}</p>
                  <div className="flex items-center text-xs text-muted-foreground mb-3">
                    <Calendar className="w-3 h-3 mr-1" />
                    {formatDate(report.created_at)}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onUpvote(report.id); }} className="flex items-center space-x-1">
                      <ThumbsUp className="w-3 h-3" />
                      <span>{report.upvotes}</span>
                    </Button>
                    <Button size="sm" onClick={() => onReportClick(report)} className="bg-primary hover:bg-primary/90">
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border z-[1000]">
        <h4 className="font-semibold text-sm mb-2">Legenda</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center space-x-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: getStatusColor('pending')}}></div><span>Pendente</span></div>
          <div className="flex items-center space-x-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: getStatusColor('in-progress')}}></div><span>Em Andamento</span></div>
          <div className="flex items-center space-x-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: getStatusColor('resolved')}}></div><span>Resolvido</span></div>
        </div>
      </div>
    </div>
  );
};

export default MapView;