import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ObraContribution({ onContribute }) {
  return (
    <section className="bg-card rounded-lg border p-10 text-center">
      <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
        <UploadCloud className="w-6 h-6 text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Tem informações sobre esta obra?</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        Ajude-nos a manter os dados atualizados enviando fotos, vídeos ou relatórios.
      </p>
      <Button onClick={onContribute} className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 font-medium">
        <UploadCloud className="w-4 h-4 mr-2" />
        Enviar Contribuição
      </Button>
    </section>
  );
}
