/**
 * Processador de Vídeos Otimizado para Mobile
 * Implementa processamento assíncrono, chunked e com proteção contra crashes
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { VideoProcessor } from '@/plugins/VideoProcessor';

// Configurações de segurança e performance
const CONFIG = {
  MAX_MEMORY_USAGE: 100 * 1024 * 1024, // 100MB máximo em memória
  CHUNK_SIZE: 1 * 1024 * 1024, // 1MB chunks para processamento (reduz picos de memória)
  MAX_CAMERA_VIDEO_MB: 250, // Aumentado para tolerar vídeos maiores antes do offload
  MAX_CONCURRENT_PROCESSING: 1, // Apenas 1 vídeo por vez
  QUEUE_POLL_INTERVAL: 100, // Verificar fila a cada 100ms
  TIMEOUTS: {
    SMALL_VIDEO: 30000, // 30s para vídeos pequenos
    MEDIUM_VIDEO: 60000, // 1min para vídeos médios  
    LARGE_VIDEO: 180000, // 3min para vídeos grandes
    HD_LONG_VIDEO: 600000, // 10min (Aumentado para garantir processamento de 8K)
  },
  DELAYS: {
    SMALL: 1000, // 1s
    MEDIUM: 3000, // 3s
    LARGE: 5000, // 5s
    HD_LONG: 10000, // 10s
    COMPLETION: 15000, // 15s
  }
};

// Estado global do processador
class VideoProcessorState {
  constructor() {
    this.isProcessing = false;
    this.currentJob = null;
    this.processingQueue = [];
    this.memoryUsage = 0;
    this.activeTimeouts = new Set();
    this.cleanupCallbacks = [];
  }

  // Fila de processamento
  addToQueue(task) {
    return new Promise((resolve, reject) => {
      this.processingQueue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    this.isProcessing = true;
    const { task, resolve, reject } = this.processingQueue.shift();

    try {
      this.currentJob = task;
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.currentJob = null;
      // Pequeno delay para permitir GC
      setTimeout(() => this.processNext(), 100);
    }
  }

  addTimeout(timeoutId) {
    this.activeTimeouts.add(timeoutId);
  }

  clearTimeout(timeoutId) {
    if (this.activeTimeouts.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(timeoutId);
    }
  }

  clearAllTimeouts() {
    this.activeTimeouts.forEach(id => clearTimeout(id));
    this.activeTimeouts.clear();
  }

  registerCleanup(callback) {
    this.cleanupCallbacks.push(callback);
  }

  async cleanup() {
    this.clearAllTimeouts();
    
    // Executar todos os callbacks de limpeza
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.warn('Erro durante cleanup:', error);
      }
    }
    
    this.cleanupCallbacks = [];
    this.memoryUsage = 0;
  }
}

const processorState = new VideoProcessorState();

/**
 * Detecta o tamanho e tipo de vídeo para aplicar estratégias apropriadas
 */
function detectVideoCharacteristics(fileSize) {
  const sizeMB = fileSize / (1024 * 1024);
  
  if (sizeMB > 150) {
    return {
      type: 'VERY_LARGE',
      timeout: CONFIG.TIMEOUTS.LARGE_VIDEO,
      delay: CONFIG.DELAYS.HD_LONG,
      completionDelay: CONFIG.DELAYS.COMPLETION * 2,
      requiresCompression: true,
      memorySafe: false
    };
  } else if (sizeMB > 50) {
    return {
      type: 'LARGE',
      timeout: CONFIG.TIMEOUTS.LARGE_VIDEO,
      delay: CONFIG.DELAYS.LARGE,
      completionDelay: CONFIG.DELAYS.COMPLETION,
      requiresCompression: true,
      memorySafe: false
    };
  } else if (sizeMB > 15) { // Aumentado de 10 para 15MB
    return {
      type: 'MEDIUM',
      timeout: CONFIG.TIMEOUTS.MEDIUM_VIDEO,
      delay: CONFIG.DELAYS.MEDIUM,
      completionDelay: CONFIG.DELAYS.MEDIUM,
      requiresCompression: true,
      memorySafe: true
    };
  } else {
    return {
      type: 'SMALL',
      timeout: CONFIG.TIMEOUTS.SMALL_VIDEO,
      delay: CONFIG.DELAYS.SMALL,
      completionDelay: CONFIG.DELAYS.SMALL,
      requiresCompression: false, // Não comprimir vídeos pequenos (<15MB) para ser instantâneo
      memorySafe: true
    };
  }
}

