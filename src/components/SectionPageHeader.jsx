import React from 'react';

export default function SectionPageHeader({ title, description, children, inlineChildren = false }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 w-full">
        <div className={inlineChildren ? 'flex min-w-0 items-center justify-between gap-3' : undefined}>
          <h1 className="min-w-0 text-2xl font-extrabold tracking-tight text-content-primary sm:text-3xl">{title}</h1>
          {inlineChildren && children}
        </div>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-secondary">{description}</p>}
      </div>
      {!inlineChildren && children}
    </div>
  );
}
