import React from 'react';
import { TileLayer } from 'react-leaflet';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import { fonteDeTiles } from './tileSources';

// Tiles que acompanham o tema. No escuro, o mapa claro do OSM brilhava demais
// contra a interface — e a inversao acontece no navegador, nao no servidor.
// Ver o cabecalho de tileSources.js para por que o provedor escuro caiu.
//
// As urls moram em tileSources.js porque o prefetch da patrulha precisa das
// mesmas — ver o cabecalho de lib/tileCache.js.
//
// A `key` no TileLayer e obrigatoria: sem ela o Leaflet reaproveita a camada e
// mantem os tiles antigos ao alternar o tema.
const ThemedTileLayer = ({ className = '', ...props }) => {
  const { resolved } = useTheme();
  // `id` e `classe` sao metadados nossos: o TileLayer os repassaria ao <div> da
  // camada como atributos invalidos.
  const { classe, id, ...cfg } = fonteDeTiles(resolved);

  return (
    <TileLayer
      key={resolved}
      className={[classe, className].filter(Boolean).join(' ')}
      {...cfg}
      {...props}
    />
  );
};

export default ThemedTileLayer;
