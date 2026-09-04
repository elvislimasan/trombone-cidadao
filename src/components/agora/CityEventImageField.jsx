import { Camera, Image as GalleryIcon, Loader2, X } from 'lucide-react';

import { useNativeCamera } from '@/hooks/useNativeCamera';

// A foto opcional do acontecimento.
//
// POR QUE `useNativeCamera` E NÃO UM `<input type="file">`
//
// O CLAUDE.md do projeto é explícito: qualquer captura precisa funcionar nos
// dois sistemas, e `<input capture>` no Android abre um Intent separado que
// pausa a Activity e pode perder o estado do formulário — que aqui é um
// formulário longo, com áreas escolhidas uma a uma. O hook já resolve os três
// caminhos (VideoProcessor no Android, CapCamera no iOS, input no web) e
// sobrevive ao OOM kill via `appRestoredResult`.
//
// POR QUE O CAMPO NÃO TEM ESTADO PRÓPRIO
//
// A foto escolhida vive dentro do hook (`photoItems`), e o formulário só
// pergunta por ela na hora de salvar (`resolveForUpload`). Duplicar num
// `useState` do pai criaria duas verdades sobre "qual é a foto" — e a que o
// upload usaria seria a do hook, não a que a tela mostra.

const CityEventImageField = ({ cam, imagemAtual, aoRemoverAtual }) => {
  const item = cam.photoItems[0];
  // A foto já salva só aparece enquanto ninguém escolheu outra: mostrar as duas
  // faria a pessoa achar que o acontecimento vai ficar com duas imagens.
  const mostrandoAtual = !item && imagemAtual;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-content-primary">Imagem</span>
        <span className="text-xs text-content-tertiary">opcional</span>
      </div>

      {/* O input do fallback web precisa existir no DOM para o hook clicá-lo. */}
      <input
        type="file"
        accept="image/*"
        ref={cam.fileInputRef}
        onChange={cam.handleFileChange}
        className="hidden"
      />

      <div className="flex flex-wrap items-start gap-2">
        {(item || mostrandoAtual) && (
          <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl bg-surface-sunken">
            <img
              src={item ? item.preview : imagemAtual}
              alt=""
              className="block h-full w-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <button
              type="button"
              aria-label="Remover imagem"
              onClick={() => (item ? cam.removePhoto(item.id) : aoRemoverAtual?.())}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 transition-transform active:scale-90"
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        )}

        {cam.addingPhoto && (
          <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken">
            <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
          </div>
        )}

        {cam.canAdd && !cam.addingPhoto && (
          <>
            <button
              type="button"
              onClick={cam.handleCamera}
              className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand/30 bg-brand-subtleBg transition-colors hover:border-brand/60 active:scale-95"
            >
              <Camera className="h-5 w-5 text-brand-subtleFg" />
              <span className="text-[10px] font-bold text-brand-subtleFg">Câmera</span>
            </button>
            <button
              type="button"
              onClick={cam.handleGallery}
              className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-edge-default bg-surface-sunken transition-colors hover:border-edge-strong active:scale-95"
            >
              <GalleryIcon className="h-5 w-5 text-content-tertiary" />
              <span className="text-[10px] font-bold text-content-secondary">Galeria</span>
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-content-tertiary">
        Aparece no topo do acontecimento e no cartão em destaque. Sem imagem, o alerta sai só com
        o ícone do tipo — o que é suficiente e não atrasa a publicação.
      </p>
    </div>
  );
};

export { useNativeCamera };
export default CityEventImageField;
