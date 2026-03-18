import { ArrowUpRight, Link2 } from "lucide-react";

export function ObraRelatedLinks({ links }) {
  const list = Array.isArray(links) ? links : [];
  if (list.length === 0) return null;

  return (
    <section className="bg-card rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Links Relacionados</h2>
      </div>
      <div className="space-y-2">
        {list.map((link, idx) => (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
          >
            <span className="text-sm font-medium text-foreground break-words leading-snug">{link.title}</span>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
          </a>
        ))}
      </div>
    </section>
  );
}

