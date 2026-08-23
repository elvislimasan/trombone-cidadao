import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Search, Filter, FileSignature, ExternalLink, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import ReportDetails from '@/components/ReportDetails';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useUpvote } from '@/hooks/useUpvotes';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

// Quantas broncas por página.
//
// A lista carregava TODAS as broncas de uma vez — e cada linha vinha com
// comentários, mídias, timeline e upvotes embutidos. Com 540 broncas isso é
// alguns megabytes de JSON por abertura da tela, no celular do embaixador.
// Vinte por página mantém o payload num tamanho que cabe em rede móvel e
// preserva o modal de edição, que precisa da bronca inteira.
const PAGE_SIZE = 20;

// A busca vai para o servidor num filtro `or`, e vírgula/parêntese são
// separadores da sintaxe do PostgREST — deixá-los passar quebra a consulta.
// `%` é curinga do ilike: quem digita "50%" não está pedindo um curinga.
const sanitizarBusca = (termo) => (termo || '').replace(/[,()%\\]/g, ' ').trim();

const ManageReportsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { handleUpvote: handleUpvoteHook } = useUpvote();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({ searchTerm: '', status: 'all', category: 'all' });
  // O que o usuário digitou já apareceu no campo; o que vai para o servidor
  // espera ele parar de digitar, senão cada tecla vira uma consulta.
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedReport, setSelectedReport] = useState(null);
  const [deletingReport, setDeletingReport] = useState(null);
  const [loading, setLoading] = useState(true);
  // Primeira carga mostra esqueleto; as seguintes (trocar de página, refetch
  // após uma ação) mantêm a lista antiga visível para a tela não piscar.
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  // Respostas fora de ordem: trocar de página duas vezes rápido pode fazer a
  // resposta da página 1 chegar depois da 2 e sobrescrever a lista certa.
  const requisicaoRef = useRef(0);
  // No celular a página seguinte se soma à lista em vez de substituí-la; no
  // desktop, troca. Quem pede a página diz qual dos dois quer.
  const acumularRef = useRef(false);

  const isMobile = useIsMobile();

  const categories = useMemo(() => ({
    'iluminacao': 'Iluminação Pública', 'buracos': 'Buracos na Via', 'esgoto': 'Esgoto Entupido',
    'limpeza': 'Limpeza Urbana', 'poda': 'Poda de Árvore', 'vazamento-de-agua': 'Vazamento de Água', 'outros': 'Outros',
  }), []);

  const statusOptions = useMemo(() => [
    { value: 'all', label: 'Todos os Status' },
    { value: 'pending', label: 'Pendente' },
    { value: 'in-progress', label: 'Em Andamento' },
    { value: 'resolved', label: 'Resolvido' },
    { value: 'duplicate', label: 'Duplicada' },
    { value: 'pending_resolution', label: 'Verificando Resolução' },
  ], []);

  const categoryOptions = useMemo(() => [
    { value: 'all', label: 'Todas as Categorias' },
    ...Object.entries(categories).map(([value, label]) => ({ value, label }))
  ], [categories]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginaSegura = Math.min(page, totalPages);

  // Filtro trocado recomeça da primeira página: continuar na página 7 de um
  // resultado que agora tem 2 páginas mostra uma lista vazia. O `setPage` anda
  // junto do `setBuscaAtiva` (e do `setFilters`, em `handleFilterChange`) para
  // que as duas mudanças entrem na mesma renderização — separadas, disparavam
  // uma consulta a mais, do filtro novo na página antiga, jogada fora depois.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAtiva(filters.searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.searchTerm]);

  const fetchReports = useCallback(async () => {
    const requisicao = ++requisicaoRef.current;
    setLoading(true);

    // No celular, recarregar sem acumular (troca de filtro, refetch depois de
    // apagar ou favoritar) tem que trazer TUDO o que já estava na tela: a lista
    // é uma rolagem contínua, e devolver só a última fatia apagaria o começo.
    const de = (isMobile && !acumularRef.current) ? 0 : (paginaSegura - 1) * PAGE_SIZE;
    const ate = paginaSegura * PAGE_SIZE - 1;
    let query = supabase
      .from('reports')
      .select(
        '*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), report_media(*), upvotes:upvotes(count), timeline:report_timeline(*), favorite_reports!left(*), petitions(id, status)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      // Desempate estável: duas broncas criadas no mesmo instante poderiam
      // trocar de lugar entre uma página e outra, sumindo ou duplicando.
      .order('id', { ascending: false });

    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.category !== 'all') query = query.eq('category_id', filters.category);

    const termo = sanitizarBusca(buscaAtiva);
    if (termo) {
      query = query.or(`title.ilike.%${termo}%,description.ilike.%${termo}%,protocol.ilike.%${termo}%`);
    }

    if (user) {
      query = query.eq('favorite_reports.user_id', user.id);
    }

    const { data, error, count } = await query.range(de, ate);

    if (requisicao !== requisicaoRef.current) return;

    if (error) {
      toast({ title: "Erro ao buscar broncas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = (data || []).map(r => ({
        ...r,
        location: r.location ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] } : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        authorName: r.author?.name || 'Anônimo',
        upvotes: r.upvotes?.[0]?.count || 0,
        comments: (r.comments || []).filter(c => c.moderation_status === 'approved'),
        photos: (r.report_media || []).filter(m => m.type === 'photo'),
        videos: (r.report_media || []).filter(m => m.type === 'video'),
        is_favorited: (r.favorite_reports || []).length > 0,
        petitionId: r.petitions?.[0]?.id || null,
        petitionStatus: r.petitions?.[0]?.status || null,
      }));
      if (acumularRef.current) {
        // Dedupe por id: uma bronca criada entre uma página e outra empurra as
        // demais para baixo, e a linha da divisa apareceria duas vezes.
        setReports(prev => {
          const vistos = new Set(prev.map(r => r.id));
          return [...prev, ...formattedData.filter(r => !vistos.has(r.id))];
        });
      } else {
        setReports(formattedData);
      }
      if (typeof count === 'number') setTotalCount(count);
    }
    acumularRef.current = false;
    setLoading(false);
    setPrimeiraCarga(false);
  }, [toast, user, paginaSegura, filters.status, filters.category, buscaAtiva, isMobile]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Apagar o último item de uma página deixa `page` além do fim.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    // A busca não: ela só chega ao servidor depois do debounce, e é lá que a
    // página volta para 1.
    if (name !== 'searchTerm') setPage(1);
  };

  const irParaPagina = (destino) => {
    const alvo = Math.min(Math.max(1, destino), totalPages);
    if (alvo === paginaSegura) return;
    acumularRef.current = false;
    setPage(alvo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const temMais = reports.length < totalCount;

  const carregarMais = useCallback(() => {
    if (loading || !temMais) return;
    acumularRef.current = true;
    setPage(p => p + 1);
  }, [loading, temMais]);

  // A sentinela só trabalha no celular; no desktop a lista continua paginada
  // por botões, onde eles funcionam bem e dão o senso de tamanho do conjunto.
  const sentinelaRef = useInfiniteScroll(carregarMais, {
    enabled: isMobile && !loading && temMais,
  });

  const handleUpvote = async (id) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }

    // Call the hook
    const result = await handleUpvoteHook(id);

    if (result.success) {
      // Sem toast: o refetch abaixo já mostra o contador de apoios novo.
      fetchReports();
    } else {
      toast({ title: "Erro ao apoiar", description: result.error, variant: "destructive" });
    }
  };

  const handleToggleFeatured = async (report) => {
    try {
      const toggled = !report.is_featured;
      const updates = { is_featured: toggled, featured_at: toggled ? new Date().toISOString() : null };
      const { error } = await supabase.from('reports').update(updates).eq('id', report.id);
      if (error) throw error;
      toast({
        title: toggled ? 'Marcada como destaque' : 'Removida dos destaques',
        description: toggled ? 'Esta bronca aparecerá na Home em Destaques.' : 'Esta bronca não aparecerá mais em Destaques.'
      });
      fetchReports();
      if (selectedReport?.id === report.id) {
        setSelectedReport(prev => ({ ...prev, ...updates }));
      }
    } catch (e) {
      toast({ title: 'Erro ao alterar destaque', description: e.message, variant: 'destructive' });
    }
  };



  const handleTransformToPetition = async (report) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Faça login como administrador para transformar em abaixo-assinado.", variant: "destructive" });
      return;
    }
    
    try {
        // Verificar se já existe uma petição para esta bronca
        const { data: existingPetitions, error: checkError } = await supabase
          .from('petitions')
          .select('id')
          .eq('report_id', report.id)
          .limit(1);

        if (checkError) throw checkError;

        if (existingPetitions && existingPetitions.length > 0) {
          // Se já existe, apenas redireciona para o editor
          navigate(`/abaixo-assinado/${existingPetitions[0].id}?edit=true`);
          return;
        }

        const petitionData = {
          title: report.title,
          target: '', // Deixar vazio para preencher no editor
          description: report.description,
          goal: 100,
          report_id: report.id,
          author_id: user.id,
          status: 'draft',
          image_url: report.photos && report.photos.length > 0 ? report.photos[0].url : null
        };
  
        const { data: newPetition, error: createError } = await supabase
          .from('petitions')
          .insert(petitionData)
          .select()
          .single();
  
        if (createError) throw createError;
  
        // REMOVIDO: Não atualizar a flag is_petition na bronca imediatamente.
        // Isso só deve acontecer quando o usuário salvar a petição no editor.
  
        toast({
          title: "Editor Iniciado",
          description: "Redirecionando para o editor para finalizar os detalhes.",
        });
  
        navigate(`/abaixo-assinado/${newPetition.id}?edit=true`);
  
      } catch (error) {
        console.error(error);
        toast({
          title: "Erro ao criar",
          description: error.message,
          variant: "destructive"
        });
      }
  };

  const handleUpdateReport = async (editData) => {
    const { 
      id,
      title,
      description,
      address,
      location,
      category_id,
      pole_number,
      pole_id,
      reported_post_identifier,
      reported_plate,
      reported_pole_distance_m,
      newPhotos,
      newVideos,
      removedMedia,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      is_from_water_utility,
      moderation_status,
      rejection_title,
      rejection_description,
      rejected_at
    } = editData;

    const reportUpdates = {};
    if (typeof title !== 'undefined') reportUpdates.title = title;
    if (typeof description !== 'undefined') reportUpdates.description = description;
    if (typeof address !== 'undefined') reportUpdates.address = address;
    if (typeof category_id !== 'undefined') reportUpdates.category_id = category_id;
    if (typeof status !== 'undefined') reportUpdates.status = status;
    if (typeof is_recurrent !== 'undefined') reportUpdates.is_recurrent = is_recurrent;
    if (typeof evaluation !== 'undefined') reportUpdates.evaluation = evaluation;
    if (typeof resolution_submission !== 'undefined') reportUpdates.resolution_submission = resolution_submission;
    if (typeof moderation_status !== 'undefined') reportUpdates.moderation_status = moderation_status;
    if (typeof rejection_title !== 'undefined') reportUpdates.rejection_title = rejection_title;
    if (typeof rejection_description !== 'undefined') reportUpdates.rejection_description = rejection_description;
    if (typeof rejected_at !== 'undefined') reportUpdates.rejected_at = rejected_at;

    if (typeof is_from_water_utility !== 'undefined' && typeof category_id !== 'undefined') {
      reportUpdates.is_from_water_utility = category_id === 'buracos' ? !!is_from_water_utility : null;
    }

    if (typeof category_id !== 'undefined') {
      if (category_id === 'iluminacao') {
        if (typeof pole_number !== 'undefined') {
          reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
        }
        if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
        if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
        if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
        if (typeof reported_pole_distance_m !== 'undefined') {
          if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
          else {
            const n = Number(reported_pole_distance_m);
            reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
          }
        }
      } else {
        reportUpdates.pole_number = null;
        reportUpdates.pole_id = null;
        reportUpdates.reported_post_identifier = null;
        reportUpdates.reported_plate = null;
        reportUpdates.reported_pole_distance_m = null;
      }
    } else if (typeof pole_number !== 'undefined') {
      reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
      if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
      if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
      if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
      if (typeof reported_pole_distance_m !== 'undefined') {
        if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
        else {
          const n = Number(reported_pole_distance_m);
          reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
        }
      }
    }

    if (location) reportUpdates.location = `POINT(${location.lng} ${location.lat})`;

    const shouldRetryWithoutRejectionFields = (err) => {
      const msg = String(err?.message || '');
      if (err?.code === 'PGRST204') return true;
      if (msg.includes('schema cache') && msg.includes('reports')) return true;
      if (msg.includes("Could not find the 'rejection_")) return true;
      if (msg.includes("Could not find the 'rejected_at'")) return true;
      return false;
    };

    const stripRejectionFields = (obj) => {
      const { rejection_title, rejection_description, rejected_at, ...rest } = obj || {};
      return rest;
    };

    const tryUpdate = async (payload) => {
      const res = await supabase.from('reports').update(payload).eq('id', id);
      return res?.error || null;
    };

    let updateError = await tryUpdate(reportUpdates);
    if (updateError && shouldRetryWithoutRejectionFields(updateError)) {
      updateError = await tryUpdate(stripRejectionFields(reportUpdates));
    }

    if (updateError) {
      toast({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }
    
    if (removedMedia && removedMedia.length > 0) {
      const { error: deleteMediaError } = await supabase
        .from('report_media')
        .delete()
        .in('id', removedMedia);

      if (deleteMediaError) {
        toast({ title: "Erro ao remover mídia antiga", description: deleteMediaError.message, variant: "destructive" });
        return;
      }

      const mediaToRemoveFromStorage = reports
        .find(r => r.id === id)
        ?.report_media.filter(m => removedMedia.includes(m.id));

      if (mediaToRemoveFromStorage && mediaToRemoveFromStorage.length > 0) {
        const pathsToRemove = mediaToRemoveFromStorage.map(m => new URL(m.url).pathname.split('/reports-media/')[1]).filter(Boolean);
        if (pathsToRemove.length > 0) {
          await supabase.storage.from('reports-media').remove(pathsToRemove);
        }
      }
    }

    toast({ title: "Bronca atualizada com sucesso!" });
    fetchReports();
    setSelectedReport(null);
  };
  
  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Ação necessária", description: "Você precisa estar logado para favoritar.", variant: "destructive" });
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      // Sem toast no sucesso: o refetch e o setSelectedReport abaixo já viram o
      // coração. "Sucesso / Adicionado aos seus favoritos" só repete o ícone.
      if (error) {
        toast({ title: "Erro", description: "Não foi possível remover dos favoritos.", variant: "destructive" });
      }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro", description: "Não foi possível adicionar aos favoritos.", variant: "destructive" });
      }
    }
    fetchReports();
    if(selectedReport?.id === reportId) {
       setSelectedReport(prev => ({...prev, is_favorited: !isFavorited}));
    }
  };

  const handleDeleteReport = async () => {
    if (!deletingReport) return;
    
    // Delete media from storage first
    if (deletingReport.report_media && deletingReport.report_media.length > 0) {
        const pathsToDelete = deletingReport.report_media.map(media => {
            try {
                const url = new URL(media.url);
                const path = url.pathname.split('/reports-media/')[1];
                return path;
            } catch (e) {
                console.error("URL inválida:", media.url);
                return null;
            }
        }).filter(Boolean);
        
        if (pathsToDelete.length > 0) {
            const { error: storageError } = await supabase.storage.from('reports-media').remove(pathsToDelete);
            if (storageError) {
                toast({ title: "Erro ao remover mídias do armazenamento", description: storageError.message, variant: "destructive" });
                // We can decide to stop here or continue
            }
        }
    }
  
    // Now delete from database tables
    const { error } = await supabase.from('reports').delete().eq('id', deletingReport.id);

    if (error) {
      toast({ title: "Erro ao remover bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca removida com sucesso!", variant: "destructive" });
      fetchReports();
    }
    setDeletingReport(null);
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Broncas - Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Broncas</h1>
              <p className="mt-2 text-lg text-muted-foreground">Central de controle para todas as solicitações.</p>
            </div>
          </div>
        </motion.div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por título, protocolo..." className="pl-10" value={filters.searchTerm} onChange={(e) => handleFilterChange('searchTerm', e.target.value)} />
            </div>
            <Combobox
              value={filters.status}
              onChange={(v) => handleFilterChange('status', v)}
              options={statusOptions}
              placeholder="Filtrar por status"
              searchPlaceholder="Buscar status..."
            />
            <Combobox
              value={filters.category}
              onChange={(v) => handleFilterChange('category', v)}
              options={categoryOptions}
              placeholder="Filtrar por categoria"
              searchPlaceholder="Buscar categoria..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Broncas</CardTitle>
            <CardDescription>
              {totalCount === 0
                ? 'Nenhuma bronca encontrada.'
                : isMobile
                  // Rolando não há "página": o que interessa é quanto já veio.
                  ? `${reports.length} de ${totalCount} broncas.`
                  : `${totalCount} broncas encontradas — exibindo ${(paginaSegura - 1) * PAGE_SIZE + 1}–${Math.min(totalCount, (paginaSegura - 1) * PAGE_SIZE + reports.length)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {primeiraCarga ? (
              <div className="space-y-2 md:space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                Nenhuma bronca corresponde aos filtros selecionados.
              </p>
            ) : (
              // O esmaecido do refetch é só do desktop: no celular a lista
              // cresce por baixo, e apagar o que já está lido a cada rolagem
              // seria pior que não avisar nada.
              <div className={`space-y-2 md:space-y-3 transition-opacity ${loading && !isMobile ? 'opacity-50 pointer-events-none' : ''}`}>
                {reports.map(report => (
                  <div key={report.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 md:p-4 bg-background rounded-lg border gap-3 md:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm md:text-base truncate">{report.title}</p>
                      <p className="text-[10px] md:text-sm text-muted-foreground">Autor: {report.author?.name || 'N/A'} | Status: <span className="font-medium">{report.status}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                      {report.petitionId ? (
                        <a href={`/abaixo-assinado/${report.petitionId}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full sm:w-auto text-blue-600 hover:text-blue-700 hover:bg-blue-100 h-8 md:h-9 text-[10px] md:text-xs px-2" 
                          >
                            <ExternalLink className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
                            Acompanhar ({report.petitionStatus})
                          </Button>
                        </a>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="flex-1 sm:flex-none text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100 h-8 md:h-9 text-[10px] md:text-xs px-2" 
                          onClick={() => handleTransformToPetition(report)}
                        >
                          <FileSignature className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
                          Gerar Petição
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 md:h-9 md:w-9 ${report.is_featured ? 'text-yellow-500 hover:text-yellow-600' : ''}`}
                          onClick={() => handleToggleFeatured(report)}
                          title={report.is_featured ? 'Remover destaque' : 'Marcar como destaque'}
                        >
                          <Star className={`w-3 h-3 md:w-4 md:h-4 ${report.is_featured ? 'fill-yellow-400' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={() => setSelectedReport(report)} title="Editar"><Edit className="w-3 h-3 md:w-4 md:h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 text-red-500 hover:text-red-600" onClick={() => setDeletingReport(report)} title="Excluir"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Celular rola; desktop pagina.
                Um par de botões no fim da lista é confortável com mouse e ruim
                com o polegar: a cada 20 itens obriga a mirar num alvo pequeno
                no rodapé para continuar lendo o que já se estava lendo. */}
            {!primeiraCarga && isMobile && (temMais || loading) && (
              <div ref={sentinelaRef} className="mt-6 flex flex-col items-center gap-3">
                {loading ? (
                  <>
                    <Skeleton className="h-[72px] w-full rounded-lg" />
                    <Skeleton className="h-[72px] w-full rounded-lg" />
                  </>
                ) : (
                  // Rede de segurança: se o IntersectionObserver não disparar
                  // (WebView antiga, rolagem dentro de outro contêiner), ainda
                  // há como avançar.
                  <Button variant="outline" size="sm" onClick={carregarMais}>
                    Carregar mais
                  </Button>
                )}
              </div>
            )}

            {!primeiraCarga && !isMobile && totalPages > 1 && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Página {paginaSegura} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={loading || paginaSegura === 1}
                    onClick={() => irParaPagina(paginaSegura - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={loading || paginaSegura === totalPages}
                    onClick={() => irParaPagina(paginaSegura + 1)}
                  >
                    Próxima <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={handleUpdateReport}
          onUpvote={handleUpvote}
          onLink={() => {}}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}

      <Dialog open={!!deletingReport} onOpenChange={(open) => !open && setDeletingReport(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a bronca "{deletingReport?.title}"? Esta ação é irreversível e removerá todos os comentários e mídias associados.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteReport}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};

export default ManageReportsPage;
