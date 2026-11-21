export const LEGISLATIVE_VIEW_KEY = 'trombone:legislative-view:v1';
export const DEFAULT_LEGISLATIVE_VIEW = Object.freeze({ layout: 'cards', summary: true, distribution: false });

export function normalizeLegislativeView(value) {
  return Object.fromEntries(['mobile', 'desktop'].map(device => {
    const saved = value?.[device];
    return [device, {
      layout: ['cards', 'list'].includes(saved?.layout) ? saved.layout : DEFAULT_LEGISLATIVE_VIEW.layout,
      summary: typeof saved?.summary === 'boolean' ? saved.summary : DEFAULT_LEGISLATIVE_VIEW.summary,
      distribution: typeof saved?.distribution === 'boolean' ? saved.distribution : DEFAULT_LEGISLATIVE_VIEW.distribution,
    }];
  }));
}

export function readLegislativeView(storage) {
  try { return normalizeLegislativeView(JSON.parse(storage.getItem(LEGISLATIVE_VIEW_KEY))); }
  catch { return normalizeLegislativeView(null); }
}
