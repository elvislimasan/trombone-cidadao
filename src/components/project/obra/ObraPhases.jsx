import { useMemo } from "react";
import { Building2, Calendar, FileText, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const statusConfig = {
  planned: { label: "Planejamento", className: "bg-blue-100 text-blue-700" },
  tendered: { label: "Em Licitação", className: "bg-amber-100 text-amber-700" },
  "in-progress": { label: "Em Execução", className: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary" },
  stalled: { label: "Paralisada", className: "bg-muted text-muted-foreground" },
  unfinished: { label: "Inacabada", className: "bg-muted text-muted-foreground" },
};

export function ObraPhases({ phases, currentPhaseId, onOpenDetails }) {
  const list = Array.isArray(phases) ? phases : [];
  const historicalPhases = useMemo(() => {
    const filtered = list.filter((p) => p.id !== currentPhaseId);
    return filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [currentPhaseId, list]);

  const formatDateDisplay = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };

  return (
    <section id="historico-licitacoes" className="bg-card rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 scroll-mt-24">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Histórico de Licitações</h2>
      </div>

      {historicalPhases.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma licitação anterior registrada</p>
          <p className="text-sm">Esta é a primeira licitação desta obra</p>
        </div>
      ) : (
        <div className="relative pl-5 sm:pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
          <div className="space-y-4">
            {historicalPhases.map((phase) => {
              const statusInfo = statusConfig[phase.status] || statusConfig.planned;
              const executionValue = Math.max(0, Math.min(100, Number(phase.executionPercentage) || 0));
              const startDate = phase.startDate || phase.predictedStartDate || null;
              const endDate = phase.endDate || phase.expectedEndDate || null;

              return (
                <div key={phase.id} className="relative">
                  <div className="absolute left-2 top-6 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary border-4 border-background" />

                  <div className="ml-4 bg-card rounded-xl border border-border overflow-hidden">
                    <div className="w-full text-left px-4 py-4 sm:py-3 bg-muted/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base leading-snug break-words">{phase.name}</span>
                            <Badge className={`${statusInfo.className} text-xs`} variant="secondary">
                              {statusInfo.label}
                            </Badge>
                          </div>
                          {phase.description ? (
                            <div className="text-sm text-muted-foreground mt-2 sm:mt-1 leading-relaxed line-clamp-2">
                              {phase.description}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-5 sm:py-4 border-t bg-background">
                      <div className="space-y-4 sm:space-y-3">
                        {phase.contractor?.name ? (
                          <div className="flex gap-3 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="text-muted-foreground leading-snug">Construtora</div>
                              <div className="font-semibold text-foreground leading-snug break-words">{phase.contractor.name}</div>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <div className="text-sm text-muted-foreground sm:w-[86px] shrink-0">Execução:</div>
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 min-w-0">
                              <Progress value={executionValue} className="h-2 bg-muted" indicatorClassName="bg-red-600" />
                            </div>
                            <div className="text-sm font-semibold text-foreground w-10 text-right shrink-0">
                              {Math.round(executionValue)}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Início:</span>
                            <span className="font-semibold text-foreground">{formatDateDisplay(startDate)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Término:</span>
                            <span className="font-semibold text-foreground">{formatDateDisplay(endDate)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 sm:mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <Button
                          variant="link"
                          size="sm"
                          className="text-primary p-0 h-auto whitespace-normal sm:whitespace-nowrap justify-start"
                          onClick={() => onOpenDetails?.(phase.id)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Ver Detalhes e Arquivos
                        </Button>

                        {phase.portalLink ? (
                          <a
                            href={phase.portalLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          >
                            Portal
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
