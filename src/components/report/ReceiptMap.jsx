import React from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { montarUrlDeTile, TILE_LIGHT } from '@/components/map/tileSources';

const zoom = 16;
const size = 256;

export function receiptPoint(location) {
  if (!location) return null;
  let lat;
  let lng;
  if (Array.isArray(location.coordinates)) [lng, lat] = location.coordinates;
  else if (typeof location === 'object') ({ lat, lng } = location);
  else {
    const match = String(location).match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (match) [, lng, lat] = match;
  }
  if (lat == null || lng == null) return null;
  lat = Number(lat);
  lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export default function ReceiptMap({ point }) {
  const world = size * 2 ** zoom;
  const radians = point.lat * Math.PI / 180;
  const centerX = (point.lng + 180) / 360 * world;
  const centerY = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * world;
  const tiles = [];
  for (let x = Math.floor((centerX - 350) / size); x <= Math.floor((centerX + 350) / size); x++) {
    for (let y = Math.floor((centerY - 115) / size); y <= Math.floor((centerY + 115) / size); y++) {
      if (y < 0 || y >= 2 ** zoom) continue;
      tiles.push({ x, y, left: x * size - centerX, top: y * size - centerY });
    }
  }
  const href = `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=${zoom}/${point.lat}/${point.lng}`;
  return <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="relative h-[230px] overflow-hidden bg-slate-200" role="img" aria-label={`Ponto da solicitação no mapa: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}>
      {tiles.map(({ x, y, left, top }) => <img key={`${x}-${y}`} src={montarUrlDeTile(TILE_LIGHT, { z: zoom, x: ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom, y })} alt="" loading="eager" className="absolute !max-w-none" style={{ width: size, height: size, left: `calc(50% + ${left}px)`, top: `calc(50% + ${top}px)` }} />)}
      <MapPin size={30} fill="#dc2626" stroke="white" strokeWidth={2.5} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md" aria-hidden="true" />
      <span className="absolute bottom-1 right-1 bg-white/90 px-1.5 py-0.5 text-[9px] text-slate-700">© OpenStreetMap contributors</span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-xs"><span className="flex items-center gap-1 text-slate-600"><MapPin size={13} /> Ponto informado no cadastro</span><a className="flex items-center gap-1 font-bold text-red-700" href={href} target="_blank" rel="noopener noreferrer">Abrir mapa <ExternalLink size={12} /></a></div>
  </div>;
}
