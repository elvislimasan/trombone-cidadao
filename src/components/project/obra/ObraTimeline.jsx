import { CalendarDays, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ObraTimeline({ executionDays, items, embedded = false }) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-6" : "bg-card rounded-lg border p-6";

  return (
    <Container className={containerClassName}>
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Prazos e Cronograma</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-muted/30 border rounded-lg p-4">
          <div className="flex items-center justify-center mb-2 text-muted-foreground">
            <Clock className="h-5 w-5" />
          </div>
          <div className="text-xs text-muted-foreground text-center">Prazo de Execução</div>
          <div className="text-center font-semibold mt-1">{executionDays ? `${executionDays} dias` : "-"}</div>
        </div>

        {Array.isArray(items) &&
          items.map((it) => (
            <div key={it.label} className="bg-muted/30 border rounded-lg p-4">
              <div className="flex items-center justify-center mb-2 text-muted-foreground">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted-foreground text-center">{it.label}</div>
              <div className="text-center font-semibold mt-1">{it.value || "-"}</div>
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

