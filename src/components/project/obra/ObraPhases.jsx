import { History, FileText, HistoryIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const historicalPhases = list.filter((p) => p.id !== currentPhaseId);

  return (
    <section id="historico-licitacoes" className="bg-card rounded-xl border border-slate-200 shadow-sm p-6 scroll-mt-24">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold ">Histórico de Licitações</h2>
      
      </div>

      {historicalPhases.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma licitação anterior registrada</p>
          <p className="text-sm">Esta é a primeira licitação desta obra</p>
        </div>
      ) : (
        <div className="divide-y border rounded-lg overflow-hidden">
          {historicalPhases.map((phase) => {
            const statusInfo = statusConfig[phase.status] || statusConfig.planned;
            return (
              <div key={phase.id} className="p-4 bg-background hover:bg-muted/20 transition-colors border-l-4 border-primary/30">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex justify-between items-center  gap-2 flex-wrap w-full">
                      <span className="font-semibold truncate">{phase.name}</span>
                      <Badge className={statusInfo.className} variant="secondary">
                        {statusInfo.label}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {phase.contractor?.name ? (
                        <span>
                          Empresa: <span className="font-semibold text-foreground">{phase.contractor.name}</span>
                        </span>
                      ) : null}
                      {phase.contractNumber ? (
                        <span>
                          Contrato: <span className="font-semibold text-foreground">{phase.contractNumber}</span>
                        </span>
                      ) : null}
                      {phase.biddingProcessNumber ? (
                        <span>
                          Processo: <span className="font-semibold text-foreground">{phase.biddingProcessNumber}</span>
                        </span>
                      ) : null}
                      {phase.portalLink ? (
                        <a href={phase.portalLink} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                          Portal
                        </a>
                      ) : null}
                    </div>
                    {phase.description ? <div className="text-sm text-muted-foreground mt-2">{phase.description}</div> : null}
                  </div>

                  <Button
                    variant="link"
                    size="sm"
                    className="text-primary p-0 h-auto whitespace-nowrap self-start sm:self-auto"
                    onClick={() => onOpenDetails?.(phase.id)}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Ver Detalhes e Arquivos
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