/**
 * Valida arquivo de vídeo sem carregar tudo em memória
 */
async function validateVideoFile(file) {
  try {
    // Suporte para objetos nativos (VideoProcessorPlugin)
    if (file && file.isNative) {
      return {
        isValid: true,
        format: file.name ? file.name.split('.').pop() : 'mp4',
        size: file.size || 0
      };
    }

    // Suporte para caminho de arquivo (string)
    if (typeof file === 'string') {
        let size = 0;
        try {
            // Tentar obter stats via Filesystem
            // Se o path for file://, removemos o prefixo para algumas chamadas, mas Filesystem geralmente quer path relativo ou absoluto correto
            // Aqui assumimos que quem passou a string sabe o que está fazendo ou é um path nativo
            
            // Tentar obter metadados via plugin, que é mais robusto para paths de mídia
            const meta = await VideoProcessor.getVideoMetadata({ filePath: file });
            size = meta.size;
        } catch (e) {
            console.warn('Erro ao validar path de vídeo:', e);
            // Se falhar, tentamos assumir que é válido se tiver extensão de vídeo
            const ext = file.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) {
                return { isValid: true, format: ext, size: 0 };
            }
            throw new Error('Caminho de vídeo inválido ou inacessível');
        }
        
        return {
            isValid: true,
            format: file.split('.').pop(),
            size: size
        };
    }

    // Verificar tamanho
    if (!file.size || file.size === 0) {
      throw new Error('Arquivo de vídeo vazio');
    }

    // Verificar tipo MIME
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mov'];
    if (!validTypes.includes(file.type)) {
      throw new Error('Tipo de vídeo não suportado');
    }

    // Verificar assinatura do arquivo (primeiros bytes)
    const firstChunk = file.slice(0, Math.min(1024, file.size));
    const buffer = await firstChunk.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Verificar assinatura MP4
    const isMP4 = bytes.length >= 8 && 
      bytes[4] === 0x66 && bytes[5] === 0x74 && 
      bytes[6] === 0x79 && bytes[7] === 0x70;

    // Verificar assinatura MOV
    const isMOV = bytes.length >= 4 && 
      bytes[0] === 0x00 && bytes[1] === 0x00 && 
      bytes[2] === 0x00 && bytes[3] === 0x20;

    if (!isMP4 && !isMOV && file.type !== 'video/webm') {
      throw new Error('Formato de vídeo inválido ou corrompido');
    }

    return {
      isValid: true,
      format: isMP4 ? 'mp4' : isMOV ? 'mov' : 'webm',
      size: file.size
    };
  } catch (error) {
    throw new Error(`Validação de vídeo falhou: ${error.message}`);
  }
}

/**
 * Processa vídeo em chunks para evitar estouro de memória
 */
