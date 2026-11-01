import React from 'react';

// Program imagery stays separate from photos submitted for individual trees.
export default function TreeProgramPhoto({ name, alt, className = '', sizes = '(max-width: 767px) 100vw, 400px', loading = 'lazy' }) {
  return <figure className={`tree-program-photo ${className}`}>
    <img src={`/images/arborization/${name}-960.webp`} srcSet={`/images/arborization/${name}-480.webp 480w, /images/arborization/${name}-960.webp 960w`} sizes={sizes} alt={alt} width={960} height={540} loading={loading} decoding="async" />
    <figcaption>Imagem ilustrativa</figcaption>
  </figure>;
}
