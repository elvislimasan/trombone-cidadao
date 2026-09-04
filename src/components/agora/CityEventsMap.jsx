import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { createMapPin } from '@/components/map/pinIcon';
import { IconeDoAcontecimento, iconeDoTipo } from '@/components/agora/CityEventVisuals';
import { FLORESTA_COORDS } from '@/config/mapConfig';
import { geocodeCity } from '@/lib/geocodeCity';
import { rotuloDasAreas, tipoDe } from '@/lib/cityEvents';

const posicaoDe = (evento) => {
  if (evento?.latitude == null || evento?.longitude == null || evento.latitude === '' || evento.longitude === '') return null;
  const lat = Number(evento?.latitude);
  const lng = Number(evento?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

const AjustarVisao = ({ pontos, centro }) => {
  const map = useMap();

  useEffect(() => {
    if (pontos.length > 1) {
      map.fitBounds(pontos, { padding: [36, 36], maxZoom: 16, animate: false });
    } else if (pontos.length === 1) {
      map.setView(pontos[0], 16, { animate: false });
    } else if (centro) {
      map.setView(centro, 13, { animate: false });
    }
  }, [map, pontos, centro]);

  return null;
};

const tamanhoDoPin = (zoom) => {
  if (zoom <= 12) return 22;
  if (zoom <= 14) return 26;
  if (zoom <= 16) return 30;
  return 36;
};

const TOKENS_DO_PIN = {
  water_outage: ['--pin-city-water-bg', '--pin-city-water-fg'],
  power_outage: ['--pin-city-power-bg', '--pin-city-power-fg'],
  road_block: ['--pin-city-traffic-bg', '--pin-city-traffic-fg'],
  traffic: ['--pin-city-traffic-bg', '--pin-city-traffic-fg'],
  public_transport: ['--pin-city-traffic-bg', '--pin-city-traffic-fg'],
  construction: ['--pin-city-traffic-bg', '--pin-city-traffic-fg'],
  event: ['--pin-city-event-bg', '--pin-city-event-fg'],
  health: ['--pin-city-health-bg', '--pin-city-health-fg'],
  public_notice: ['--pin-city-notice-bg', '--pin-city-notice-fg'],
  weather: ['--pin-city-water-bg', '--pin-city-water-fg'],
};

const tokensDoTipo = (type) => TOKENS_DO_PIN[type] || ['--pin-city-other-bg', '--pin-city-other-fg'];

const agruparEventos = (map, eventos, zoom) => {
  if (zoom >= 17) return eventos.map((evento) => ({ eventos: [evento], position: posicaoDe(evento) }));

  const limite = zoom <= 12 ? 58 : 48;
  const grupos = [];

  eventos.forEach((evento) => {
    const position = posicaoDe(evento);
    const pixel = map.project(L.latLng(position), zoom);
    const proximo = grupos.find((grupo) => grupo.pixel.distanceTo(pixel) < limite);

    if (!proximo) {
      grupos.push({ eventos: [evento], pixels: [pixel], pixel, positions: [position], position });
      return;
    }

    proximo.eventos.push(evento);
    proximo.pixels.push(pixel);
    proximo.positions.push(position);
    proximo.pixel = L.point(
      proximo.pixels.reduce((soma, p) => soma + p.x, 0) / proximo.pixels.length,
      proximo.pixels.reduce((soma, p) => soma + p.y, 0) / proximo.pixels.length
    );
    proximo.position = [
      proximo.positions.reduce((soma, p) => soma + p[0], 0) / proximo.positions.length,
      proximo.positions.reduce((soma, p) => soma + p[1], 0) / proximo.positions.length,
    ];
  });

  return grupos;
};

const MarcadoresDeEventos = ({ eventos, cityName }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend() { setZoom(map.getZoom()); },
  });

  const grupos = useMemo(() => agruparEventos(map, eventos, zoom), [map, eventos, zoom]);
  const pinSize = tamanhoDoPin(zoom);

  return grupos.map((grupo) => {
    if (grupo.eventos.length > 1) {
      const clusterIcon = createMapPin({
        cacheKey: `city-event-cluster|${grupo.eventos.length}`,
        bgToken: '--pin-city-cluster-bg',
        fgToken: '--pin-city-cluster-fg',
        icon: String(grupo.eventos.length),
        size: Math.max(26, pinSize),
      });

      return (
        <Marker
          key={`cluster-${grupo.eventos.map((evento) => evento.id).join('-')}`}
          position={grupo.position}
          icon={clusterIcon}
          title={`${grupo.eventos.length} acontecimentos próximos`}
          eventHandlers={{
            click() {
              map.flyTo(grupo.position, Math.min(18, zoom + 2), { animate: true, duration: 0.45 });
            },
          }}
        />
      );
    }

    const evento = grupo.eventos[0];
    const tipo = tipoDe(evento.type);
    const Icone = iconeDoTipo(evento.type, evento.icon_key);
    const [bgToken, fgToken] = tokensDoTipo(evento.type);
    const iconSize = Math.max(12, Math.round(pinSize * 0.48));
    const icon = createMapPin({
      cacheKey: `city-event|${evento.type}|${evento.icon_key || 'default'}`,
      bgToken,
      fgToken,
      icon: <Icone width={iconSize} height={iconSize} strokeWidth="2.5" />,
      size: pinSize,
    });

    return (
      <Marker key={evento.id} position={grupo.position} icon={icon}>
        <Popup>
          <div className="min-w-44">
            <p className="font-bold text-content-primary">{evento.title || tipo.rotulo}</p>
            <p className="mt-1 text-xs text-content-secondary">
              {evento.location_label || rotuloDasAreas(evento.areas, { maximo: 2 }) || cityName}
            </p>
            <Link className="mt-2 inline-block text-xs font-bold text-brand" to={`/agora/${evento.id}`}>
              Ver detalhes
            </Link>
          </div>
        </Popup>
      </Marker>
    );
  });
};

