import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { createReportUploadQueue } from '@/lib/reportUploadQueue';
import { createReportUploadStore } from '@/lib/reportUploadStore';
import { prepareReportMediaSource, reportMediaApi, uploadReportMediaSource } from '@/lib/reportMediaTransport';

const UploadContext = createContext({});
export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const { user } = useAuth();
  const [queue] = useState(() => createReportUploadQueue({
    store: createReportUploadStore(), prepareSource: prepareReportMediaSource,
    api: reportMediaApi, upload: uploadReportMediaSource,
    onComplete: item => window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: item.reportId } })),
  }));
  const [snapshot, setSnapshot] = useState(queue.snapshot);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managedReportId, setManagedReportId] = useState(null);
  useEffect(() => {
    const unsubscribe = queue.subscribe(setSnapshot);
    void queue.restore();
    return unsubscribe;
  }, [queue]);
  const visible = item => item.ownerId ? item.ownerId === user?.id : Boolean(item.recoveryToken);
  const activeUploads = Object.fromEntries(Object.entries(snapshot.items).filter(([, item]) => visible(item)));
  const reports = Object.values(snapshot.reports).filter(visible).sort((a, b) => b.savedAt - a.savedAt);
  const uploads = Object.values(activeUploads);
  const showMediaManager = report => {
    if (report?.reportId) {
      void queue.rememberReport(report);
      setManagedReportId(report.reportId);
    } else setManagedReportId(null);
    setManagerOpen(true);
  };
  return <UploadContext.Provider value={{
    activeUploads, reports, storageError: snapshot.storageError,
    queueReportMedia: (source, report) => queue.enqueue(source, report),
    rememberReport: report => queue.rememberReport(report),
    retryUpload: id => queue.retry(id),
    replaceUpload: (id, source) => queue.replace(id, source),
    cancelUpload: id => queue.dismiss(id),
    isUploading: uploads.some(item => !['error', 'completed'].includes(item.status)),
    totalProgress: uploads.length ? uploads.reduce((sum, item) => sum + item.progress, 0) / uploads.length : 0,
    managerOpen, managedReportId, showMediaManager,
    closeMediaManager: () => setManagerOpen(false),
    selectManagedReport: setManagedReportId,
  }}>{children}</UploadContext.Provider>;
};
