import React from 'react';

// Paisagem decorativa: não representa construções ou pontos reais da cidade.
// As cores vêm dos tokens para acompanhar os temas sem carregar uma imagem.
export default function ExploreCityBackdrop() {
  return <div className="discovery-hero-art" aria-hidden="true">
    <svg viewBox="0 0 640 260" fill="none" focusable="false">
      <circle cx="500" cy="86" r="54" fill="rgb(var(--status-pending-fg) / .07)" />
      <circle cx="500" cy="86" r="34" fill="rgb(var(--status-pending-fg) / .07)" />
      <path d="M128 218C195 179 245 210 301 192C366 171 395 192 455 174C508 158 566 166 640 151V260H128Z" fill="rgb(var(--success-fg) / .04)" />
      <path d="M198 104H232C231 92 215 88 208 98C204 93 194 96 194 104H198ZM395 53H427C427 42 414 38 407 47C401 42 391 46 391 53H395Z" fill="rgb(var(--brand) / .06)" />

      {/* Ruas e caminho pontilhado ligam os elementos sem sugerir um mapa real. */}
      <path d="M42 232C125 232 131 199 216 208C312 219 325 244 426 226C505 212 547 230 630 210" stroke="rgb(var(--brand) / .1)" strokeWidth="22" strokeLinecap="round" />
      <path d="M42 232C125 232 131 199 216 208C312 219 325 244 426 226C505 212 547 230 630 210" stroke="rgb(var(--brand) / .2)" strokeWidth="1.5" strokeDasharray="4 9" strokeLinecap="round" />

      <g stroke="rgb(var(--brand) / .23)" strokeWidth="2" strokeLinejoin="round">
        <path d="M250 204V139L290 110L330 139V204" fill="rgb(var(--brand) / .045)" />
        <path d="M241 140L290 103L339 140" strokeWidth="4" strokeLinecap="round" />
        <path d="M280 204V177A10 10 0 0 1 300 177V204" fill="rgb(var(--brand) / .06)" />
        <rect x="265" y="148" width="13" height="15" rx="3" />
        <rect x="302" y="148" width="13" height="15" rx="3" />
        <rect x="350" y="132" width="51" height="72" rx="5" fill="rgb(var(--brand) / .035)" />
        <path d="M361 145H369M382 145H390M361 161H369M382 161H390M361 177H369M382 177H390" strokeLinecap="round" strokeWidth="4" />
        <path d="M442 202V158L472 135L502 158V202" fill="rgb(var(--brand) / .045)" />
        <path d="M435 159L472 130L509 159M467 202V181H479V202" strokeLinecap="round" />
        <rect x="453" y="165" width="11" height="11" rx="2" />
        <rect x="481" y="165" width="11" height="11" rx="2" />
      </g>

      <g stroke="rgb(var(--success-fg) / .25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M197 200V154M548 198V148" />
        <path d="M176 164C154 154 159 130 175 125C173 103 207 94 217 116C239 117 244 147 225 158C216 171 190 174 176 164Z" fill="rgb(var(--success-fg) / .085)" />
        <path d="M529 160C510 148 515 126 530 120C530 99 559 94 569 113C591 117 591 144 576 154C564 169 543 169 529 160Z" fill="rgb(var(--success-fg) / .085)" />
        <path d="M197 175L184 163M197 183L211 170M548 172L561 158" />
      </g>

      <g stroke="rgb(var(--brand) / .18)" strokeWidth="2" strokeLinecap="round">
        <path d="M414 203V184M409 184H433M413 178H429M430 184V203M405 203H438" />
        <path d="M596 99V111M590 105H602M304 74V82M300 78H308" />
      </g>
      <path d="M403 91C403 72 432 72 432 91C432 102 417.5 115 417.5 115S403 102 403 91Z" fill="rgb(var(--brand) / .3)" />
      <circle cx="417.5" cy="90.5" r="5" fill="rgb(var(--surface-raised))" />
    </svg>
  </div>;
}
