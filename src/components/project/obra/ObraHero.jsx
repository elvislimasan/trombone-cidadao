export function ObraHero({ imageUrl, title }) {
  return (
    <div className="relative h-48 md:h-64  overflow-hidden bg-muted">
      <img src={imageUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 to-transparent" />
    </div>
  );
}

