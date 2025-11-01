import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ReportErrorModal = ({ onClose }) => {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({
        title: "Descrição vazia",
        description: "Por favor, descreva o erro que você encontrou.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from('error_reports').insert({
      description,
      page_url: window.location.href,
      user_id: user?.id,
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Erro ao reportar",
        description: "Não foi possível enviar seu relatório. Tente novamente.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Relatório enviado!",
        description: "Obrigado por nos ajudar a melhorar. Nossa equipe irá analisar o problema.",
      });
      onClose();
    }
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
            <h2 className="text-xl font-bold gradient-text flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Reportar um Erro
            </h2>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Encontrou algo que não funciona? Descreva o problema abaixo.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: O botão de compartilhar não está funcionando nesta página..."
            rows={5}
            className="resize-none"
          />

          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="flex-1 bg-primary hover:bg-primary/90 gap-2" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : <><Send className="w-4 h-4" /> Enviar Relatório</>}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ReportErrorModal;