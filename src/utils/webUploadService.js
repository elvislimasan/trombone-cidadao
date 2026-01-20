import { supabase } from '@/lib/customSupabaseClient';

/**
 * Faz upload de arquivo grande para o Supabase Storage usando URL assinada e XHR para progresso.
 * Suporta retries e timeout ajustável.
 */
export const uploadLargeFile = async (file, filePath, options = {}) => {
  const {
    maxRetries = 3,
    onProgress,
    signal,
    bucket = 'reports-media'
  } = options;

  const fileSizeMB = file.size / (1024 * 1024);
  
  // Para arquivos muito grandes, usar timeout maior e adaptativo
  // 800MB+ -> 60min, 500MB+ -> 30min, 200MB+ -> 15min, 100MB+ -> 5min, Default -> 2min
  const timeout = fileSizeMB > 800 ? 3600000 : fileSizeMB > 500 ? 1800000 : fileSizeMB > 200 ? 900000 : fileSizeMB > 100 ? 300000 : 120000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) throw new Error('Upload cancelado');

      const { data: signed, error: signedErr } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(filePath);
        
      if (signedErr) throw signedErr;
      const signedUrl = signed?.signedUrl || signed?.url;
      if (!signedUrl) throw new Error('Falha ao gerar URL assinada para upload');

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-upsert', 'false');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const percent = (e.loaded / e.total) * 100;
            onProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            reject(new Error(`Erro no upload: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Erro de rede no upload'));
        xhr.ontimeout = () => reject(new Error('Upload timeout'));

        if (signal) {
          signal.addEventListener('abort', () => {
            xhr.abort();
            reject(new Error('Upload cancelado'));
          });
        }

        xhr.timeout = timeout;
        xhr.send(file);
      });
      
      return { data: true };
    } catch (error) {
      if (error.message === 'Upload cancelado') throw error;
      console.warn(`Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Upload falhou após ${maxRetries} tentativas: ${error.message}`);
      }
      
      // Esperar antes de tentar novamente (backoff exponencial)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};
