import React from 'react';

import { cn } from '@/lib/utils';

// AS CLASSES PRECISAM SER FUNDIDAS, NÃO CONCATENADAS
//
// Isto montava a string com template literal: `${variants[variant]} ${className}`.
// Parece equivalente, e não é. Duas utilitárias Tailwind da mesma propriedade
// têm a MESMA especificidade, então quem vence não é a que veio depois no
// atributo — é a que veio depois na folha de estilo gerada, que ninguém
// controla daqui.
//
// O sintoma real: a variante `outline` traz `text-foreground`, e um chamador
// que passasse `text-amber-800` podia perder a disputa. No tema escuro
// `--foreground` é quase branco, e o resultado era um selo creme com texto
// branco em cima — invisível, sem nada no console.
//
// `cn` (clsx + tailwind-merge) resolve o conflito antes de virar HTML: a classe
// do chamador substitui a da variante em vez de brigar com ela.
export const Badge = ({ variant = 'default', className, ...props }) => {
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'text-foreground border border-input',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
};
