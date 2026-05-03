import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Check, Flag, Trash2, ExternalLink, EyeOff, Loader2 } from 'lucide-react';

const REASON_LABELS = {
  spam: 'Spam ou golpe',
  harassment: 'Assédio ou bullying',
  hate_speech: 'Discurso de ódio',
  violence: 'Violência ou ameaça',
  sexual_content: 'Conteúdo sexual',
  misinformation: 'Informação falsa',
  illegal: 'Atividade ilegal',
  other: 'Outro',
};

const STATUS_LABELS = {
  pending: { label: 'Pendente', cls: 'text-amber-700 bg-amber-100' },
  reviewed: { label: 'Revisada', cls: 'text-blue-700 bg-blue-100' },
  dismissed: { label: 'Descartada', cls: 'text-gray-700 bg-gray-100' },
  actioned: { label: 'Acionada', cls: 'text-green-700 bg-green-100' },
};

const targetLink = (type, id) => {
  switch (type) {
    case 'report': return `/bronca/${id}`;
    case 'petition': return `/abaixo-assinado/${id}`;
    case 'profile': return `/perfil/${id}`;
    default: return null;
  }
};

const ContentReportsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('content_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter !== 'all') q = q.eq('status', filter);

    const { data, error } = await q;
    if (error) {
      toast({ title: 'Erro ao carregar denúncias', description: error.message, variant: 'destructive' });
    } else {
      const rows = data || [];
      const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id).filter(Boolean)));

      if (reporterIds.length === 0) {
        setItems(rows);
        setLoading(false);
        return;
      }

      const { data: reporters, error: reportersError } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', reporterIds);

      if (reportersError) {
        setItems(rows);
        setLoading(false);
        return;
      }

      const reporterById = new Map((reporters || []).map((p) => [p.id, p]));
      setItems(rows.map((r) => ({ ...r, reporter: reporterById.get(r.reporter_id) || null })));
    }
    setLoading(false);
  }, [toast, filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const updateStatus = async (id, newStatus) => {
    setUpdatingId(id);
    const { error } = await supabase
      .from('content_reports')
      .update({
        status: newStatus,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    setUpdatingId(null);

    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Denúncia atualizada' });
      fetchItems();
    }
  };

  const removeReportContent = async (item) => {
    if (item.target_type !== 'report') {
      toast({ title: 'Remoção automática indisponível', description: 'Use o link e remova manualmente no painel correspondente.', variant: 'destructive' });
      return;
    }
    if (!confirm('Remover esta bronca da plataforma? (soft delete)')) return;
    setUpdatingId(item.id);
    const { error } = await supabase
      .from('reports')
      .update({ deleted_at: new Date().toISOString(), moderation_status: 'rejected' })
      .eq('id', item.target_id);

    if (error) {
      setUpdatingId(null);
      toast({ title: 'Erro ao remover conteúdo', description: error.message, variant: 'destructive' });
      return;
    }
    await updateStatus(item.id, 'actioned');
  };

  const counts = items.length;

  return (
    <>
      <Helmet><title>Denúncias de Conteúdo - Admin</title></Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red flex items-center gap-3">
                <Flag className="w-7 h-7" /> Denúncias de Conteúdo
              </h1>
              <p className="mt-2 text-muted-foreground">Modere conteúdo reportado pelos usuários (UGC).</p>
            </div>
          </div>
        </motion.div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="reviewed">Revisadas</TabsTrigger>
            <TabsTrigger value="actioned">Acionadas</TabsTrigger>
            <TabsTrigger value="dismissed">Descartadas</TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Lista</CardTitle>
            <CardDescription>{counts} denúncia(s) encontrada(s).</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhuma denúncia. ✅</p>
            ) : (
              <div className="space-y-4">
                {items.map((it) => {
                  const statusMeta = STATUS_LABELS[it.status] || STATUS_LABELS.pending;
                  const link = targetLink(it.target_type, it.target_id);
                  return (
                    <div key={it.id} className="p-4 bg-background rounded-lg border">
                      <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div className="flex-grow space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMeta.cls}`}>
                              {statusMeta.label}
                            </span>
                            <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                              {REASON_LABELS[it.reason] || it.reason}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(it.created_at).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          <div className="text-sm">
                            <span className="font-medium capitalize">{it.target_type}</span>{' '}
                            <span className="text-muted-foreground">#{String(it.target_id).slice(0, 8)}</span>
                            {link && (
                              <Link to={link} target="_blank" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                                <ExternalLink className="w-3 h-3" /> abrir
                              </Link>
                            )}
                          </div>

                          {it.details && (
                            <p className="text-sm text-foreground bg-muted/30 p-2 rounded">{it.details}</p>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Reportado por: {it.reporter?.name || (it.reporter_id ? 'Usuário' : 'Anônimo')}
                          </p>
                        </div>

                        {it.status === 'pending' && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === it.id}
                              onClick={() => updateStatus(it.id, 'dismissed')}
                            >
                              <Check className="w-4 h-4 mr-1" /> Descartar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === it.id}
                              onClick={() => updateStatus(it.id, 'reviewed')}
                            >
                              <EyeOff className="w-4 h-4 mr-1" /> Marcar revisada
                            </Button>
                            {it.target_type === 'report' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={updatingId === it.id}
                                onClick={() => removeReportContent(it)}
                              >
                                <Trash2 className="w-4 h-4 mr-1" /> Remover conteúdo
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ContentReportsPage;
