import { Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

function progressColor(percentage) {
  if (percentage < 30) return "bg-primary";
  if (percentage < 70) return "bg-amber-500";
  return "bg-red-500";
}

export function ObraProgress({ percentage }) {
  const value = Math.max(0, Math.min(100, Number(percentage) || 0));

  return (
    <section className="bg-card rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Progresso da Obra</h2>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Andamento geral</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <Progress value={value} className="h-3" indicatorClassName={progressColor(value)} />
    </section>
  );
}

