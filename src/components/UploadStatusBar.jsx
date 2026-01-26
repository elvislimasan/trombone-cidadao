import React, { useState } from 'react';
import { useUpload } from '@/contexts/UploadContext';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const UploadStatusBar = () => {
  const { activeUploads, totalProgress, cancelUpload } = useUpload();
  const [isOpen, setIsOpen] = useState(false);
  
  // Apenas Nativo
  if (!Capacitor.isNativePlatform()) return null;

  const uploads = Object.values(activeUploads);
  
  // Não mostrar nada se não houver uploads ativos ou recentes
  if (uploads.length === 0) return null;

  const hasErrors = uploads.some(u => u.status === 'error');
  const allCompleted = uploads.every(u => u.status === 'completed');
  const isUploading = uploads.some(u => u.status !== 'completed' && u.status !== 'error');

  // Circular Progress SVG
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (totalProgress / 100) * circumference;

  // Ajuste de posição para mobile (acima da tab bar se houver)
  // Geralmente bottom-20 ou similar funciona bem para evitar sobreposição
  
  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[9999] flex flex-col items-end gap-2">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="bg-card border shadow-xl rounded-xl w-[calc(100vw-2rem)] max-w-sm overflow-hidden mb-2"
          >
            <div className="p-3 border-b bg-muted/50 flex justify-between items-center">
              <h3 className="font-semibold text-sm">Gerenciador de Uploads</h3>
              <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="max-h-60 overflow-y-auto p-2 space-y-2">
              {uploads.map((upload) => (
                <div key={upload.id} className="bg-background border rounded-lg p-2 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium truncate flex-1 pr-2" title={upload.name}>
                      {upload.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {upload.status === 'completed' ? '100%' : 
                        upload.status === 'error' ? 'Erro' : 
                        `${Math.round(upload.progress)}%`}
                      </span>
                      {(upload.status === 'uploading' || 
                        upload.status === 'pending' || 
                        upload.status === 'compressing' || 
                        upload.status === 'optimizing' || 
                        upload.status === 'preparing') && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); cancelUpload(upload.id); }}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                          title="Cancelar upload"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <Progress 
                    value={upload.progress} 
                    className={cn(
                      "h-1.5 mt-1",
                      upload.status === 'completed' && "[&>div]:bg-green-500",
                      upload.status === 'error' && "[&>div]:bg-red-500"
                    )} 
                  />
                  
                  {upload.status === 'error' && (
                    <p className="text-xs text-red-500 mt-1 truncate">
                      {upload.error || 'Falha no envio'}
                    </p>
                  )}
                  {(upload.status === 'compressing' || upload.status === 'optimizing') && (
                    <p className="text-xs text-yellow-500 mt-1 truncate">
                      Otimizando vídeo...
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        layout
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all border-2 pointer-events-auto bg-background",
          hasErrors ? "border-red-200 text-red-600" : 
          allCompleted ? "border-green-200 text-green-600" :
          "border-border text-primary"
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Progress Ring Background */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 p-1 pointer-events-none" viewBox="0 0 44 44">
           {/* Track */}
           <circle
             className="text-muted/20"
             strokeWidth="3"
             stroke="currentColor"
             fill="transparent"
             r={radius}
             cx="22"
             cy="22"
           />
           {/* Indicator */}
           {isUploading && (
             <circle
               className="text-primary transition-all duration-300 ease-in-out"
               strokeWidth="3"
               strokeDasharray={circumference}
               strokeDashoffset={strokeDashoffset}
               strokeLinecap="round"
               stroke="currentColor"
               fill="transparent"
               r={radius}
               cx="22"
               cy="22"
             />
           )}
        </svg>

        {/* Icon Central */}
        <div className="relative z-10">
          {hasErrors ? (
            <AlertCircle className="w-6 h-6" />
          ) : allCompleted ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : (
            <div className="relative">
              <Upload className="w-5 h-5" />
              {isUploading && (
                  <span className="absolute top-0 right-0 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
              )}
            </div>
          )}
        </div>
        
        {/* Badge Count */}
        {uploads.length > 1 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-background z-20">
                {uploads.length}
            </span>
        )}
      </motion.button>
    </div>
  );
};

export default UploadStatusBar;
