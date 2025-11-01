import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';

const ReportsTrashPage = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportToRestore, setReportToRestore] = useState(null);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('reports')
      .select('*, author:profiles!reports_author_id_fkey(name)')
      .eq('moderation_status', 'rejected')
      .gte('rejected_at', thirtyDaysAgo)
      .order('rejected_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao buscar broncas na lixeira", description: error.message, variant: "destructive" });
    } else {
      setReports(data);
      setFilteredReports(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const result = reports.filter(r =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.protocol && r.protocol.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredReports(result);
  }, [searchTerm, reports]);

  const handleRestore = async () => {
    if (!reportToRestore) return;
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: 'pending_approval', rejected_at: null })
      .eq('id', reportToRestore.id);

    if (error) {
      toast({ title: "Erro ao restaurar bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca restaurada!", description: "A bronca foi enviada de volta para moderação." });
      fetchReports();
    }
    setReportToRestore(null);
  };

  const handleDeletePermanent = async () => {
    if (!reportToDelete) return;

    // First, delete related media from storage
    const { data: media, error: mediaError } = await supabase
      .from('report_media')
      .select('url')
      .eq('report_id', reportToDelete.id);

    if (mediaError) {
      toast({ title: "Erro ao buscar mídias para exclusão", description: mediaError.message, variant: "destructive" });
      return;
    }

    if (media && media.length > 0) {
      const pathsToRemove = media.map(m => new URL(m.url).pathname.split('/reports-media/')[1]).filter(Boolean);
      if (pathsToRemove.length > 0) {
        const { error: storageError } = await supabase.storage.from('reports-media').remove(pathsToRemove);
        if (storageError) {
          toast({ title: "Erro ao remover arquivos do armazenamento", description: storageError.message, variant: "destructive" });
          // Continue deletion even if storage fails
        }
      }
    }

    // Then, delete the report from the database (this will cascade)
    const { error: deleteError } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportToDelete.id);

    if (deleteError) {
      toast({ title: "Erro ao excluir permanentemente", description: deleteError.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca excluída permanentemente!", variant: "destructive" });
      fetchReports();
    }
    setReportToDelete(null);
  };

  return (
    <>
      <Helmet>
        <title>Lixeira de Broncas - Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/painel-controle"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Lixeira de Broncas</h1>
              <p className="mt-2 text-lg text-muted-foreground">Broncas rejeitadas nos últimos 30 dias.</p>
            </div>
          </div>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Broncas Rejeitadas</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por título ou protocolo..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando lixeira...</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">A lixeira está vazia.</p>
            ) : (
              <div className="space-y-3">
                {filteredReports.map(report => (
                  <div key={report.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div>
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Autor: {report.author?.name || 'N/A'} | Rejeitada em: {new Date(report.rejected_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-600" onClick={() => setReportToRestore(report)}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setReportToDelete(report)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!reportToRestore} onOpenChange={(open) => !open && setReportToRestore(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">Restaurar Bronca</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Tem certeza que deseja restaurar a bronca "{reportToRestore?.title}"? Ela será enviada de volta para a fila de moderação.
          </DialogDescription>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" onClick={handleRestore} className="bg-green-600 hover:bg-green-700">
              <RotateCcw className="w-4 h-4 mr-2" /> Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">Excluir Permanentemente</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Tem certeza que deseja excluir permanentemente a bronca "{reportToDelete?.title}"? Esta ação é irreversível e removerá todos os dados associados.
          </DialogDescription>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDeletePermanent}>
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReportsTrashPage;