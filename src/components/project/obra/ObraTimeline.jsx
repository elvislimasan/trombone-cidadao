import { CalendarDays, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ObraTimeline({ executionDays, items, embedded = false }) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6 lg:p-4 2xl:p-6" : "bg-card rounded-lg border p-4 sm:p-6 lg:p-4 2xl:p-6";
  const safeItems = Array.isArray(items) ? items : [];
  const visibleItems = safeItems.filter((it) => it?.value && it.value !== "-");
  const hasExecutionDays = Number(executionDays) > 0;
  const baseCardClassName = "rounded-xl border bg-card p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm";
  // Mantém destaque apenas no card "Prazo de Execução"
  const highlightedCardClassName =
    "bg-blue-50 border border-blue-200/70 dark:bg-slate-900/30 dark:border-slate-700 rounded-xl p-4 sm:p-4 lg:p-3 2xl:p-4 shadow-sm";

  if (!hasExecutionDays && visibleItems.length === 0) return null;

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Prazos e Cronograma</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 min-[1700px]:grid-cols-5 gap-3 sm:gap-4 lg:gap-3 2xl:gap-4">
        {hasExecutionDays ? (
          <div className={highlightedCardClassName}>
            <div className="flex items-center justify-center mb-2 text-muted-foreground">
              <Clock className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-[10px] lg:text-[9px] 2xl:text-[10px] uppercase tracking-wide text-muted-foreground text-center">
              Prazo de Execução
            </div>
            <div className="text-center text-base sm:text-lg lg:text-base 2xl:text-xl font-bold text-foreground mt-2 lg:mt-1.5 leading-snug whitespace-nowrap tabular-nums">
              {`${executionDays} dias`}
            </div>
          </div>
        ) : null}

        {visibleItems.map((it) => (
            <div
              key={it.label}
              className={baseCardClassName}
            >
              <div className="flex items-center justify-center mb-2 text-muted-foreground">
                <CalendarDays className="h-5 w-5 text-red-500" />
              </div>
              <div className="text-[10px] lg:text-[9px] 2xl:text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                {it.label}
              </div>
              <div className="text-center text-base sm:text-lg lg:text-base 2xl:text-xl font-bold text-foreground mt-2 lg:mt-1.5 leading-snug whitespace-nowrap tabular-nums">
                {it.value || "-"}
              </div>
              {it.badge ? (
                <div className="mt-2 flex justify-center">
                  <Badge variant="secondary">{it.badge}</Badge>
                </div>
              ) : null}
            </div>
          ))}
      </div>
    </Container>
  );
}
