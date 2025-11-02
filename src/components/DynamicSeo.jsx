import React from 'react';
import { Helmet } from 'react-helmet';

const DynamicSEO = ({ 
  title, 
  description, 
  image, 
  url,
  type = "website" 
}) => {
  const siteName = "Trombone Cidadão";
  const baseUrl = "https://trombone-cidadao.vercel.app"; // ⚠️ SUBSTITUA PELO SEU DOMÍNIO REAL
  
  // Escolha UMA das opções abaixo para defaultImage:
  
  // Opção 1: Placeholder online (funciona imediatamente)
//   const defaultImage = "https://via.placeholder.com/1200x630/3B82F6/FFFFFF?text=Trombone+Cidadão";
  
  // Opção 2: Imagem local (se você criar uma)
  const defaultImage = `${baseUrl}/thumbnail.png`;
  
  // Opção 3: Logo do projeto
  // const defaultImage = `${baseUrl}/logo.png`;

  const pageTitle = title || siteName;
  const pageDescription = description || "Plataforma colaborativa para solicitação de serviços públicos em Floresta-PE. Registre, acompanhe e resolva as broncas da sua cidade.";
  const pageImage = image || defaultImage;
  const pageUrl = url || baseUrl;

  return (
    <Helmet>
      {/* Meta Tags Básicas */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={pageUrl} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:image" content={pageImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:locale" content="pt_BR" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={pageImage} />
      
      {/* Meta Tags para WhatsApp */}
      <meta name="twitter:image:alt" content={pageTitle} />
      <meta property="og:image:alt" content={pageTitle} />
    </Helmet>
  );
};

export default DynamicSEO;