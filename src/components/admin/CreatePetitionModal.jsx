import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ArrowDownToLine } from 'lucide-react';

const CreatePetitionModal = ({ report, onClose, onSuccess }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [openEditor, setOpenEditor] = useState(true);
  const [formData, setFormData] = useState({
    title: report?.title || '',
    target: '',
    description: report?.description || '',
    goal: 100,
    deadline: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);

    try {
      // 1. Criar a Petição
      const petitionData = {
        title: formData.title,
        target: formData.target,
        description: formData.description,
        goal: parseInt(formData.goal),
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        report_id: report?.id || null,
        author_id: user.id,
        status: 'open',
        image_url: report?.photos && report.photos.length > 0 ? report.photos[0].url : null // Tenta pegar imagem da bronca
      };

      const { data: newPetition, error: createError } = await supabase
        .from('petitions')
        .insert(petitionData)
        .select()
        .single();

      if (createError) throw createError;

      // 2. Se for vinculada a uma bronca, atualizar a bronca (opcional, mas bom para rastreio)
      if (report?.id) {
        const { error: updateReportError } = await supabase
          .from('reports')
          .update({ is_petition: true }) // Mantemos por enquanto para compatibilidade visual na lista antiga
          .eq('id', report.id);

        if (updateReportError) console.error("Erro ao atualizar flag na bronca:", updateReportError);
      }

      toast({
        title: "Abaixo-Assinado Criado! 🎉",
        description: "A campanha foi criada com sucesso e já pode receber assinaturas.",
      });

      if (onSuccess) onSuccess(newPetition);
      onClose();

      if (openEditor) {
        navigate(`/abaixo-assinado/${newPetition.id}?edit=true`);
      }

    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao criar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Transformar em Abaixo-Assinado</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título da Campanha</Label>
            <Input 
              id="title" 
              name="title" 
              value={formData.title} 
              onChange={handleChange} 
              placeholder="Ex: Salve a Praça Central"
              required 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target">Destinatário (Quem deve resolver?)</Label>
            <Input 
              id="target" 
              name="target" 
              value={formData.target} 
              onChange={handleChange} 
              placeholder="Ex: Prefeitura de Recife, Secretário de Saúde..."
              required 
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Descrição / Texto do Abaixo-Assinado</Label>
              {report?.description && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                  onClick={() => setFormData(prev => ({ ...prev, description: report.description }))}
                >
                  <ArrowDownToLine className="w-3 h-3" />
                  Usar descrição da bronca
                </Button>
              )}
            </div>
            <Textarea 
              id="description" 
              name="description" 
              value={formData.description} 
              onChange={handleChange} 
              placeholder="Descreva o objetivo e por que as pessoas devem assinar..."
              rows={5}
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal">Meta de Assinaturas</Label>
              <Input 
                id="goal" 
                name="goal" 
                type="number" 
                min="10"
                value={formData.goal} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Data Limite (Opcional)</Label>
              <Input 
                id="deadline" 
                name="deadline" 
                type="date" 
                value={formData.deadline} 
                onChange={handleChange} 
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox 
              id="openEditor" 
              checked={openEditor} 
              onCheckedChange={setOpenEditor} 
            />
            <Label htmlFor="openEditor" className="text-sm font-normal cursor-pointer">
              Continuar editando para adicionar imagens e novidades
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Criando...' : 'Criar Abaixo-Assinado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePetitionModal;
