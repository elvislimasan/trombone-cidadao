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
      <div className="bg-primary text-primary-foreground shadow-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="icon" variant="ghost" className="h-10 w-10 rounded-xl hover:bg-primary-foreground/10">
              <Link to={backTo} aria-label="Voltar">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <span className="text-xs sm:text-sm font-bold tracking-wider text-primary-foreground/80">
              Voltar para mapa de obras
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button onClick={onManage} variant="ghost" size="sm" className="ml-2 flex">
                <Settings className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Gerenciar</span>
              </Button>
            )}

            <Button onClick={onShare} variant="ghost" className="rounded-full h-12 w-12 sm:h-10 sm:w-auto sm:px-4">
              <Share2 className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline font-medium">Compartilhar</span>
            </Button>

            <Button
              onClick={onFavoriteToggle}
              variant="ghost"
              className={`rounded-full h-12 w-12 sm:h-10 sm:w-auto sm:px-4 ${
                isFavorited ? "bg-primary-foreground/10 text-primary-foreground" : "text-primary-foreground"
              }`}
            >
              <Heart className={`w-5 h-5 sm:mr-2 ${isFavorited ? "fill-current" : ""}`} />
              <span className="hidden sm:inline font-medium">Favoritar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="hidden lg:block bg-card text-foreground border-b border-border">
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

      <div className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass} variant="secondary">
              {statusLabel}
            </Badge>
            {category ? (
              <Badge variant="outline" className="text-muted-foreground border-border bg-muted/40">
                {category}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
          </div>
        </div>
      </div>
    </header>
  );
}

