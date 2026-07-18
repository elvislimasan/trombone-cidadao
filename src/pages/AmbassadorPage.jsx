import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Check, X, MapPin, FileText, Megaphone, Loader2, Users, ShieldCheck, Copy, Link2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Navigate } from 'react-router-dom';

const AmbassadorPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // State for "Minhas Cidades"
  const [myCities, setMyCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // State for "Broncas pendentes"
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // State for "Atualizações pendentes"
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  // Access guard
  const canAccess = user && (user.is_ambassador || user.is_master || user.is_admin);
  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  const fetchMyCities = useCallback(async () => {
    setLoadingCities(true);
    const { data, error } = await supabase
      .from('ambassador_cities')
      .select('id, city_id, status, cities(id, name, state_id, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (error) {
      toast({ title: 'Erro ao buscar cidades', description: error.message, variant: 'destructive' });
    } else {
      setMyCities(data || []);
    }
    setLoadingCities(false);
  }, [user.id, toast]);

  const fetchPendingReports = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingReports([]);
      setLoadingReports(false);
      return;
    }
    setLoadingReports(true);
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, category_id, created_at, moderation_status, city_id, category:category_id(name)')
      .in('city_id', cityIds)
      .eq('moderation_status', 'pending_approval')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao buscar broncas', description: error.message, variant: 'destructive' });
    } else {
      setPendingReports(data || []);
    }
    setLoadingReports(false);
  }, [toast]);

  const fetchPendingUpdates = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingUpdates([]);
      setLoadingUpdates(false);
      return;
    }
    setLoadingUpdates(true);
    // Get report_updates where the parent report is in my cities
    const { data, error } = await supabase
      .from('report_updates')
      .select(
        'id, report_id, update_type, message, status, created_at, ' +
        'author:profiles!report_updates_author_id_fkey(name), ' +
        'report:reports!report_updates_report_id_fkey(id, title, city_id)'
      )
      .eq('status', 'pending_moderation')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao buscar atualizações', description: error.message, variant: 'destructive' });
    } else {
      // Filter client-side by city
      const cityIdSet = new Set(cityIds);
      const filtered = (data || []).filter(u => u.report && cityIdSet.has(u.report.city_id));
      setPendingUpdates(filtered);
    }
    setLoadingUpdates(false);
  }, [toast]);

  useEffect(() => {
    fetchMyCities();
  }, [fetchMyCities]);

  useEffect(() => {
    if (!loadingCities) {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
      fetchPendingUpdates(cityIds);
    }
  }, [myCities, loadingCities, fetchPendingReports, fetchPendingUpdates]);

  const handleReportAction = async (reportId, newStatus) => {
    setActionLoadingId(`report-${reportId}-${newStatus}`);
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: newStatus, ...(newStatus === 'approved' ? { status: 'pending' } : {}) })
      .eq('id', reportId);

    if (error) {
      toast({ title: 'Erro ao processar bronca', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Bronca aprovada!' : 'Bronca rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
    }
    setActionLoadingId(null);
  };

  const handleUpdateAction = async (updateId, newStatus) => {
    setActionLoadingId(`update-${updateId}-${newStatus}`);
    const { error } = await supabase
      .from('report_updates')
      .update({ status: newStatus === 'approved' ? 'pending' : 'rejected' })
      .eq('id', updateId);

    if (error) {
      toast({ title: 'Erro ao processar atualização', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Atualização aprovada!' : 'Atualização rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingUpdates(cityIds);
    }
    setActionLoadingId(null);
  };

  const UPDATE_TYPE_LABELS = {
    still_here: 'O problema ainda está aqui',
    being_solved: 'O problema está sendo resolvido',
    solved: 'O problema foi resolvido',
  };

  const getCityNameById = (cityId) => {
    const found = myCities.find(c => c.city_id === cityId);
    if (!found) return '';
    const city = found.cities;
    return city ? `${city.name} - ${city.states?.uf || ''}` : '';
  };

  return (
    <>
      <Helmet>
        <title>Painel do Embaixador - Trombone Cidadão</title>
        <meta name="description" content="Painel do embaixador para moderar broncas e atualizações da sua cidade." />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8 text-tc-red" />
            <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Painel do Embaixador</h1>
          </div>
          <p className="text-muted-foreground text-base">
            Modere o conteúdo da sua cidade e mantenha a plataforma de qualidade.
          </p>
        </motion.div>

        <Tabs defaultValue="cities" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto sm:h-10 bg-muted/50 rounded-lg mb-6">
            <TabsTrigger value="cities" className="gap-2 text-xs sm:text-sm">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Minhas Cidades</span>
              <span className="sm:hidden">Cidades</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2 text-xs sm:text-sm">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Broncas Pendentes</span>
              <span className="sm:hidden">Broncas</span>
              {pendingReports.length > 0 && (
                <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-tc-red text-white text-[10px]">
                  {pendingReports.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-2 text-xs sm:text-sm">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">Atualizações Pendentes</span>
              <span className="sm:hidden">Atualizações</span>
              {pendingUpdates.length > 0 && (
                <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-tc-red text-white text-[10px]">
                  {pendingUpdates.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ABA: Minhas Cidades */}
          <TabsContent value="cities">
            {loadingCities ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando cidades...</span>
              </div>
            ) : myCities.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <MapPin className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-muted-foreground">Nenhuma cidade atribuída</p>
                  <p className="text-muted-foreground text-sm">Você ainda não é embaixador ativo de nenhuma cidade.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myCities.map((ac) => {
                  const city = ac.cities;
                  return (
                    <motion.div
                      key={ac.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="border-border hover:border-tc-red/40 transition-all">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <MapPin className="w-4 h-4 text-tc-red shrink-0" />
                            {city?.name || '—'}
                          </CardTitle>
                          <CardDescription>
                            {city?.states?.uf ? `Estado: ${city.states.uf}` : 'Estado desconhecido'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                            <Check className="w-3 h-3" /> Ativo
                          </span>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA: Broncas Pendentes */}
          <TabsContent value="reports">
            {loadingReports ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando broncas...</span>
              </div>
            ) : pendingReports.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma bronca pendente!</p>
                  <p className="text-muted-foreground text-sm">Todas as broncas da sua cidade já foram moderadas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingReports.map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="border-border overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch min-h-[90px]">
                          <div className="w-1.5 shrink-0 bg-blue-500" />
                          <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm md:text-base text-foreground truncate">
                                {report.title}
                              </h3>
                              <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                                {report.category?.name && (
                                  <span className="px-2 py-0.5 bg-muted rounded-full">{report.category.name}</span>
                                )}
                                <span>{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                                {report.city_id && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {getCityNameById(report.city_id)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                disabled={!!actionLoadingId}
                                onClick={() => handleReportAction(report.id, 'rejected')}
                              >
                                {actionLoadingId === `report-${report.id}-rejected` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><X className="w-3 h-3 mr-1" /> Rejeitar</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={!!actionLoadingId}
                                onClick={() => handleReportAction(report.id, 'approved')}
                              >
                                {actionLoadingId === `report-${report.id}-approved` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Check className="w-3 h-3 mr-1" /> Aprovar</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA: Atualizações Pendentes */}
          <TabsContent value="updates">
            {loadingUpdates ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Carregando atualizações...</span>
              </div>
            ) : pendingUpdates.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <Megaphone className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-green-600">Nenhuma atualização pendente!</p>
                  <p className="text-muted-foreground text-sm">Todas as atualizações da sua cidade já foram moderadas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingUpdates.map((update) => (
                  <motion.div
                    key={update.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="border-border overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch min-h-[90px]">
                          <div className="w-1.5 shrink-0 bg-orange-500" />
                          <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground mb-0.5">
                                Bronca: <span className="font-medium text-foreground">{update.report?.title || '—'}</span>
                              </p>
                              {update.update_type && (
                                <span className="inline-block text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full mb-1">
                                  {UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                                </span>
                              )}
                              {update.message && (
                                <p className="text-sm text-muted-foreground italic line-clamp-2">"{update.message}"</p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                <span>Por: {update.author?.name || 'Anônimo'}</span>
                                <span>{new Date(update.created_at).toLocaleDateString('pt-BR')}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                disabled={!!actionLoadingId}
                                onClick={() => handleUpdateAction(update.id, 'rejected')}
                              >
                                {actionLoadingId === `update-${update.id}-rejected` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><X className="w-3 h-3 mr-1" /> Rejeitar</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={!!actionLoadingId}
                                onClick={() => handleUpdateAction(update.id, 'approved')}
                              >
                                {actionLoadingId === `update-${update.id}-approved` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <><Check className="w-3 h-3 mr-1" /> Aprovar</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default AmbassadorPage;
