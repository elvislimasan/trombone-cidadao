import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';

const AppDownloadBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Notificar o App.jsx quando o banner estiver visível para ajustar padding
  useEffect(() => {
    if (isVisible) {
      // Calcular altura dinâmica baseada no tamanho da tela
      const isMobile = window.innerWidth < 640;
      const height = isMobile ? '3rem' : '3.5rem';
      document.documentElement.style.setProperty('--app-banner-height', height);
    } else {
      document.documentElement.style.setProperty('--app-banner-height', '0px');
    }
  }, [isVisible]);

  useEffect(() => {
    // Verificar se o banner foi fechado anteriormente
    const dismissed = localStorage.getItem('app-download-banner-dismissed');
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Verificar se já está no app nativo (Capacitor)
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      setIsDismissed(true);
      return;
    }

    // Mostrar apenas em mobile (não desktop)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      // Pequeno delay para animação suave
      setTimeout(() => {
        setIsVisible(true);
      }, 500);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('app-download-banner-dismissed', 'true');
    setIsDismissed(true);
  };

  const handleDownload = () => {
    // Link da Play Store
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.trombonecidadao.app';
    
    // Tentar abrir no app nativo se estiver disponível
    if (window.location.href.includes('android-app://')) {
      window.location.href = playStoreUrl;
    } else {
      window.open(playStoreUrl, '_blank');
    }
  };

  if (isDismissed || !isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-0 left-0 right-0 z-[1000] bg-gradient-to-r from-primary to-primary/90 text-white shadow-lg"
          style={{ 
            paddingTop: 'calc(var(--safe-area-top))',
            top: 'calc(4rem + var(--safe-area-top))'
          }}
        >
          <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold leading-tight">
                    Baixe o app Trombone Cidadão
                  </p>
                  <p className="text-xs text-white/80 leading-tight hidden sm:block">
                    Tenha acesso rápido e notificações
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={handleDownload}
                  size="sm"
                  className="bg-white text-primary hover:bg-white/90 text-xs sm:text-sm font-semibold gap-1 sm:gap-2 px-2 sm:px-4 h-8 sm:h-9"
                >
                  <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Baixar</span>
                  <span className="sm:hidden">App</span>
                </Button>
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:bg-white/20 rounded-full transition-colors flex-shrink-0"
                  aria-label="Fechar banner"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AppDownloadBanner;

