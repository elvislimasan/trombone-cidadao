import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { Info, HelpCircle, Edit } from 'lucide-react';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { useCityView } from '@/contexts/CityContext';
import { geocodeCity } from '@/lib/geocodeCity';
import MapDisplayControls, {
  CurrentLocationMarker,
  MAP_LAYER,
  MapBaseLayer,
} from '@/components/map/MapDisplayControls';

// Status de pavimentacao -> sufixo das classes .via-pav--* e .ponto-pav--*.
const PAVEMENT_STATUS_TOKEN = {
  paved: 'paved',
  partially_paved: 'partial',
  unpaved: 'unpaved',
};

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

// O ponto encolhe no zoom de cidade e cresce ao aproximar. É o que o disco de
// 40 px não fazia — ele tinha o mesmo tamanho a 3 km e a 30 m, e por isso
// quatrocentos deles cobriam o mapa inteiro.
const ZoomWatcher = ({ onZoom }) => {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
};

// Recentraliza o mapa nas ruas carregadas sempre que a lista muda
// (ex.: ao trocar a cidade no seletor). Se não houver ruas na cidade,
// centraliza na própria cidade selecionada (forward geocode). Sem isso,
// o mapa fica preso no center inicial (Floresta).
const FitToStreets = ({ streets, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (streets || []).flatMap((s) => {
      const daLinha = (Array.isArray(s.linhas) ? s.linhas : []).flat();
      if (daLinha.length > 0) return daLinha;
      return s.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng)
        ? [[s.location.lat, s.location.lng]]
        : [];
    });

    if (pts.length > 0) {
      const key = 'streets:' + pts.map((p) => p.join(',')).sort().join('|');
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
  }, [streets, activeCity, map]);
  return null;
};

