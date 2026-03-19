import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, Building2, Hash, FolderOpen, Pencil } from "lucide-react";

const statusConfig = {
  planned: { label: "Planejamento", className: "bg-blue-100 text-blue-700" },
  tendered: { label: "Em Licitação", className: "bg-amber-100 text-amber-700" },
  "in-progress": { label: "Em Execução", className: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary" },
  stalled: { label: "Paralisada", className: "bg-muted text-muted-foreground" },
  unfinished: { label: "Inacabada", className: "bg-muted text-muted-foreground" },
};

export function ObraCurrentPhase({ phase, category, onEdit, isAdmin = false, embedded = false }) {
  if (!phase) return null;

  const statusInfo = statusConfig[phase.status] || statusConfig.planned;
  const executionValue = Math.max(0, Math.min(100, Number(phase.executionPercentage) || 0));
  const hasContractorName = Boolean(phase.contractor?.name);
  const hasCnpj = Boolean(phase.contractor?.cnpj);
  const hasCategory = Boolean(category);
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-6 relative" : "bg-card rounded-lg border border-primary/20 p-6 relative";
  const hasAnyCard = hasContractorName || hasCnpj || hasCategory;

  return (
    <Container className={containerClassName}>
      <div className="flex flex-row items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* <Clock className="h-5 w-5 text-red-500 shrink-0" /> */}
            <h2 className="text-xl font-bold truncate">{phase.name}</h2>
          </div>
         
        </div>
        {isAdmin ? (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1  sm:w-auto">
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline-block">Editar</span>
          </Button>
        ) : null}
      </div>

      {phase.description ? <p className="text-sm text-muted-foreground mb-4">{phase.description}</p> : null}

      {phase.contractNumber || phase.biddingProcessNumber || phase.portalLink ? (
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 text-sm mb-4">
          {phase.contractNumber ? (
            <div className="text-muted-foreground">
              Contrato: <span className="font-semibold text-foreground">{phase.contractNumber}</span>
            </div>
          ) : null}
          {phase.biddingProcessNumber ? (
            <div className="text-muted-foreground">
              Processo: <span className="font-semibold text-foreground">{phase.biddingProcessNumber}</span>
            </div>
          ) : null}
          {phase.portalLink ? (
            <a href={phase.portalLink} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              Portal da Transparência
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Execução e Responsáveis</h3>
        {hasAnyCard ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasContractorName ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-red-500" />
                  <span className="text-xs">Construtora</span>
                </div>
                <div className="font-semibold text-sm mt-2">{phase.contractor?.name}</div>
              </div>
            ) : null}

            {hasCnpj ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Hash className="h-4 w-4 text-red-500" />
                  <span className="text-xs">CNPJ</span>
                </div>
                <div className="font-semibold text-sm mt-2">{phase.contractor?.cnpj}</div>
              </div>
            ) : null}

            {hasCategory ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4 text-red-500" />
                  <span className="text-xs">Categoria</span>
                </div>
                <div className="font-semibold text-sm mt-2">{category}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem informações nesta seção.</div>
        )}
      </div>
    </Container>
  );
}
