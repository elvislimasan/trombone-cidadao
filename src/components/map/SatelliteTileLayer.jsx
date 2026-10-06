import React from 'react';
import { TileLayer } from 'react-leaflet';

// Em algumas cidades o nível 19 do Esri é uma imagem de "Map data not yet
// available", inclusive com HTTP 200. Amplie o nível 18 em vez de pedir
// essas imagens vazias quando o usuário aproxima até a escala de 20 metros.
export default function SatelliteTileLayer() {
  return <TileLayer
    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    attribution="Tiles &copy; Esri"
    maxNativeZoom={18}
    maxZoom={19}
  />;
}
