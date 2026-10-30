import React from 'react';
import { GrowingTree } from './TreeAdoptionIntroduction';

export default function TreeAdoptionWelcome({ cityName }) {
  return <aside className="adoption-welcome" aria-label="Um cuidado que cria raízes">
    <div className="adoption-welcome-heading">
      <h2>Uma muda hoje.<br /><span>Mais vida amanhã.</span></h2>
      {cityName && <p>{cityName}</p>}
    </div>
    <div className="adoption-welcome-art" aria-hidden="true"><GrowingTree /></div>
  </aside>;
}
