import { CalendarDays, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ObraTimeline({ executionDays, items, embedded = false }) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6" : "bg-card rounded-lg border p-4 sm:p-6";
  const safeItems = Array.isArray(items) ? items : [];
  const visibleItems = safeItems.filter((it) => it?.value && it.value !== "-");
  const hasExecutionDays = Number(executionDays) > 0;

  if (!hasExecutionDays && visibleItems.length === 0) return null;

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Prazos e Cronograma</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {hasExecutionDays ? (
          <div className="bg-amber-50 border border-amber-200/70 dark:bg-slate-900/30 dark:border-slate-700 rounded-xl p-5 sm:p-4">
            <div className="flex items-center justify-center mb-2 text-muted-foreground">
              <Clock className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Prazo de Execução</div>
            <div className="text-center text-lg sm:text-xl font-bold text-foreground mt-2 leading-snug break-words">{`${executionDays} dias`}</div>
          </div>
        ) : null}

        {visibleItems.map((it) => (
            <div
              key={it.label}
              className="bg-blue-50 border border-blue-200/70 dark:bg-slate-900/30 dark:border-slate-700 rounded-xl p-5 sm:p-4"
            >
              <div className="flex items-center justify-center mb-2 text-muted-foreground">
                <CalendarDays className="h-5 w-5 text-red-500" />
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">{it.label}</div>
              <div className="text-center text-lg sm:text-xl font-bold text-foreground mt-2 leading-snug break-words">{it.value || "-"}</div>
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
