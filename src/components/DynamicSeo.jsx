// DynamicSEO.jsx
import { Helmet } from 'react-helmet-async';
import React from 'react';
import { Capacitor } from '@capacitor/core';

const DynamicSEO = ({ 
  title, 
  description, 
  image, 
  url, 
  type = "website" 
}) => {
  const siteName = "Trombone Cidadão";
  
  // URL base para imagens - fallback robusto (não usar localhost no app)
  const getBaseUrl = () => {
    let baseUrl;
    
    // 1. Prioridade: Variável de ambiente (configurada no Vercel)
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    }
    // 2. Se estiver no app nativo, sempre usar produção
    else if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    // 3. Se estiver no navegador, detectar automaticamente o ambiente
    else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      
      // Se for localhost, usar localhost
      if (origin.includes('localhost')) {
        baseUrl = origin;
      }
      // Se for Vercel (dev), usar Vercel
      else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        baseUrl = origin;
      }
      // Se for domínio de produção, usar produção
      else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      }
      // Fallback: usar a origem atual
      else {
        baseUrl = origin;
      }
    }
    // 4. Fallback final: produção
    else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    
    // Remover barra final se existir para evitar barras duplas
    return baseUrl.replace(/\/$/, '');
  };
  
  const baseUrl = getBaseUrl();
  
  // Imagem padrão (thumbnail) se não houver imagem específica ou em caso de erro
  const defaultImage = `${baseUrl}/images/thumbnail.jpg`;
  
  // IMPORTANTE: Verificar se a imagem recebida não é a thumbnail padrão quando deveria ser a da bronca
  const isDefaultThumbnail = image && typeof image === 'string' && image.includes('thumbnail.jpg');
  
  // Usa a imagem da bronca se disponível, senão usa a padrão
  const seoImage = image || defaultImage;
  
  // Garante que a URL da imagem seja absoluta
  const getAbsoluteImageUrl = (imgUrl) => {
    // Se não houver URL, retorna a thumbnail padrão
    if (!imgUrl) {
      return defaultImage;
    }
    
    // Se já for URL absoluta, retorna como está
    if (imgUrl.startsWith('http')) {
      return imgUrl;
    }
    
    // Se começar com /, adiciona baseUrl
    if (imgUrl.startsWith('/')) {
      return `${baseUrl}${imgUrl}`;
    }
    
    // Caso contrário, adiciona baseUrl com /
    return `${baseUrl}/${imgUrl}`;
  };

  const absoluteImageUrl = getAbsoluteImageUrl(seoImage);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph - Essencial para preview do link compartilhado */}
      {/* IMPORTANTE: Sempre definir og:image para garantir que a imagem da bronca seja usada */}
      {/* Usar prioritizeSeoTags para garantir que estas meta tags tenham prioridade */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImageUrl} />
      <meta property="og:image:url" content={absoluteImageUrl} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="pt_BR" />
      
      {/* Twitter Card - Para preview no Twitter/X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImageUrl} />
      <meta name="twitter:image:alt" content={title} />
      
      {/* WhatsApp e outras redes sociais usam Open Graph */}
      <meta name="image" content={absoluteImageUrl} />
      
      {/* Meta tag adicional para garantir que a imagem seja usada */}
      <link rel="image_src" href={absoluteImageUrl} />
      
      {/* Deep Links - App Links (Android) e Universal Links (iOS) */}
      {/* Isso faz com que o link abra no app se estiver instalado */}
      {url && url.includes('/bronca/') && (() => {
        const reportId = url.split('/bronca/')[1]?.split('?')[0]?.split('#')[0] || '';
        if (!reportId) return null;
        const deepLinkUrl = `trombonecidadao://bronca/${reportId}`;
        return (
          <>
            <meta property="al:android:app_name" content="Trombone Cidadão" />
            <meta property="al:android:package" content="com.trombonecidadao.app" />
            <meta property="al:android:url" content={deepLinkUrl} />
            <meta property="al:ios:app_name" content="Trombone Cidadão" />
            <meta property="al:ios:app_store_id" content="" />
            <meta property="al:ios:url" content={deepLinkUrl} />
            <meta property="al:web:url" content={url} />
            <meta property="al:web:should_fallback" content="true" />
          </>
        );
      })()}
      
      {/* JSON-LD para SEO estruturado */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": title,
          "description": description,
          "image": absoluteImageUrl,
          "url": url
        })}
      </script>
    </Helmet>
  );
};

export default DynamicSEO;