async function processVideoInChunks(file, onProgress) {
  const chunks = [];
  const totalChunks = Math.ceil(file.size / CONFIG.CHUNK_SIZE);
  let processedChunks = 0;

  try {
    for (let i = 0; i < file.size; i += CONFIG.CHUNK_SIZE) {
      const chunk = file.slice(i, Math.min(i + CONFIG.CHUNK_SIZE, file.size));
      const chunkBuffer = await chunk.arrayBuffer();
      
      chunks.push(chunkBuffer);
      processedChunks++;
      
      if (onProgress) {
        onProgress((processedChunks / totalChunks) * 50); // 0-50% do progresso
      }
      
      // Yield para permitir que a UI atualize
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verificar uso de memória
      const currentMemory = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      if (currentMemory > CONFIG.MAX_MEMORY_USAGE) {
        throw new Error('Uso de memória excedeu o limite seguro');
      }
    }
    
    return chunks;
  } catch (error) {
    // Limpar chunks em caso de erro
    chunks.length = 0;
    throw error;
  }
}

/**
 * Comprime vídeo usando plugin nativo (apenas mobile)
 */
async function compressVideoNative(file, options = {}) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Compressão nativa disponível apenas em dispositivos móveis');
  }

  const {
    maxSizeMB = 50,
    maxFileSize, // Adicionado suporte a maxFileSize
    quality = 'low',
    maxWidth = 1920,
    maxHeight = 1080
  } = options;

  let progressListener = null;

  try {
    let inputPath = null;
    let originalSize = 0;
    let tempPath = null;
    
    const isNativeObject = typeof file === 'object' && file.isNative && file.nativePath;

    if (typeof file === 'string' || isNativeObject) {
        inputPath = isNativeObject ? file.nativePath : file;
        originalSize = (isNativeObject && file.size) ? file.size : 0;
        
        if (originalSize === 0) {
            try {
                const meta = await VideoProcessor.getVideoMetadata({ filePath: inputPath });
                originalSize = meta.size;
            } catch (e) {
                originalSize = 0;
            }
        }
    } else {
        const fileName = `temp_video_${Date.now()}.mp4`;
        tempPath = `temp/${fileName}`;

        let wroteFirst = false;
        let fileUri = null;
        for (let i = 0; i < file.size; i += CONFIG.CHUNK_SIZE) {
          const chunk = file.slice(i, Math.min(i + CONFIG.CHUNK_SIZE, file.size));
          const buf = new Uint8Array(await chunk.arrayBuffer());
          let str = '';
          const step = 4096;
          for (let j = 0; j < buf.length; j += step) {
            str += String.fromCharCode.apply(null, Array.from(buf.slice(j, Math.min(j + step, buf.length))));
          }
          const base64Chunk = btoa(str);
          if (!wroteFirst) {
            const writeRes = await Filesystem.writeFile({ path: tempPath, data: base64Chunk, directory: Directory.Cache, encoding: 'base64' });
            fileUri = writeRes?.uri || null;
            wroteFirst = true;
          } else {
            await Filesystem.appendFile({ path: tempPath, data: base64Chunk, directory: Directory.Cache, encoding: 'base64' });
          }
          if (options.onProgress) options.onProgress(Math.min(60, Math.round((i / file.size) * 60)), 'Preparando arquivo...');
          await new Promise(r => setTimeout(r, 15));
        }
        
        inputPath = fileUri || tempPath;
        originalSize = file.size;
    }


    // Ajuste dinâmico de compressão baseado na duração
    let targetMaxSizeMB = options.maxSizeMB || 50;
    let targetMaxFileSize = options.maxFileSize;

    // Configurar listener de progresso
    try {
      progressListener = await VideoProcessor.addListener('videoProgress', (data) => {
        if (options.onProgress && data.progress !== undefined) {
           // Se o vídeo veio de arquivo nativo, o progresso vai de 0 a 100
           // Se veio de leitura JS (que já foi até 60%), precisamos ajustar se quisermos manter a continuidade
           // Mas como a leitura JS é rápida e a compressão é lenta, podemos simplesmente usar o progresso da compressão
           // como a parte "pesada".
           // Vamos considerar que a compressão é a fase principal.
           
           const percent = data.progress;
           // Otimização visual: evitar retrocesso se já estivermos em 60% (da leitura)
           // Se a leitura levou 60%, a compressão é os 40% restantes? Não, a compressão demora mais.
           // Vamos apenas repassar o progresso real da compressão, talvez com uma mensagem diferente.
           
           options.onProgress(percent, `Comprimindo vídeo: ${percent}%`);
        }
      });
    } catch (e) {
      console.warn('Falha ao registrar listener de progresso:', e);
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const meta = await VideoProcessor.getVideoMetadata({ filePath: inputPath });
        const duration = meta?.duration || 0;
        
        // Se o vídeo for curto (< 60s), garantir que o tamanho seja otimizado
        // mesmo que o arquivo original seja muito grande
        if (duration > 0 && duration < 60) {
          // Para vídeos curtos, 10MB é um bom limite superior
          if (targetMaxSizeMB > 10) {
            targetMaxSizeMB = 10;
          }
          
          // Para vídeos muito curtos (< 15s), ser mais agressivo (5MB)
          // Isso resolve o problema de vídeos curtos de 20MB+
          if (duration < 15 && targetMaxSizeMB > 5) {
            targetMaxSizeMB = 5;
          }

          targetMaxFileSize = targetMaxSizeMB * 1024 * 1024;
          console.log(`[VideoProcessor] Ajuste de compressão para vídeo curto (${duration.toFixed(1)}s): Meta ${targetMaxSizeMB}MB`);
        }
      }
    } catch (metaErr) {
      console.warn('[VideoProcessor] Não foi possível ler metadados para ajuste fino:', metaErr);
    }

    // Comprimir usando plugin nativo
    const compressionResult = await VideoProcessor.compressVideo({
      filePath: inputPath,
      maxSizeMB: Math.max(1, targetMaxSizeMB),
      maxFileSize: targetMaxFileSize || (targetMaxSizeMB * 1024 * 1024),
      quality,
      maxWidth,
      maxHeight
    });

    const outputPath = compressionResult?.outputPath || inputPath;
    const meta = await VideoProcessor.getVideoMetadata({ filePath: outputPath });
    const compressedSize = meta?.size || 0;
    if (compressedSize <= 0) {
      throw new Error('Arquivo comprimido inválido');
    }

    if (outputPath !== inputPath) {
      try {
        await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache });
      } catch {}
    }

    const originalSizeVal = (typeof file === 'object' && file.size) ? file.size : originalSize;

    return {
      nativePath: outputPath,
      originalSize: originalSizeVal,
      compressedSize,
      compressionRatio: originalSizeVal > 0 ? ((originalSizeVal - compressedSize) / originalSizeVal) * 100 : 0
    };

  } catch (error) {
    throw new Error(`Falha na compressão nativa: ${error.message}`);
  } finally {
    if (progressListener) {
      progressListener.remove();
    }
  }
}

