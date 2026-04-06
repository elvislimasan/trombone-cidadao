import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const FeedCardSkeleton = () => (
  <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
    {/* Header */}
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>

    {/* Image */}
    <Skeleton className="w-full aspect-[4/3]" />

    {/* Engagement bar */}
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60">
      <Skeleton className="h-7 w-14 rounded-lg" />
      <Skeleton className="h-7 w-14 rounded-lg" />
      <Skeleton className="h-7 w-10 rounded-lg" />
      <Skeleton className="h-7 w-8 rounded-lg ml-auto" />
    </div>

    {/* Content */}
    <div className="px-4 pb-4 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-40 mt-1" />
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