export default function CityEventsMap({
  eventos = [],
  cityName,
  cityUf,
  compact = false,
  embedded = false,
  showLegend = false,
}) {
  const [centroDaCidade, setCentroDaCidade] = useState(null);
  const localizados = useMemo(
    () => eventos.filter((evento) => posicaoDe(evento)),
    [eventos]
  );
  const pontos = useMemo(() => localizados.map(posicaoDe), [localizados]);
  const tiposNaLegenda = useMemo(() => {
    const unicos = new Map();
    localizados.forEach((evento) => {
      const chave = evento.type;
      if (!unicos.has(chave)) unicos.set(chave, evento);
    });
    return [...unicos.values()].slice(0, 6);
  }, [localizados]);

  useEffect(() => {
    if (pontos.length || !cityName) return;
    let cancelado = false;
    geocodeCity(cityName, cityUf).then((centro) => {
      if (!cancelado && centro) setCentroDaCidade([centro.lat, centro.lng]);
    });
    return () => { cancelado = true; };
  }, [cityName, cityUf, pontos.length]);

  const centro = pontos[0] || centroDaCidade || FLORESTA_COORDS;

  return (
    <div className={`relative overflow-hidden bg-surface-sunken ${
      compact
        ? 'h-64 rounded-2xl'
        : `h-[28rem] sm:h-[32rem] lg:h-[36rem] ${embedded ? 'rounded-none' : 'rounded-3xl'}`
    }`}>
      <MapContainer center={centro} zoom={pontos.length ? 16 : 13} className="h-full w-full" scrollWheelZoom>
        <ThemedTileLayer maxZoom={19} />
        <AjustarVisao pontos={pontos} centro={centroDaCidade} />
        <MarcadoresDeEventos eventos={localizados} cityName={cityName} />
      </MapContainer>

      {!localizados.length && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[500] rounded-2xl border border-edge-subtle bg-surface-raised/95 px-4 py-3 text-center text-sm text-content-secondary shadow-elevation-1 backdrop-blur">
          Eventos com um local exato aparecerão aqui.
        </div>
      )}

      {showLegend && tiposNaLegenda.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-xl border border-edge-subtle bg-surface-raised/95 p-1.5 shadow-elevation-2 backdrop-blur-md">
          {tiposNaLegenda.map((evento) => (
            <span
              key={`${evento.type}-${evento.icon_key || 'default'}`}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-subtle py-1 pl-1 pr-2 text-[9px] font-bold text-content-secondary"
            >
              <IconeDoAcontecimento
                type={evento.type}
                iconKey={evento.icon_key}
                severity={evento.severity}
                tamanho="sm"
                className="!h-5 !w-5 !rounded-md"
              />
              {tipoDe(evento.type).curto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
