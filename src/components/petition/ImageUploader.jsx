import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import ImageCropper from '@/components/ui/ImageCropper';

const ImageUploader = ({ onUploadComplete, maxFiles = 5 }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Cropping state
  const [filesToProcess, setFilesToProcess] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const [currentImageSrc, setCurrentImageSrc] = useState(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [processedUrls, setProcessedUrls] = useState([]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
    // Reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFiles = (files) => {
    const validFiles = files.filter(file => {
      const isValidType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast({
        title: "Arquivos ignorados",
        description: "Alguns arquivos eram inválidos (apenas JPG/PNG/WebP até 5MB).",
        variant: "destructive"
      });
    }

    if (validFiles.length === 0) return;

    if (validFiles.length > maxFiles) {
        toast({
            title: "Muitos arquivos",
            description: `Você pode enviar no máximo ${maxFiles} imagens por vez.`,
            variant: "destructive"
        });
        return;
    }

    setFilesToProcess(validFiles);
    setProcessedUrls([]);
    setCurrentFileIndex(0);
    setUploading(true);
    setProgress(0);
  };

  useEffect(() => {
    if (currentFileIndex >= 0 && currentFileIndex < filesToProcess.length) {
      const file = filesToProcess[currentFileIndex];
      const reader = new FileReader();
      reader.onload = () => {
        setCurrentImageSrc(reader.result);
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
    } else if (currentFileIndex !== -1 && currentFileIndex >= filesToProcess.length) {
      // All done
      finishUpload();
    }
  }, [currentFileIndex, filesToProcess]);

  const handleCropComplete = async (croppedBlob) => {
    try {
        const fileExt = 'jpg'; // Cropped image is usually jpeg/png
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('petition-images')
          .upload(fileName, croppedBlob);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('petition-images')
          .getPublicUrl(fileName);

        setProcessedUrls(prev => [...prev, publicUrl]);
        
    } catch (error) {
        console.error('Upload error:', error);
        toast({ 
          title: "Erro no upload", 
          description: "Falha ao enviar imagem.", 
          variant: "destructive" 
        });
    } finally {
        // Move to next
        setCropperOpen(false);
        setCurrentFileIndex(prev => prev + 1);
        setProgress(((currentFileIndex + 1) / filesToProcess.length) * 100);
    }
  };

  const handleCancelCrop = () => {
    // Skip this file
    setCropperOpen(false);
    setCurrentFileIndex(prev => prev + 1);
  };

  const finishUpload = () => {
    if (processedUrls.length > 0) {
      onUploadComplete(processedUrls);
      toast({ title: "Upload concluído", description: `${processedUrls.length} imagens adicionadas.` });
    }
    setUploading(false);
    setCurrentFileIndex(-1);
    setFilesToProcess([]);
  };

  return (
    <>
      {currentImageSrc && (
        <ImageCropper 
          open={cropperOpen} 
          imageSrc={currentImageSrc}
          onClose={handleCancelCrop}
          onCropComplete={handleCropComplete}
          aspect={16 / 9}
        />
      )}
      
      <div
        className={`border-2 border-dashed rounded-lg p-4 md:p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-3 md:gap-4">
          <div className="p-3 md:p-4 bg-muted rounded-full">
            {uploading ? (
              <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="font-medium">
              {uploading ? `Processando imagens... ${Math.round(progress)}%` : "Arraste imagens ou clique para selecionar"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Suporta JPG, PNG e WebP (max 5MB)
            </p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Selecionar Arquivos
          </Button>
        </div>
      </div>
    </>
  );
};

export default ImageUploader;
