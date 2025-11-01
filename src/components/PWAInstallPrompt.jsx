import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

const PWAInstallPrompt = ({ deferredPrompt, onDismiss }) => {
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the A2HS prompt');
      } else {
        console.log('User dismissed the A2HS prompt');
      }
    }
    onDismiss();
  };

  const handleDismissClick = () => {
    localStorage.setItem('pwa-install-prompt-dismissed', 'true');
    onDismiss();
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm w-full"
    >
      <div className="flex items-start gap-4">
        <div className="bg-primary/10 p-3 rounded-full">
          <Download className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-grow">
          <h3 className="font-semibold text-foreground">Instale o App!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Tenha acesso rápido e fácil ao nosso app adicionando-o à sua tela inicial.
          </p>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleInstallClick} className="flex-1">
              Instalar
            </Button>
            <Button onClick={handleDismissClick} variant="ghost" className="flex-1">
              Agora não
            </Button>
          </div>
        </div>
        <Button onClick={handleDismissClick} variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default PWAInstallPrompt;