function pointFromWkb(value) {
  const hex = value.replace(/^\\x/i, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0 || hex.length < 42) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  const byteOrder = view.getUint8(0);
  if (byteOrder !== 0 && byteOrder !== 1) return null;
  const littleEndian = byteOrder === 1;
  const geometryType = view.getUint32(1, littleEndian);
  if ((geometryType & 0x0fffffff) % 1000 !== 1) return null;

  const coordinateOffset = 5 + ((geometryType & 0x20000000) !== 0 ? 4 : 0);
  if (bytes.length < coordinateOffset + 16) return null;
  return {
    lng: view.getFloat64(coordinateOffset, littleEndian),
    lat: view.getFloat64(coordinateOffset + 8, littleEndian),
  };
}

export function guideLocation(location) {
  if (!location) return null;
  let lat;
  let lng;
  if (Array.isArray(location.coordinates)) {
    [lng, lat] = location.coordinates;
  } else if (typeof location.lat !== 'undefined' && typeof location.lng !== 'undefined') {
    ({ lat, lng } = location);
  } else if (typeof location === 'string') {
    const pointMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    const googleAtMatch = location.match(/@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    const googleDataMatch = location.match(/!3d\s*(-?\d+(?:\.\d+)?)!4d\s*(-?\d+(?:\.\d+)?)/i);
    if (pointMatch) [, lng, lat] = pointMatch;
    // !3d/!4d e o ponto do local; @lat,lng pode ser apenas o centro da tela.
    else if (googleDataMatch) [, lat, lng] = googleDataMatch;
    else if (googleAtMatch) [, lat, lng] = googleAtMatch;
    else ({ lat, lng } = pointFromWkb(location) || {});
  }
  lat = Number(lat);
  lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
