import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { compressVideoWeb } from '@/utils/videoProcessor';
import { uploadLargeFile } from '@/utils/webUploadService';
import { supabase } from '@/lib/customSupabaseClient';
import { Capacitor } from '@capacitor/core';
import { notifyNative } from '@/lib/nativeNotification';
import { showAppError } from '@/lib/appError';

const UploadContext = createContext({});

const BATCH_CLEANUP_DELAY_MS = 3000;
const UNKNOWN_NATIVE_EVENT_TTL_MS = 15000;

const getUploadBatchId = (upload) =>
  String(upload?.batchId || upload?.reportId || upload?.id || 'upload-desconhecido');

const getNativeFailureReason = (status) => {
  const normalized = String(status || 'error');
  if (normalized === 'cancelled') return 'O envio foi cancelado.';
  if (normalized.includes('timeout')) return 'O upload excedeu o tempo limite.';
  if (normalized.includes('network')) return 'A conexão caiu durante o upload.';
  if (normalized.includes('compression')) return 'O vídeo não pôde ser otimizado.';
  if (normalized.includes('upload_failed')) return 'O servidor rejeitou um dos arquivos.';
  return 'Um ou mais anexos não puderam ser enviados.';
};

const applyNativeEventToUpload = (upload, event) => {
  const status = String(event?.status || 'uploading');
  const numericProgress = Number(event?.progress);
  const progress = Number.isFinite(numericProgress) ? numericProgress : upload.progress;
  const lastUpdate = Date.now();

  if (status === 'completed') {
    return { ...upload, progress: 100, status: 'completed', lastUpdate };
  }

  if (status === 'cancelled' || status.startsWith('error')) {
    const failureReason = getNativeFailureReason(status);
    return {
      ...upload,
      progress,
      status: 'error',
      error: status,
      failureReason,
      lastUpdate,
    };
  }

  return {
    ...upload,
    progress,
    status,
    lastUpdate,
  };
};

