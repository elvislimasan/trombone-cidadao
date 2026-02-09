import { useEffect, useMemo, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Custom hook to manage SEO and Open Graph meta tags for the petition page.
 * Dynamically updates document head tags based on petition data.
 *
 * @param {Object|null} petition - The petition object
 * @param {string} id - The petition ID
 * @returns {Object} Calculated SEO data (title, description, image, url)
 */
export const usePetitionSEO = (petition, id) => {
  const getBaseUrl = useCallback(() => {
    let baseUrl;
    if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    } else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        baseUrl = origin;
      } else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        baseUrl = origin;
      } else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      } else {
        baseUrl = origin;
      }
    } else if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    } else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    return baseUrl.replace(/\/$/, '');
  }, []);

  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);

  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    let petitionImage = defaultThumbnail;

    if (petition) {
      if (petition.gallery && petition.gallery.length > 0) {
        petitionImage = petition.gallery[0];
      } else if (petition.image_url) {
        petitionImage = petition.image_url;
      }

      if (petitionImage && !petitionImage.startsWith('http')) {
        petitionImage = `${baseUrl}${petitionImage.startsWith('/') ? '' : '/'}${petitionImage}`;
      }

      if (petitionImage && petitionImage !== defaultThumbnail) {
        try {
          const cleanUrl = petitionImage.split('?')[0];
          petitionImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
        } catch (e) {
          console.error("Error generating OG image URL", e);
        }
      }
    }

    if (!petitionImage || petitionImage.trim() === '') {
      petitionImage = defaultThumbnail;
    }

    return {
      title: petition?.title || 'Abaixo-Assinado - Trombone Cidadão',
      description: petition?.description ? (petition.description.length > 150 ? petition.description.substring(0, 150) + '...' : petition.description) : 'Assine esta petição e ajude a fazer a diferença!',
      image: petitionImage,
      url: `${baseUrl}/abaixo-assinado/${id}`,
    };
  }, [baseUrl, petition, id]);

  useEffect(() => {
    const { title, description, image, url } = seoData;
    if (!image) return;

    const updateMetaTags = () => {
      const selectorsToRemove = [
        'meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[property="og:image:width"]',
        'meta[property="og:image:height"]', 'meta[property="og:image:type"]', 'meta[property="og:image:alt"]',
        'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]',
        'meta[name="twitter:card"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
        'meta[name="twitter:image"]', 'meta[name="twitter:image:alt"]', 'meta[name="image"]', 'link[rel="image_src"]',
      ];
      
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      const metaTags = [
        { property: 'property', value: 'og:title', content: title },
        { property: 'property', value: 'og:description', content: description },
        { property: 'property', value: 'og:url', content: url },
        { property: 'property', value: 'og:image', content: image },
        { property: 'property', value: 'og:image:url', content: image },
        { property: 'property', value: 'og:image:width', content: '1200' },
        { property: 'property', value: 'og:image:height', content: '630' },
        { property: 'property', value: 'og:image:type', content: 'image/jpeg' },
        { property: 'property', value: 'og:image:alt', content: title },
        { property: 'name', value: 'twitter:card', content: 'summary_large_image' },
        { property: 'name', value: 'twitter:title', content: title },
        { property: 'name', value: 'twitter:description', content: description },
        { property: 'name', value: 'twitter:image', content: image },
        { property: 'name', value: 'image', content: image },
      ];

      metaTags.forEach(({ property, value, content }) => {
        const element = document.createElement('meta');
        if (property.name) {
            element.setAttribute('name', property.value);
        } else {
            element.setAttribute('property', property.value);
        }
        element.setAttribute('content', content);
        document.head.insertBefore(element, document.head.firstChild);
      });

      const imageSrcLink = document.createElement('link');
      imageSrcLink.setAttribute('rel', 'image_src');
      imageSrcLink.setAttribute('href', image);
      document.head.insertBefore(imageSrcLink, document.head.firstChild);
    };

    updateMetaTags();
    const timers = [
      setTimeout(updateMetaTags, 100),
      setTimeout(updateMetaTags, 500),
      setTimeout(updateMetaTags, 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [seoData]);
};
