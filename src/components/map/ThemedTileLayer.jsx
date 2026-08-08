import React from 'react';
import { TileLayer } from 'react-leaflet';
import { useTheme } from '@/design-system/theme/ThemeProvider';

// Tiles que acompanham o tema. No escuro, o mapa claro do OSM brilhava demais
// contra a interface. CARTO Dark Matter e gratuito para uso nao comercial e
// mantem a mesma projecao/zoom do OSM, entao a troca e transparente.
//
// A `key` no TileLayer e obrigatoria: sem ela o Leaflet reaproveita a camada e
// mantem os tiles antigos ao alternar o tema.
const LIGHT = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const DARK = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
};

const ThemedTileLayer = (props) => {
  const { resolved } = useTheme();
  const cfg = resolved === 'dark' ? DARK : LIGHT;

  return <TileLayer key={resolved} {...cfg} {...props} />;
};

export default ThemedTileLayer;
