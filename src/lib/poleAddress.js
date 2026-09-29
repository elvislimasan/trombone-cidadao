export function polePosition(pole) {
  const values = [pole.latitude, pole.longitude];
  if (values.some((value) => value == null || String(value).trim() === '')) return null;
  const [lat, lng] = values.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}
