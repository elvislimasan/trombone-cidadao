import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Check, Lightbulb, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function ElectricianCompletionCelebration({ open, onClose }) {
  useEffect(() => {
    if (!open || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;
    const options = { particleCount: 55, spread: 70, startVelocity: 32, gravity: 1.1, zIndex: 10001, disableForReducedMotion: true,
      colors: ['#f9c74f', '#f9844a', '#f94144', '#43aa8b', '#ffffff'] };
    confetti({ ...options, origin: { x: 0.25, y: 0.65 }, angle: 70 });
    const secondBurst = window.setTimeout(() => confetti({ ...options, origin: { x: 0.75, y: 0.65 }, angle: 110 }), 180);
    return () => window.clearTimeout(secondBurst);
  }, [open]);

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent hideClose className="w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised p-0 text-center shadow-elevation-3">
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-brand-subtleBg">
        <span aria-hidden="true" className="absolute h-32 w-32 rounded-full border border-brand/20" />
        <span aria-hidden="true" className="absolute h-28 w-28 rounded-full bg-brand/10 blur-2xl" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand text-content-onBrand shadow-elevation-3">
          <Lightbulb aria-hidden="true" className="h-10 w-10" />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-surface-raised bg-success-fg text-white"><Check aria-hidden="true" className="h-4 w-4" /></span>
        </span>
        <Sparkles aria-hidden="true" className="absolute left-10 top-8 h-6 w-6 text-brand" />
        <Sparkles aria-hidden="true" className="absolute bottom-7 right-10 h-5 w-5 text-brand" />
      </div>
      <div className="px-6 pb-6 pt-1">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Serviço concluído</p>
        <DialogTitle className="mt-2 font-display text-2xl font-black leading-tight text-content-primary">Mais um poste consertado!</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-content-secondary">Obrigado pelo seu trabalho. A ordem foi finalizada e o cadastro do poste atualizado.</DialogDescription>
        <Button asChild className="mt-6 min-h-12 w-full"><Link to="/prefeitura/eletricista">Ver minhas ordens</Link></Button>
        <Button type="button" variant="ghost" className="mt-2 min-h-11 w-full" onClick={onClose}>Ver ordem concluída</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
