export function webCameraCapabilities(track, mode = 'photo') {
  let capabilities = {};
  let settings = {};
  try { capabilities = track?.getCapabilities?.() || {}; } catch {}
  try { settings = track?.getSettings?.() || {}; } catch {}
  const range = capabilities.zoom;
  const hardwareZoom = typeof track?.applyConstraints === 'function'
    && Number.isFinite(range?.min) && Number.isFinite(range?.max)
    && Number.isFinite(settings.zoom)
    && range.min > 0 && range.max > range.min;
  const zoom = hardwareZoom ? {
    min: range.min, max: range.max, step: range.step > 0 ? range.step : 0.1,
  } : { min: 1, max: mode === 'photo' ? 4 : 1, step: 0.1 };
  return {
    hardwareZoom, zoom,
    value: hardwareZoom ? Math.min(zoom.max, Math.max(zoom.min, settings.zoom || zoom.min)) : 1,
    // Chromium ainda expõe boolean; a especificação mais recente usa sequência.
    torch: typeof track?.applyConstraints === 'function'
      && (capabilities.torch === true || capabilities.torch?.includes?.(true) === true),
    torchValue: settings.torch === true,
  };
}

export function clampCameraZoom(value, { min, max, step }) {
  if (!Number.isFinite(value)) return min;
  const bounded = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((bounded - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
}

export function photoZoomCrop(width, height, zoom = 1) {
  const scale = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

export function fitCameraPreview(containerWidth, containerHeight, frameWidth, frameHeight) {
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight);
  return { width: frameWidth * scale, height: frameHeight * scale };
}

export async function applyWebCameraControls(track, { zoom, torch }) {
  const controls = {};
  if (zoom != null) controls.zoom = zoom;
  if (torch != null) controls.torch = torch;
  await track.applyConstraints({ advanced: [controls] });
  // Uma constraint avançada pode ser ignorada sem rejeitar a Promise.
  // Só confirme o controle quando o estado da câmera corresponde ao pedido.
  const settings = track.getSettings?.() || {};
  for (const [key, value] of Object.entries(controls)) {
    const applied = key === 'zoom'
      ? Number.isFinite(settings.zoom) && Math.abs(settings.zoom - value) < 0.001
      : settings.torch === value;
    if (!applied) {
      const error = new Error(`A câmera não aplicou o controle ${key}.`);
      error.constraint = key;
      throw error;
    }
  }
  return settings;
}
