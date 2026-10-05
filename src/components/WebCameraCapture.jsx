import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, Video, Circle, Square, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { webCameraCapabilities, photoZoomCrop, applyWebCameraControls, fitCameraPreview } from '@/lib/webCameraControls';

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
  const previewRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const controlsQueueRef = useRef(Promise.resolve());
  const mountedRef = useRef(false);
  const nativeInputRef = useRef(null);
  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mode] = useState(initialMode);
  const [controls, setControls] = useState(() => webCameraCapabilities(null, initialMode));
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [controlsBusy, setControlsBusy] = useState(false);
  const [controlsError, setControlsError] = useState('');
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const fittedPreview = fitCameraPreview(previewSize.width, previewSize.height, frameSize.width, frameSize.height);

  const recorderMimeType = useMemo(() => pickRecorderMimeType(), []);

  useEffect(() => {
    const preview = previewRef.current;
    const measure = () => setPreviewSize({ width: preview.clientWidth, height: preview.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(preview);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;

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
        const detected = webCameraCapabilities(stream.getVideoTracks()[0], mode);
        setControls(detected);
        setZoom(detected.value);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.volume = 0;
          await videoRef.current.play();
        }
        if (!cancelled) setIsReady(true);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Falha ao acessar a câmera.');
      }
    };

    start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (recorderRef.current) recorderRef.current.onstop = null;
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

  const changeControls = (next) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setControlsBusy(true);
    setControlsError('');
    controlsQueueRef.current = controlsQueueRef.current.catch(() => {}).then(async () => {
      if (!mountedRef.current || track.readyState === 'ended') return;
      try {
        await applyWebCameraControls(track, {
          ...(controls.hardwareZoom ? { zoom: next.zoom ?? zoom } : {}),
          ...(controls.torch ? { torch: next.torch ?? torch } : {}),
        });
        if (!mountedRef.current) return;
        if (next.zoom != null) setZoom(next.zoom);
        if (next.torch != null) setTorch(next.torch);
      } catch {
        if (mountedRef.current) setControlsError('Não foi possível ajustar a câmera. Tente novamente ou use a câmera do aparelho.');
      } finally {
        if (mountedRef.current) setControlsBusy(false);
      }
    });
  };

  const changeZoom = (value) => {
    if (controls.hardwareZoom) changeControls({ zoom: value });
    else setZoom(value);
  };

  const captureWithDevice = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsReady(false);
    nativeInputRef.current?.click();
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const crop = photoZoomCrop(canvas.width, canvas.height, controls.hardwareZoom ? 1 : zoom);
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    if (mountedRef.current) onCapture?.({ type: 'photo', file: blob });
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
        <button type="button" onClick={onClose} aria-label="Fechar câmera" className="p-2 rounded-md hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div ref={previewRef} className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center">
        <div className="overflow-hidden" style={fittedPreview}>
          <video ref={videoRef} playsInline muted className="w-full h-full object-contain" onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth && video.videoHeight) setFrameSize({ width: video.videoWidth, height: video.videoHeight });
          }} style={controls.hardwareZoom ? undefined : { transform: `scale(${zoom})` }} />
        </div>
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">Abrindo câmera…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/90 text-sm px-6 text-center">{error}</div>
        )}
      </div>

      <div className="px-4 pt-3 space-y-3 text-white">
        {controls.zoom.max > controls.zoom.min && (
          <label className="flex items-center gap-3 text-sm">
            <span>Zoom</span>
            <input type="range" aria-label="Zoom da câmera" min={controls.zoom.min} max={controls.zoom.max} step={controls.zoom.step} value={zoom} disabled={!isReady || controlsBusy} onChange={(event) => changeZoom(Number(event.target.value))} className="min-w-0 flex-1 accent-white" />
            <span className="w-12 text-right">{zoom.toFixed(1)}×</span>
          </label>
        )}
        <button type="button" aria-pressed={torch} disabled={!isReady || !controls.torch || controlsBusy} onClick={() => changeControls({ torch: !torch })} className="flex items-center gap-2 text-sm disabled:opacity-60">
          {torch ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          {controls.torch ? `Flash ${torch ? 'ligado' : 'desligado'}` : 'Flash indisponível neste navegador'}
        </button>
        {controlsError && <p role="status" className="text-sm text-amber-200">{controlsError}</p>}
        {mode === 'photo' && !controls.hardwareZoom && <p className="text-xs text-white/70">Zoom digital: a aproximação também será aplicada à foto.</p>}
        {mode === 'photo' && (
          <>
            <button type="button" onClick={captureWithDevice} className="text-sm underline">Usar câmera do aparelho</button>
            <input ref={nativeInputRef} type="file" accept="image/*" capture="environment" className="hidden" onCancel={onClose} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onCapture?.({ type: 'photo', file });
              else onClose?.();
            }} />
          </>
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
          <Button type="button" onClick={capturePhoto} disabled={!isReady || controlsBusy} className="bg-surface-raised text-black hover:bg-white/90 rounded-full h-12 px-6">
            <Camera className="h-5 w-5 mr-2" />
            Capturar
          </Button>
        )}
      </div>
    </div>
  );
}
