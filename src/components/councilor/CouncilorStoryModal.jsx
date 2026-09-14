import { useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2, Send, X } from 'lucide-react';

import { STORY_HEIGHT, STORY_WIDTH, useStoryExport } from '@/hooks/useStoryExport';
import { URL_FUNDO_VEREADOR, toDataUri } from '@/lib/storyAssets';
import CouncilorStoryCard from './CouncilorStoryCard';

export default function CouncilorStoryModal({ councilor, cityName, streetCount, reportCount, streetNames, shareUrl, onClose }) {
  const [assets, setAssets] = useState({ photoUrl: '', logoUrl: '', backgroundUrl: '', ready: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      toDataUri(councilor?.photo_url),
      toDataUri('/logo.png'),
      toDataUri(URL_FUNDO_VEREADOR),
    ]).then(([photoUrl, logoUrl, backgroundUrl]) => {
      if (active) setAssets({ photoUrl, logoUrl, backgroundUrl, ready: true });
    });
    return () => { active = false; };
  }, [councilor?.photo_url]);

  const { exportRef, baixando, compartilhando, ocupado, baixar, compartilhar, podeCompartilhar } = useStoryExport({
    nomeArquivo: `vereador-${councilor?.slug || 'perfil'}`,
    shareUrl,
    contentId: councilor?.id,
    pronto: assets.ready,
  });

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const cardProps = { councilor, cityName, streetCount, reportCount, streetNames, shareUrl, photoUrl: assets.photoUrl, logoUrl: assets.logoUrl, backgroundUrl: assets.backgroundUrl };

  return (
    <div className="fixed inset-0 z-[1005] flex bg-surface-base md:items-center md:justify-center md:bg-black/60 md:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="councilor-story-title" className="flex h-full min-h-0 w-full flex-col bg-surface-base md:h-[calc(100vh-3rem)] md:max-h-[800px] md:max-w-[30rem] md:overflow-hidden md:rounded-3xl md:border md:border-edge-subtle md:shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-edge-subtle px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pt-4">
          <div className="min-w-0"><h2 id="councilor-story-title" className="text-lg font-extrabold leading-tight text-content-primary">Card do perfil legislativo</h2><p className="mt-0.5 text-sm text-content-secondary">Pronto para publicar em story, Direct ou outras redes</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-secondary active:bg-surface-subtleHover"><X size={22} /></button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,rgba(220,38,38,.08),transparent_45%)] p-4">
          <div className="relative shrink-0 overflow-hidden rounded-[1.25rem] shadow-[0_30px_80px_rgba(0,0,0,0.45)]" style={{ width: STORY_WIDTH * 0.24, height: STORY_HEIGHT * 0.24 }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: STORY_WIDTH, height: STORY_HEIGHT, transform: 'scale(0.24)' }}><CouncilorStoryCard {...cardProps} /></div>
            {!assets.ready && <div className="absolute inset-0 flex items-center justify-center bg-slate-950"><Loader2 className="h-7 w-7 animate-spin text-white" /></div>}
          </div>
        </div>

        <div className="border-t border-edge-subtle px-5 pt-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
          <div className="flex gap-2.5">
            <button type="button" onClick={copy} disabled={ocupado} aria-label={copied ? 'Link copiado' : 'Copiar link'} title={copied ? 'Link copiado' : 'Copiar link'} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-edge-default text-content-primary disabled:opacity-50">{copied ? <Check size={19} /> : <Copy size={19} />}</button>
            <button type="button" onClick={baixar} disabled={ocupado || !assets.ready} aria-label="Baixar card" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-edge-default text-content-primary disabled:opacity-50">{baixando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}</button>
            <button type="button" onClick={compartilhar} disabled={ocupado || !assets.ready} className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-bold text-content-onBrand transition-transform active:scale-[.98] disabled:opacity-50">{compartilhando ? <><Loader2 size={16} className="animate-spin" />Enviando...</> : <><Send size={16} />{podeCompartilhar ? 'Publicar card' : 'Baixar card'}</>}</button>
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', left: -9999, top: 0, width: STORY_WIDTH, height: STORY_HEIGHT, overflow: 'hidden', pointerEvents: 'none' }}><CouncilorStoryCard ref={exportRef} {...cardProps} /></div>
    </div>
  );
}
