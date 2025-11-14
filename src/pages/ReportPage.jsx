import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReportDetails from '@/components/ReportDetails';

import { useToast } from '@/components/ui/use-toast';
import LinkReportModal from '@/components/LinkReportModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useUpvote } from '../hooks/useUpvotes';
import DynamicSEO from '../components/DynamicSeo';

const ReportPage = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const { handleUpvote } = useUpvote();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reports')
      .select(`
        *, 
        category:categories(name, icon), 
        author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), 
        comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), 
        timeline:report_timeline(*), 
        report_media(*), 
        upvotes:upvotes(count),
        favorite_reports(user_id)
      `)
      .eq('id', reportId)
      .single();

    if (error || !data) {
      toast({
        title: "Bronca não encontrada",
        description: "A solicitação que você está procurando não existe ou foi removida.",
        variant: "destructive"
      });
      navigate('/');
    } else {
      const formattedData = {
        ...data,
        location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
        category: data.category_id,
        categoryName: data.category?.name,
        categoryIcon: data.category?.icon,
        authorName: data.author?.name || 'Anônimo',
        authorAvatar: data.author?.avatar_url,
        photos: (data.report_media || []).filter(m => m.type === 'photo'),
        videos: (data.report_media || []).filter(m => m.type === 'video'),
        comments: (data.comments || []).filter(c => c.moderation_status === 'approved').map(c => ({
          ...c,
          authorName: c.author?.name || 'Anônimo'
        })),
        upvotes: data.upvotes[0]?.count || 0,
        is_favorited: user ? data.favorite_reports.some(fav => fav.user_id === user.id) : false,
      };
      setReport(formattedData);
    }
    setLoading(false);
  }, [reportId, navigate, toast, user]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleUpdateReport = async (editData) => {
    const { id, title, description, address, location, category_id, newPhotos, newVideos, removedMedia, status, is_recurrent, evaluation, resolution_submission, moderation_status } = editData;

    const reportUpdates = { title, description, address, category_id, status, is_recurrent, evaluation, resolution_submission , moderation_status};
    if (location) {
      reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    }

    const { error: updateError } = await supabase.from('reports').update(reportUpdates).eq('id', id);
    if (updateError) {
      toast({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }

    if (removedMedia && removedMedia.length > 0) {
      const { error: deleteError } = await supabase.from('report_media').delete().in('id', removedMedia);
      if (deleteError) {
        toast({ title: "Erro ao remover mídia antiga", description: deleteError.message, variant: "destructive" });
      }
    }

    const mediaToUpload = [
      ...(newPhotos || []).map(p => ({ ...p, type: 'photo' })),
      ...(newVideos || []).map(v => ({ ...v, type: 'video' }))
    ];

    if (mediaToUpload.length > 0) {
      const uploadPromises = mediaToUpload.map(async (media) => {
        const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
        const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, media.file);
        if (uploadError) throw new Error(`Falha no upload de ${media.name}: ${uploadError.message}`);
        const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
        return { report_id: id, url: publicUrl, type: media.type, name: media.name };
      });

      try {
        const uploadedMedia = await Promise.all(uploadPromises);
        if (uploadedMedia.length > 0) {
          const { error: insertError } = await supabase.from('report_media').insert(uploadedMedia);
          if (insertError) throw new Error(`Falha ao salvar mídia: ${insertError.message}`);
        }
      } catch (error) {
        toast({ title: "Erro no upload de nova mídia", description: error.message, variant: "destructive" });
      }
    }
    
    toast({ title: "Bronca atualizada com sucesso! ✨" });
    fetchReport();
  };

  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para favoritar.", variant: "destructive" });
      navigate('/login');
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Removido dos favoritos! 💔" });
        setReport(prev => ({ ...prev, is_favorited: false }));
      }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Adicionado aos favoritos! ⭐" });
        setReport(prev => ({ ...prev, is_favorited: true }));
      }
    }
  };

  const handleOpenLinkModal = (sourceReport) => {
    setReportToLink(sourceReport);
    setShowLinkModal(true);
  };

  const handleLinkReport = async (sourceReportId, targetReportId) => {
    const { error } = await supabase
      .from('reports')
      .update({ status: 'duplicate', linked_to: targetReportId })
      .eq('id', sourceReportId);
    
    if (error) {
      toast({ title: "Erro ao vincular bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca vinculada! 🔗", description: "A solicitação foi marcada como duplicada." });
      fetchReport();
    }
    setShowLinkModal(false);
    setReportToLink(null);
  };

  if (loading) {
    return <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50"><p>Carregando...</p></div>;
  }

  if (!report) {
    return null;
  }

  // Preparar dados para SEO
  const seoTitle = `Bronca: ${report.title} - Trombone Cidadão`;
  const seoDescription = report.description || `Confira esta solicitação em Floresta-PE: "${report.title}". Protocolo: ${report.protocol}`;
  const seoImage = report.photos && report.photos.length > 0 
    ? report.photos[0].url 
    : 'https://trombonecidadao.com.br/bronca/thumbnail.png';
  const seoUrl = `${window.location.origin}/bronca/${report.id}`;

  return (
    <>
      {/* Meta Tags Dinâmicas para esta bronca */}
      <DynamicSEO 
        title={seoTitle}
        description={seoDescription}
        image={seoImage}
        url={seoUrl}
        type="article"
      />
      
      <ReportDetails
        report={report}
        onClose={() => navigate('/')}
        onUpdate={handleUpdateReport}
        onUpvote={() => handleUpvote(report.id, report.upvotes, report.user_has_upvoted)}
        onLink={handleOpenLinkModal}
        onFavoriteToggle={handleFavoriteToggle}
      />
      
      {showLinkModal && reportToLink && (
        <LinkReportModal
          sourceReport={reportToLink}
          allReports={allReports}
          onClose={() => setShowLinkModal(false)}
          onLink={handleLinkReport}
        />
      )}
    </>
  );
};

export default ReportPage;