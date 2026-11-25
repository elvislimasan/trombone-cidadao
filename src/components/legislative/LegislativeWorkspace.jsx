import React from 'react';

export default function LegislativeWorkspace({ heading, navigation, children, navigationLabel = 'Câmara', navigationCount = 5, footer }) {
  return <div className="legislative-workspace">
    {heading}
    <aside className="legislative-workspace-rail">
      <nav className="legislative-nav" aria-label={navigationLabel} style={{ '--leg-navigation-count': navigationCount }}>{navigation}</nav>
      {footer && <div className="legislative-workspace-rail-footer">{footer}</div>}
    </aside>
    <div className="legislative-workspace-content">{children}</div>
  </div>;
}
