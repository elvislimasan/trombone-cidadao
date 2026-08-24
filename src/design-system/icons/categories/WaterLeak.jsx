import React from 'react';
// Guia de pins: gota solida, como esgoto - as duas categorias dividem o azul.
// Aqui a gota vem acompanhada de duas menores, para nao ficarem identicas no
// mapa quando as duas categorias aparecem lado a lado.
export default function WaterLeak() {
  return (
    <>
      <path
        d="M13.4 2.8c0 0-5.2 5.4-5.2 8.8a5.2 5.2 0 0 0 10.4 0c0-3.4-5.2-8.8-5.2-8.8Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M6.4 14.6c0 0-2.2 2.3-2.2 3.7a2.2 2.2 0 0 0 4.4 0c0-1.4-2.2-3.7-2.2-3.7Z"
        fill="currentColor"
        stroke="none"
        opacity=".6"
      />
    </>
  );
}
