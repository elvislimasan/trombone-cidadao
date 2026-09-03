import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { showAppError } from '@/lib/appError';

const TrashPage = () => {
  const [rejectedReports, setRejectedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemToConfirm, setItemToConfirm] = useState(null);
  const [actionType, setActionType] = useState('');

  const fetchRejectedReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, rejected_at')
      .eq('moderation_status', 'rejected')
      .order('rejected_at', { ascending: false });

    if (error) {
      showAppError({ title: "Erro ao buscar broncas rejeitadas", description: error.message, variant: "destructive" });
    } else {
      setRejectedReports(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRejectedReports();
  }, [fetchRejectedReports]);

  const handleRecover = async (reportId) => {
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: 'pending_approval', rejected_at: null })
      .eq('id', reportId);

    if (error) {
      showAppError({ title: "Erro ao recuperar bronca", description: error.message, variant: "destructive" });
    } else {
      fetchRejectedReports();
    }
    setItemToConfirm(null);
  };

  // Apagar a bronca não apaga as fotos.
  //
  // `report_media` cai por cascade no banco, mas os arquivos ficam no bucket
  // `reports-media` — sem nenhuma linha apontando para eles, portanto sem
  // nenhuma tela que os liste. Toda exclusão feita por aqui vinha deixando
  // esse rastro, e a conta do Storage é por byte guardado.
  const removerMidiasDoStorage = async (reportIds) => {
    if (!reportIds || reportIds.length === 0) return;

    const { data: media, error } = await supabase
      .from('report_media')
      .select('url')
      .in('report_id', reportIds);

    if (error || !media || media.length === 0) return;

    const caminhos = media
      .map((m) => {
        try {
          return new URL(m.url).pathname.split('/reports-media/')[1] || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (caminhos.length === 0) return;

    const { error: storageError } = await supabase.storage.from('reports-media').remove(caminhos);
    if (storageError) {
      // Não interrompe a exclusão: melhor a bronca sair do ar com um arquivo
      // órfão do que continuar publicada porque o bucket recusou.
      showAppError({
        title: 'Arquivos não removidos do armazenamento',
        description: storageError.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (reportId) => {
    // Storage primeiro: depois do delete no banco não há mais como saber quais
    // arquivos eram desta bronca.
    await removerMidiasDoStorage([reportId]);

    const { error } = await supabase.from('reports').delete().eq('id', reportId);

    if (error) {
      showAppError({ title: "Erro ao excluir permanentemente", description: error.message, variant: "destructive" });
    } else {
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
      setItemToConfirm(null);
      return;
    }

    await removerMidiasDoStorage(idsToDelete);

    const { error } = await supabase.from('reports').delete().in('id', idsToDelete);

    if (error) {
      showAppError({ title: "Erro ao limpar a lixeira", description: error.message, variant: "destructive" });
    } else {
      fetchRejectedReports();
    }
    setItemToConfirm(null);
  };

  const openConfirmationModal = (item, type) => {
    setItemToConfirm(item);
    setActionType(type);
  };

  const { visiveis: broncasVisiveis, propsPaginacao } = useListaPaginada(rejectedReports, {
    porPagina: 20,
  });

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
      <div className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Lixeira de Broncas</h1>
              {/* A frase anterior era "mantidas aqui por 30 dias", e não há
                  nada que apague sozinho: a consulta lista todas as rejeitadas,
                  desde sempre. Quem limpa é o botão ao lado, quando alguém o
                  aperta. Prometer expiração automática faz o administrador
                  supor que a lixeira se cuida — e ela não se cuida. */}
              <p className="mt-2 text-lg text-muted-foreground">Broncas rejeitadas ficam aqui até serem excluídas.</p>
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
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[84px] w-full rounded-lg" />
                ))}
              </div>
            ) : rejectedReports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">A lixeira está vazia. ✨</p>
            ) : (
              <div className="space-y-3">
                {broncasVisiveis.map(report => (
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

            {!loading && <PaginacaoLista {...propsPaginacao} />}
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
