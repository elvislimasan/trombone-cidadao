import { DollarSign, Landmark, User } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function ObraFinancial({
  fundingSource,
  fundingAmounts,
  parliamentaryAmendment,
  parliamentaryAmendmentValue,
  contractValue,
  expectedValue,
  embedded = false,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6 lg:p-4 2xl:p-6" : "bg-card rounded-lg border p-4 sm:p-6 lg:p-4 2xl:p-6";

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

  const fundingSourceParts = String(fundingSource || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p === "state" || p === "estadual"
        ? "Estadual"
        : p === "federal"
        ? "Federal"
        : p === "municipal"
        ? "Municipal"
        : p === "estaduais"
        ? "Estadual"
        : p
    );

  const normalizedFundingSource = fundingSourceParts.join(", ");

  const amounts = fundingAmounts && typeof fundingAmounts === "object" ? fundingAmounts : null;
  const fundingFederal = amounts ? Number(amounts.federal) || 0 : 0;
  const fundingState = amounts ? (Number(amounts.estadual) || Number(amounts.state) || 0) : 0;
  const fundingMunicipal = amounts ? Number(amounts.municipal) || 0 : 0;

  const hasFundingAmounts = fundingFederal > 0 &&  fundingSourceParts.includes('Federal') || fundingState > 0 && fundingSourceParts.includes('Estadual') || fundingMunicipal > 0 && fundingSourceParts.includes('Municipal');

  const hasFundingSource = !isEmptyValue(normalizedFundingSource) || hasFundingAmounts;
  const parliamentaryValueNumber = Number(parliamentaryAmendmentValue);
  const hasParliamentaryValue = Number.isFinite(parliamentaryValueNumber) && parliamentaryValueNumber > 0;
  const hasParliamentaryAmendment = !isEmptyValue(parliamentaryAmendment) || hasParliamentaryValue;
  const hasContractValue = Number(contractValue) > 0;
  const hasExpectedValue = Number(expectedValue) > 0;

  if (!hasFundingSource && !hasParliamentaryAmendment && !hasContractValue && !hasExpectedValue) return null;

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <h2 className="text-[14px] font-semibold uppercase text-muted-foreground">Financeiro</h2>
      </div>

      <div className={`grid grid-cols-1 ${hasFundingAmounts ?'sm:grid-cols-3 md:grid-cols-3' : "sm:grid-cols-4 md:grid-cols-4"} gap-3 sm:gap-2`}>
        {hasFundingSource ? (
          <div className={`rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm ${hasFundingAmounts ? "col-span sm:col-span-3 mb-3" : "col-span-1"}`}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Landmark className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Fonte de Recurso</span>
            </div>
            <div className="mt-3 sm:mt-2 lg:mt-2 font-semibold text-sm lg:text-[13px] leading-snug whitespace-normal break-normal text-foreground">
              {fundingSourceParts.length > 0
                ? fundingSourceParts.map((label, idx) => (
                    <span key={`${label}-${idx}`}>
                      {label}
                      {idx < fundingSourceParts.length - 1 ? ", " : ""}
                    </span>
                  ))
                : "-"}
            </div>
            {hasFundingAmounts ? (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {fundingFederal > 0 && fundingSourceParts.includes("Federal") ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Federal</span>
                    <span className="font-semibold text-foreground whitespace-nowrap tabular-nums">{formatCurrency(fundingFederal)}</span>
                  </div>
                ) : null}
                {fundingState > 0 && fundingSourceParts.includes("Estadual") ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Estadual</span>
                    <span className="font-semibold text-foreground whitespace-nowrap tabular-nums">{formatCurrency(fundingState)}</span>
                  </div>
                ) : null}
                {fundingMunicipal > 0 && fundingSourceParts.includes("Municipal") ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Municipal</span>
                    <span className="font-semibold text-foreground whitespace-nowrap tabular-nums">{formatCurrency(fundingMunicipal)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {hasParliamentaryAmendment ? (
          <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Emenda Parlamentar</span>
            </div>
            {!isEmptyValue(parliamentaryAmendment) ? (
              <div className="mt-3 sm:mt-2 lg:mt-2 font-semibold text-sm lg:text-[13px] leading-snug break-words text-foreground">
                {parliamentaryAmendment}
              </div>
            ) : null}
            {hasParliamentaryValue ? (
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{formatCurrency(parliamentaryValueNumber)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {hasContractValue ? (
          <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Valor Contratado (Fase Atual)</span>
            </div>
            <div className="mt-3 sm:mt-2 lg:mt-2 font-semibold text-sm lg:text-[13px] leading-snug break-words text-foreground">{formatCurrency(contractValue)}</div>
          </div>
        ) : null}

        {hasExpectedValue ? (
          <div className="rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-[10px] uppercase tracking-wide">Valor Previsto (Fase Atual)</span>
            </div>
            <div className="mt-3 sm:mt-2 lg:mt-2 font-semibold text-sm lg:text-[13px] leading-snug break-words text-foreground">{formatCurrency(expectedValue)}</div>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
