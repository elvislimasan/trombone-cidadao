import React from 'react';
import { Skeleton } from '@/design-system/feedback/Skeleton';

// A estrutura espelha o FeedCard para que a troca skeleton->conteudo
// nao produza layout shift.
const FeedCardSkeleton = () => (
  <div className="bg-surface-raised rounded-2xl border border-edge-subtle shadow-elevation-1 overflow-hidden">
    <div className="flex items-start gap-3 p-3.5">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-20" rounded="rounded-full" />
    </div>

    <Skeleton className="w-full aspect-[4/3]" rounded="rounded-none" />

    <div className="flex items-center gap-2 px-3 py-2 border-t border-edge-subtle">
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-7 w-10" />
      <Skeleton className="h-7 w-8 ml-auto" />
    </div>

    <div className="px-4 pb-3.5 pt-2 space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  </div>
);

const FeedSkeleton = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <FeedCardSkeleton key={i} />
    ))}
  </div>
);

export default FeedSkeleton;
