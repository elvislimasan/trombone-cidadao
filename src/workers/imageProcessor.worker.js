// Web Worker para processamento pesado de imagens
// Evita travar a UI durante processamento

self.onmessage = function(e) {
  const { imageData, maxWidth, maxHeight, quality, fileName } = e.data;
  
  try {
    // Criar imagem a partir dos dados
    const img = new Image();
    
    img.onload = function() {
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
        
        // Converter para WEBP (melhor relação tamanho/qualidade)
        canvas.convertToBlob({ type: 'image/webp', quality: quality })
          .then(blob => {
            // Converter blob para ArrayBuffer para enviar de volta
            blob.arrayBuffer().then(buffer => {
              self.postMessage({
                success: true,
                buffer: buffer,
                width: width,
                height: height,
                fileName: fileName.replace(/\.jpe?g$/i, '.webp'),
                size: blob.size,
                mime: 'image/webp'
              });
            });
          })
          .catch(error => {
            self.postMessage({
              success: false,
              error: error.message
            });
          });
      } catch (error) {
        self.postMessage({
          success: false,
          error: error.message
        });
      }
    };
    
    img.onerror = function() {
      self.postMessage({
        success: false,
        error: 'Erro ao carregar imagem no worker'
      });
    };
    
    // Carregar imagem
    img.src = imageData;
    
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
};