export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const [activeUploads, setActiveUploads] = useState({});
  const [isMinimized, setIsMinimized] = useState(false);

  const mountedRef = React.useRef(true);
  const activeUploadsRef = React.useRef({});
  const abortControllersRef = React.useRef({});
  const failedBatchIdsRef = React.useRef(new Set());
  const silentFailureBatchIdsRef = React.useRef(new Set());
  const notifiedFailureBatchIdsRef = React.useRef(new Set());
  const notifiedSuccessBatchIdsRef = React.useRef(new Set());
  const rollbackStartedReportIdsRef = React.useRef(new Set());
  const cleanupTimersRef = React.useRef(new Map());
  const mediaInsertStartedIdsRef = React.useRef(new Set());
  const failureHandledUploadIdsRef = React.useRef(new Set());
  const cancelledTransportIdsRef = React.useRef(new Set());
  const pendingNativeEventsRef = React.useRef(new Map());

  // O ref é a fonte síncrona das transições. O React recebe sempre um snapshot
  // pronto, sem efeitos externos dentro de um updater funcional.
  const setUploads = useCallback((updater) => {
    const previous = activeUploadsRef.current;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    if (!next || next === previous) return previous;

    activeUploadsRef.current = next;
    if (mountedRef.current) setActiveUploads(next);
    return next;
  }, []);

  const clearUploadGuards = useCallback((uploadIds) => {
    uploadIds.forEach((uploadId) => {
      mediaInsertStartedIdsRef.current.delete(uploadId);
      failureHandledUploadIdsRef.current.delete(uploadId);
    });
  }, []);

  const removeBatchUploads = useCallback((batchId, removeAll = false) => {
    const normalizedBatchId = String(batchId);
    const current = activeUploadsRef.current;
    const removedIds = [];
    const nextEntries = Object.entries(current).filter(([, item]) => {
      if (getUploadBatchId(item) !== normalizedBatchId) return true;
      const shouldRemove = removeAll || item.status === 'completed';
      if (shouldRemove) removedIds.push(item.id);
      return !shouldRemove;
    });

    if (removedIds.length === 0) return;
    setUploads(Object.fromEntries(nextEntries));
    clearUploadGuards(removedIds);
  }, [clearUploadGuards, setUploads]);

  const scheduleBatchCleanup = useCallback((batchId, removeAll = false) => {
    const normalizedBatchId = String(batchId);
    const cleanupKey = `${normalizedBatchId}:${removeAll ? 'all' : 'completed'}`;
    if (cleanupTimersRef.current.has(cleanupKey)) return;

    const timer = setTimeout(() => {
      cleanupTimersRef.current.delete(cleanupKey);
      removeBatchUploads(normalizedBatchId, removeAll);
    }, BATCH_CLEANUP_DELAY_MS);
    cleanupTimersRef.current.set(cleanupKey, timer);
  }, [removeBatchUploads]);

  const cancelTransport = useCallback(async (uploadId) => {
    if (!uploadId || cancelledTransportIdsRef.current.has(uploadId)) return;
    cancelledTransportIdsRef.current.add(uploadId);

    const controller = abortControllersRef.current[uploadId];
    if (controller) {
      try {
        controller.abort();
      } catch (error) {
        console.error('[UploadContext] Erro ao abortar upload web:', error);
      } finally {
        delete abortControllersRef.current[uploadId];
      }
    }

    const isWebTransport = Boolean(controller) || String(uploadId).startsWith('web_');
    if (!isWebTransport && Capacitor.isNativePlatform()) {
      try {
        await VideoProcessor.cancelUpload({ uploadId });
      } catch (error) {
        cancelledTransportIdsRef.current.delete(uploadId);
        console.error('[UploadContext] Erro ao cancelar upload nativo:', error);
      }
    }
  }, []);

  const rollbackReport = useCallback(async (reportId) => {
    if (!reportId || rollbackStartedReportIdsRef.current.has(reportId)) return;
    rollbackStartedReportIdsRef.current.add(reportId);

    try {
      const { error } = await supabase.from('reports').delete().eq('id', reportId);
      if (error) {
        rollbackStartedReportIdsRef.current.delete(reportId);
        console.error('[UploadContext] Falha no rollback da bronca:', error);
      }
    } catch (error) {
      rollbackStartedReportIdsRef.current.delete(reportId);
      console.error('[UploadContext] Falha no rollback da bronca:', error);
    }
  }, []);

  const failBatch = useCallback(async (upload, reason, { silent = false } = {}) => {
    if (!upload) return;

    const batchId = getUploadBatchId(upload);
    const failureReason = reason || 'Um ou mais anexos não puderam ser enviados.';
    failedBatchIdsRef.current.add(batchId);
    if (silent) silentFailureBatchIdsRef.current.add(batchId);
    const isSilent = silentFailureBatchIdsRef.current.has(batchId);

    const siblings = Object.values(activeUploadsRef.current)
      .filter((item) => getUploadBatchId(item) === batchId);

    siblings.forEach((item) => failureHandledUploadIdsRef.current.add(item.id));

    if (isSilent) {
      removeBatchUploads(batchId, true);
    } else if (siblings.length > 0) {
      setUploads((current) => {
        let changed = false;
        const next = { ...current };
        Object.entries(current).forEach(([uploadId, item]) => {
          if (getUploadBatchId(item) !== batchId) return;
          changed = true;
          next[uploadId] = {
            ...item,
            status: 'error',
            error: item.error || failureReason,
            failureReason,
            lastUpdate: Date.now(),
          };
        });
        return changed ? next : current;
      });
    }

    const cancellableSiblings = siblings.filter(
      (item) => item.status !== 'completed' && item.status !== 'error'
    );
    const cancellation = Promise.allSettled(
      cancellableSiblings.map((item) => cancelTransport(item.id))
    );

    const reportId = upload.reportId || siblings.find((item) => item.reportId)?.reportId;
    const rollback = reportId ? rollbackReport(reportId) : Promise.resolve();

    if (!isSilent && !notifiedFailureBatchIdsRef.current.has(batchId)) {
      notifiedFailureBatchIdsRef.current.add(batchId);
      const body = `${failureReason} Tente novamente.`;
      if (Capacitor.isNativePlatform()) {
        void notifyNative({
          title: 'Falha no upload',
          body,
          dedupeKey: `upload-falhou:${batchId}`,
        });
      } else {
        showAppError({ title: 'Falha no upload', description: body });
      }
    }

    if (!isSilent) scheduleBatchCleanup(batchId);
    await Promise.all([cancellation, rollback]);
  }, [cancelTransport, removeBatchUploads, rollbackReport, scheduleBatchCleanup, setUploads]);

  const failUploadBatch = useCallback((metadata, reason) => {
    const safeMetadata = metadata || {};
    return failBatch({
      id: safeMetadata.batchId || safeMetadata.reportId || `falha-${Date.now()}`,
      ...safeMetadata,
    }, reason, { silent: safeMetadata.silent === true });
  }, [failBatch]);

  const notifyCompletionIfReady = useCallback((uploads, uploadId) => {
    const upload = uploads[uploadId];
    if (!upload) return;

    const batchId = getUploadBatchId(upload);
    if (failedBatchIdsRef.current.has(batchId)) {
      if (!silentFailureBatchIdsRef.current.has(batchId)) {
        scheduleBatchCleanup(batchId);
      }
      return;
    }
    if (notifiedSuccessBatchIdsRef.current.has(batchId)) return;

    const batchUploads = Object.values(uploads)
      .filter((item) => getUploadBatchId(item) === batchId);
    const expectedUploads = Math.max(
      1,
      ...batchUploads.map((item) => Number(item.expectedUploads) || 1)
    );
    if (batchUploads.length < expectedUploads) return;
    if (batchUploads.some((item) => item.status !== 'completed')) return;
    if (batchUploads.some((item) => item.mediaRow && !item.mediaRowFinalized)) return;

    notifiedSuccessBatchIdsRef.current.add(batchId);
    const isReportUpload = Boolean(upload.reportId || upload.isReportUpload);
    void notifyNative({
      title: 'Upload concluído',
      body: isReportUpload
        ? 'Sua bronca e os anexos foram enviados com sucesso.'
        : `${upload.name || 'Arquivo'} foi enviado com sucesso.`,
      ...(upload.reportId
        ? { extra: { reportId: upload.reportId, url: `/bronca/${upload.reportId}` } }
        : {}),
      dedupeKey: `upload-concluido:${batchId}`,
    });
    scheduleBatchCleanup(batchId, true);
  }, [scheduleBatchCleanup]);

  const cacheUnknownNativeEvent = useCallback((event) => {
    const uploadId = event?.id;
    if (!uploadId) return;

    const previous = pendingNativeEventsRef.current.get(uploadId);
    if (previous?.timer) clearTimeout(previous.timer);

    const receivedAt = Date.now();
    const timer = setTimeout(() => {
      const current = pendingNativeEventsRef.current.get(uploadId);
      if (current?.receivedAt === receivedAt) {
        pendingNativeEventsRef.current.delete(uploadId);
      }
    }, UNKNOWN_NATIVE_EVENT_TTL_MS);

    pendingNativeEventsRef.current.set(uploadId, { event, receivedAt, timer });
  }, []);

  const consumeUnknownNativeEvent = useCallback((uploadId) => {
    const pending = pendingNativeEventsRef.current.get(uploadId);
    if (!pending) return null;

    pendingNativeEventsRef.current.delete(uploadId);
    if (pending.timer) clearTimeout(pending.timer);
    if (Date.now() - pending.receivedAt > UNKNOWN_NATIVE_EVENT_TTL_MS) return null;
    return pending.event;
  }, []);

  const applyNativeUploadEvent = useCallback((event) => {
    const uploadId = event?.id;
    if (!uploadId) return;

    const upload = activeUploadsRef.current[uploadId];
    if (!upload) {
      cacheUnknownNativeEvent(event);
      return;
    }

    const batchId = getUploadBatchId(upload);
    if (failedBatchIdsRef.current.has(batchId)) return;

    setUploads((current) => {
      const currentUpload = current[uploadId];
      if (!currentUpload) return current;
      return {
        ...current,
        [uploadId]: applyNativeEventToUpload(currentUpload, event),
      };
    });
  }, [cacheUnknownNativeEvent, setUploads]);

  const registerUpload = useCallback((uploadId, metadata = {}) => {
    if (!uploadId) return;

    const now = Date.now();
    const pendingEvent = consumeUnknownNativeEvent(uploadId);
    let nextUpload = {
      ...metadata,
      id: uploadId,
      progress: Number(metadata.progress) || 0,
      status: metadata.status || 'pending',
      timestamp: now,
      lastUpdate: now,
    };
    const batchId = getUploadBatchId(nextUpload);
    const batchFailed = failedBatchIdsRef.current.has(batchId);
    const batchIsSilent = silentFailureBatchIdsRef.current.has(batchId);

    if (pendingEvent && !batchFailed) {
      nextUpload = applyNativeEventToUpload(nextUpload, pendingEvent);
    }

    if (batchFailed) {
      failureHandledUploadIdsRef.current.add(uploadId);
      if (!batchIsSilent) {
        nextUpload = {
          ...nextUpload,
          status: 'error',
          error: 'Outro anexo deste envio falhou.',
          failureReason: 'Outro anexo deste envio falhou.',
        };
      }
    }

    if (!batchIsSilent) {
      setUploads((current) => ({ ...current, [uploadId]: nextUpload }));
    }

    if (batchFailed) void cancelTransport(uploadId);
  }, [cancelTransport, consumeUnknownNativeEvent, setUploads]);

  const updateUploadProgress = useCallback((uploadId, progress, status = 'uploading') => {
    setUploads((current) => {
      const upload = current[uploadId];
      if (!upload) return current;
      if (failedBatchIdsRef.current.has(getUploadBatchId(upload))) return current;
      if (upload.status === 'completed' && status === 'completed') return current;

      const isError = status === 'error' || String(status).startsWith('error');
      const nextUpload = {
        ...upload,
        progress,
        status: isError ? 'error' : status,
        lastUpdate: Date.now(),
      };
      if (isError) {
        nextUpload.error = upload.error || 'Falha no envio';
        nextUpload.failureReason = upload.failureReason
          || 'Um ou mais anexos não puderam ser enviados.';
      }

      return { ...current, [uploadId]: nextUpload };
    });
  }, [setUploads]);

  const cancelUpload = useCallback(async (uploadId, { reason, silent } = {}) => {
    const upload = activeUploadsRef.current[uploadId];
    if (!upload) {
      await cancelTransport(uploadId);
      return;
    }

    await failBatch(upload, reason || 'Upload cancelado.', {
      silent: silent === true || !reason,
    });
  }, [cancelTransport, failBatch]);

  const queueWebUpload = useCallback(async (file, filePath, metadata, options = {}) => {
    const uploadId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    abortControllersRef.current[uploadId] = controller;

    registerUpload(uploadId, { ...metadata, status: 'preparing', progress: 0 });

    void (async () => {
      try {
        if (controller.signal.aborted) throw new Error('Upload cancelado');

        let fileToUpload = file;
        if (metadata.type === 'video' && !options.skipCompression) {
          updateUploadProgress(uploadId, 0, 'optimizing');
          try {
            if (controller.signal.aborted) throw new Error('Upload cancelado');
            const result = await compressVideoWeb(file, {
              quality: 'medium',
              onProgress: (value) => {
                if (!controller.signal.aborted) {
                  updateUploadProgress(uploadId, value, 'optimizing');
                }
              },
            });
            fileToUpload = result.file;
          } catch (compressionError) {
            if (compressionError.message === 'Upload cancelado') throw compressionError;
          }
        }

        if (controller.signal.aborted) throw new Error('Upload cancelado');
        updateUploadProgress(uploadId, 0, 'uploading');

        if (metadata.type === 'video' && fileToUpload?.type) {
          const rawType = String(fileToUpload.type);
          const baseType = rawType.split(';')[0].trim();
          if (baseType && baseType !== rawType) {
            const baseName = String(fileToUpload.name || 'video').replace(/\.[^/.]+$/, '');
            const extension = baseType === 'video/webm'
              ? 'webm'
              : baseType === 'video/mp4'
                ? 'mp4'
                : '';
            const nextName = extension
              ? `${baseName}.${extension}`
              : String(fileToUpload.name || baseName);
            fileToUpload = new File([fileToUpload], nextName, {
              type: baseType,
              lastModified: Date.now(),
            });
          }
        }

        await uploadLargeFile(fileToUpload, filePath, {
          onProgress: (value) => updateUploadProgress(uploadId, value, 'uploading'),
          bucket: options.bucket || 'reports-media',
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          updateUploadProgress(uploadId, 100, 'completed');
        }
      } catch (error) {
        if (error.message !== 'Upload cancelado' && error.name !== 'AbortError') {
          console.error('[UploadContext] Web background upload failed:', error);
          updateUploadProgress(uploadId, 0, 'error');
        }
      } finally {
        delete abortControllersRef.current[uploadId];
      }
    })();

    return uploadId;
  }, [registerUpload, updateUploadProgress]);

  // A referência de mídia passa a ser gravada somente após o arquivo chegar ao
  // storage. O guard é reservado antes da chamada para impedir inserts duplos.
  useEffect(() => {
    const candidates = Object.values(activeUploads).filter((upload) => (
      upload.status === 'completed'
      && upload.mediaRow
      && !upload.mediaRowFinalized
      && !mediaInsertStartedIdsRef.current.has(upload.id)
      && !failedBatchIdsRef.current.has(getUploadBatchId(upload))
    ));

    candidates.forEach((upload) => {
      mediaInsertStartedIdsRef.current.add(upload.id);
      setUploads((current) => {
        const currentUpload = current[upload.id];
        if (!currentUpload || currentUpload.status !== 'completed') return current;
        return {
          ...current,
          [upload.id]: {
            ...currentUpload,
            status: 'finalizing',
            mediaRowInsertStarted: true,
            lastUpdate: Date.now(),
          },
        };
      });

      void (async () => {
        let insertError = null;
        try {
          const { error } = await supabase.from('report_media').insert(upload.mediaRow);
          insertError = error;
        } catch (error) {
          insertError = error;
        }
        if (!mountedRef.current) return;

        const currentUpload = activeUploadsRef.current[upload.id];
        if (!currentUpload) return;
        const batchId = getUploadBatchId(currentUpload);
        if (failedBatchIdsRef.current.has(batchId)) return;

        if (insertError) {
          setUploads((current) => {
            const item = current[upload.id];
            if (!item) return current;
            return {
              ...current,
              [upload.id]: {
                ...item,
                status: 'error',
                error: insertError?.message || 'Falha ao vincular o arquivo à bronca.',
                failureReason: 'O arquivo foi enviado, mas não pôde ser vinculado à bronca.',
                lastUpdate: Date.now(),
              },
            };
          });
          return;
        }

        setUploads((current) => {
          const item = current[upload.id];
          if (!item || failedBatchIdsRef.current.has(getUploadBatchId(item))) return current;
          return {
            ...current,
            [upload.id]: {
              ...item,
              progress: 100,
              status: 'completed',
              mediaRowFinalized: true,
              lastUpdate: Date.now(),
            },
          };
        });
      })();
    });
  }, [activeUploads, setUploads]);

  // Falha e sucesso são agregados depois que o snapshot foi confirmado, nunca
  // durante a construção do próximo estado.
  useEffect(() => {
    const uploads = Object.values(activeUploads);

    uploads.forEach((upload) => {
      if (upload.status !== 'error') return;
      if (failureHandledUploadIdsRef.current.has(upload.id)) return;
      failureHandledUploadIdsRef.current.add(upload.id);
      void failBatch(
        upload,
        upload.failureReason || upload.error || 'Um ou mais anexos não puderam ser enviados.',
        { silent: silentFailureBatchIdsRef.current.has(getUploadBatchId(upload)) }
      );
    });

    uploads.forEach((upload) => {
      if (upload.status === 'completed') {
        notifyCompletionIfReady(activeUploads, upload.id);
      }
    });
  }, [activeUploads, failBatch, notifyCompletionIfReady]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let disposed = false;
    let progressListener = null;

    void (async () => {
      try {
        const listener = await VideoProcessor.addListener('uploadProgress', applyNativeUploadEvent);
        if (disposed) {
          await listener.remove();
          return;
        }
        progressListener = listener;
      } catch (error) {
        if (!disposed) {
          console.error('[UploadContext] Falha ao configurar listener nativo:', error);
        }
      }
    })();

    return () => {
      disposed = true;
      if (progressListener) void progressListener.remove();
    };
  }, [applyNativeUploadEvent]);

  // Detecção de uploads travados consulta o ref diretamente. Não há setState ou
  // chamada de plugin dentro de um updater React.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const checkedBatches = new Set();

      Object.values(activeUploadsRef.current).forEach((upload) => {
        const batchId = getUploadBatchId(upload);
        if (checkedBatches.has(batchId) || failedBatchIdsRef.current.has(batchId)) return;

        const timeSinceLastUpdate = now - (upload.lastUpdate || upload.timestamp || now);
        const stalledAtZero = upload.progress === 0 && (
          upload.status === 'pending' || upload.status === 'uploading'
        ) && timeSinceLastUpdate > 180000;
        const stalledPreparation = upload.progress === 0 && (
          upload.status === 'compressing'
          || upload.status === 'optimizing'
          || upload.status === 'preparing'
        ) && timeSinceLastUpdate > 600000;
        const stalledOptimization = upload.progress > 0 && (
          upload.status === 'compressing' || upload.status === 'optimizing'
        ) && timeSinceLastUpdate > 180000;

        if (!stalledAtZero && !stalledPreparation && !stalledOptimization) return;
        checkedBatches.add(batchId);

        const reason = stalledPreparation
          ? 'O processamento do vídeo demorou muito.'
          : stalledOptimization
            ? 'A otimização do vídeo parou de responder.'
            : 'O upload demorou muito para iniciar.';
        void cancelUpload(upload.id, { reason });
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [cancelUpload]);

  useEffect(() => {
    const cleanupTimers = cleanupTimersRef.current;
    const pendingNativeEvents = pendingNativeEventsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupTimers.forEach((timer) => clearTimeout(timer));
      cleanupTimers.clear();
      pendingNativeEvents.forEach(({ timer }) => {
        if (timer) clearTimeout(timer);
      });
      pendingNativeEvents.clear();
    };
  }, []);

  const toggleMinimized = () => setIsMinimized((previous) => !previous);
  const uploadsList = Object.values(activeUploads);
  const isUploading = uploadsList.some(
    (upload) => upload.status !== 'completed' && upload.status !== 'error'
  );
  const totalProgress = uploadsList.length > 0
    ? uploadsList.reduce((total, upload) => total + upload.progress, 0) / uploadsList.length
    : 0;

  return (
    <UploadContext.Provider value={{
      activeUploads,
      registerUpload,
      updateUploadProgress,
      queueWebUpload,
      failUploadBatch,
      cancelUpload,
      isUploading,
      totalProgress,
      isMinimized,
      toggleMinimized,
    }}>
      {children}
    </UploadContext.Provider>
  );
};
