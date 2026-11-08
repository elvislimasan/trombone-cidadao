import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Download, Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStoryExport } from '@/hooks/useStoryExport';
import { toDataUri } from '@/lib/storyAssets';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import ObraDelayStoryCard, { DELAY_STORY_MODELS, DELAY_STORY_THEMES } from './ObraDelayStoryCard';

export default function ObraDelayStoryModal({ computed, work, phaseName, shareUrl, photoUrl, onClose }) {
  const { resolved } = useTheme();
  const [appearance, setAppearance] = useState(() => resolved === 'dark' ? 'dark' : 'light');
  const [model, setModel] = useState('impacto');
  const [useFeaturedImage, setUseFeaturedImage] = useState(true);
  const hasFeaturedImage = Boolean(photoUrl || work.thumbnail_url);
  const [qr, setQr] = useState({ url: '', error: false });
  const [assets, setAssets] = useState({ logoUrl: '', photoUrl: '', ready: false, error: false });
  const [assetAttempt, setAssetAttempt] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [previewNode, setPreviewNode] = useState(null);
  const [previewScale, setPreviewScale] = useState(0.25);
  useEffect(() => {
    if (!previewNode) return;
    const observer = new ResizeObserver(entries => setPreviewScale(entries[0].contentRect.width / 1080));
    observer.observe(previewNode);
    return () => observer.disconnect();
  }, [previewNode]);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(shareUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#17202b', light: '#ffffff' } })
      .then(url => { if (active) setQr({ url, error: false }); })
      .catch(() => { if (active) setQr({ url: '', error: true }); });
    return () => { active = false; };
  }, [shareUrl]);
  useEffect(() => {
    let active = true;
    setAssets({ logoUrl: '', photoUrl: '', ready: false, error: false });
    Promise.all([
      toDataUri('/logo.png'),
      toDataUri(photoUrl || work.thumbnail_url),
      document.fonts.load('96px TromboneStory').then(fonts => fonts.length > 0),
    ]).then(([logoUrl, photoUrl, fontReady]) => {
      if (active) setAssets({ logoUrl, photoUrl, ready: Boolean(logoUrl && fontReady), error: !logoUrl || !fontReady });
    }).catch(() => { if (active) setAssets({ logoUrl: '', photoUrl: '', ready: false, error: true }); });
    return () => { active = false; };
  }, [photoUrl, work.thumbnail_url, assetAttempt]);
  const { exportRef, baixando, compartilhando, ocupado, baixar, compartilhar, podeCompartilhar, viaInstagram } = useStoryExport({
    nomeArquivo: `atrasometro-${String(work.id).replace(/[^a-z0-9-]/gi, '')}-${model}-${appearance}${useFeaturedImage ? '' : '-sem-foto'}`,
    shareUrl, pronto: Boolean(qr.url) && assets.ready, pixelRatio: 1,
    backgroundColor: DELAY_STORY_THEMES[appearance].background,
    contentId: work.id,
    aoConcluirShare: onClose,
  });
  const data = { model, appearance, computed, title: work.title, location: [work.city, work.state].filter(Boolean).join(' · '), phaseName, qrCode: qr.url, logoUrl: assets.logoUrl, photoUrl: useFeaturedImage ? assets.photoUrl : '' };

  return <Dialog open onOpenChange={open => { if (!open && !ocupado) onClose(); }}>
    {/* Exceção intencional: seletor de arte em diálogo com largura limitada. */}
    <DialogContent className="max-h-[94dvh] w-[calc(100%-24px)] max-w-4xl overflow-y-auto rounded-2xl p-4 sm:p-6" onEscapeKeyDown={event => { if (ocupado) event.preventDefault(); }} onPointerDownOutside={event => { if (ocupado) event.preventDefault(); }}>
      <DialogHeader className="pr-8 text-left">
        <DialogTitle>Arte para story</DialogTitle>
        <DialogDescription className="sr-only">Escolha um modelo para baixar ou compartilhar a arte da obra em PNG, 1080 por 1920 pixels.</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] sm:items-center">
        <div className="flex min-w-0 justify-center rounded-xl bg-surface-sunken p-3" aria-label={`Prévia do modelo ${DELAY_STORY_MODELS.find(item => item.id === model).name}`}>
          <div ref={setPreviewNode} className="relative overflow-hidden rounded-lg shadow-lg" style={{ width: 270, maxWidth: '100%', aspectRatio: '9 / 16' }}>
            <div style={{ width: 1080, height: 1920, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}><ObraDelayStoryCard {...data} /></div>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-edge-default p-3 text-sm font-semibold">
            <input type="checkbox" name="delay-story-featured-image" checked={useFeaturedImage && hasFeaturedImage} disabled={ocupado || !hasFeaturedImage} onChange={event => { setUseFeaturedImage(event.target.checked); setDownloaded(false); }} className="h-4 w-4 accent-brand" />
            Usar imagem de destaque
          </label>
          <fieldset disabled={ocupado}>
            <legend className="mb-2 text-sm font-semibold">Tema da arte</legend>
            <div className="grid grid-cols-2 gap-2">
              {[['light', 'Claro'], ['dark', 'Escuro']].map(([id, name]) => <label key={id} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold focus-within:ring-2 focus-within:ring-brand ${appearance === id ? 'border-brand bg-brand/5' : 'border-edge-default'}`}>
                <input type="radio" name="delay-story-appearance" value={id} checked={appearance === id} onChange={() => { setAppearance(id); setDownloaded(false); }} className="accent-brand" />{name}
              </label>)}
            </div>
          </fieldset>
          <fieldset disabled={ocupado} className="space-y-2">
            <legend className="mb-3 text-sm font-semibold">Modelo</legend>
            {DELAY_STORY_MODELS.map(item => <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-brand ${model === item.id ? 'border-brand bg-brand/5' : 'border-edge-default'}`}>
              <input className="h-4 w-4 accent-brand" type="radio" name="delay-story-model" value={item.id} checked={model === item.id} onChange={() => { setModel(item.id); setDownloaded(false); }} />
              <span className="flex h-10 w-10 shrink-0 items-end rounded-lg p-1.5" style={{ background: DELAY_STORY_THEMES[appearance].background }}><span style={{ background: item.accent, height: 8, width: '100%', borderRadius: 2 }} /></span>
              <span className="flex-1 text-sm font-semibold">{item.name}</span>
              {model === item.id && <Check className="h-4 w-4 text-brand" aria-hidden="true" />}
            </label>)}
          </fieldset>
          <p className="text-xs text-content-secondary">PNG · 1080 × 1920</p>
          {qr.error && <p role="alert" className="text-sm text-danger">Não foi possível preparar o QR Code. Feche e tente novamente.</p>}
          {assets.error && <p role="alert" className="text-sm text-danger">Não foi possível carregar o logo ou a fonte da arte.</p>}
          <Button variant={podeCompartilhar && !assets.error ? 'outline' : 'default'} className="min-h-12 w-full gap-2" disabled={ocupado || !qr.url || (!assets.ready && !assets.error)} onClick={async () => { if (assets.error) { setAssetAttempt(value => value + 1); return; } setDownloaded(false); if (await baixar()) setDownloaded(true); }}>
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {baixando ? 'Gerando PNG…' : assets.error ? 'Tentar novamente' : 'Baixar arte'}
          </Button>
          {podeCompartilhar && <Button className="min-h-12 w-full gap-2" disabled={ocupado || !qr.url || !assets.ready} onClick={() => { setDownloaded(false); void compartilhar(); }}>
            {compartilhando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {compartilhando ? 'Enviando…' : viaInstagram ? 'Compartilhar' : 'Publicar no story'}
          </Button>}
          <p role="status" className="text-sm text-content-secondary">{downloaded ? 'Arte salva. Pronta para postar no story.' : (!qr.url || !assets.ready) && !qr.error && !assets.error ? 'Preparando arte…' : ''}</p>
        </div>
      </div>
      <div aria-hidden="true" style={{ position: 'fixed', left: -9999, top: 0, width: 1080, height: 1920, pointerEvents: 'none' }}><ObraDelayStoryCard ref={exportRef} {...data} /></div>
    </DialogContent>
  </Dialog>;
}
