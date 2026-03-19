import { ArrowUpRight, FileText, FolderOpen, Image as ImageIcon, Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export function ObraGallery({ galleries, documents, emptyMessage, embedded = false, onOpenViewer, canAdd = false, onAdd }) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-6" : "bg-card rounded-xl border border-slate-200 shadow-sm p-6";
  const groups = Array.isArray(galleries) ? galleries : [];
  const docs = Array.isArray(documents) ? documents : [];

  return (
    <Container className={containerClassName}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          
          <h2 className="text-lg font-semibold">Galeria e Documentos</h2>
        </div>
        {canAdd ? (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={onAdd} className="h-9 w-9 sm:hidden" aria-label="Adicionar">
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={onAdd} className="hidden sm:inline-flex">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        ) : null}
      </div>

      {groups.length === 0 && docs.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <ImageIcon className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm text-slate-500 font-medium">{emptyMessage || "Nenhuma mídia disponível"}</p>
          <p className="text-xs text-slate-400 mt-1">As fotos e vídeos desta obra aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const items = Array.isArray(g.items) ? g.items : [];
            const displayItems = items.slice(0, 4);
            const hasMore = items.length > 4;

            return (
              <div key={g.name}>
                <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <FolderOpen className="w-4 h-4 text-red-500" />
                  {g.name}
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {displayItems.map((item, idx) => (
                    <div key={item.id} className="group cursor-pointer" onClick={() => onOpenViewer?.(items, idx)}>
                      <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative bg-muted shadow-sm border border-border">
                        {["video", "video_url"].includes(item.type) ? (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900">
                            <Video className="w-10 h-10 text-white/80 group-hover:scale-110 transition-transform" />
                          </div>
                        ) : (
                          <img
                            src={item.url}
                            alt={item.description || item.name || "Foto da obra"}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      </div>
                      <p className="text-xs text-red-600 font-semibold pl-1">{item.created_at ? formatDate(item.created_at) : "Data não informada"}</p>
                    </div>
                  ))}

                  {hasMore ? (
                    <div
                      className="aspect-[4/3] rounded-xl bg-red-50 border-2 border-dashed border-red-200 flex flex-col items-center justify-center cursor-pointer hover:bg-red-100 transition-colors group"
                      onClick={() => onOpenViewer?.(items, 4)}
                    >
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-2 group-hover:bg-red-200 transition-colors">
                        <FolderOpen className="w-5 h-5 text-red-600" />
                      </div>
                      <span className="text-sm font-bold text-red-700">Ver todas</span>
                      <span className="text-xs text-red-500 font-medium">+{items.length - 4} fotos</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {docs.length > 0 ? (
            <div>
              <h4 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 uppercase tracking-wide text-xs">
                <FileText className="w-4 h-4 text-red-500" /> Documentos
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center p-3 rounded-xl border border-border hover:border-red-200 hover:bg-red-50/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-500 mr-3 shrink-0 group-hover:bg-red-100 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-red-700 transition-colors">
                        {doc.title || doc.name || "Documento sem título"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{doc.created_at ? formatDate(doc.created_at) : "Data não informada"}</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 ml-auto group-hover:text-red-400 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Container>
  );
}
