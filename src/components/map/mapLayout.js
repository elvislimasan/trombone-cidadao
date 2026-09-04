// Medidas compartilhadas por todas as telas de mapa.
//
// A altura de Ruas é a referência do produto. Manter estas classes num único
// arquivo impede Broncas, Obras e Imóveis de criarem cálculos próprios quando
// o cabeçalho, o banner ou a área segura mudarem.
export const MAP_PAGE_VIEWPORT_CLASS =
  'min-[1100px]:h-[calc(100dvh-var(--header-bar-height)-var(--header-safe-top,0px)-var(--app-banner-height,0px)-var(--desktop-extra-top,0px))] min-[1100px]:overflow-hidden';

export const MAP_GRID_CLASS =
  'grid gap-2 sm:gap-3 min-[1100px]:min-h-0 min-[1100px]:flex-1 min-[1100px]:grid-rows-[minmax(0,1fr)]';

export const MAP_CANVAS_CLASS =
  'relative h-[calc(100dvh-28rem-var(--safe-area-bottom,0px))] min-h-[22rem] w-full overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm sm:h-[calc(100dvh-24rem-var(--safe-area-bottom,0px))] sm:min-h-[24rem] min-[900px]:h-[calc(100dvh-19rem-var(--safe-area-bottom,0px))] lg:h-[calc(100dvh-16rem)] lg:min-h-[20rem] min-[1100px]:h-full min-[1100px]:min-h-0';