/**
 * Comprime vídeo na web usando Canvas + MediaRecorder
 * @param {File} file 
 * @param {Object} options 
 */
async function compressVideoWeb(file, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        quality = 'medium',
        maxWidth = 960, // Otimizado para mobile (qHD) - mais rápido que 720p
        maxHeight = 540,
        onProgress
      } = options;

      // Bitrates alvo (bits por segundo)
      const bitrates = {
        low: 1500000,    // 1.5 Mbps (aumentado de 1.0)
        medium: 3000000, // 3.0 Mbps (aumentado de 2.5)
        high: 6000000    // 6.0 Mbps (aumentado de 5.0)
      };
      const targetBitrate = bitrates[quality] || bitrates.medium;

      const video = document.createElement('video');
      // REMOVIDO: video.muted = true; -> Para permitir captura de áudio via createMediaElementSource
      // O áudio será redirecionado para o stream e não sairá nos alto-falantes
      video.playsInline = true;
      video.src = URL.createObjectURL(file);
      
      await new Promise((r, j) => {
        video.onloadedmetadata = () => r();
        video.onerror = (e) => j(e);
      });

      // Calcular dimensões mantendo aspect ratio
      let w = video.videoWidth;
      let h = video.videoHeight;
      const aspect = w / h;
      
      if (w > maxWidth || h > maxHeight) {
        if (aspect > 1) { // Landscape
          w = Math.min(w, maxWidth);
          h = Math.round(w / aspect);
        } else { // Portrait
          h = Math.min(h, maxHeight);
          w = Math.round(h * aspect);
        }
      }
      
      // Garantir dimensões pares
      w = Math.floor(w / 2) * 2;
      h = Math.floor(h / 2) * 2;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      const stream = canvas.captureStream(24); // 24 FPS (Cinema) - mais leve que 30 FPS
      
      // Configurar áudio
      let audioContext = null;
      let audioSource = null;
      let thumbnail = null;

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          audioContext = new AudioContext();
          audioSource = audioContext.createMediaElementSource(video);
          const dest = audioContext.createMediaStreamDestination();
          audioSource.connect(dest);
          const audioTrack = dest.stream.getAudioTracks()[0];
          if (audioTrack) stream.addTrack(audioTrack);
        }
      } catch (e) {
        console.warn('Áudio não suportado na compressão web:', e);
      }

      // Gerar Thumbnail inicial
      try {
        thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      } catch (e) {
        console.warn('Erro ao gerar thumbnail web:', e);
      }

      // Detectar melhor formato suportado
      const mimeTypes = [
        'video/mp4', // Tentar MP4 nativo primeiro (Safari, alguns Chromes)
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: targetBitrate
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        // FORÇAR MP4 para passar no upload do Supabase (erro 415 com webm), mesmo que seja WebM internamente
        // A maioria dos players modernos detecta o conteúdo real ou toca WebM renomeado
        const forcedMimeType = 'video/mp4';
        const blob = new Blob(chunks, { type: forcedMimeType });
        
        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.mp4", {
          type: forcedMimeType,
          lastModified: Date.now()
        });
        
        URL.revokeObjectURL(video.src);
        if (audioContext) audioContext.close();
        
        resolve({
          file: compressedFile,
          compressedSize: blob.size,
          nativePath: null, // Web não tem path nativo
          thumbnail
        });
      };

      recorder.onerror = (e) => reject(e);

      recorder.start(1000);
      
      // Tentar reproduzir com promessa para evitar erros de play() não interagido
      try {
        await video.play();
      } catch (playErr) {
        console.warn("Autoplay bloqueado ou falha ao iniciar vídeo:", playErr);
        // Se falhar, tentar mutar e dar play novamente (perde áudio, mas salva vídeo)
        video.muted = true;
        await video.play();
      }

      function draw() {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, w, h);
        
        if (onProgress) {
          const percent = Math.min(99, (video.currentTime / video.duration) * 100);
          onProgress(percent, 'Comprimindo (Web)...');
        }
        
        requestAnimationFrame(draw);
      }
      
      draw();

      video.onended = () => {
        recorder.stop();
      };

    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Processa vídeo de forma segura e otimizada
 */
