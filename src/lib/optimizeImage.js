const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = async () => {
    try {
      // Alguns WebViews disparam onload antes de todos os pixels estarem
      // decodificados. Aguardar decode evita imagens vazias ou pretas.
      if (typeof image.decode === 'function') await image.decode();
      resolve({ image, url });
    } catch (error) {
      URL.revokeObjectURL(url);
      reject(error);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Não foi possível ler a imagem.'));
  };
  image.src = url;
});

const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Não foi possível otimizar a imagem.'));
  }, type, quality);
});

export async function imageDimensions(file) {
  const { image, url } = await loadImage(file);
  try {
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redimensiona fotos antes do upload no navegador e no WebView do app.
 * O limite padrão acompanha o fluxo principal de broncas no mobile nativo.
 */
export async function optimizeImageFile(file, { maxDimension = 1600, quality = 0.8, forceResize = false } = {}) {
  if (!file?.type?.startsWith('image/') || /image\/(gif|svg\+xml)/i.test(file.type)) return file;
  if (typeof Image === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return file;

  try {
    const { image, url } = await loadImage(file);
    try {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, 'image/webp', quality);
      // Libera o buffer de pixels assim que o WebP foi criado. Isso reduz o
      // pico de memória ao selecionar várias fotos no celular.
      canvas.width = 1;
      canvas.height = 1;
      const dimensionsChanged = scale < 1;
      // Se a foto excede o limite, envie a versão reduzida mesmo quando o
      // WebP ocupa mais bytes: o limite de resolução deve ser respeitado.
      if (blob.size >= file.size && !dimensionsChanged && !forceResize) return file;
      const name = String(file.name || 'imagem').replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}
