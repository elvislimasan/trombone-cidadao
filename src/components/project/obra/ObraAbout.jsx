import { FileText } from "lucide-react";

export function ObraAbout({ description }) {
  if (!description) return null;

  return (
    <section className="bg-card rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Sobre a Obra</h2>
      </div>

      <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{description}</p>
    </section>
  );
}

