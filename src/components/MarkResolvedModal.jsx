import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const MarkResolvedModal = ({ onClose, onSubmit }) => {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
      const webpFile = new File([blob], file.name.replace(/\.(jpe?g|png)$/i, '.webp'), { type: 'image/webp' });
      setPhotoFile(webpFile);
      setPhotoPreview(URL.createObjectURL(webpFile));
    } catch (_) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    onSubmit({ photoFile });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[3000]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-card rounded-2xl shadow-2xl max-w-md w-full border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold gradient-text">Marcar como Resolvido</h2>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Envie uma foto para comprovar a solução (opcional).</p>
        </div>

        <div className="p-6 space-y-6">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          
          {photoPreview ? (
            <div className="w-full aspect-video rounded-lg overflow-hidden relative group">
              <img src={photoPreview} alt="Pré-visualização" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" onClick={() => fileInputRef.current.click()}>
                  Trocar Foto
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="w-full aspect-video rounded-lg border-2 border-dashed border-input flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <Upload className="w-10 h-10 mb-2" />
              <span className="font-semibold">Clique para enviar uma foto (Opcional)</span>
              <span className="text-xs">PNG, JPG, GIF até 10MB</span>
            </button>
          )}

          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="flex-1 bg-green-600 hover:bg-green-700 gap-2">
              <Check className="w-4 h-4" />
              Confirmar Resolução
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MarkResolvedModal;