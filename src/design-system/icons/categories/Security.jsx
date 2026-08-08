import React from 'react';
// Guia de pins: escudo solido com um check vazado no meio. O check e recortado
// com fill-rule evenodd para aparecer na cor do pin, sem depender de pintar por
// cima com uma cor que muda por tema.
export default function Security() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2.6 4.6 5.8v5.4c0 4.6 3.1 8.9 7.4 10.2 4.3-1.3 7.4-5.6 7.4-10.2V5.8L12 2.6Zm3.9 6.6a1 1 0 0 1 .1 1.4l-4.3 5a1 1 0 0 1-1.5 0l-2.2-2.4a1 1 0 1 1 1.5-1.4l1.5 1.6 3.5-4.1a1 1 0 0 1 1.4-.1Z"
      fill="currentColor"
      stroke="none"
    />
  );
}
