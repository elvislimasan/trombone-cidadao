import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';

const TrashPage = () => {
  const [rejectedReports, setRejectedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemToConfirm, setItemToConfirm] = useState(null);
  const [actionType, setActionType] = useState('');
  const { toast } = useToast();

  const fetchRejectedReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, rejected_at')
      .eq('moderation_status', 'rejected')
      .order('rejected_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao buscar broncas rejeitadas", description: error.message, variant: "destructive" });
    } else {
      setRejectedReports(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchRejectedReports();
  }, [fetchRejectedReports]);

  const handleRecover = async (reportId) => {
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: 'pending_approval', rejected_at: null })
      .eq('id', reportId);

    if (error) {
      toast({ title: "Erro ao recuperar bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca recuperada!", description: "A bronca foi enviada para moderação." });
      fetchRejectedReports();
    }
    setItemToConfirm(null);
  };

  const handleDelete = async (reportId) => {
    // This is a permanent deletion
    const { error } = await supabase.from('reports').delete().eq('id', reportId);

    if (error) {
      toast({ title: "Erro ao excluir permanentemente", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca excluída permanentemente!", variant: "destructive" });
      fetchRejectedReports();
    }
    setItemToConfirm(null);
  };

  const handleEmptyTrash = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const idsToDelete = rejectedReports
      .filter(report => new Date(report.rejected_at) < thirtyDaysAgo)
      .map(report => report.id);

    if (idsToDelete.length === 0) {
      toast({ title: "Nenhuma bronca antiga para limpar.", description: "A lixeira está atualizada." });
      setItemToConfirm(null);
      return;
    }

    const { error } = await supabase.from('reports').delete().in('id', idsToDelete);

    if (error) {
      toast({ title: "Erro ao limpar a lixeira", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lixeira limpa!", description: `${idsToDelete.length} broncas antigas foram excluídas.` });
      fetchRejectedReports();
    }
    setItemToConfirm(null);
  };

  const openConfirmationModal = (item, type) => {
    setItemToConfirm(item);
    setActionType(type);
  };

  const confirmAction = () => {
    if (!itemToConfirm) return;
    if (actionType === 'recover') handleRecover(itemToConfirm.id);
    if (actionType === 'delete') handleDelete(itemToConfirm.id);
    if (actionType === 'empty') handleEmptyTrash();
  };

  return (
    <>
      <Helmet>
        <title>Lixeira - Admin</title>
        <meta name="description" content="Gerencie broncas rejeitadas." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Lixeira de Broncas</h1>
              <p className="mt-2 text-lg text-muted-foreground">Broncas rejeitadas são mantidas aqui por 30 dias.</p>
            </div>
          </div>
          <Button variant="destructive" onClick={() => openConfirmationModal({ id: 'empty' }, 'empty')} disabled={loading}>
            <Trash2 className="w-4 h-4 mr-2" /> Limpar Lixeira (+30 dias)
          </Button>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Broncas Rejeitadas</CardTitle>
            <CardDescription>{rejectedReports.length} itens na lixeira.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando lixeira...</p>
            ) : rejectedReports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">A lixeira está vazia. ✨</p>
            ) : (
              <div className="space-y-3">
                {rejectedReports.map(report => (
                  <div key={report.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div>
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-sm text-muted-foreground">Rejeitada {formatTimeAgo(report.rejected_at)}</p>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openConfirmationModal(report, 'recover')}>
                        <RotateCcw className="w-4 h-4 mr-2" /> Recuperar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => openConfirmationModal(report, 'delete')}>
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!itemToConfirm} onOpenChange={(open) => !open && setItemToConfirm(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-yellow-400" />
              Confirmar Ação
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {actionType === 'recover' && `Tem certeza que deseja recuperar a bronca "${itemToConfirm?.title}"? Ela voltará para a fila de moderação.`}
            {actionType === 'delete' && `Tem certeza que deseja excluir permanentemente a bronca "${itemToConfirm?.title}"? Esta ação não pode ser desfeita.`}
            {actionType === 'empty' && `Tem certeza que deseja excluir permanentemente todas as broncas rejeitadas há mais de 30 dias?`}
          </p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button
              type="button"
              variant={actionType === 'delete' || actionType === 'empty' ? 'destructive' : 'default'}
              onClick={confirmAction}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TrashPage;