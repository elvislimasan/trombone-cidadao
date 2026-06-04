/**
 * useNativeCamera
 *
 * Hook reutilizável para captura de fotos em Android, iOS e web.
 * Replica o padrão robusto do ReportModal:
 *   - Android : VideoProcessor.capturePhoto (KeepAliveService — processo não é morto)
 *   - iOS     : CapCamera.getPhoto com CameraSource.Camera / Photos
 *   - Web     : <input type="file" accept="image/*">
 *
 * Fluxo nativo:
 *   1. Captura via plugin → filePath
 *   2. Compress para upload  (VideoProcessor, Android only)
 *   3. Thumbnail 512px       (VideoProcessor, Android only)
 *   4. UN ÚNICO setState com preview pronto — sem flicker
 *   5. Fetch nativePath → File apenas no momento do upload (resolveForUpload)
 *
 * Recuperação de OOM kill (Android):
 *   App.addListener('appRestoredResult') detecta o resultado da câmera
 *   após o sistema matar e restaurar o processo.
 *
 * Uso:
 *   const cam = useNativeCamera({ maxPhotos: 5 });
 *   <input ref={cam.fileInputRef} ... />
 *   <button onClick={cam.handleCamera}>Câmera</button>
 *   <button onClick={cam.handleGallery}>Galeria</button>
 *   {cam.photoItems.map(item => <img src={item.preview} />)}
 *   // No submit:
 *   const files = await cam.resolveForUpload();
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { App } from '@capacitor/app';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { useToast } from '@/components/ui/use-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converte qualquer tipo de path nativo para URL web-acessível.
 *
 * Android VideoProcessor: '/data/user/0/...'           → convertFileSrc
 * iOS CapCamera path    : '/var/mobile/...'            → convertFileSrc
 * iOS CapCamera webPath : 'capacitor://localhost/...'  → usa diretamente
 * Blob URL              : 'blob:...'                   → usa diretamente
 */
export const toWebUrl = (p) => {
  if (!p) return '';
  if (
    p.startsWith('capacitor://') ||
    p.startsWith('blob:') ||
    p.startsWith('http://') ||
    p.startsWith('https://')
  )
    return p;
  const clean = p.startsWith('file://') ? p.replace('file://', '') : p;
  return Capacitor.convertFileSrc(clean);
};

/** Verifica se erro é cancelamento pelo usuário (silencioso) */
export const isUserCancelled = (err) =>
  /cancel|cancelled|dismissed|user cancel/i.test(String(err?.message || err));

/** Compressão web via Canvas (fallback browser) */
export const compressToJpeg = async (file, maxPx = 1280, quality = 0.75) => {
  try {
    const dataUrl = await new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result);
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxPx || height > maxPx) {
      const r = Math.min(maxPx / width, maxPx / height);
      width = Math.floor(width * r);
      height = Math.floor(height * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res, rej) => {
      if (canvas.convertToBlob) {
        canvas.convertToBlob({ type: 'image/jpeg', quality }).then(res).catch(rej);
      } else {
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error('toBlob failed'))),
          'image/jpeg',
          quality
        );
      }
    });
    return new File(
      [blob],
      (file.name || 'photo').replace(/\.(webp|png|heic)$/i, '.jpg'),
      { type: 'image/jpeg' }
    );
  } catch (_) {
    return file;
  }
};

/**
 * Converte todos os items capturados em File[] para upload.
 * Items de câmera nativa: fetch do path (nativePath) no momento do envio.
 * Items web: File já está disponível.
 */
export const resolveItemsForUpload = async (items) => {
  const resolved = await Promise.all(
    items.map(async (item) => {
      if (item.file) return item.file;
      if (item.nativePath) {
        try {
          const resp = await fetch(toWebUrl(item.nativePath));
          const blob = await resp.blob();
          return new File([blob], item.name || 'photo.jpg', { type: 'image/jpeg' });
        } catch (_) {
          return null;
        }
      }
      return null;
    })
  );
  return resolved.filter(Boolean);
};

// ─── Storage helpers (sobrevivem a OOM kill, diferente de window.*) ──────────
const LS_CONTEXT = '__native_camera_context__';
const LS_PENDING = '__native_camera_pending_photo__';
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 min — descarta foto antiga

const setCameraContext = () => {
  try { localStorage.setItem(LS_CONTEXT, 'useNativeCamera'); } catch (_) {
    window.__NATIVE_CAMERA_CONTEXT__ = 'useNativeCamera'; // fallback
  }
};
const clearCameraContext = () => {
  try { localStorage.removeItem(LS_CONTEXT); } catch (_) {
    window.__NATIVE_CAMERA_CONTEXT__ = null;
  }
};
export const getCameraContext = () => {
  try { return localStorage.getItem(LS_CONTEXT); } catch (_) {
    return window.__NATIVE_CAMERA_CONTEXT__ || null;
  }
};

