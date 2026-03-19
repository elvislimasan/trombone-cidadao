import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Hash, FolderOpen, Pencil } from "lucide-react";

const statusConfig = {
  planned: { label: "Planejamento", className: "bg-blue-100 text-blue-700", headerClassName: "bg-blue-500/25 text-blue-100" },
  tendered: { label: "Em Licitação", className: "bg-amber-100 text-amber-700", headerClassName: "bg-amber-500/25 text-amber-100" },
  "in-progress": { label: "Em Execução", className: "bg-emerald-100 text-emerald-700", headerClassName: "bg-emerald-500/25 text-emerald-100" },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary", headerClassName: "bg-white/15 text-white" },
  stalled: { label: "Paralisada", className: "bg-muted text-muted-foreground", headerClassName: "bg-white/10 text-white/80" },
  unfinished: { label: "Inacabada", className: "bg-muted text-muted-foreground", headerClassName: "bg-white/10 text-white/80" },
};

export function ObraCurrentPhase({ phase, category, onEdit, isAdmin = false, embedded = false }) {
  if (!phase) return null;

  const statusInfo = statusConfig[phase.status] || statusConfig.planned;
  const hasContractorName = Boolean(phase.contractor?.name);
  const hasCnpj = Boolean(phase.contractor?.cnpj);
  const hasCategory = Boolean(category);
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "px-6 pb-6" : "bg-card rounded-xl border border-border overflow-hidden ";
  const hasAnyCard = hasContractorName || hasCnpj || hasCategory;
  const hasMeta = Boolean(phase.contractNumber || phase.biddingProcessNumber || phase.portalLink);
  const bodyClassName = embedded ? "pt-6 lg:pt-5 2xl:pt-6" : "p-4 sm:p-5 lg:p-4 2xl:p-6";

  return (
    <Container className={containerClassName}>
      <div className={embedded ? "-mx-6" : ""}>
        <div className="rounded-t-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 lg:px-5 2xl:px-6 py-4 sm:py-5 lg:py-4 2xl:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-white/70">Fase Atual</div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg lg:text-base 2xl:text-xl font-bold text-white leading-tight break-words">{phase.name}</h2>
                <Badge className={`${statusInfo.headerClassName || statusInfo.className} border-none`} variant="secondary">
                  {statusInfo.label}
                </Badge>
              </div>
            </div>

            {isAdmin ? (
              <>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={onEdit}
                  className="h-9 w-9 sm:hidden border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  aria-label="Editar fase atual"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="hidden sm:inline-flex gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              </>
            ) : null}
          </div>

          {hasMeta ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 lg:px-3 lg:py-2.5 text-sm lg:text-xs 2xl:text-sm text-white/80">
              <div className="flex flex-col sm:justify-between sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4">
                {phase.contractNumber ? (
                  <div>
                    Contrato: <span className="font-semibold text-white">{phase.contractNumber}</span>
                  </div>
                ) : null}
                {phase.biddingProcessNumber ? (
                  <div>
                    Processo: <span className="font-semibold text-white">{phase.biddingProcessNumber}</span>
                  </div>
                ) : null}
                {phase.portalLink ? (
                  <a
                    href={phase.portalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white underline underline-offset-2"
                  >
                    Portal da Transparência
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={bodyClassName}>
        {phase.description ? (
          <p className="text-sm lg:text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line mb-4 sm:mb-6 lg:mb-4 2xl:mb-6">
            {phase.description}
          </p>
        ) : null}

        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Execução e Responsáveis
        </div>

        {hasAnyCard ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-3 2xl:gap-4">
            {hasContractorName ? (
              <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-red-500" />
                  <span className="text-xs uppercase tracking-wide">Contratada</span>
                </div>
                <div className="font-semibold text-sm lg:text-[13px] leading-snug break-words mt-3 sm:mt-2 lg:mt-2">{phase.contractor?.name}</div>
              </div>
            ) : null}

            {hasCnpj ? (
              <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="h-4 w-4 text-red-500" />
                  <span className="text-xs uppercase tracking-wide">CNPJ</span>
                </div>
                <div className="font-semibold text-sm lg:text-[13px] leading-snug break-words mt-3 sm:mt-2 lg:mt-2">{phase.contractor?.cnpj}</div>
              </div>
            ) : null}

            {hasCategory ? (
              <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4 text-red-500" />
                  <span className="text-xs uppercase tracking-wide">Categoria</span>
                </div>
                <div className="font-semibold text-sm lg:text-[13px] leading-snug break-words mt-3 sm:mt-2 lg:mt-2">{category}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">Sem informações nesta seção.</div>
        )}
      </div>
    </Container>
  );
}
