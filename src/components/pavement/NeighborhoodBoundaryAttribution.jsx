import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const CREDIT = 'Bairros: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> (ODbL)';

export default function NeighborhoodBoundaryAttribution({ hasOsm }) {
  const map = useMap();
  useEffect(() => {
    if (!hasOsm) return undefined;
    map.attributionControl?.addAttribution(CREDIT);
    return () => { map.attributionControl?.removeAttribution(CREDIT); };
  }, [map, hasOsm]);
  return null;
}
