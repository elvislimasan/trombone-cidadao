import { ExternalLink, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function ObraPayments({
  payments,
  totalPaid,
  phaseName,
  expectedValue = 0,
  totalPaidAllPhases = 0,
  totalExpectedAllPhases = 0,
  embedded = false,
  canAdd = false,
  onAddPayment,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6 lg:p-4 2xl:p-6" : "bg-card rounded-lg border p-4 sm:p-6 lg:p-4 2xl:p-6";
  const list = Array.isArray(payments) ? payments : [];
  const phasePct = expectedValue ? Math.min((Number(totalPaid) / Number(expectedValue)) * 100, 100) : 0;
  const totalPct = totalExpectedAllPhases ? Math.min((Number(totalPaidAllPhases) / Number(totalExpectedAllPhases)) * 100, 100) : 0;

  return (
    <Container className={containerClassName}>
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0">
            <span className="truncate">Pagamentos</span>
            {canAdd ? (
              <Button
                size="icon"
                variant="outline"
                onClick={onAddPayment}
                className="h-7 w-7 rounded-md sm:hidden"
                aria-label="Adicionar pagamento"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {phaseName ? <span className="hidden sm:inline text-muted-foreground font-normal text-sm">- {phaseName}</span> : null}
          </h2>
        </div>

        {canAdd ? (
          <Button size="sm" variant="outline" onClick={onAddPayment} className="hidden sm:inline-flex">
            <Plus className="h-4 w-4 mr-1" />
            Adicionar pagamento
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-5 lg:p-4 2xl:p-5">
          <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs sm:text-sm lg:text-xs 2xl:text-sm mb-1.5 sm:mb-2">
            <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Pago na Fase Atual</span>
          </div>
          <div className="text-lg sm:text-xl lg:text-lg 2xl:text-2xl font-bold text-blue-900 mb-2 sm:mb-3 lg:mb-2">{formatCurrency(totalPaid)}</div>
          <Progress value={phasePct} className="h-1.5 sm:h-2 bg-blue-100" indicatorClassName="bg-blue-600" />
          <div className="text-[10px] sm:text-xs text-blue-700 mt-1.5 sm:mt-2">{Math.round(phasePct)}%</div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 sm:p-5 lg:p-4 2xl:p-5">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs sm:text-sm lg:text-xs 2xl:text-sm mb-1.5 sm:mb-2">
            <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Total Pago (Todas as Fases)</span>
          </div>
          <div className="text-lg sm:text-xl lg:text-lg 2xl:text-2xl font-bold text-emerald-900 mb-2 sm:mb-3 lg:mb-2">{formatCurrency(totalPaidAllPhases)}</div>
          <Progress value={totalPct} className="h-1.5 sm:h-2 bg-emerald-100" indicatorClassName="bg-emerald-600" />
          <div className="text-[10px] sm:text-xs text-emerald-700 mt-1.5 sm:mt-2">{Math.round(totalPct)}%</div>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="mb-4 text-xs sm:text-sm text-muted-foreground">
            Para consultar valores das fases anteriores, vá até a seção de{" "}
            <a href="#historico-licitacoes" className="text-primary underline underline-offset-2">
              Histórico de Licitações
            </a>
            .
          </div>
          <div className="rounded-lg border border-border overflow-hidden bg-background">
            <Table>
              <TableHeader className="bg-amber-100/80 dark:bg-slate-900/60">
                <TableRow className="border-b border-amber-200/70 dark:border-slate-700 hover:bg-transparent">
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">Pagamento</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">Nº Empenho</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">Descrição</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-center">Parcela</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">Credor</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-right">Valor</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-center">Portal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className="odd:bg-background even:bg-slate-50/80 dark:even:bg-slate-900/20 hover:bg-slate-100/70 dark:hover:bg-slate-900/40"
                  >
                  <TableCell className="font-medium">{payment.date}</TableCell>
                  <TableCell>{payment.orderNumber || "-"}</TableCell>
                  <TableCell className="max-w-48 truncate" title={payment.description}>
                    {payment.description || "-"}
                  </TableCell>
                  <TableCell className="text-center">{payment.installment || "-"}</TableCell>
                  <TableCell className="max-w-32 truncate" title={payment.contractor}>
                    {payment.contractor || "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatCurrency(payment.value)}</TableCell>
                  <TableCell className="text-center">
                    {payment.url ? (
                      <Button asChild variant="ghost" size="sm" className="text-primary">
                        <a href={payment.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Ver
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum pagamento registrado {phaseName ? `para ${phaseName}` : ""}</p>
        </div>
      )}
    </Container>
  );
}
