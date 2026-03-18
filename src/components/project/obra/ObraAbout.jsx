import { FileText } from "lucide-react";
import { ObraProgress } from "./ObraProgress";
import { ObraHero } from "./ObraHero";

export function ObraAbout({ description, overallProgress, heroImageUrl, title }) {
  if (!description) return null;

  return (
    <section className="bg-card rounded-lg">
        {heroImageUrl ? <ObraHero imageUrl={heroImageUrl} title={title} /> : null}
    <div className="p-6">

      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Sobre a Obra</h2>
      </div>

      <p className="text-muted-foreground leading-relaxed whitespace-pre-line mb-6">{description}</p>
      <ObraProgress percentage={overallProgress} />
    </div>
    </section>
  );
}

