import React from 'react';
// Guia de pins: tesoura de poda em X. Trocou a arvore antiga - o guia usa a
// ferramenta, nao o objeto podado.
export default function Greenery() {
  return (
    <>
      <path d="M8.2 4.4 15.4 15.2" strokeWidth="2.2" />
      <path d="M15.8 4.4 8.6 15.2" strokeWidth="2.2" />
      <circle cx="7.4" cy="17.8" r="2.5" strokeWidth="2" />
      <circle cx="16.6" cy="17.8" r="2.5" strokeWidth="2" />
    </>
  );
}
