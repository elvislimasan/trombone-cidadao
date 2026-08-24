import React from 'react';
// Guia de pins: massa de asfalto solida com buracos vazados.
// Tres recortes de tamanhos diferentes, fora do eixo horizontal: dois recortes
// simetricos no meio da massa liam como um par de olhos.
export default function Pothole() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.6 16.8c0-1.5 1.7-2.6 3.4-3.1.9-.3 1.4-1 1.9-1.9.8-1.4 2.2-2.3 4.1-2.3 2.1 0 3.5 1.1 4.4 2.4.6 1 1.2 1.6 2.3 2 1.6.5 3 1.5 3 3 0 2.3-4.5 3.8-9.5 3.8s-9.6-1.6-9.6-3.9Zm2.9 1c0-.4.6-.7 1.3-.7s1.3.3 1.3.7-.6.7-1.3.7-1.3-.3-1.3-.7Zm4.3-2.2c0-.6.8-1.1 1.8-1.1s1.8.5 1.8 1.1-.8 1.1-1.8 1.1-1.8-.5-1.8-1.1Zm4.8 2.9c0-.3.5-.6 1-.6s1 .3 1 .6-.5.6-1 .6-1-.3-1-.6Z"
      fill="currentColor"
      stroke="none"
    />
  );
}
