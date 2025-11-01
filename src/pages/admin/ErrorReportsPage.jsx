import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Trash2, User, Link as LinkIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

const ErrorReportsPage = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingReport, setDeletingReport] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('error_reports')
      .select('*, user:profiles(name)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao buscar relatórios de erro", description: error.message, variant: "destructive" });
    } else {
      setReports(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleStatusChange = async (id, newStatus) => {
    const { error } = await supabase
      .from('error_reports')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status atualizado com sucesso!" });
      fetchReports();
    }
  };

  const handleDelete = async () => {
    if (!deletingReport) return;
    const { error } = await supabase
      .from('error_reports')
      .delete()
      .eq('id', deletingReport.id);

    if (error) {
      toast({ title: "Erro ao deletar relatório", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Relatório deletado com sucesso!" });
      fetchReports();
    }
    setDeletingReport(null);
  };

  const getStatusChip = (status) => {
    switch (status) {
      case 'new': return <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">Novo</span>;
      case 'resolved': return <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">Resolvido</span>;
      default: return <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">{status}</span>;
    }
  };

  return (
    <>
      <Helmet>
        <title>Relatórios de Erro - Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/painel-controle"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Relatórios de Erro</h1>
              <p className="mt-2 text-lg text-muted-foreground">Analise e gerencie os erros reportados pelos usuários.</p>
            </div>
          </div>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Relatórios</CardTitle>
            <CardDescription>{reports.length} relatórios encontrados.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando...</p>
            ) : reports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum relatório de erro. Tudo certo por aqui! ✅</p>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} className="p-4 bg-background rounded-lg border">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex-grow">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusChip(report.status)}
                          <p className="text-sm text-muted-foreground">
                            {new Date(report.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <p className="font-semibold text-foreground">{report.description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                          {report.user && (
                            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {report.user.name}</span>
                          )}
                          {report.page_url && (
                            <a href={report.page_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary break-all">
                              <LinkIcon className="w-3 h-3 flex-shrink-0" /> <span>{report.page_url}</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex gap-2">
                        {report.status === 'new' && (
                          <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-600" onClick={() => handleStatusChange(report.id, 'resolved')}>
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingReport(report)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!deletingReport} onOpenChange={(open) => !open && setDeletingReport(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover este relatório de erro? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ErrorReportsPage;