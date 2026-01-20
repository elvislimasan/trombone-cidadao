import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Video, Film, Trash2, AlertCircle, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Capacitor } from '@capacitor/core';
import { addVideoFile, isVideoProcessorBusy, cleanupVideoProcessor, generateQuickWebThumbnail, setGlobalUserViewingMedia } from '@/utils/videoProcessor';
import { VideoProcessor as VideoProcessorPlugin } from '@/plugins/VideoProcessor';
import MediaViewer from '@/components/MediaViewer';

/**
 * Componente de Processamento de Vídeos Otimizado
 * Previne crashes ao adicionar vídeos grandes com processamento assíncrono seguro
 */
const VideoProcessor = ({ 
  videos = [], 
  onVideosChange, 
  disabled = false,
  maxVideos = 5,
  maxSizeMB = 50,
  onProcessingChange,
  onRecordVideo, // Prop para override da gravação
  showList = true // Controla se a lista de vídeos é renderizada internamente
}) => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastSourceRef = useRef('');
  const [viewingVideoIndex, setViewingVideoIndex] = useState(null);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupVideoProcessor();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Verificar se pode adicionar mais vídeos
  const canAddMoreVideos = videos.length < maxVideos;

  // Função segura para adicionar vídeo com UI Otimista
  const handleAddVideo = useCallback(async (file) => {
    if (!file || !mountedRef.current) return;

    // Verificar limites
    if (videos.length >= maxVideos) {
      return;
    }

    // Verificar se processador está ocupado (opcional, já que vamos permitir background)
    // if (isVideoProcessorBusy()) { return; }

    // UI Otimista: Adicionar placeholder imediatamente
    const tempId = `temp_${Date.now()}`;
    const tempVideo = {
      id: tempId,
      name: file.name || `video_${Date.now()}.mp4`,
      size: file.size || 0,
      originalSize: file.size || 0,
      preview: null,
      isProcessing: true,
      progress: 1,
      status: 'waiting',
      // Adicionar propriedades para permitir envio em background
      nativePath: file.nativePath || null,
      file: file,
      isNative: file.isNative || false
    };

    // Atualizar lista imediatamente com o vídeo pendente
    const currentVideos = [...videos, tempVideo];
    onVideosChange(currentVideos);

    // Notificar pai que há processamento (para bloquear submit)
    if (onProcessingChange) onProcessingChange(true);

    // Tentar gerar thumbnail do original imediatamente para feedback visual rápido
    if (file.isNative && file.nativePath && Capacitor.isNativePlatform()) {
      // Executar sem await para não bloquear
      VideoProcessorPlugin.getVideoThumbnail({ 
        filePath: file.nativePath, 
        maxWidth: 100, 
        maxHeight: 100 
      }).then(({ imagePath }) => {
        if (mountedRef.current && imagePath) {
          const previewUrl = Capacitor.convertFileSrc(imagePath);
          onVideosChange(prevVideos => prevVideos.map(v => 
            v.id === tempId ? { ...v, preview: previewUrl } : v
          ));
        }
      }).catch(err => {
        console.warn('Falha ao gerar preview antecipado:', err);
      });
    } else if (!file.isNative) {
      // Gera thumbnail para Web imediatamente
      generateQuickWebThumbnail(file).then(thumb => {
        if (mountedRef.current && thumb) {
            onVideosChange(prevVideos => prevVideos.map(v => 
                v.id === tempId ? { ...v, preview: thumb } : v
            ));
        }
      });
    }

    try {
      abortControllerRef.current = new AbortController();

      // Iniciar processamento SEM await (fire-and-forget para UI principal)
      // Mas precisamos capturar o resultado para atualizar a lista
      addVideoFile(file, {
        onStart: () => {
          if (mountedRef.current) {
             onVideosChange(prevVideos => prevVideos.map(v => 
               v.id === tempId ? { ...v, status: 'processing', progress: 1 } : v
             ));
          }
        },
        onProgress: (progress, message) => {
          if (mountedRef.current) {
             onVideosChange(prevVideos => prevVideos.map(v => {
               if (v.id !== tempId) return v;
               const nextProgress = Math.max(v.progress || 0, progress || 0);
               return { ...v, progress: nextProgress };
             }));
          }
        },
        onSuccess: async (videoData, processedFile) => {
          if (mountedRef.current) {
            // Primeiro update: Marcar como finalizado IMEDIATAMENTE para liberar UI
            const baseVideo = {
              id: videoData.id,
              name: videoData.name,
              size: videoData.size,
              originalSize: videoData.originalSize,
              compressed: videoData.compressed,
              compressionRatio: videoData.compressionRatio,
              addedAt: videoData.addedAt,
              file: processedFile || null,
              nativePath: videoData.nativePath || null,
              preview: videoData.preview || null,
              isProcessing: false // Finalizado
            };

            // Atualizar lista imediatamente para liberar o botão de enviar
            onVideosChange(prevVideos => prevVideos.map(v => 
               v.id === tempId ? baseVideo : v
            ));
            
            window.lastVideoAddedTime = Date.now();

            // Gerar thumbnail em segundo plano se necessário
            if (!baseVideo.preview && baseVideo.nativePath && Capacitor.isNativePlatform()) {
               try {
                  const { imagePath } = await VideoProcessorPlugin.getVideoThumbnail({ 
                    filePath: baseVideo.nativePath, 
                    maxWidth: 320, 
                    maxHeight: 240 
                  });
                  
                  if (mountedRef.current && imagePath) {
                    const previewUrl = Capacitor.convertFileSrc(imagePath);
                    // Segundo update: Adicionar thumbnail
                    onVideosChange(prevVideos => prevVideos.map(v => 
                       v.id === baseVideo.id ? { ...v, preview: previewUrl } : v
                    ));
                  }
               } catch (thumbErr) {
                  console.warn('Falha ao gerar thumbnail do vídeo (background):', thumbErr);
               }
            }
          }
        },
        onError: (stage, error) => {
           console.error('Erro no processamento background:', error);
           // Se o erro for uma string, usa ela. Se for objeto, tenta message. Se não, usa genérico.
           const errorMessage = typeof error === 'string' ? error : (error.message || "O vídeo foi removido devido a um erro.");
           
           toast({
             variant: "destructive",
             title: "Falha ao processar vídeo",
             description: errorMessage
           });
           // Remover vídeo com erro
           if (mountedRef.current) {
             onVideosChange(prevVideos => prevVideos.filter(v => v.id !== tempId));
           }
        }
      }, { 
        source: lastSourceRef.current || 'unknown',
        skipCompression: Capacitor.isNativePlatform() // Novo fluxo: Pula compressão no UI, deixa pro UploadService
      }).finally(() => {
         // Verificar se todos terminaram
         // Essa lógica pode ser complexa pois não temos acesso fácil ao estado atualizado aqui dentro do callback
         // Vamos confiar que o useEffect ou componente pai vai gerenciar o estado global de 'processing'
         // Mas precisamos chamar onProcessingChange(false) em algum momento.
         // Solução simplificada: Se este era o único, libera.
         // Mas como saber? 
         // Vamos delegar: o componente VideoProcessor pode ter um useEffect monitorando videos.
      });

    } catch (e) {
      console.error("Erro ao iniciar processamento:", e);
      // Remover temp
      onVideosChange(prevVideos => prevVideos.filter(v => v.id !== tempId));
    }
  }, [videos, onVideosChange, maxVideos, toast, onProcessingChange]);

  // Monitorar estado global de processamento baseado na lista de vídeos
  useEffect(() => {
    const hasProcessing = videos.some(v => v.isProcessing);
    if (isProcessing !== hasProcessing) {
        setIsProcessing(hasProcessing);
        if (onProcessingChange) onProcessingChange(hasProcessing);
    }
  }, [videos, onProcessingChange]);

  // Handler para seleção de arquivo
  const handleFileSelect = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    
    // Garantir que a fonte seja marcada como galeria se não estiver definida
    if (!lastSourceRef.current) {
      lastSourceRef.current = 'gallery';
    }

    if (files.length === 0) return;

    // Processar vídeos em paralelo (o gerenciamento de fila está no videoProcessor.js)
    const MAX_GALLERY_VIDEO_MB = 1024;
    
    // Disparar processamento para todos os arquivos válidos
    const validFiles = files.filter(f => (f.size || 0) / (1024 * 1024) <= MAX_GALLERY_VIDEO_MB);
    
    validFiles.forEach(async (file, index) => {
      if (!mountedRef.current) return;
      try {
        await handleAddVideo(file);
      } catch (error) {
        console.error('Erro ao processar vídeo:', error);
      }
    });
    
    // Feedback se algum foi ignorado
    if (validFiles.length < files.length) {
      toast({
        title: "Alguns vídeos foram ignorados",
        description: `Vídeos maiores que ${MAX_GALLERY_VIDEO_MB}MB não são suportados.`,
        variant: "destructive"
      });
    }

  }, [handleAddVideo, toast]);

  // Handler para gravação de vídeo
  const handleRecordVideo = useCallback(async () => {
    if (disabled) return;
    lastSourceRef.current = 'camera';

    // Se houver um handler externo (CameraCapture do ReportModal), usar ele
    if (onRecordVideo) {
      onRecordVideo();
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      if (fileInputRef.current) fileInputRef.current.click();
      return;
    }

    if (!Capacitor.isPluginAvailable || !Capacitor.isPluginAvailable('VideoProcessor')) {
      if (fileInputRef.current) fileInputRef.current.click();
      return;
    }

    try {
      // Não bloqueamos mais a UI aqui, deixamos o handleAddVideo gerenciar o estado 'isProcessing'
      setProcessingMessage('');

      const { filePath } = await VideoProcessorPlugin.captureVideo({
        maxDurationSec: 0, // 0 = Sem limite
        lowQuality: false // Melhor qualidade inicial, comprimimos depois
      });

      if (!filePath) return;

      // Obter metadados básicos para o objeto de arquivo
      let name = `video_camera_${Date.now()}.mp4`;
      let size = 0;
      let duration = 0;
      
      try {
        const meta = await VideoProcessorPlugin.getVideoMetadata({ filePath });
        size = meta?.size || 0;
        duration = meta?.duration || 0;
      } catch (e) {
        console.warn('Falha ao ler metadados do vídeo gravado:', e);
      }

      // Adicionar vídeo usando a função centralizada que já tem UI otimista
      await handleAddVideo({
        name,
        size,
        type: 'video/mp4',
        nativePath: filePath,
        duration,
        isNative: true
      });

    } catch (e) {
      if (e.message !== 'Seleção cancelada' && e.message !== 'cancelled') {
        console.error("Erro ao gravar vídeo:", e);
       
      }
    }
  }, [disabled, isProcessing, onRecordVideo, handleAddVideo, toast]);

  // Handler para galeria
  const handleGallerySelect = useCallback(async () => {
    if (disabled) return;

    lastSourceRef.current = 'gallery';

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await VideoProcessorPlugin.pickVideo();
        if (result && result.filePath) {
           // Adicionar vídeo nativo diretamente
           await handleAddVideo({
             // Mock de objeto File para compatibilidade
             name: result.name || `video_${Date.now()}.mp4`,
             size: result.size,
             type: 'video/mp4',
             nativePath: result.filePath, // Caminho real no disco
             duration: result.duration,
             // Importante: Marcar como nativo para evitar leitura de blob
             isNative: true 
           });
        }
      } catch (e) {
       
      }
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  }, [disabled, isProcessing, handleAddVideo, toast]);

  // Remover vídeo
  const handleRemoveVideo = useCallback((index) => {
    if (disabled) return;

    const videoToRemove = videos[index];
    if (!videoToRemove) return;

    // Criar novo array sem o vídeo removido
    const newVideos = videos.filter((_, i) => i !== index);
    onVideosChange(newVideos);

    toast({
      title: 'Vídeo removido',
      description: `${videoToRemove.name} foi removido`,
      duration: 2000
    });
  }, [videos, onVideosChange, toast]);

  // Renderizar vídeo individual (componente memoizado)
  const renderVideo = useCallback((video, index) => {
    const sizeMB = (video.size / (1024 * 1024)).toFixed(1);
    const originalSizeMB = (video.originalSize / (1024 * 1024)).toFixed(1);
    const isProcessingItem = video.isProcessing;
    
    return (
      <div 
        key={video.id || index} 
        className="flex items-center justify-between bg-background p-3 rounded-md border group hover:border-accent transition-colors"
      >
        <div 
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                    setViewingVideoIndex(index);
                    setGlobalUserViewingMedia(true);
                }}
              >
                {video.preview ? (
            <div className="relative w-12 h-12">
              <img src={video.preview} alt="Thumb do vídeo" className="w-12 h-12 object-cover rounded border border-border" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
            </div>
          ) : (
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center rounded border border-gray-200 dark:border-gray-700 relative">
                   <Video className="w-5 h-5 text-gray-400" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-3 h-3 text-gray-500 fill-gray-500 opacity-50" />
                   </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{video.name}</p>
          </div>
        </div>
        <button 
          type="button" 
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveVideo(index);
          }}
          className="text-muted-foreground hover:text-destructive p-1 ml-2 transition-opacity"
          aria-label="Remover vídeo"
          disabled={disabled}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }, [handleRemoveVideo, disabled]);

  // Cancelar processamento
  const handleCancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProcessingProgress(0);
    setProcessingMessage('');
    if (onProcessingChange) onProcessingChange(false);
    
    // Limpar inputs
    if (fileInputRef.current) fileInputRef.current.value = null;
    if (cameraInputRef.current) cameraInputRef.current.value = null;
    
    toast({
      title: 'Processamento cancelado',
      description: 'O envio do vídeo foi cancelado.',
    });
  }, [onProcessingChange, toast]);

  // Barra de progresso do processamento (REMOVIDA - Agora usa overlay)
  const renderProgressBar = () => null;

  // Overlay de Loading Bloqueante
  const renderLoadingOverlay = () => {
    if (!isProcessing) return null;

    return (
      <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg shadow-lg p-6 w-full max-w-sm flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <Video className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>
          
          <div className="space-y-2 w-full">
            <h3 className="font-semibold text-lg">Fazendo o upload de vídeo</h3>
            <p className="text-sm text-muted-foreground">Por favor, aguarde...</p>
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCancelProcessing}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-2"
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div  style={!Capacitor.isNativePlatform ? {margin: "0"} : {}}>
      {/* Overlay de Loading */}
      {/* {renderLoadingOverlay()} */}
      
      {/* Media Viewer */}
      {viewingVideoIndex !== null && (
        <MediaViewer
          media={videos.map(v => ({
            type: 'video',
            url: v.nativePath ? Capacitor.convertFileSrc(v.nativePath) : (v.file ? URL.createObjectURL(v.file) : v.url || ''),
            name: v.name,
            preview: v.preview
          }))}
          startIndex={viewingVideoIndex}
          onClose={() => {
            setViewingVideoIndex(null);
            setGlobalUserViewingMedia(false);
          }}
          onRemove={handleRemoveVideo}
        />
      )}

      {/* Inputs ocultos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/mov"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || !canAddMoreVideos}
      />
      
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || !canAddMoreVideos}
      />

      {/* Botões de ação */}
      <div className={`grid ${Capacitor.isNativePlatform() ? 'grid-cols-2' : 'grid-cols-1'} gap-3`} >
        {Capacitor.isNativePlatform() && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRecordVideo}
            className="h-20 flex-col gap-1"
            disabled={disabled || !canAddMoreVideos}
          >
            <Video className="w-6 h-6" />
            <span className="text-xs">Gravar Vídeo</span>
          </Button>
        )}
        
        <Button
          type="button"
          variant="outline"
          onClick={handleGallerySelect}
          className="h-20 flex-col gap-1"
          disabled={disabled || !canAddMoreVideos}
        >
          <Film className="w-6 h-6" />
          <span className="text-xs">Galeria de Vídeos</span>
        </Button>
      </div>

      {/* Informações de limite */}
      {!canAddMoreVideos && !isProcessing && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <AlertCircle className="w-4 h-4 text-yellow-600" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Limite de {maxVideos} vídeos atingido
          </p>
        </div>
      )}

      {/* Barra de Progresso (REMOVIDA - Agora usa overlay) */}
      {/* {renderProgressBar()} */}

      {/* Lista de vídeos */}
      {showList && videos.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-foreground">
              Vídeos adicionados ({videos.length})
            </p>
            <p className="text-xs text-muted-foreground">
              {(() => {
                const totalMB = videos.reduce((total, v) => total + v.size, 0) / (1024 * 1024);
                return `Total: ${totalMB.toFixed(1)}MB`;
              })()}
            </p>
          </div>
          
          <div className="space-y-2">
            {videos.map((video, index) => renderVideo(video, index))}
          </div>
        </div>
      )}

      {/* Processamento silencioso */}
    </div>
  );
};

export default React.memo(VideoProcessor);
