import { useEffect, useState } from "react";
import { MapPin, Play, Image } from "lucide-react";
import MediaViewer from "@/components/MediaViewer";
import StatusBadge from "@/design-system/primitives/StatusBadge";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 3 da fase 2).
// Redesenhado na task 4 da fase 2: badge de status (StatusBadge do design
// system) sobreposto no canto superior esquerdo da midia, e contador de fotos
// no canto inferior direito. bg-black/50 do contador e a unica cor fixa
// aceitavel aqui -- e um overlay sobre imagem/video, igual PlayBadge do
// FeedCardMedia.
// Bloco de midia da bronca: hero (capa) e galeria em grade ficam em posicoes
// diferentes da arvore (hero fora do card branco, galeria depois do resumo),
// por isso viram dois componentes -- igual ReportProblemDescription/Details
// na task 2. mediaViewerState fica levantado em ReportPage para os dois
// blocos e o MediaViewer (renderizado aqui, no Hero) compartilharem o mesmo
// estado. Nao decide nada de permissao -- so exibe o que vem em viewerMedia.

export const ReportMediaHero = ({
  viewerMedia,
  getCategoryName,
  category,
  status,
  mediaViewerState,
  setMediaViewerState,
}) => {
  const hasMedia = viewerMedia.length > 0;
  const firstMedia = hasMedia ? viewerMedia[0] : null;
  const firstIsVideo =
    firstMedia &&
    (firstMedia.type === "video" || firstMedia.type === "video_url");
  const [firstVideoThumb, setFirstVideoThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFirstVideoThumb(null);
    if (!firstIsVideo || !firstMedia?.url) return;
    try {
      const video = document.createElement("video");
      Object.assign(video, {
        crossOrigin: "anonymous",
        muted: true,
        playsInline: true,
        preload: "metadata",
      });
      video.addEventListener(
        "loadedmetadata",
        () => {
          const t = Math.min(0.2, Math.max(0.05, (video.duration || 1) * 0.1));
          video.addEventListener(
            "seeked",
            () => {
              try {
                const c = document.createElement("canvas");
                c.width = video.videoWidth || 1280;
                c.height = video.videoHeight || 720;
                c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
                if (!cancelled)
                  setFirstVideoThumb(c.toDataURL("image/jpeg", 0.7));
              } catch {}
            },
            { once: true }
          );
          try {
            video.currentTime = t;
          } catch {}
        },
        { once: true }
      );
      video.src = firstMedia.url;
    } catch {}
    return () => {
      cancelled = true;
    };
  }, [firstIsVideo, firstMedia?.url]);

  return (
    <>
      <div className="relative overflow-hidden">
        {/* aspect-[4/5] igual ao card do feed: a maioria das fotos de bronca
            vem do celular na vertical, e o h-[64vw] achatava demais. */}
        <div className="w-full max-w-full aspect-[4/5] sm:aspect-[4/3] lg:aspect-[16/10] bg-surface-sunken relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[length:20px_20px]" />
          {hasMedia ? (
            <button
              type="button"
              className="absolute inset-0 w-full h-full "
              onClick={() =>
                setMediaViewerState({ isOpen: true, startIndex: 0 })
              }
            >
              {firstIsVideo ? (
                firstVideoThumb ? (
                  <div className="w-full h-full relative">
                    <img
                      src={firstVideoThumb}
                      alt="Thumbnail do vídeo"
                      className="w-full h-full max-w-full object-cover rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-black/10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-black/30 border border-white/20 flex items-center justify-center">
                        <Play className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                    <Play className="w-10 h-10 text-white drop-shadow" />
                  </div>
                )
              ) : (
                <img
                  src={firstMedia.url}
                  alt="Mídia da bronca"
                  className="w-full h-full max-w-full object-cover"
                />
              )}
            </button>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-black/20 bg-black/20 flex items-center justify-center">
                <MapPin className="w-7 h-7 text-white/60" />
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-none">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-2xs font-bold uppercase tracking-[0.15em] bg-surface-raised/90 backdrop-blur-md text-content-primary shadow-elevation-1">
              {getCategoryName(category)}
            </span>
            <StatusBadge status={status} size="md" withIcon />
          </div>
          {hasMedia && viewerMedia.length > 1 && (
            <div className="absolute bottom-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white bg-black/50 pointer-events-none">
              <Image className="w-3.5 h-3.5" strokeWidth={1.75} />
              {viewerMedia.length}
            </div>
          )}
        </div>
      </div>

      {mediaViewerState.isOpen && viewerMedia.length > 0 && (
        <MediaViewer
          media={viewerMedia}
          startIndex={mediaViewerState.startIndex}
          onClose={() =>
            setMediaViewerState({ isOpen: false, startIndex: 0 })
          }
        />
      )}
    </>
  );
};

export const ReportMediaGallery = ({ viewerMedia, setMediaViewerState }) => {
  if (viewerMedia.length <= 1) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-content-primary flex items-center gap-1.5">
          <Image className="w-3.5 h-3.5 text-brand" strokeWidth={1.5} />
          Galeria
        </p>
        <button
          type="button"
          onClick={() =>
            setMediaViewerState({ isOpen: true, startIndex: 0 })
          }
          className="text-xs font-semibold text-brand hover:underline"
        >
          Ver todas ({viewerMedia.length})
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {viewerMedia.slice(1, 8).map((m, idx) => (
          <button
            key={`${m.type}-${m.url}-${idx}`}
            type="button"
            onClick={() =>
              setMediaViewerState({
                isOpen: true,
                startIndex: idx + 1,
              })
            }
            className="relative aspect-square rounded-xl overflow-hidden bg-surface-subtle hover:opacity-90 transition-opacity"
          >
            {m.type === "image" ? (
              <img
                src={m.url}
                alt="Mídia da bronca"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-black/40 border border-white/15 flex items-center justify-center">
                  <Play className="w-5 h-5 text-white" strokeWidth={1.5} />
                </div>
              </div>
            )}
            {idx === 6 && viewerMedia.length > 8 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-sm font-bold">+{viewerMedia.length - 8}</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ReportMediaHero;
