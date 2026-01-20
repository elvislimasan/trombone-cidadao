import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { Capacitor } from '@capacitor/core';

export const useBackgroundUpload = () => {
  const [uploads, setUploads] = useState({}); // Map<uploadId, { progress, status, error }>
  const listenersRef = useRef([]);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const handle = await VideoProcessor.addListener('uploadProgress', (event) => {
          if (!mounted) return;
          setUploads(prev => ({
            ...prev,
            [event.id]: { 
              progress: event.progress, 
              status: event.status 
            }
          }));
        });
        listenersRef.current.push(handle);
      } catch (e) {
        console.error('Failed to setup upload listener:', e);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      listenersRef.current.forEach(handle => handle.remove());
      listenersRef.current = [];
    };
  }, []);

  const uploadVideo = useCallback(async (filePath, uploadUrl, headers = {}) => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Background upload is only available on native platforms');
    }

    const { uploadId } = await VideoProcessor.uploadVideoInBackground({
      filePath,
      uploadUrl,
      headers
    });

    setUploads(prev => ({
      ...prev,
      [uploadId]: { progress: 0, status: 'pending' }
    }));

    return uploadId;
  }, []);

  const cancelUpload = useCallback(async (uploadId) => {
    if (!Capacitor.isNativePlatform()) return;
    await VideoProcessor.cancelUpload({ uploadId });
    setUploads(prev => {
      const newUploads = { ...prev };
      delete newUploads[uploadId];
      return newUploads;
    });
  }, []);

  const getUploadStatus = useCallback((uploadId) => {
    return uploads[uploadId];
  }, [uploads]);

  return {
    uploadVideo,
    cancelUpload,
    getUploadStatus,
    uploads
  };
};
