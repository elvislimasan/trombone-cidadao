// Web Worker para processamento pesado de imagens
// Evita travar a UI durante processamento

// eslint-disable-next-line no-restricted-globals
const workerScope = self;

workerScope.onmessage = function(e) {
  const { imageData, maxWidth, maxHeight, quality, fileName } = e.data;
  
  try {
    // Image não existe em Web Workers. Decodifique o arquivo com createImageBitmap.
    fetch(imageData).then((response) => response.blob()).then(createImageBitmap).then((img) => {
      try {
        // Calcular dimensões mantendo proporção
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        // Criar canvas e redimensionar
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        img.close();
        
        // Converter para WEBP (melhor relação tamanho/qualidade)
        canvas.convertToBlob({ type: 'image/webp', quality: quality })
          .then(blob => {
            const mime = blob.type || 'image/png';
            const extension = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
            // Converter blob para ArrayBuffer para enviar de volta
            return blob.arrayBuffer().then(buffer => {
              workerScope.postMessage({
                success: true,
                buffer: buffer,
                width: width,
                height: height,
                fileName: fileName.replace(/\.[^.]+$/, '') + '.' + extension,
                size: blob.size,
                mime
              });
            });
          })
          .catch(error => {
            workerScope.postMessage({
              success: false,
              error: error.message
            });
          });
      } catch (error) {
        workerScope.postMessage({
          success: false,
          error: error.message
        });
      }
    }).catch(() => {
      workerScope.postMessage({
        success: false,
        error: 'Erro ao carregar imagem no worker'
      });
    });
    
  } catch (error) {
    workerScope.postMessage({
      success: false,
      error: error.message
    });
  }
};

