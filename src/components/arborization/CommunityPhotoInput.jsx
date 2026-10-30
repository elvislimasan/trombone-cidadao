import React, { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, Image as GalleryIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { openDeviceCamera, prefersBrowserCamera, prefersDeviceCamera } from '@/lib/deviceCamera';

const WebCameraCapture = lazy(() => import('@/components/WebCameraCapture'));

function NativePhotoActions({ onPhoto, onBusyChange, galleryRef, disabled }) {
  const cam = useNativeCamera({ maxPhotos: 2 });
  const handled = useRef(null);
  useEffect(() => { cam.fileInputRef.current = galleryRef.current; });
  useEffect(() => { onBusyChange(cam.addingPhoto); }, [cam.addingPhoto, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => {
    const latest = cam.photoItems.at(-1);
    if (!latest || latest.id === handled.current) return;
    handled.current = latest.id;
    onPhoto(latest.file || latest);
    // Conserva a anterior se a pessoa cancelar uma tentativa de trocar a foto.
    cam.photoItems.slice(0, -1).forEach(item => cam.removePhoto(item.id));
  }, [cam.photoItems, cam.removePhoto, onPhoto]);
  return <><Button type="button" variant="outline" disabled={disabled || !cam.canAdd} onClick={cam.handleCamera}>{cam.addingPhoto ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}Tirar foto</Button><Button type="button" variant="outline" disabled={disabled || !cam.canAdd} onClick={cam.handleGallery}><GalleryIcon size={17} />Galeria</Button></>;
}

export default function CommunityPhotoInput({ file, onChange, initialUrl, optional = false, onBusyChange, disabled = false }) {
  const id = useId(), galleryRef = useRef(null), cameraRef = useRef(null);
  const [preview, setPreview] = useState(''), [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false), [nativeBusy, setNativeBusy] = useState(false);
  const busy = cameraOpen || nativeBusy;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    // Caminhos nativos são exibidos diretamente. O File só é lido no envio,
    // quando o servidor de arquivos do Capacitor já teve tempo de disponibilizá-lo.
    if (file.nativePath) { setPreview(file.preview); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const accept = useCallback(next => {
    if (!next) return;
    if (!next.nativePath && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 5 * 1024 * 1024)) {
      setError('Escolha uma foto JPG, PNG ou WebP de até 5 MB.'); return;
    }
    setError(''); onChange(next);
  }, [onChange]);
  const selectFile = event => { const next = event.target.files?.[0]; event.target.value = ''; accept(next); };
  const takePhoto = () => {
    if (disabled || busy) return;
    setError('');
    // Mesmo comportamento da bronca: iOS web usa a câmera do aparelho;
    // Android com getUserMedia e desktop mantêm a captura dentro da página.
    if (prefersDeviceCamera() && !prefersBrowserCamera() && openDeviceCamera(cameraRef.current)) return;
    setCameraOpen(true);
  };
  return <div className="community-photo-input">
    <div className="community-photo-picker">{preview || initialUrl ? <img src={preview || initialUrl} alt="Prévia da foto escolhida" /> : <span className="community-photo-placeholder"><Camera size={32} /><strong>Fotografe a planta</strong><span>{optional ? 'Opcional · ' : ''}JPG, PNG ou WebP · até 5 MB</span></span>}</div>
    <input id={id} ref={galleryRef} aria-label="Escolher foto da planta na galeria" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={disabled || busy} />
    <input ref={cameraRef} aria-label="Câmera do aparelho" className="sr-only" type="file" accept="image/*" capture="environment" onChange={selectFile} disabled={disabled || busy} />
    <div className="community-photo-actions">{Capacitor.isNativePlatform() ? <NativePhotoActions onPhoto={accept} onBusyChange={setNativeBusy} galleryRef={galleryRef} disabled={disabled} /> : <><Button type="button" variant="outline" disabled={disabled || busy} onClick={takePhoto}><Camera size={17} />Tirar foto</Button><Button type="button" variant="outline" disabled={disabled || busy} onClick={() => galleryRef.current?.click()}><GalleryIcon size={17} />Galeria</Button></>}
      {file && optional && <button type="button" className="community-text-button" disabled={disabled || busy} onClick={() => { onChange(null); setError(''); }}>Remover foto</button>}
    </div>
    {nativeBusy && <p role="status" className="community-muted"><Loader2 size={16} className="animate-spin" />Preparando foto…</p>}
    {error && <p role="alert" className="community-error">{error}</p>}
    <Dialog open={cameraOpen} onOpenChange={setCameraOpen}><DialogContent hideClose className="community-camera-dialog"><DialogTitle className="sr-only">Tirar foto da planta</DialogTitle><DialogDescription className="sr-only">Enquadre a planta e toque em Capturar foto. Você também pode fechar para voltar ao formulário.</DialogDescription><Suspense fallback={<p role="status" className="community-camera-loading"><Loader2 className="animate-spin" />Abrindo câmera…</p>}><WebCameraCapture initialMode="photo" allowDeviceCamera={!prefersBrowserCamera()} onClose={() => setCameraOpen(false)} onCapture={({ file: photo }) => { accept(new File([photo], `planta-${Date.now()}.jpg`, { type: photo.type || 'image/jpeg' })); setCameraOpen(false); }} /></Suspense></DialogContent></Dialog>
  </div>;
}