const PavementMapView = forwardRef(({ streets, canManage = false, onEditStreet }, ref) => {
  const mapRef = useRef();
  const markerRefs = useRef({});
  const [mapLayer, setMapLayer] = useState(MAP_LAYER.STANDARD);
  const [currentLocation, setCurrentLocation] = useState(null);
  const { mode } = useMapModeToggle();
  const { city: activeCity } = useCityView();
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  // A ESPESSURA ACOMPANHA O ZOOM, E ESSA É A DIFERENÇA ENTRE MAPA E BORRÃO.
  //
  // A linha era 5 px em qualquer zoom. No zoom de cidade, com trezentas ruas
  // desenhadas, 5 px é mais largo que o quarteirão que a rua separa: os traços
  // encostam, e o mapa vira um bloco de cor onde não se lê rua nenhuma.
  //
  // Afinando para 1,5 px de longe, o desenho volta a ter espaço entre as vias —
  // e a malha da cidade aparece. De perto ela engrossa, porque aí há espaço e o
  // que se quer é acertar o toque.
  const espessuraDaVia = zoom >= 17 ? 5 : zoom >= 16 ? 3.5 : zoom >= 15 ? 2.5 : zoom >= 14 ? 2 : 1.5;
  // A área de toque cresce junto, mas nunca abaixo de 14 px: é o mínimo para o
  // dedo, e ela é invisível de qualquer forma.
  const toqueDaVia = Math.max(14, espessuraDaVia * 3);
  // O ponto é sempre menor que a linha da mesma rua seria. Ele marca "não sei o
  // traçado", e não deve competir com o que se sabe.
  const raioDoPonto = zoom >= 17 ? 5 : zoom >= 15 ? 3.5 : 2.5;

  useImperativeHandle(ref, () => ({
    goToLocation: (location) => {
      if (mapRef.current) {
        mapRef.current.flyTo([location.lat, location.lng], 18);
        const street = streets.find(s => s.location && s.location.lat === location.lat && s.location.lng === location.lng);
        if (street && markerRefs.current[street.id]) {
          markerRefs.current[street.id].openPopup();
        }
      }
    }
  }));

  // O visor de fotos, o carrossel e o cartão de status saíram daqui junto com o
  // modal de detalhes: a página da rua mostra tudo aquilo, e mais.

  return (
    <div className="w-full h-full bg-secondary rounded-lg overflow-hidden relative">
      <MapContainer
        center={FLORESTA_COORDS}
        zoom={INITIAL_ZOOM}
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <MapController mapRef={mapRef} />
        <MapScrollLock mode={mode} />
        <FitToStreets streets={streets} activeCity={activeCity} />
        <MapBaseLayer layer={mapLayer} />
        <CurrentLocationMarker position={currentLocation} />
        <ZoomWatcher onZoom={setZoom} />
        {streets.map((street) => {
          const token = PAVEMENT_STATUS_TOKEN[street.status] || 'unknown';
          const linhas = Array.isArray(street.linhas) ? street.linhas : [];

          const popup = (
            <Popup className="custom-popup" minWidth={200}>
              <div className="p-1">
                <div className="mb-2">
                  <h3 className="font-bold text-lg text-tc-red leading-tight">{street.name}</h3>
                  {street.is_unnamed && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-status-pendingBorder bg-status-pendingBg px-2 py-0.5 text-[10px] font-semibold text-status-pendingFg">
                      <HelpCircle className="h-3 w-3" /> Sem nome oficial
                    </span>
                  )}
                </div>

                {/* UM BOTÃO SÓ, E ELE LEVA À PÁGINA DA RUA
                    Havia dois: "Ver mais detalhes" abria um modal, e "História
                    da rua" — que só aparecia quando havia biografia cadastrada
                    — levava à página. O portão fazia sentido quando a página
                    era só história: sem conteúdo, não havia o que abrir.
                    A página virou Minha Rua. Agora ela responde "está faltando
                    água aqui?", "quantas broncas há nesta rua", "posso
                    acompanhar" — tudo isso existe para QUALQUER rua, inclusive
                    a que nunca recebeu uma linha de biografia. O portão passou
                    a esconder justamente o que mais importa.
                    O modal saiu junto: ele mostrava um subconjunto da página. */}
                {/* O `!` NO TEXTO NÃO É PREGUIÇA
                    `leaflet.css` traz `.leaflet-container a { color: #0078A8 }`,
                    que tem especificidade 0,1,1 e ganha da classe de cor do
                    botão (0,1,0). O rótulo saía repintado por cima do fundo da
                    marca — texto escuro sobre vermelho, ilegível.
                    Subir a regra no index.css resolveria para todo link dentro
                    de popup, e é justamente o que não se quer: um link comum
                    ali DEVE ser azul. O `!important` fica no único lugar em que
                    o elemento é um link mas se comporta como botão. */}
                <div className="mt-2">
                  <Button
                    asChild
                    size="sm"
                    // `primary-foreground` e não `content-onBrand`: é a cor que
                    // a própria variante do Button já escolheu para este fundo.
                    // O `!` só faz ela vencer o leaflet — não muda a decisão de
                    // design nem presume que os dois tokens sejam iguais.
                    className="w-full justify-center !text-primary-foreground hover:!text-primary-foreground"
                  >
                    <Link to={`/mapa-pavimentacao/rua/${street.id}`}>
                      <Info className="w-4 h-4 mr-2" /> Detalhes e história
                    </Link>
                  </Button>
                  {canManage && onEditStreet && (
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onEditStreet(street)}>
                      <Edit className="mr-2 h-4 w-4" /> Editar rua
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          );

          // COM TRAÇADO: a rua é uma linha, que é o que ela é.
          if (linhas.length > 0) {
            return (
              <React.Fragment key={street.id}>
                {/* A área de toque vai por baixo e é invisível: sem ela, acertar
                    5 px com o dedo é impossível. O ref também vai aqui — é a
                    única camada interativa da rua com traçado, e é ela que
                    `goToLocation` precisa abrir. */}
                <Polyline
                  positions={linhas}
                  ref={(el) => { if (el) markerRefs.current[street.id] = el; }}
                  className="via-pav-toque"
                  pathOptions={{ weight: toqueDaVia, opacity: 0 }}
                >
                  {popup}
                </Polyline>
                <Polyline
                  positions={linhas}
                  className={`via-pav via-pav--${token}`}
                  pathOptions={{ weight: espessuraDaVia }}
                  interactive={false}
                />
              </React.Fragment>
            );
          }

          // SEM TRAÇADO: um ponto pequeno. Rua sem nome oficial nunca vai ter
          // traçado do OSM, e é aqui que ela vive.
          if (!street.location) return null;
          return (
            <CircleMarker
              key={street.id}
              ref={(el) => { if (el) markerRefs.current[street.id] = el; }}
              center={[street.location.lat, street.location.lng]}
              radius={raioDoPonto}
              className={`ponto-pav ponto-pav--${token}`}
              pathOptions={{ weight: 1.5 }}
            >
              {popup}
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute right-3 top-[5.5rem] z-[800] flex flex-col gap-2">
        <MapDisplayControls
          mapRef={mapRef}
          layer={mapLayer}
          onLayerChange={setMapLayer}
          onLocated={setCurrentLocation}
        />
        <MapModeToggle className="h-11 w-11 rounded-full p-0" />
      </div>

    </div>
  );
});

PavementMapView.displayName = 'PavementMapView';

export default PavementMapView;
