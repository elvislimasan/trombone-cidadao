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
  const containerClassName = embedded ? "p-6" : "bg-card rounded-lg border p-6";
  const list = Array.isArray(payments) ? payments : [];
  const phasePct = expectedValue ? Math.min((Number(totalPaid) / Number(expectedValue)) * 100, 100) : 0;
  const totalPct = totalExpectedAllPhases ? Math.min((Number(totalPaidAllPhases) / Number(totalExpectedAllPhases)) * 100, 100) : 0;

  return (
    <Container className={containerClassName}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            Pagamentos {phaseName ? <span className="text-muted-foreground font-normal text-sm">- {phaseName}</span> : null}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {canAdd && (
            <Button size="sm" variant="outline" onClick={onAddPayment} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar pagamento
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
            <Receipt className="h-4 w-4" />
            Pago na Fase Atual
          </div>
          <div className="text-2xl font-bold text-blue-900 mb-3">{formatCurrency(totalPaid)}</div>
          <Progress value={phasePct} className="h-2 bg-blue-100" indicatorClassName="bg-blue-600" />
          <div className="text-xs text-blue-700 mt-2">{Math.round(phasePct)}%</div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
            <Receipt className="h-4 w-4" />
            Total Pago (Todas as Fases)
          </div>
          <div className="text-2xl font-bold text-emerald-900 mb-3">{formatCurrency(totalPaidAllPhases)}</div>
          <Progress value={totalPct} className="h-2 bg-emerald-100" indicatorClassName="bg-emerald-600" />
          <div className="text-xs text-emerald-700 mt-2">{Math.round(totalPct)}%</div>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Pagamento</TableHead>
                <TableHead>Nº Empenho</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Parcela</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Vínculo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((payment) => (
                <TableRow key={payment.id}>
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
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum pagamento registrado {phaseName ? `para ${phaseName}` : ""}</p>
        </div>
      )}
    </Container>
  );
}
