import { FileText, FolderOpen, Image as ImageIcon, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ObraGallery({ galleries, documents, emptyMessage, embedded = false, onOpenViewer, canAdd = false, onAdd }) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-6" : "bg-card rounded-lg border p-6";
  const groups = Array.isArray(galleries) ? galleries : [];
  const docs = Array.isArray(documents) ? documents : [];

  return (
    <Container className={containerClassName}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Galeria e Documentos</h2>
        </div>
        {canAdd ? (
          <Button size="sm" variant="outline" onClick={onAdd}>
            Adicionar
          </Button>
        ) : null}
      </div>

      {groups.length === 0 && docs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>{emptyMessage || "Nenhuma mídia registrada"}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const items = Array.isArray(g.items) ? g.items : [];
            const displayItems = items.slice(0, 4);
            const hasMore = items.length > 4;

            return (
              <div key={g.name}>
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span>{g.name}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {displayItems.map((item, idx) => (
                    <button key={item.id} type="button" className="text-left" onClick={() => onOpenViewer?.(items, idx)}>
                      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border">
                        {item.type === "video" || item.type === "video_url" ? (
                          <div className="w-full h-full flex items-center justify-center bg-foreground/90">
                            <Video className="h-8 w-8 text-background/80" />
                          </div>
                        ) : (
                          <img src={item.url} alt={item.name || "Mídia"} className="w-full h-full object-cover" />
                        )}
                      </div>
                    </button>
                  ))}
                  {hasMore ? (
                    <Button type="button" variant="outline" className="h-full" onClick={() => onOpenViewer?.(items, 4)}>
                      Ver todas
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {docs.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" />
                <span>Documentos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{doc.name || "Documento"}</div>
                      {doc.date ? <div className="text-xs text-muted-foreground">{doc.date}</div> : null}
                    </div>
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
