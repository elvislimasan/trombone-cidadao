import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, ArrowRight, Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MediaViewer = ({ media, startIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentItem = media[currentIndex];

  const goToPrevious = (e) => {
    e.stopPropagation();
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? media.length - 1 : prevIndex - 1));
  };

  const goToNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prevIndex) => (prevIndex === media.length - 1 ? 0 : prevIndex + 1));
  };

  const toggleFullscreen = (e) => {
    e.stopPropagation();
    const element = document.querySelector('.media-viewer-container');
    if (!element) return;

    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') goToNext(e);
      if (e.key === 'ArrowLeft') goToPrevious(e);
      if (e.key === 'Escape') onClose();
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [media, onClose]);

  const isYoutubeVideo = (url) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const getYoutubeEmbedUrl = (url) => {
    try {
      const urlObj = new URL(url);
      let videoId;
      if (urlObj.hostname === 'youtu.be') {
        videoId = urlObj.pathname.slice(1);
      } else {
        videoId = urlObj.searchParams.get('v');
      }
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    } catch (e) {
      return null;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-[2000] media-viewer-container"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full h-full flex flex-col items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-4 right-4 flex items-center gap-4 z-[2001]">
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20">
              {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="w-6 h-6" />
            </Button>
          </div>

          {media.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 rounded-full z-[2001]"
              >
                <ArrowLeft className="w-8 h-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 rounded-full z-[2001]"
              >
                <ArrowRight className="w-8 h-8" />
              </Button>
            </>
          )}

          <div className="w-full h-full max-w-6xl max-h-[85vh] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
              >
                {currentItem.type === 'photo' ? (
                  <img
                    src={currentItem.url}
                    alt={currentItem.name || `Mídia ${currentIndex + 1}`}
                    className="w-full h-full object-contain"
                  />
                ) : isYoutubeVideo(currentItem.url) ? (
                  <iframe
                    className="w-full h-full aspect-video"
                    src={getYoutubeEmbedUrl(currentItem.url)}
                    title={currentItem.name || 'Vídeo do YouTube'}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                ) : (
                  <video controls autoPlay className="w-full h-full object-contain">
                    <source src={currentItem.url} />
                    Seu navegador não suporta o player de vídeo.
                  </video>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="absolute bottom-4 text-center text-white z-[2001]">
            <p className="text-lg">{currentItem.name || `${currentItem.type === 'photo' ? 'Foto' : 'Vídeo'} ${currentIndex + 1}`}</p>
            <p className="text-sm text-gray-400">{currentIndex + 1} de {media.length}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MediaViewer;