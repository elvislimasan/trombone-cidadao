import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { Play, Image } from "lucide-react";
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
  const { thumbnailUrl: firstVideoThumb } = useVideoThumbnail(firstIsVideo ? firstMedia.url : null);

  if (!hasMedia) return <div className="flex flex-wrap items-center gap-2 px-4 pb-4"><span className="text-sm font-semibold text-content-secondary">{getCategoryName(category)}</span><StatusBadge status={status} size="md" withIcon /></div>;

  return (
    <>
      <div className="relative overflow-hidden">
        {/* A capa compacta deixa o resumo e a participação próximos no celular. */}
        <div className="w-full max-w-full aspect-[4/3] lg:aspect-[16/10] bg-surface-sunken relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[length:20px_20px]" />
          {hasMedia ? (
            <button
              type="button"
              aria-label={firstIsVideo ? "Abrir vídeo da bronca" : "Ampliar foto da bronca"}
              className="absolute inset-0 w-full h-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-brand focus-visible:-outline-offset-4"
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
                    <div className="absolute inset-0 flex items-center justify-center"><Play className="h-12 w-12 rounded-full bg-black/50 p-3 text-white" aria-hidden="true" /></div>
                  </div>
                ) : (
                  <div className="relative h-full w-full bg-surface-sunken">
                    <video src={firstMedia.url} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />
                    <div className="absolute inset-0 flex items-center justify-center"><Play className="h-12 w-12 rounded-full bg-black/50 p-3 text-white" aria-hidden="true" /></div>
                  </div>
                )
              ) : <img src={firstMedia.url} alt="Foto do problema relatado" className="h-full w-full object-cover" />}
            </button>
          ) : null}
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
          className="inline-flex min-h-12 items-center rounded-xl px-2 text-xs font-semibold text-brand hover:underline"
        >
          Ver todas ({viewerMedia.length})
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {viewerMedia.slice(1, 8).map((m, idx) => (
          <button
            key={`${m.type}-${m.url}-${idx}`}
            aria-label={`Abrir evid?ncia ${idx + 2}`}
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
