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
  const containerClassName = embedded ? "p-4 sm:p-6" : "bg-card rounded-lg border p-4 sm:p-6";

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
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Financeiro</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {hasFundingSource ? (
          <div className="rounded-xl border bg-card p-5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Landmark className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Fonte de Recurso</span>
            </div>
            <div className="mt-3 sm:mt-2 font-semibold text-sm leading-snug break-words text-foreground">{fundingSource}</div>
          </div>
        ) : null}

        {hasParliamentaryAmendment ? (
          <div className="rounded-xl border bg-card p-5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Emenda Parlamentar</span>
            </div>
            <div className="mt-3 sm:mt-2 font-semibold text-sm leading-snug break-words text-foreground">{parliamentaryAmendment}</div>
          </div>
        ) : null}

        {hasContractValue ? (
          <div className="rounded-xl border bg-card p-5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Valor Contratado (Fase Atual)</span>
            </div>
            <div className="mt-3 sm:mt-2 font-semibold text-sm leading-snug break-words text-foreground">{formatCurrency(contractValue)}</div>
          </div>
        ) : null}

        {hasExpectedValue ? (
          <div className="rounded-xl border bg-card p-5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Valor Previsto (Fase Atual)</span>
            </div>
            <div className="mt-3 sm:mt-2 font-semibold text-sm leading-snug break-words text-foreground">{formatCurrency(expectedValue)}</div>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
