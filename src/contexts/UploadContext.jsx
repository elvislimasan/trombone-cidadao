import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { compressVideoWeb } from '@/utils/videoProcessor';
import { uploadLargeFile } from '@/utils/webUploadService';
import { toast } from 'sonner';
import { supabase } from '@/lib/customSupabaseClient';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const UploadContext = createContext({});

export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const [activeUploads, setActiveUploads] = useState({});
  const [isMinimized, setIsMinimized] = useState(false);
  const abortControllersRef = React.useRef({});

  // Listener global para eventos de progresso nativos
  useEffect(() => {
    let progressListener;

    const setupListener = async () => {
      progressListener = await VideoProcessor.addListener('uploadProgress', (event) => {
        // event: { id: string, progress: number, status: string }
        
        setActiveUploads(prev => {
          const upload = prev[event.id];
          if (!upload) return prev; // Se não estivermos rastreando, ignora

          const newState = { ...prev };
          
          if (event.status === 'completed') {
            // Upload concluído
            
            // Verificar se ainda há outros uploads pendentes para a mesma bronca
            const currentReportId = upload.reportId;
            const hasPendingUploadsForThisReport = Object.values(newState).some(u => 
                u.reportId === currentReportId && 
                u.id !== event.id && 
                u.status !== 'completed' && 
                u.status !== 'error'
            );

            if (currentReportId && !hasPendingUploadsForThisReport) {
//                 console.log(`[UploadContext] All uploads completed for report ${currentReportId}. Making visible.`);
                supabase.from('reports')
                  .update({ moderation_status: 'approved' })
                  .eq('id', currentReportId)
                  .then(async ({ error }) => {
                      if (error) console.error("Failed to update report status:", error);
                      else {
                          toast.success("Bronca enviada com sucesso! ✅");
                          
                          // Notificação Local
                          try {
                            const notificationId = Math.floor(Date.now() % 2147483647);
                            await LocalNotifications.schedule({
                                notifications: [{
                                    title: "Upload Concluído! 🚀",
                                    body: "Sua bronca foi enviada com sucesso e já está visível no mapa.",
                                    id: notificationId,
                                    schedule: { at: new Date(Date.now() + 100) },
                                    smallIcon: "ic_stat_icon_config_sample"
                                }]
                            });
                          } catch (e) {
                              console.error("Failed to schedule notification:", e);
                          }
                      }
                  });
            } else if (currentReportId) {
//                 console.log(`[UploadContext] Upload completed for ${event.id}, but report ${currentReportId} still has pending uploads.`);
            }

            // Removemos da lista após um breve delay para o usuário ver o 100%
            // Mas marcamos como completo primeiro
            newState[event.id] = { ...upload, progress: 100, status: 'completed', lastUpdate: Date.now() };
            
            // Toast removed as per user request
            
            // Remover após 3 segundos
            setTimeout(() => {
                setActiveUploads(current => {
                    const { [event.id]: _, ...rest } = current;
                    return rest;
                });
            }, 3000);

          } else if (event.status && event.status.startsWith('error')) {
            // Erro
            newState[event.id] = { ...upload, status: 'error', error: event.status, lastUpdate: Date.now() };
            
            // ROLLBACK: Delete report if upload failed
            if (upload.reportId && !upload.deleteTriggered) {
                newState[event.id] = { ...newState[event.id], deleteTriggered: true };
                
//                 console.log(`[UploadContext] Upload failed for report ${upload.reportId}. Deleting report.`);
                supabase.from('reports').delete().eq('id', upload.reportId).then(({ error }) => {
                    if (error) console.error("[UploadContext] Failed to delete report:", error);
                    else {
                        let errorMsg = "Upload falhou. A bronca foi removida. Tente novamente.";
                        if (event.status.includes('timeout')) {
                            errorMsg = "O upload demorou muito e excedeu o tempo limite. Tente uma conexão melhor.";
                        } else if (event.status.includes('network')) {
                            errorMsg = "Erro de conexão durante o upload. Verifique sua internet.";
                        } else if (event.status.includes('compression')) {
                            errorMsg = "Falha ao otimizar o vídeo. O formato pode ser incompatível.";
                        } else if (event.status.includes('upload_failed')) {
                            errorMsg = "O servidor rejeitou o arquivo. Tente novamente mais tarde.";
                        }
                        toast.error(errorMsg);
                    }
                });
            }
          } else {
            // Progresso
            // Use status from event if available (e.g. 'compressing'), otherwise default to 'uploading'
            const newStatus = event.status || 'uploading';
            
            newState[event.id] = { 
                ...upload, 
                progress: event.progress, 
                status: newStatus,
                lastUpdate: Date.now() 
            };
          }
          
          return newState;
        });
      });
    };

    setupListener();

    return () => {
      if (progressListener) {
        progressListener.remove();
      }
    };
  }, []);

  // Monitor de uploads travados (Stuck Upload Detection)
  useEffect(() => {
    const interval = setInterval(() => {
        const now = Date.now();
        setActiveUploads(prev => {
            const newState = { ...prev };
            let hasChanges = false;

            Object.values(newState).forEach(upload => {
                // Se estiver pendente ou enviando, mas travado em 0% por mais de tempo limite
                // Ignorar status de compressão ou preparação que podem demorar
                const isStuckState = (upload.status === 'pending' || upload.status === 'uploading') && 
                                     upload.status !== 'compressing' && 
                                     upload.status !== 'optimizing' &&
                                     upload.status !== 'preparing';

                if (isStuckState && upload.progress === 0) {
                    const timeSinceLastUpdate = now - (upload.lastUpdate || upload.timestamp);
                    
                    // Aumentar timeout para 180 segundos por segurança (3 min) para inicialização lenta
                    if (timeSinceLastUpdate > 180000) { 
//                         console.warn(`[UploadContext] Upload ${upload.id} stuck at 0% for ${timeSinceLastUpdate}ms. Aborting.`);
                        
                        // Cancelar upload e remover bronca
                        cancelUpload(upload.id);
                        toast.error("Upload demorou muito para iniciar e foi cancelado. Tente novamente.");
                    }
                } else if ((upload.status === 'compressing' || upload.status === 'optimizing' || upload.status === 'preparing') && upload.progress === 0) {
                     // Para compressão de vídeos grandes, permitir timeout MUITO maior (ex: 10 minutos)
                     const timeSinceLastUpdate = now - (upload.lastUpdate || upload.timestamp);
                     if (timeSinceLastUpdate > 600000) { // 10 minutos
//                         console.warn(`[UploadContext] Compression/Preparation stuck for ${timeSinceLastUpdate}ms. Aborting.`);
                        cancelUpload(upload.id);
                        toast.error("Processamento do vídeo demorou muito e foi cancelado.");
                     }
                }
            });

            return prev; // cancelUpload já atualiza o estado, então aqui só iteramos
        });
    }, 5000); // Verificar a cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const registerUpload = useCallback((uploadId, metadata) => {
    setActiveUploads(prev => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        progress: 0,
        status: 'pending',
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        ...metadata // name, type, etc.
      }
    }));
  }, []);

  const updateUploadProgress = useCallback((uploadId, progress, status = 'uploading') => {
    setActiveUploads(prev => {
        const upload = prev[uploadId];
        if (!upload) return prev;

        const newState = { ...prev };
        newState[uploadId] = { ...upload, progress, status, lastUpdate: Date.now() };
        
        if (status === 'completed') {
             if (upload.status !== 'completed') {
                const currentReportId = upload.reportId;
                
                // Verificar se há outros uploads pendentes para este report
                const hasPendingUploadsForThisReport = Object.values(newState).some(u => 
                    u.reportId === currentReportId && 
                    u.id !== uploadId && 
                    u.status !== 'completed' && 
                    u.status !== 'error'
                );

                if (currentReportId && !hasPendingUploadsForThisReport) {
                    supabase.from('reports')
                      .update({ moderation_status: 'approved' })
                      .eq('id', currentReportId)
                      .then(async ({ error }) => {
                          if (error) console.error("Failed to update report status:", error);
                          else {
                              if (!Capacitor.isNativePlatform()) {
                                  toast.success("Bronca enviada com sucesso! ✅");
                              }
                              
                              // Notificação Local
                              try {
                                const notificationId = Math.floor(Date.now() % 2147483647);
                                await LocalNotifications.schedule({
                                    notifications: [{
                                        title: "Upload Concluído! 🚀",
                                        body: "Sua bronca foi enviada com sucesso e já está visível no mapa.",
                                        id: notificationId,
                                        schedule: { at: new Date(Date.now() + 100) },
                                        smallIcon: "ic_stat_icon_config_sample"
                                    }]
                                });
                              } catch (e) {
                                  console.error("Failed to schedule notification:", e);
                              }
                          }
                      });
                } else if (!currentReportId) {
                    if (!Capacitor.isNativePlatform()) {
                        toast.success(`Upload de ${upload.name || 'arquivo'} concluído!`);
                    }
                }
            }
            setTimeout(() => {
                setActiveUploads(current => {
                    const { [uploadId]: _, ...rest } = current;
                    return rest;
                });
            }, 3000);
        } else if (status === 'error') {
             if (upload.reportId && !upload.deleteTriggered) {
                newState[uploadId] = { ...newState[uploadId], deleteTriggered: true };
//                 console.log(`[UploadContext] Upload failed for report ${upload.reportId}. Deleting report.`);
                supabase.from('reports').delete().eq('id', upload.reportId).then(({ error }) => {
                    if (error) console.error("[UploadContext] Failed to delete report:", error);
                    else toast.error("Upload falhou. A bronca foi removida. Tente novamente.");
                });
            }
        }
        return newState;
    });
  }, []);

  const cancelUpload = useCallback(async (uploadId) => {
      // Obter info do upload antes de remover
      let uploadInfo = null;
      setActiveUploads(prev => {
          uploadInfo = prev[uploadId];
          return prev;
      });

      // Cancelar controller se existir (Web)
      if (abortControllersRef.current[uploadId]) {
          try {
              abortControllersRef.current[uploadId].abort();
          } catch (e) {
              console.error("Erro ao abortar upload web:", e);
          }
          delete abortControllersRef.current[uploadId];
      }

      // Cancelamento nativo
      try {
        if (Capacitor.isNativePlatform()) {
             await VideoProcessor.cancelUpload({ uploadId });
        }
      } catch (e) {
//         console.warn("Erro ao cancelar upload nativo:", e);
      }

      // Remover do estado
      setActiveUploads(prev => {
          const { [uploadId]: _, ...rest } = prev;
          return rest;
      });

      // Remover bronca associada
      if (uploadInfo && uploadInfo.reportId) {
//           console.log(`[UploadContext] Upload ${uploadId} cancelled. Deleting report ${uploadInfo.reportId}.`);
          try {
              const { error } = await supabase.from('reports').delete().eq('id', uploadInfo.reportId);
              if (error) throw error;
              toast.info("Upload cancelado e bronca removida.");
          } catch (err) {
              console.error("Erro ao remover bronca após cancelamento:", err);
          }
      }
  }, []);

  const queueWebUpload = useCallback(async (file, filePath, metadata, options = {}) => {
    const uploadId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar controller para cancelamento
    const controller = new AbortController();
    abortControllersRef.current[uploadId] = controller;

    // Registrar estado inicial
    registerUpload(uploadId, { ...metadata, status: 'preparing', progress: 0 });
    
    // Executar processo em background (sem await)
    (async () => {
        try {
            if (controller.signal.aborted) throw new Error('Upload cancelado');

            let fileToUpload = file;
            
            // 1. Otimizar se necessário (apenas vídeos)
            if (metadata.type === 'video' && !options.skipCompression) {
                updateUploadProgress(uploadId, 0, 'optimizing');
                try {
                    // Check abort before heavy operation
                    if (controller.signal.aborted) throw new Error('Upload cancelado');

                    const result = await compressVideoWeb(file, {
                        quality: 'medium',
                        onProgress: (p) => {
                            if (controller.signal.aborted) return;
                            updateUploadProgress(uploadId, p, 'optimizing');
                        }
                    });
                    fileToUpload = result.file;
                } catch (compErr) {
                    if (compErr.message === 'Upload cancelado') throw compErr;
//                     console.warn("Compressão web falhou, usando original:", compErr);
                    // Segue com o original
                }
            }
            
            // 2. Upload
            if (controller.signal.aborted) throw new Error('Upload cancelado');
            updateUploadProgress(uploadId, 0, 'uploading');
            
            await uploadLargeFile(fileToUpload, filePath, {
                onProgress: (p) => updateUploadProgress(uploadId, p, 'uploading'),
                bucket: options.bucket || 'reports-media',
                signal: controller.signal
            });
            
            // 3. Concluir
            if (!controller.signal.aborted) {
                updateUploadProgress(uploadId, 100, 'completed');
            }
            
        } catch (err) {
            if (err.message === 'Upload cancelado' || err.name === 'AbortError') {
//                 console.log("Web upload cancelled:", uploadId);
                // Não marcamos como erro, apenas removemos (já tratado no cancelUpload)
            } else {
                console.error("Web background upload failed:", err);
                updateUploadProgress(uploadId, 0, 'error');
            }
        } finally {
            // Cleanup controller
            delete abortControllersRef.current[uploadId];
        }
    })();
    
    return uploadId;
  }, [registerUpload, updateUploadProgress]);

  const toggleMinimized = () => setIsMinimized(prev => !prev);

  // Valores computados
  const uploadsList = Object.values(activeUploads);
  const isUploading = uploadsList.some(u => u.status !== 'completed' && u.status !== 'error');
  const totalProgress = uploadsList.length > 0 
    ? uploadsList.reduce((acc, curr) => acc + curr.progress, 0) / uploadsList.length 
    : 0;

  return (
    <UploadContext.Provider value={{ 
      activeUploads, 
      registerUpload, 
      updateUploadProgress,
      queueWebUpload,
      cancelUpload,
      isUploading,
      totalProgress,
      isMinimized,
      toggleMinimized
    }}>
      {children}
    </UploadContext.Provider>
  );
};
