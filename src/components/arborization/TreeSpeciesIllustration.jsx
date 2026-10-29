import React from 'react';

// Ilustração neutra para os cadastros que ainda não têm imagem da espécie.
export default function TreeSpeciesIllustration() {
  return <div className="adoption-generic-tree">
    <svg viewBox="0 0 180 108" fill="none" role="img" aria-label="Ilustração genérica de árvore">
      <ellipse cx="91" cy="98" rx="45" ry="6" fill="currentColor" opacity=".09" />
      <path d="M88 96V43m0 29L65 53m23 8 24-19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".65" />
      <path d="M53 63C28 53 37 25 56 24 57 4 83 1 93 16c21-16 44 2 41 18 25 14 11 39-8 36-11 17-31 13-39 4-17 12-31 2-34-11Z" fill="currentColor" opacity=".17" stroke="currentColor" strokeWidth="1.5" />
      <path d="M88 75V35m0 23L71 44m17 3 16-15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".65" />
      <path d="M49 98v-12m0 4c-10 0-13-7-12-12 9 0 12 5 12 12m1-5c0-8 6-12 12-11-1 8-5 12-12 11" fill="currentColor" opacity=".35" />
    </svg><span>Ilustração genérica</span>
  </div>;
}
