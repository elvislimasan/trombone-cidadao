import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapResizeObserver() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
