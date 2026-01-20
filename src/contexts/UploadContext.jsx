import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { toast } from 'sonner';
import { supabase } from '@/lib/customSupabaseClient';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const UploadContext = createContext({});

export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const [activeUploads, setActiveUploads] = useState({});
  const [isMinimized, setIsMinimized] = useState(false);

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
                console.log(`[UploadContext] All uploads completed for report ${currentReportId}. Making visible.`);
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
                console.log(`[UploadContext] Upload completed for ${event.id}, but report ${currentReportId} still has pending uploads.`);
            }

            // Removemos da lista após um breve delay para o usuário ver o 100%
            // Mas marcamos como completo primeiro
            newState[event.id] = { ...upload, progress: 100, status: 'completed' };
            
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
            newState[event.id] = { ...upload, status: 'error', error: event.status };
            
            // ROLLBACK: Delete report if upload failed
            if (upload.reportId && !upload.deleteTriggered) {
                newState[event.id] = { ...newState[event.id], deleteTriggered: true };
                
                console.log(`[UploadContext] Upload failed for report ${upload.reportId}. Deleting report.`);
                supabase.from('reports').delete().eq('id', upload.reportId).then(({ error }) => {
                    if (error) console.error("[UploadContext] Failed to delete report:", error);
                    else toast.error("Upload falhou. A bronca foi removida. Tente novamente.");
                });
            }
          } else {
            // Progresso
            newState[event.id] = { ...upload, progress: event.progress, status: 'uploading' };
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

  const registerUpload = useCallback((uploadId, metadata) => {
    setActiveUploads(prev => ({
      ...prev,
      [uploadId]: {
        id: uploadId,
        progress: 0,
        status: 'pending',
        timestamp: Date.now(),
        ...metadata // name, type, etc.
      }
    }));
  }, []);

  const updateUploadProgress = useCallback((uploadId, progress, status = 'uploading') => {
    setActiveUploads(prev => {
        const upload = prev[uploadId];
        if (!upload) return prev;

        const newState = { ...prev };
        newState[uploadId] = { ...upload, progress, status };
        
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
                console.log(`[UploadContext] Upload failed for report ${upload.reportId}. Deleting report.`);
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
      // Implementar cancelamento nativo se necessário
      // await VideoProcessor.cancelUpload({ uploadId });
      setActiveUploads(prev => {
          const { [uploadId]: _, ...rest } = prev;
          return rest;
      });
  }, []);

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
