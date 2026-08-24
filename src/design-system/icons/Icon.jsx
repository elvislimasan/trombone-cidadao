import React from 'react';

// Registry preenchido pelo index.js para evitar dependencia circular.
const registry = new Map();

export function registerIcons(entries) {
  for (const [name, Component] of Object.entries(entries)) {
    registry.set(name, Component);
  }
}

export function hasIcon(name) {
  return registry.has(name);
}

const Icon = ({ name, size = 24, className = '', title, strokeWidth = 1.75, ...rest }) => {
  const Component = registry.get(name);
  if (!Component) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] icone desconhecido: "${name}"`);
    }
    return null;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {/* Sem title o icone e decorativo (aria-hidden). Com title, o <title>
          nomeia o svg — sem aria-label junto, que duplicaria o texto acessivel. */}
      {title ? <title>{title}</title> : null}
      <Component />
    </svg>
  );
};

export default Icon;
