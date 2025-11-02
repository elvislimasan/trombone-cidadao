// DynamicSEO.jsx
import { Helmet } from 'react-helmet-async';
import React from 'react';

const DynamicSEO = ({ 
  title, 
  description, 
  image, 
  url, 
  type = "website" 
}) => {
  const siteName = "Trombone Cidadão";
  
  // URL base para imagens - fallback robusto
  const getBaseUrl = () => {
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://trombone-cidadao.vercel.app';
  };
  
  const baseUrl = getBaseUrl();
  
  // Imagem padrão se não houver imagem específica
  const defaultImage = `${baseUrl}/images/thumbnail.jpg`;
  
  // Usa a imagem da bronca se disponível, senão usa a padrão
  const seoImage = image ? image : defaultImage;
  
  // Garante que a URL da imagem seja absoluta
  const getAbsoluteImageUrl = (imgUrl) => {
    if (!imgUrl) return defaultImage;
    if (imgUrl.startsWith('http')) return imgUrl;
    if (imgUrl.startsWith('/')) return `${baseUrl}${imgUrl}`;
    return `${baseUrl}/${imgUrl}`;
  };

  const absoluteImageUrl = getAbsoluteImageUrl(seoImage);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImageUrl} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImageUrl} />
    </Helmet>
  );
};

export default DynamicSEO;