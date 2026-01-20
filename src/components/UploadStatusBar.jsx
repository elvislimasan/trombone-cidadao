import React from 'react';
import { useUpload } from '@/contexts/UploadContext';
import { Progress } from '@/components/ui/progress';
import { X, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const UploadStatusBar = () => {
  const { activeUploads, isUploading, totalProgress, isMinimized, toggleMinimized, cancelUpload } = useUpload();
  const uploads = Object.values(activeUploads);

  if (uploads.length === 0) return null;

  // Se minimizado, mostra apenas uma pílula flutuante ou barra fina
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer animate-in fade-in slide-in-from-bottom-5"
        onClick={toggleMinimized}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        <span className="text-sm font-medium">
          {isUploading ? 'Enviando...' : 'Concluído'}
        </span>
        <Progress value={totalProgress} className="w-16 h-2" />
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-4 pb-2 animate-in slide-in-from-bottom-10">
      <div className="bg-card/95 backdrop-blur-md border shadow-xl rounded-xl overflow-hidden">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer border-b"
          onClick={toggleMinimized}
        >
          <div className="flex items-center gap-2">
            {isUploading ? (
              <div className="relative">
                 <div className="absolute inset-0 rounded-full animate-ping bg-primary/20"></div>
                 <Loader2 className="h-4 w-4 animate-spin text-primary relative z-10" />
              </div>
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            <span className="font-semibold text-sm">
              {isUploading ? `Enviando ${uploads.length} arquivo(s)...` : 'Envios concluídos'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* List */}
        <div className="max-h-60 overflow-y-auto p-2 space-y-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 p-2 rounded-lg bg-background border">
              {/* Icon/Thumbnail Placeholder */}
              <div className={cn(
                "w-10 h-10 rounded flex items-center justify-center bg-muted shrink-0",
                upload.status === 'completed' && "bg-green-100 dark:bg-green-900/20",
                upload.status === 'error' && "bg-red-100 dark:bg-red-900/20"
              )}>
                {upload.type === 'video' ? '🎥' : '📷'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium truncate max-w-[150px]">
                    {upload.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {upload.status === 'completed' ? '100%' : 
                     upload.status === 'error' ? 'Erro' : 
                     `${Math.round(upload.progress)}%`}
                  </span>
                </div>
                
                <Progress 
                  value={upload.progress} 
                  className={cn(
                    "h-1.5",
                    upload.status === 'completed' && "[&>div]:bg-green-500",
                    upload.status === 'error' && "[&>div]:bg-red-500"
                  )} 
                />
              </div>

              {upload.status === 'uploading' && (
                <button 
                    onClick={(e) => { e.stopPropagation(); cancelUpload(upload.id); }}
                    className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UploadStatusBar;
