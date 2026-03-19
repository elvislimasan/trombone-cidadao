import { ArrowLeft, Heart, Share2, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusStyles = {
  planned: "bg-blue-100 text-blue-700",
  tendered: "bg-amber-100 text-amber-700",
  "in-progress": "bg-emerald-100 text-emerald-700",
  completed: "bg-primary/10 text-primary",
  stalled: "bg-muted text-muted-foreground",
  unfinished: "bg-muted text-muted-foreground",
};

const statusLabels = {
  planned: "Planejamento",
  tendered: "Licitação",
  "in-progress": "Execução",
  completed: "Concluída",
  stalled: "Paralisada",
  unfinished: "Inacabada",
};

export function ObraHeader({
  title,
  subtitle,
  status,
  category,
  backTo = "/obras-publicas",
  isAdmin = false,
  onManage,
  onShare,
  isFavorited = false,
  onFavoriteToggle,
}) {
  const statusClass = statusStyles[status] || "bg-muted text-muted-foreground";
  const statusLabel = statusLabels[status] || "Status";

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-card text-foreground border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button asChild size="icon" variant="outline" className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl shrink-0">
              <Link to={backTo} aria-label="Voltar">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>
            </Button>
            <span className="hidden sm:inline text-sm font-bold tracking-wider text-muted-foreground truncate">
              Voltar para mapa de obras
            </span>
            <span className="sm:hidden text-[11px] font-bold tracking-wider text-muted-foreground truncate max-w-[160px]">
              Voltar para obras
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isAdmin ? (
              <>
                <Button
                  onClick={onManage}
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl sm:hidden"
                  aria-label="Gerenciar"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button onClick={onManage} variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Settings className="w-4 h-4 mr-2" />
                  Gerenciar
                </Button>
              </>
            ) : null}

            <Button
              onClick={onShare}
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl sm:hidden"
              aria-label="Compartilhar"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <Button onClick={onShare} variant="outline" className="hidden sm:inline-flex rounded-full h-10 px-4">
              <Share2 className="w-4 h-4 mr-2" />
              <span className="font-medium">Compartilhar</span>
            </Button>

            <Button
              onClick={onFavoriteToggle}
              variant="outline"
              size="icon"
              className={`h-9 w-9 rounded-xl sm:hidden ${isFavorited ? "bg-muted" : ""}`}
              aria-label={isFavorited ? "Remover dos favoritos" : "Favoritar"}
            >
              <Heart className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
            </Button>
            <Button
              onClick={onFavoriteToggle}
              variant="outline"
              className={`hidden sm:inline-flex rounded-full h-10 px-4 ${isFavorited ? "bg-muted" : ""}`}
            >
              <Heart className={`w-4 h-4 mr-2 ${isFavorited ? "fill-current" : ""}`} />
              <span className="font-medium">Favoritar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card text-foreground border-b border-border">
        <div className="container mx-auto px-4 py-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <Link to="/" className="hover:text-primary transition-colors">
            Início
          </Link>
          <span className="opacity-50">›</span>
          <Link to={backTo} className="hover:text-primary transition-colors">
            Obras Públicas
          </Link>
          <span className="opacity-50">›</span>
          <span className="text-foreground truncate max-w-[300px]">{title}</span>
        </div>
      </div>
    </header>
  );
}
