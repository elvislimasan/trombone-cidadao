import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Flag, Ban, Loader2 } from 'lucide-react';

const REASONS = [
  { value: 'spam', label: 'Spam ou golpe' },
  { value: 'harassment', label: 'Assédio ou bullying' },
  { value: 'hate_speech', label: 'Discurso de ódio' },
  { value: 'violence', label: 'Violência ou ameaça' },
  { value: 'sexual_content', label: 'Conteúdo sexual / nudez' },
  { value: 'misinformation', label: 'Informação falsa' },
  { value: 'illegal', label: 'Atividade ilegal' },
  { value: 'other', label: 'Outro motivo' },
];

const ReportContentModal = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  authorId,
  authorName,
  onBlocked,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const canBlock = !!user && !!authorId && user.id !== authorId;

  const handleSubmit = async () => {
    if (!targetType || !targetId) return;
    setSubmitting(true);
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: user?.id || null,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: 'Erro ao enviar denúncia',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Denúncia enviada',
      description: 'Nossa equipe vai analisar este conteúdo em até 24 horas.',
    });
    setDetails('');
    onClose();
  };

  const handleBlock = async () => {
    if (!canBlock) return;
    setBlocking(true);
    const { error } = await supabase.from('blocked_users').upsert({
      blocker_id: user.id,
      blocked_id: authorId,
    });
    setBlocking(false);
    if (error) {
      toast({
        title: 'Erro ao bloquear',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: `${authorName || 'Usuário'} bloqueado`,
      description: 'Você não verá mais conteúdo dessa pessoa.',
    });
    if (onBlocked) onBlocked(authorId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" /> Denunciar conteúdo
          </DialogTitle>
          <DialogDescription>
            Conte para a moderação por que este conteúdo viola nossas diretrizes.
            Denúncias são analisadas em até 24 horas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="report-reason">Motivo</Label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Detalhes (opcional)</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Descreva o problema..."
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full"
            variant="destructive"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Flag className="w-4 h-4 mr-2" />}
            Enviar denúncia
          </Button>

          {canBlock && (
            <Button
              onClick={handleBlock}
              disabled={blocking}
              variant="outline"
              className="w-full"
            >
              {blocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
              Bloquear {authorName || 'este usuário'}
            </Button>
          )}

          <Button onClick={onClose} variant="ghost" className="w-full">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportContentModal;
