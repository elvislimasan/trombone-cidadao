import React, { useEffect, useMemo } from 'react';
import { CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';

export default function MunicipalDemandReportMarkers({ locations, servicePosition, selectedLocation }) {
  const map = useMap();
  const serviceLat = servicePosition?.lat;
  const serviceLng = servicePosition?.lng;
  const points = useMemo(() => [
    ...locations.filter((location) => location.position).map(({ position }) => [position.lat, position.lng]),
    ...(serviceLat != null && serviceLng != null ? [[serviceLat, serviceLng]] : []),
  ], [locations, serviceLat, serviceLng]);

  useEffect(() => {
    if (!points.length) return undefined;
    // Fit after the picker's initial view so every linked location stays visible.
    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(points, { padding: [30, 30], maxZoom: 16, animate: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [map, points]);

  useEffect(() => {
    if (selectedLocation?.position) map.setView(selectedLocation.position, 17, { animate: false });
  }, [map, selectedLocation]);

  return <>{locations.map((location, index) => location.position && <CircleMarker key={location.id}
    center={location.position} radius={11} bubblingMouseEvents={false}
    pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}>
    <Tooltip permanent direction="top" offset={[0, -8]}>{index + 1}</Tooltip>
    <Popup><strong>{location.title}</strong><p>{location.address || 'Endereço não informado'}{location.neighborhood && <><br />{location.neighborhood}</>}</p></Popup>
  </CircleMarker>)}</>;
}
