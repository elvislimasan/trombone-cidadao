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

  const simplifyText = (value) =>
    String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const isEmptyValue = (value) => {
    const t = simplifyText(value);
    return !t || t === "-" || t === "n/a" || t === "nao informado" || t === "nao informada";
  };

  const hasFundingSource = !isEmptyValue(fundingSource);
  const hasParliamentaryAmendment = !isEmptyValue(parliamentaryAmendment);
  const hasContractValue = Number(contractValue) > 0;
  const hasExpectedValue = Number(expectedValue) > 0;

  if (!hasFundingSource && !hasParliamentaryAmendment && !hasContractValue && !hasExpectedValue) return null;

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">Financeiro</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {hasFundingSource ? (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Landmark className="h-4 w-4 text-red-500" />
              <span className="text-xs">Fonte de Recurso</span>
            </div>
            <div className="mt-2 font-semibold text-sm text-foreground">{fundingSource}</div>
          </div>
        ) : null}

        {hasParliamentaryAmendment ? (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 text-red-500" />
              <span className="text-xs">Emenda Parlamentar</span>
            </div>
            <div className="mt-2 font-semibold text-sm text-foreground">{parliamentaryAmendment}</div>
          </div>
        ) : null}

        {hasContractValue ? (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-xs">Valor Contratado (Fase Atual)</span>
            </div>
            <div className="mt-2 font-semibold text-sm text-foreground">{formatCurrency(contractValue)}</div>
          </div>
        ) : null}

        {hasExpectedValue ? (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-xs">Valor Previsto (Fase Atual)</span>
            </div>
            <div className="mt-2 font-semibold text-sm text-foreground">{formatCurrency(expectedValue)}</div>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
