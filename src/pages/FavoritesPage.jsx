import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import ReportList from '@/components/ReportList';
import ReportDetails from '@/components/ReportDetails';
import LinkReportModal from '@/components/LinkReportModal';
import { useNavigate } from 'react-router-dom';
import { useUpvote } from '../hooks/useUpvotes';

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

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('favorite_reports')
      .select(`
        report:reports (
          *,
          pole_number,
          category:categories(name, icon),
          author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config),
          upvotes:upvotes(count),
          comments:comments(count),
          report_media(*)
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      toast({ title: "Erro ao buscar favoritos", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(fav => ({
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
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchFavorites();
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
        fetchFavorites();
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
        fetchFavorites();
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
      fetchFavorites();
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
      fetchFavorites();
      setSelectedReport(null);
      setShowLinkModal(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Meus Favoritos - Trombone Cidadão</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
            <Star className="w-8 h-8 text-yellow-400" />
            Minhas Broncas Favoritas
          </h1>
          <p className="text-muted-foreground mb-8">
            Acompanhe aqui as atualizações das solicitações que você marcou como favoritas.
          </p>
        </motion.div>

        {loading ? (
          <p>Carregando seus favoritos...</p>
        ) : favoriteReports.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">Você ainda não favoritou nenhuma bronca.</p>
            <p className="text-sm text-muted-foreground mt-2">Clique na estrela ⭐ em uma bronca para adicioná-la aqui.</p>
          </div>
        ) : (
          <ReportList reports={favoriteReports} onReportClick={setSelectedReport} />
        )}
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