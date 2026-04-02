import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, Video, Circle, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

const pickRecorderMimeType = () => {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
};

const extForMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  return 'webm';
};

export default function WebCameraCapture({ initialMode = 'photo', onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mode] = useState(initialMode);

  const recorderMimeType = useMemo(() => pickRecorderMimeType(), []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        setError('');
        setIsReady(false);

        if (!navigator?.mediaDevices?.getUserMedia) {
          setError('Este navegador não suporta câmera.');
          return;
        }

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: mode === 'video'
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.volume = 0;
          await videoRef.current.play();
        }
        setIsReady(true);
      } catch (e) {
        setError(e?.message || 'Falha ao acessar a câmera.');
      }
    };

    start();

    return () => {
      cancelled = true;
      try {
        recorderRef.current?.stop?.();
      } catch {}
      try {
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
    };
  }, [mode]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    onCapture?.({ type: 'photo', file: blob });
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('Este navegador não suporta gravação de vídeo.');
      return;
    }

    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, recorderMimeType ? { mimeType: recorderMimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const mimeRaw = recorder.mimeType || recorderMimeType || 'video/webm';
      const mime = String(mimeRaw).split(';')[0].trim() || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      setIsRecording(false);
      onCapture?.({ type: 'video', file: blob, mimeType: mime, ext: extForMime(mime) });
    };

    recorder.start(250);
    setIsRecording(true);
  };

  const stopRecording = () => {
    try {
      recorderRef.current?.stop?.();
    } catch {}
  };

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {mode === 'video' ? <Video className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          {mode === 'video' ? 'Gravar vídeo' : 'Tirar foto'}
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">Abrindo câmera…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/90 text-sm px-6 text-center">{error}</div>
        )}
      </div>

      <div className="px-4 py-4 flex items-center justify-center gap-3">
        {mode === 'video' ? (
          isRecording ? (
            <Button type="button" onClick={stopRecording} className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 px-6">
              <Square className="h-5 w-5 mr-2" />
              Parar
            </Button>
          ) : (
            <Button type="button" onClick={startRecording} disabled={!isReady} className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 px-6">
              <Circle className="h-5 w-5 mr-2" />
              Gravar
            </Button>
          )
        ) : (
          <Button type="button" onClick={capturePhoto} disabled={!isReady} className="bg-white text-black hover:bg-white/90 rounded-full h-12 px-6">
            <Camera className="h-5 w-5 mr-2" />
            Capturar
          </Button>
        )}
      </div>
    </div>
  );
}