const savePendingPhoto = (rawPath, filename) => {
  try {
    localStorage.setItem(LS_PENDING, JSON.stringify({ rawPath, filename, ts: Date.now() }));
  } catch (_) {
    window.__NATIVE_CAMERA_PENDING_PHOTO__ = { rawPath, filename };
  }
};
const clearPendingPhoto = () => {
  try { localStorage.removeItem(LS_PENDING); } catch (_) {
    window.__NATIVE_CAMERA_PENDING_PHOTO__ = null;
  }
};
const consumePendingPhoto = () => {
  try {
    const raw = localStorage.getItem(LS_PENDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > PENDING_TTL_MS) { localStorage.removeItem(LS_PENDING); return null; }
    localStorage.removeItem(LS_PENDING);
    return parsed;
  } catch (_) {
    const p = window.__NATIVE_CAMERA_PENDING_PHOTO__;
    window.__NATIVE_CAMERA_PENDING_PHOTO__ = null;
    return p || null;
  }
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {number} [options.maxPhotos=5]       - Limite de fotos
 * @param {string} [options.toastSuccess]      - Mensagem de sucesso (padrão '✅ Foto adicionada!')
 */
export const useNativeCamera = ({ maxPhotos = 5, toastSuccess = '✅ Foto adicionada!' } = {}) => {
  const { toast } = useToast();

  // Estado unificado — cada item: { id, preview, nativePath?, file?, name }
  const [photoItems, setPhotoItems] = useState([]);
  const [addingPhoto, setAddingPhoto] = useState(false);

  // Ref para evitar double-tap sem causar re-render
  const takingPhotoRef = useRef(false);
  const fileInputRef = useRef(null);

  const canAdd = photoItems.length < maxPhotos && !addingPhoto;

  // ── Processamento nativo ────────────────────────────────────────────────
  // Igual ao processPhotoFromUriOptimized do ReportModal:
  //   compress para upload → thumbnail para preview → UM ÚNICO setState
  const processAndAdd = useCallback(
    async (rawPath, filename) => {
      // Normaliza path (remove file:// se presente; mantém capacitor:// intacto)
      const filePath =
        rawPath.startsWith('file://') ? rawPath.replace('file://', '') : rawPath;

      // Android com VideoProcessor: compress + thumbnail
      // iOS sem VideoProcessor: usa path diretamente (CapCamera já limita via quality/width)
      let finalPath = filePath;
      let previewPath = filePath;

      const hasVideoProcessor =
        !filePath.startsWith('capacitor://') &&
        Capacitor.isPluginAvailable('VideoProcessor');

      if (hasVideoProcessor) {
        // 1. Compressão para upload (1280px, medium quality)
        try {
          const comp = await VideoProcessor.compressImage({
            filePath,
            maxWidth: 1280,
            maxHeight: 1280,
            maxSizeMB: 0.5,
            quality: 'medium',
            format: 'jpeg',
          });
          if (comp?.outputPath) finalPath = comp.outputPath;
        } catch (_) {}

        // 2. Thumbnail leve para preview no modal (512px, low quality)
        try {
          const thumb = await VideoProcessor.compressImage({
            filePath: finalPath,
            maxWidth: 512,
            maxHeight: 512,
            maxSizeMB: 0.3,
            quality: 'low',
            format: 'jpeg',
          });
          if (thumb?.outputPath) previewPath = thumb.outputPath;
        } catch (_) {}
      }

      // UM ÚNICO setState — sem flicker, igual ao ReportModal
      setPhotoItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          nativePath: finalPath,
          preview: toWebUrl(previewPath),
          name: filename,
        },
      ]);

      toast({ title: toastSuccess });
    },
    [toast, toastSuccess]
  );

  // ── Recuperação de foto pendente no mount ─────────────────────────────
  // Persiste em localStorage → sobrevive a OOM kill (diferente de window.*).
  // App.jsx salva o path quando appRestoredResult detecta contexto useNativeCamera.
  // Também recupera se o modal fechou/reabriu enquanto processAndAdd rodava.
  useEffect(() => {
    const pending = consumePendingPhoto();
    if (pending?.rawPath) {
      processAndAdd(pending.rawPath, pending.filename || `photo_restored_${Date.now()}.jpg`);
    }
  // Só executa no mount — processAndAdd é estável via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recuperação após OOM kill (Android) via appRestoredResult ──────────
  // App.jsx lida com o caso principal (navega para / ou não).
  // Este listener cobre o caso em que o componente já estava montado.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle = null;
    const setup = async () => {
      handle = await App.addListener('appRestoredResult', async (data) => {
        const isCameraResult =
          (data.pluginId === 'VideoProcessor' && data.methodName === 'capturePhoto') ||
          (data.pluginId === 'Camera' &&
            (data.methodName === 'getPhoto' || data.methodName === 'pickImages'));
        if (!isCameraResult || !data.success || !data.data) return;
        const rawPath = data.data.filePath || data.data.path || data.data.webPath;
        if (rawPath) {
          clearCameraContext();
          await processAndAdd(rawPath, `photo_restored_${Date.now()}.jpg`);
        }
      });
    };
    setup();
    return () => { handle?.remove(); };
  }, [processAndAdd]);

  // ── Web file input ──────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const file of files.slice(0, maxPhotos - photoItems.length)) {
        const compressed = await compressToJpeg(file);
        setPhotoItems((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            file: compressed,
            preview: URL.createObjectURL(compressed),
            name: compressed.name,
          },
        ]);
      }
      e.target.value = '';
    },
    [maxPhotos, photoItems.length]
  );

  // ── Câmera ──────────────────────────────────────────────────────────────
  // Android : VideoProcessor.capturePhoto — KeepAliveService evita morte do processo
  // iOS     : CapCamera.getPhoto (CameraSource.Camera) — sheet nativo, não pausa JS
  // Web     : <input capture="environment">
  const handleCamera = useCallback(async () => {
    if (!canAdd || takingPhotoRef.current) return;
    takingPhotoRef.current = true;
    setAddingPhoto(true);
    try {
      if (Capacitor.isNativePlatform()) {
        let rawPath = null;
        const ts = Date.now();
        const filename = `photo_${ts}.jpg`;

        // Sinaliza para App.jsx (persiste em localStorage — sobrevive OOM kill)
        // → impede que appRestoredResult navegue para / derrubando o modal
        setCameraContext();

        if (Capacitor.isPluginAvailable('VideoProcessor')) {
          const result = await VideoProcessor.capturePhoto({ quality: 'medium' });
          rawPath = result?.filePath;
        } else {
          // iOS
          const photo = await CapCamera.getPhoto({
            quality: 70,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            correctOrientation: true,
            saveToGallery: false,
            presentationStyle: 'fullscreen',
          });
          rawPath = photo?.path || photo?.webPath;
        }

        clearCameraContext();

        if (rawPath) {
          // Guarda em localStorage antes da compressão async (sobrevive OOM kill e remount)
          savePendingPhoto(rawPath, filename);
          await processAndAdd(rawPath, filename);
          clearPendingPhoto(); // limpa após sucesso
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => handleFileChange(e);
        input.click();
      }
    } catch (err) {
      clearCameraContext();
      if (!isUserCancelled(err))
        toast({ title: 'Não foi possível abrir a câmera', variant: 'destructive' });
    } finally {
      takingPhotoRef.current = false;
      setAddingPhoto(false);
    }
  }, [canAdd, processAndAdd, handleFileChange, toast]);

  // ── Galeria ─────────────────────────────────────────────────────────────
  // Android + iOS: CapCamera.getPhoto com source Photos + Uri
  // Web           : <input type="file" multiple>
  const handleGallery = useCallback(async () => {
    if (!canAdd || takingPhotoRef.current) return;
    takingPhotoRef.current = true;
    setAddingPhoto(true);
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera')) {
        const ts = Date.now();
        const filename = `gallery_${ts}.jpg`;

        setCameraContext();

        const photo = await CapCamera.getPhoto({
          source: CameraSource.Photos,
          resultType: CameraResultType.Uri,
          quality: 100,
          width: 0,
          height: 0,
          correctOrientation: true,
          presentationStyle: 'fullscreen',
        });

        clearCameraContext();

        const rawPath = photo?.path || photo?.webPath;
        if (rawPath) {
          savePendingPhoto(rawPath, filename);
          await processAndAdd(rawPath, filename);
          clearPendingPhoto();
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      clearCameraContext();
      if (!isUserCancelled(err))
        toast({ title: 'Não foi possível abrir a galeria', variant: 'destructive' });
    } finally {
      takingPhotoRef.current = false;
      setAddingPhoto(false);
    }
  }, [canAdd, processAndAdd, toast]);

  // ── Remover foto ────────────────────────────────────────────────────────
  const removePhoto = useCallback((id) => {
    setPhotoItems((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // Limpa todas as fotos (chamar ao fechar/submeter o modal)
  const clearPhotos = useCallback(() => {
    setPhotoItems((prev) => {
      prev.forEach((item) => {
        if (item?.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
    clearPendingPhoto();
  }, []);

  // ── Resolve para upload ─────────────────────────────────────────────────
  // Chame APENAS no momento do submit — garante que o arquivo está disponível
  const resolveForUpload = useCallback(
    () => resolveItemsForUpload(photoItems),
    [photoItems]
  );

  return {
    photoItems,
    addingPhoto,
    canAdd,
    handleCamera,
    handleGallery,
    removePhoto,
    clearPhotos,
    resolveForUpload,
    fileInputRef,
    handleFileChange,
  };
};
