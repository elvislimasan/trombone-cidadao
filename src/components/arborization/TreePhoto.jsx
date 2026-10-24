import React, { useState } from 'react';
import { treeImage } from '@/lib/arborization';

export default function TreePhoto({ tree, className = '', imageClassName = '', captionClassName = 'mt-1 text-xs text-muted-foreground', fallback = null, children }) {
  const [failedUrls, setFailedUrls] = useState([]);
  const photo = treeImage(tree, failedUrls);
  if (!photo) return fallback;
  return <figure className={className} data-illustrative={photo.illustrative || undefined}>
    <img src={photo.url} alt={photo.alt} className={imageClassName} onError={() => setFailedUrls(current => [...current, photo.url])} />
    {photo.illustrative && <figcaption className={captionClassName}>{photo.caption}</figcaption>}
    {typeof children === 'function' ? children(photo) : children}
  </figure>;
}
