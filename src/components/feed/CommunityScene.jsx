import React from 'react';

// Paisagem ilustrativa, sem representar lugares ou atividades reais da cidade.
// SVG decorativo usa os tokens do produto para acompanhar os dois temas.
export default function CommunityScene() {
  return (
    <svg viewBox="0 0 320 136" fill="none" aria-hidden="true" focusable="false" className="community-scene">
      <ellipse cx="161" cy="124" rx="137" ry="8" fill="rgb(var(--brand))" opacity=".06" />
      <circle cx="259" cy="29" r="14" fill="rgb(var(--tc-amber-300))" />
      <path d="M24 108H296M40 123H74M87 123H105M215 123H249M262 123H282" stroke="rgb(var(--border-strong))" strokeWidth="2" strokeLinecap="round" />
      <path d="M63 109V64L92 42L121 64V109" fill="rgb(var(--surface-raised))" stroke="rgb(var(--text-secondary))" strokeWidth="2" strokeLinejoin="round" />
      <path d="M57 64L92 37L127 64" stroke="rgb(var(--brand))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M85 108V88C85 84 99 84 99 88V108" fill="rgb(var(--brand-subtle-bg))" stroke="rgb(var(--brand))" strokeWidth="2" />
      <rect x="75" y="69" width="11" height="11" rx="3" fill="rgb(var(--tc-amber-100))" stroke="rgb(var(--text-secondary))" strokeWidth="1.5" />
      <rect x="99" y="69" width="11" height="11" rx="3" fill="rgb(var(--tc-amber-100))" stroke="rgb(var(--text-secondary))" strokeWidth="1.5" />
      <rect x="138" y="52" width="46" height="57" rx="5" fill="rgb(var(--surface-raised))" stroke="rgb(var(--border-strong))" strokeWidth="2" />
      {[61, 79].map(y => <g key={y}><rect x="148" y={y} width="8" height="9" rx="2" fill="rgb(var(--surface-sunken))" /><rect x="166" y={y} width="8" height="9" rx="2" fill="rgb(var(--surface-sunken))" /></g>)}
      <path d="M35 107V76M255 107V76" stroke="rgb(var(--text-secondary))" strokeWidth="3" strokeLinecap="round" />
      <path d="M21 75C12 62 21 49 33 48C33 34 54 37 55 49C71 55 63 77 51 77H27" fill="rgb(var(--success-bg))" stroke="rgb(var(--success-fg))" strokeWidth="2" strokeLinejoin="round" />
      <path d="M242 78C231 67 238 53 249 52C249 37 271 39 273 52C287 59 282 78 270 78H246" fill="rgb(var(--success-bg))" stroke="rgb(var(--success-fg))" strokeWidth="2" strokeLinejoin="round" />
      <path d="M196 108H226M201 107V96H221V107M198 96H224M200 91H222" stroke="rgb(var(--text-secondary))" strokeWidth="2" strokeLinecap="round" />
      <path d="M204 45C204 31 225 31 225 45C225 55 214.5 63 214.5 63S204 55 204 45Z" fill="rgb(var(--brand))" />
      <circle cx="214.5" cy="44.5" r="4" fill="rgb(var(--text-on-brand))" />
      <path d="M190 22V30M186 26H194M121 22V28M118 25H124" stroke="rgb(var(--brand))" strokeWidth="2" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}