export async function processVideoFile(file, options = {}) {
  // Envelopar a chamada real na fila para garantir sequenciamento
  return processorState.addToQueue(async () => {
    return await _processVideoFileInternal(file, options);
  });
}

/**
 * Implementação interna do processamento
 */
async function _processVideoFileInternal(file, options = {}) {
  const {
    onProgress,
    onComplete,
    onError,
    validateOnly = false,
    source = 'unknown'
  } = options;

  const jobId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Função de Heartbeat para manter o processo vivo enquanto houver progresso
  let timeoutId = null;
  const resetTimeout = () => {
    if (timeoutId) processorState.clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // Se estourar este timeout, significa que não houve progresso por 10 minutos
      const err = new Error('Timeout: Processamento travou ou demorou excessivamente sem progresso.');
      if (onError) onError('timeout', err.message);
      // Não lançamos erro aqui pois estamos dentro de um callback async, 
      // mas o estado global eventualmente limpará ou o usuário cancelará.
      // O ideal seria abortar, mas JS não tem cancelamento fácil de Promises profundas.
    }, CONFIG.TIMEOUTS.HD_LONG_VIDEO);
    processorState.addTimeout(timeoutId);
  };

  try {
    // Iniciar timeout inicial
    resetTimeout();

    // Validar arquivo
    const validation = await validateVideoFile(file);
    resetTimeout(); // Reset após validação
    
    if (validateOnly) {
      processorState.clearTimeout(timeoutId);
      return { success: true, validation };
    }

    // Detectar características do vídeo
    const fileSize = typeof file === 'string' ? validation.size : file.size;
    const characteristics = detectVideoCharacteristics(fileSize);
    
    if (onProgress) {
      onProgress(10, 'Validação concluída');
    }

  let processedFile = file;
  let compressionResult = null;

  // Wrapper de progresso que reseta o timeout
  const reportProgress = (percent, msg) => {
      resetTimeout(); // O MÁGICO: Cada % de progresso ganha mais tempo de vida
      if (onProgress) onProgress(percent, msg);
  };

  // Caso câmera: não manter File na memória; offload para nativo e evitar compressão imediata
  let nativePathFromCamera = null;
  
  // Se já for um path (string), usamos direto
  if (typeof file === 'string') {
      nativePathFromCamera = file;
  }
  // Se for objeto nativo (VideoProcessorPlugin)
  else if (file && file.isNative && file.nativePath) {
      nativePathFromCamera = file.nativePath;
  }
  // Se for File object da câmera, offload para disco
  else if (Capacitor.isNativePlatform() && source === 'camera') {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > CONFIG.MAX_CAMERA_VIDEO_MB) {
      const msg = `Vídeo da câmera muito grande (${sizeMB.toFixed(1)}MB). Grave em HD 30fps.`;
      if (onError) onError('validação', msg);
      throw new Error(msg);
    }
    reportProgress(15, 'Movendo vídeo para armazenamento nativo...');
    try {
      nativePathFromCamera = await offloadCameraFileToNative(file, (p, m) => reportProgress(p, m));
      processedFile = nativePathFromCamera; // Atualizar processedFile para ser o path
      reportProgress(70, 'Arquivo salvo no armazenamento nativo');
    } catch (e) {
      if (onError) onError('offload', e.message);
      throw e;
    }
  }

  // Comprimir se necessário (apenas mobile) ou se for Web (para garantir MP4 via Canvas)
  // Se for câmera, SEMPRE comprimir para garantir formato e metadados corretos
  if (characteristics.requiresCompression || source === 'camera' || !Capacitor.isNativePlatform()) {
    if (Capacitor.isNativePlatform()) {

      const sizeMB = fileSize / (1024 * 1024);
        
        // Configurações agressivas de compressão para mobile (tipo WhatsApp)
        const targetMaxSizeMB =
          sizeMB > 100 ? 15 : // Arquivos gigantes -> 15MB
          sizeMB > 50 ? 10 :   // Arquivos grandes -> 10MB
          sizeMB > 10 ? 5 : 3; // Arquivos médios (>10MB) -> 5MB, Pequenos -> 3MB

        const isVeryLarge = sizeMB > 100;
        
        try {
          compressionResult = await compressVideoNative(file, {
            maxSizeMB: targetMaxSizeMB,
            maxFileSize: targetMaxSizeMB * 1024 * 1024,
            quality: 'safe_hd', // USAR PERFIL SEGURO (alterado de medium para safe_hd/custom logic no nativo)
            maxWidth: 1280, // Forçar HD 720p no pedido também
            maxHeight: 720,
            onProgress: (p, m) => reportProgress(p, m) // Passar wrapper com heartbeat
          });
          
          // Ler arquivo nativo para Blob se necessário
          if (compressionResult.nativePath && !compressionResult.file) {
             try {
               const fileData = await Filesystem.readFile({
                  path: compressionResult.nativePath
               });
               // Converter base64 para Blob
               // Suportar tanto formato { data: ... } quanto string direta
               const base64Data = typeof fileData.data === 'string' ? fileData.data : fileData;
               const response = await fetch(`data:video/mp4;base64,${base64Data}`);
               const blob = await response.blob();
               
               processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.mp4", { 
                  type: 'video/mp4',
                  lastModified: Date.now()
               });
               compressionResult.file = processedFile;
             } catch (readErr) {
               console.warn("Erro ao ler arquivo comprimido nativo:", readErr);
               throw new Error("Falha ao ler arquivo comprimido: " + readErr.message);
             }
          } else {
             processedFile = compressionResult.file || null;
          }
          
          // Validar se o resultado da compressão está dentro dos limites aceitáveis
          const compressedSizeMB = (compressionResult.compressedSize || file.size) / (1024 * 1024);
          const resultToleranceMB = Math.max(10, targetMaxSizeMB * 2);
          
          if (compressedSizeMB > resultToleranceMB) {
             throw new Error(`Resultado da compressão muito grande (${compressedSizeMB.toFixed(1)}MB)`);
          }

          if (onProgress) {
            onProgress(99, 'Finalizando...');
          }
        } catch (compressionError) {
          // REMOVIDO FALLBACK WEB AUTOMÁTICO
          // Se a compressão nativa falhar, a compressão via Canvas (Web) certamente falhará por memória (OOM).
          // Além disso, causava confusão visual (ia a 100% e voltava a 40%).
          // Melhor falhar rápido e informar o usuário para tentar outro vídeo.
          console.error('Falha irrecuperável na compressão nativa:', compressionError);
          throw new Error(`Não foi possível otimizar este vídeo. Tente um vídeo menor ou com resolução mais baixa. (${compressionError.message})`);
        }
    } else {
      // Compressão Web via Canvas/MediaRecorder
      try {
        // Se for muito grande, usar bitrate mais baixo
        const quality = file.size > 100 * 1024 * 1024 ? 'low' : 'medium';
        
        compressionResult = await compressVideoWeb(file, {
          quality,
          maxWidth: 960,
          maxHeight: 540,
          onProgress: (p) => onProgress && onProgress(p, 'Processando vídeo...')
        });

        processedFile = compressionResult.file;
        
        if (onProgress) onProgress(100, 'Compressão Web concluída');

      } catch (webErr) {
        console.warn('Falha na compressão web:', webErr);
        // Na web, se falhar, podemos seguir com o original ou rejeitar
        // Se for muito grande (>50MB), melhor rejeitar
        if (file.size > 50 * 1024 * 1024) {
           throw new Error("Falha na compressão web e arquivo muito grande.");
        }
        // Caso contrário, segue com original
        processedFile = file;
      }
    }
  }

  // Garantir que temos um arquivo para retornar, mesmo que não tenha sido comprimido
  if (!processedFile) {
    processedFile = file;
  }

  // Gerar thumbnail nativo se disponível
  let preview = compressionResult?.thumbnail || null;
  if (!preview && Capacitor.isNativePlatform()) {
    const finalNativePath = compressionResult?.nativePath || nativePathFromCamera;
    if (finalNativePath) {
      try {
        const { imagePath } = await VideoProcessor.getVideoThumbnail({ 
          filePath: finalNativePath, 
          maxWidth: 320, 
          maxHeight: 240 
        });
        preview = Capacitor.convertFileSrc(imagePath);
      } catch (thumbErr) {
        console.warn('Falha ao gerar thumbnail nativo:', thumbErr);
      }
    }
  }

  // Criar objeto de vídeo seguro
  const videoData = {
    id: jobId,
    name: file.name,
    size: (processedFile?.size) ?? (compressionResult?.compressedSize ?? file.size),
    originalSize: file.size,
    type: characteristics.type,
    addedAt: Date.now(),
    compressed: compressionResult !== null,
    compressionRatio: compressionResult?.compressionRatio || 0,
    nativePath: compressionResult?.nativePath || nativePathFromCamera || null,
    preview,
    characteristics
  };

    // Armazenar arquivo em local seguro
  const secureStorage = new Map();
  secureStorage.set(jobId, {
    file: processedFile,
    originalFile: source === 'camera' ? null : file,
    timestamp: Date.now()
  });

    processorState.registerCleanup(async () => {
      secureStorage.clear();
    });

    processorState.clearTimeout(timeoutId);
    //processorState.isProcessing = false; // Removido: Gerenciado pela Fila

    if (onComplete) {
      onComplete(videoData, processedFile);
    }

    return {
      success: true,
      videoData,
      file: processedFile,
      originalFile: file,
      compressionResult
    };

  } catch (error) {
    processorState.clearAllTimeouts();
    //processorState.isProcessing = false; // Removido: Gerenciado pela Fila
    
    if (onError) {
      onError('processamento', error.message);
    }
    
    throw error;
  }
}

