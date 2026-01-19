import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { UploadCloud, Send, Image as ImageIcon, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const UploadWorkPhotoPage = () => {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchWork = useCallback(async () => {
    const { data, error } = await supabase
      .from('public_works')
      .select('id, title')
      .eq('id', workId)
      .single();
    
    if (error || !data) {
      toast({ title: "Obra não encontrada", variant: "destructive" });
      navigate('/obras-publicas');
    } else {
      setWork(data);
    }
  }, [workId, navigate, toast]);

  useEffect(() => {
    fetchWork();
  }, [fetchWork]);

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast({ title: "Nenhuma foto selecionada", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Você precisa estar logado para enviar fotos", variant: "destructive" });
      return;
    }

    setIsUploading(true);

    const uploadPromises = files.map(async ({ file }) => {
      let uploadFile = file;
      if (file.type && file.type.startsWith('image')) {
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
          uploadFile = new File([blob], file.name.replace(/\.(jpe?g|png)$/i, '.webp'), { type: 'image/webp' });
        } catch (_) {}
      }
      const fileName = `${user.id}/${Date.now()}_${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('work-media')
        .upload(fileName, uploadFile);

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('work-media')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('public_work_media')
        .insert({
          work_id: workId,
          url: publicUrl,
          type: file.type.startsWith('image') ? 'image' : 'video',
          name: uploadFile.name,
        });

      if (dbError) {
        throw dbError;
      }
    });

    try {
      await Promise.all(uploadPromises);
      toast({
        title: "Fotos enviadas com sucesso! 🎉",
        description: "Obrigado pela sua contribuição.",
      });
      navigate(`/obras-publicas/${workId}`);
    } catch (error) {
      toast({
        title: "Erro ao enviar fotos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!work) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Carregando...</h1>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Enviar Fotos da Obra - {work.title}</title>
        <meta name="description" content={`Contribua com fotos para a obra: ${work.title}.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto max-w-3xl px-4 py-12"
      >
        <Card className="overflow-hidden shadow-2xl">
          <CardHeader className="bg-muted/50 p-6">
            <Button variant="ghost" size="sm" className="absolute top-4 left-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <CardTitle className="text-2xl font-bold text-center text-tc-red pt-8">Enviar Fotos da Obra</CardTitle>
            <CardDescription className="text-center text-lg">{work.title}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div
              className="border-2 border-dashed border-muted-foreground/50 rounded-xl p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
                multiple
              />
              <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 font-semibold text-foreground">Arraste e solte as fotos aqui</p>
              <p className="text-sm text-muted-foreground">ou clique para selecionar os arquivos</p>
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-tc-red" />
                  Fotos Selecionadas ({files.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {files.map((file, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative group"
                    >
                      <img
                        className="w-full h-32 object-cover rounded-lg border border-border"
                        alt={`Pré-visualização da imagem ${index + 1}`}
                        src={file.preview} />
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={isUploading || files.length === 0}
                size="lg"
                className="bg-tc-red hover:bg-tc-red/90 text-white"
              >
                {isUploading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                    />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Enviar {files.length} {files.length === 1 ? 'Foto' : 'Fotos'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default UploadWorkPhotoPage;