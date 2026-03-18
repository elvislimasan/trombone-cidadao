import { DollarSign, Landmark, User } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function ObraFinancial({
  fundingSource,
  parliamentaryAmendment,
  contractValue,
  expectedValue,
  embedded = false,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-6" : "bg-card rounded-lg border p-6";

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Financeiro</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Landmark className="h-4 w-4" />
            <span className="text-xs">Fonte de Recurso</span>
          </div>
          <div className="mt-2 font-semibold text-sm text-foreground">{fundingSource || "Não informado"}</div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="text-xs">Emenda Parlamentar</span>
          </div>
          <div className="mt-2 font-semibold text-sm text-foreground">{parliamentaryAmendment || "Não informado"}</div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs">Valor Contratado (Fase Atual)</span>
          </div>
          <div className="mt-2 font-semibold text-sm text-foreground">{contractValue ? formatCurrency(contractValue) : "Não informado"}</div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs">Valor Previsto (Fase Atual)</span>
          </div>
          <div className="mt-2 font-semibold text-sm text-foreground">{expectedValue ? formatCurrency(expectedValue) : "Não informado"}</div>
        </div>
      </div>
    </Container>
  );
}
