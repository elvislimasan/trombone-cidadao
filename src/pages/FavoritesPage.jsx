import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Star, MapPin, ThumbsUp } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import ReportDetails from '@/components/ReportDetails';
import LinkReportModal from '@/components/LinkReportModal';
import { useNavigate } from 'react-router-dom';
import { useUpvote } from '../hooks/useUpvotes';

const PAGE_SIZE = 9;

const FavoritesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [favoriteReports, setFavoriteReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const {handleUpvote} = useUpvote();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [page, setPage] = useState(1);
  const [totalFavorites, setTotalFavorites] = useState(0);

  const fetchFavorites = useCallback(async (pageToLoad = 1) => {
    if (!user) return;
    setLoading(true);
    const from = (pageToLoad - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('favorite_reports')
      .select(`
        report:reports (
          *,
          pole_number,
          category:categories(name, icon),
          author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config),
          upvotes:signatures(count),
          comments:comments(count),
          report_media(*)
        )
      `)
      .eq('user_id', user.id)
      .range(from, to);

    if (error) {
      toast({ title: "Erro ao buscar favoritos", description: error.message, variant: "destructive" });
    } else {
      const formattedData = (data || []).map(fav => ({
        ...fav.report,
        location: fav.report.location ? { lat: fav.report.location.coordinates[1], lng: fav.report.location.coordinates[0] } : null,
        category: fav.report.category_id,
        categoryName: fav.report.category?.name,
        categoryIcon: fav.report.category?.icon,
        authorName: fav.report.author?.name || 'Anônimo',
        upvotes: fav.report.upvotes[0]?.count || 0,
        comments_count: fav.report.comments[0]?.count || 0,
        is_favorited: true,
        photos: (fav.report.report_media || []).filter(m => m.type === 'photo'),
        videos: (fav.report.report_media || []).filter(m => m.type === 'video'),
      }));
      setFavoriteReports(formattedData);
      setTotalFavorites((data && data.length < PAGE_SIZE && pageToLoad === 1) ? data.length : totalFavorites || (data ? data.length : 0));
      setPage(pageToLoad);
    }
    setLoading(false);
  }, [user, toast, totalFavorites]);

  useEffect(() => {
    fetchFavorites(1);
  }, [fetchFavorites]);

  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login.", variant: "destructive" });
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Removido dos favoritos! 💔" });
        fetchFavorites(page);
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => ({ ...prev, is_favorited: false }));
        }
      }
    } else {
      // This case is less likely on this page, but good to have
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Adicionado aos favoritos! ⭐" });
        fetchFavorites(page);
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => ({ ...prev, is_favorited: true }));
        }
      }
    }
  };

  const handleUpdateReport = async (editData) => {
    const { id } = editData;
    const { error } = await supabase.from('reports').update(editData).eq('id', id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca atualizada!" });
      fetchFavorites(page);
      setSelectedReport(null);
    }
  };

  const handleOpenLinkModal = (sourceReport) => {
    setReportToLink(sourceReport);
    setShowLinkModal(true);
  };

  const handleLinkReport = async (sourceReportId, targetReportId) => {
    const { error } = await supabase.from('reports').update({ status: 'duplicate', linked_to: targetReportId }).eq('id', sourceReportId);
    if (error) {
      toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca vinculada!" });
      fetchFavorites(page);
      setSelectedReport(null);
      setShowLinkModal(false);
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'pending') return 'Pendente';
    if (status === 'in-progress') return 'Em Andamento';
    if (status === 'resolved') return 'Resolvida';
    if (status === 'duplicate') return 'Duplicada';
    return status || 'Sem status';
  };

  const filteredFavorites = useMemo(() => {
    let list = [...favoriteReports];

    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }

    list.sort((a, b) => {
      if (sortBy === 'upvotes') {
        const aVotes = a.upvotes || 0;
        const bVotes = b.upvotes || 0;
        return bVotes - aVotes;
      }

      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    });

    return list;
  }, [favoriteReports, statusFilter, sortBy]);

  const statusChips = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'in-progress', label: 'Em andamento' },
    { key: 'resolved', label: 'Resolvidas' },
  ];

  const totalPages = totalFavorites ? Math.max(1, Math.ceil(totalFavorites / PAGE_SIZE)) : 1;

  return (
    <>
      <Helmet>
        <title>Meus Favoritos - Trombone Cidadão</title>
      </Helmet>
      <div className="flex flex-col bg-[#F9FAFB] md:px-6">
        <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-6 max-w-[88rem] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-2"
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
              <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
              Favoritos
            </p>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827] flex items-center gap-2">
              <Star className="w-6 h-6 text-yellow-400" />
              Minhas Broncas Favoritas
            </h1>
            <p className="text-xs lg:text-sm text-[#6B7280] max-w-2xl">
              Acompanhe as broncas que você marcou com estrela e volte a elas com facilidade.
            </p>
          </motion.div>

          {!loading && favoriteReports.length > 0 && (
            <div className="flex flex-col gap-3 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] md:text-xs text-[#6B7280]">
                  {filteredFavorites.length} {filteredFavorites.length === 1 ? 'bronca favorita' : 'broncas favoritas'}
                </div>
                <div className="flex items-center gap-2 text-[11px] md:text-xs text-[#6B7280]">
                  <span>Ordenar por</span>
                  <button
                    type="button"
                    onClick={() => setSortBy('recent')}
                    className={`px-2 py-0.5 rounded-full border text-[11px] ${
                      sortBy === 'recent'
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                    }`}
                  >
                    Mais recentes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('upvotes')}
                    className={`px-2 py-0.5 rounded-full border text-[11px] ${
                      sortBy === 'upvotes'
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                    }`}
                  >
                    Mais apoiadas
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setStatusFilter(chip.key)}
                    className={`px-3 py-1 rounded-full border text-[11px] md:text-xs transition ${
                      statusFilter === chip.key
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[#6B7280]">Carregando seus favoritos...</p>
          ) : filteredFavorites.length === 0 ? (
            totalFavorites === 0 && statusFilter === 'all' ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl bg-white border-[#E5E7EB]">
                <p className="text-sm text-[#6B7280]">Você ainda não favoritou nenhuma bronca.</p>
                <p className="text-xs md:text-sm text-[#6B7280] mt-2">
                  Clique na estrela ⭐ em uma bronca para adicioná-la aqui.
                </p>
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-xl bg-white border-[#E5E7EB]">
                <p className="text-sm text-[#6B7280]">Nenhuma bronca encontrada com os filtros atuais.</p>
              </div>
            )
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              {filteredFavorites.map((r) => {
                const coverPhoto = r.photos && r.photos[0];
                return (
                  <div
                    key={r.id}
                    className="h-full bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition"
                    onClick={() => setSelectedReport(r)}
                  >
                    <div className="relative h-36 md:h-40 w-full">
                      {coverPhoto && coverPhoto.url ? (
                        <img
                          src={coverPhoto.url}
                          alt={r.title}
                          className="w-full h-full object-cover transform transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center">
                          <span className="text-4xl">{r.categoryIcon || '📍'}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0" />
                      <div className="absolute top-2 left-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/90 text-[#111827] font-medium">
                          {getStatusLabel(r.status)}
                        </span>
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                          Favorito
                        </span>
                        <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {r.upvotes}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 space-y-1.5">
                      <p className="text-xs text-[#6B7280] flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{r.address || 'Endereço não informado'}</span>
                      </p>
                      <p className="text-sm md:text-base font-semibold text-[#111827] leading-snug md:leading-snug line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">
                        {r.title}
                      </p>
                      <p className="text-xs md:text-sm text-[#6B7280] mt-0.5 leading-snug md:leading-snug line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                        {r.description}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#6B7280]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{r.categoryIcon}</span>
                          <span className="truncate">{r.categoryName}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-medium">
                          Nos seus favoritos
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[11px] md:text-xs text-[#6B7280]">
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => fetchFavorites(page - 1)}
                  className={`px-3 py-1 rounded-full border ${
                    page === 1
                      ? 'bg-[#E5E7EB] text-[#9CA3AF] border-[#E5E7EB] cursor-not-allowed'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                  }`}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => fetchFavorites(page + 1)}
                  className={`px-3 py-1 rounded-full border ${
                    page === totalPages
                      ? 'bg-[#E5E7EB] text-[#9CA3AF] border-[#E5E7EB] cursor-not-allowed'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                  }`}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={handleUpdateReport}
          onUpvote={() => handleUpvote(selectedReport.id, selectedReport.upvotes, selectedReport.user_has_upvoted)}
          onLink={handleOpenLinkModal}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}
      {showLinkModal && reportToLink && (
        <LinkReportModal
          sourceReport={reportToLink}
          allReports={favoriteReports}
          onClose={() => setShowLinkModal(false)}
          onLink={handleLinkReport}
        />
      )}
    </>
  );
};

export default FavoritesPage;