/**
 * Interface simplificada para uso no componente
 */
export async function addVideoFile(file, componentCallbacks = {}, meta = {}) {
  const {
    onStart = () => {},
    onProgress = () => {},
    onSuccess = () => {},
    onError = () => {}
  } = componentCallbacks;

  try {
    onStart();
    
    const result = await processVideoFile(file, {
      onProgress: (progress, message) => {
        onProgress(progress, message);
      },
      onComplete: (videoData, processedFile) => {
        onSuccess(videoData, processedFile);
      },
      onError: (stage, error) => {
        onError(stage, error);
      },
      source: meta?.source || 'unknown'
    });

    return result;

  } catch (error) {
    onError('geral', error.message);
    throw error;
  }
}

/**
 * Limpa recursos e estado do processador
 */
export async function cleanupVideoProcessor() {
  await processorState.cleanup();
}

/**
 * Verifica se o processador está ocupado
 */
export function isVideoProcessorBusy() {
  return processorState.isProcessing;
}

export default {
  processVideoFile,
  addVideoFile,
  cleanupVideoProcessor,
  isVideoProcessorBusy,
  validateVideoFile,
  CONFIG
};
/**
 * Offload seguro de arquivo capturado pela câmera para armazenamento nativo
 */
async function offloadCameraFileToNative(file, onProgress) {
  const fileName = `camera_${Date.now()}.mp4`;
  const tempPath = `temp/${fileName}`;
  let wroteFirst = false;
  let fileUri = null;

  for (let i = 0; i < file.size; i += CONFIG.CHUNK_SIZE) {
    const chunk = file.slice(i, Math.min(i + CONFIG.CHUNK_SIZE, file.size));
    const buf = new Uint8Array(await chunk.arrayBuffer());
    let str = '';
    const step = 4096;
    for (let j = 0; j < buf.length; j += step) {
      str += String.fromCharCode.apply(null, Array.from(buf.slice(j, Math.min(j + step, buf.length))));
    }
    const base64Chunk = btoa(str);
    if (!wroteFirst) {
      const writeRes = await Filesystem.writeFile({ path: tempPath, data: base64Chunk, directory: Directory.Cache, encoding: 'base64' });
      fileUri = writeRes?.uri || null;
      wroteFirst = true;
    } else {
      await Filesystem.appendFile({ path: tempPath, data: base64Chunk, directory: Directory.Cache, encoding: 'base64' });
    }
    if (onProgress) onProgress(Math.min(60, Math.round((i / file.size) * 60)), 'Transferindo para armazenamento nativo...');
    await new Promise(r => setTimeout(r, 20));
  }

  return fileUri || tempPath;
}
