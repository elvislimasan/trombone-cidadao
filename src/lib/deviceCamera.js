// O input capture abre a câmera do sistema sem manter getUserMedia ativo.
// iPadOS pode se identificar como Mac quando pede a versão desktop do site.
export function prefersDeviceCamera(device = typeof navigator === 'undefined' ? undefined : navigator) {
  return /Android|iPhone|iPad|iPod/i.test(device?.userAgent || '')
    || (/Macintosh/i.test(device?.userAgent || '') && device?.maxTouchPoints > 1);
}

// No Android, manter a captura na página evita colocar a aba em segundo plano
// enquanto o aplicativo de câmera disputa memória com o navegador.
export function prefersBrowserCamera(device = typeof navigator === 'undefined' ? undefined : navigator) {
  return /Android/i.test(device?.userAgent || '')
    && typeof device?.mediaDevices?.getUserMedia === 'function';
}

export function openDeviceCamera(input) {
  if (!input?.isConnected) return false;
  // A mesma foto pode ser escolhida de novo depois de removida ou cancelada.
  input.value = '';
  input.click();
  return true;
}
