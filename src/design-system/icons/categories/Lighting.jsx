import React from 'react';
// Guia de pins: poste em L com a lampada pendurada na ponta.
// A lampada e uma gota invertida (bulbo redondo + bocal), nao um trapezio -
// como trapezio ela lia como chuveiro.
export default function Lighting() {
  return (
    <>
      <path d="M8.8 20.6V6.2a2.6 2.6 0 0 1 2.6-2.6h3.2" strokeWidth="2.2" />
      <path d="M6.8 20.6h4" strokeWidth="2.2" />
      <path
        d="M16.2 5.2a3.6 3.6 0 0 1 3.6 3.6c0 1.5-.9 2.5-1.5 3.1-.3.3-.4.5-.4.8v.2h-3.4v-.2c0-.3-.1-.5-.4-.8-.6-.6-1.5-1.6-1.5-3.1a3.6 3.6 0 0 1 3.6-3.6Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M14.7 14.1h3v.7a.9.9 0 0 1-.9.9h-1.2a.9.9 0 0 1-.9-.9v-.7Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  );
}
