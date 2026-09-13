import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { HardHat, Newspaper, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { showAppError } from '@/lib/appError';
import SectionPageHeader from '@/components/SectionPageHeader';
export default function FavoritesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [favoriteWorks, setFavoriteWorks] = useState([]);
  const [favoriteNews, setFavoriteNews] = useState([]);
  const [worksLoading, setWorksLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('works');
  const fetchFavoriteWorks = useCallback(async () => {
    if (!user) return;
    setWorksLoading(true);
    const { data, error } = await supabase
      .from('favorite_works')
      .select(`
        work:public_works (
          *,
          work_category:work_categories(name),
          work_area:work_areas(name)
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      showAppError({ title: "Erro ao buscar obras favoritas", description: error.message, variant: "destructive" });
      setFavoriteWorks([]);
    } else {
      const formattedData = (data || []).filter(fav => fav.work).map((fav) => ({
        ...fav.work,
        location: fav.work.location ? { lat: fav.work.location.coordinates[1], lng: fav.work.location.coordinates[0] } : null,
        categoryName: fav.work.work_category?.name,
        areaName: fav.work.work_area?.name,
      }));
      setFavoriteWorks(formattedData);
    }
    setWorksLoading(false);
  }, [user]);

  const loadFavoriteNewsIds = useCallback(() => {
    try {
      const key = user?.id ? `tc_favorite_news_ids_${user.id}` : 'tc_favorite_news_ids';
      const raw = localStorage.getItem(key);
      const ids = JSON.parse(raw || '[]');
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  }, [user?.id]);

  const fetchFavoriteNews = useCallback(async () => {
    setNewsLoading(true);
    const ids = loadFavoriteNewsIds();
    if (!ids.length) {
      setFavoriteNews([]);
      setNewsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('news')
      .select('id, title, date, description, image_url')
      .in('id', ids);
    if (error) {
      showAppError({ title: "Erro ao buscar notícias salvas", description: error.message, variant: "destructive" });
      setFavoriteNews([]);
    } else {
      const byId = new Map((data || []).map((n) => [n.id, n]));
      setFavoriteNews(ids.map((id) => byId.get(id)).filter(Boolean));
    }
    setNewsLoading(false);
  }, [loadFavoriteNewsIds]);

  useEffect(() => {
    fetchFavoriteWorks();
  }, [fetchFavoriteWorks]);

  useEffect(() => {
    fetchFavoriteNews();
  }, [fetchFavoriteNews]);

  useEffect(() => {
    const onStorage = () => fetchFavoriteNews();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchFavoriteNews]);

  const getWorkStatusInfo = (status) => {
    switch (status) {
      case 'in-progress': return { color: 'bg-blue-500', text: 'Em Andamento' };
      case 'completed': return { color: 'bg-green-500', text: 'Concluída' };
      case 'stalled': return { color: 'bg-red-500', text: 'Paralisada' };
      case 'planned': return { color: 'bg-purple-500', text: 'Prevista' };
      case 'tendered': return { color: 'bg-orange-500', text: 'Licitada' };
      default: return { color: 'bg-gray-500', text: 'Não iniciada' };
    }
  };

  const removeSavedNews = (newsId) => {
    try {
      const key = user?.id ? `tc_favorite_news_ids_${user.id}` : 'tc_favorite_news_ids';
      const ids = loadFavoriteNewsIds().filter((id) => id !== newsId);
      localStorage.setItem(key, JSON.stringify(ids));
      // Sem toast: o card sai da lista na mesma hora. Anunciar "removida" por
      // cima de uma lista que já encolheu é dizer o que está à vista.
      setFavoriteNews((prev) => prev.filter((n) => n.id !== newsId));
    } catch {}
  };


  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Helmet><title>Obras e notícias salvas — Trombone Cidadão</title></Helmet>
    <Link to="/seguindo" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand">← Acompanhando</Link>
    <SectionPageHeader title="Obras e notícias salvas" description="Seus outros conteúdos guardados para consultar depois." />
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-4 grid h-auto grid-cols-2"><TabsTrigger value="works" className="min-h-11">Obras</TabsTrigger><TabsTrigger value="news" className="min-h-11">Notícias</TabsTrigger></TabsList>
            <TabsContent value="works">
              {worksLoading ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-surface-raised border-edge-subtle">
                  <p className="text-sm text-content-secondary">Carregando suas obras favoritas...</p>
                </div>
              ) : favoriteWorks.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-surface-raised border-edge-subtle">
                  <p className="text-sm text-content-secondary">Você ainda não favoritou nenhuma obra.</p>
                  <p className="text-xs md:text-sm text-content-secondary mt-2">
                    Clique na estrela ⭐ em uma obra para adicioná-la aqui.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {favoriteWorks.map((work) => {
                    const statusInfo = getWorkStatusInfo(work.status);
                    return (
                      <div key={work.id} className="bg-surface-raised border border-edge-subtle rounded-2xl shadow-sm p-4 hover:shadow-lg transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <HardHat className="w-5 h-5 text-tc-red flex-shrink-0" />
                            <p className="font-semibold text-content-primary truncate">{work.title}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full text-white ${statusInfo.color}`}>{statusInfo.text}</span>
                        </div>
                        {work.description && (
                          <p className="text-xs text-content-secondary mt-2 line-clamp-2">{work.description}</p>
                        )}
                        {work.execution_percentage > 0 && (
                          <div className="mt-3">
                            <div className="flex justify-between text-xs font-medium mb-1 text-content-secondary">
                              <span>Progresso</span>
                              <span>{work.execution_percentage}%</span>
                            </div>
                            <Progress value={work.execution_percentage} className="h-2" />
                          </div>
                        )}
                        <div className="text-[11px] text-content-secondary mt-3 space-y-1">
                          {work.total_value > 0 && <p>Valor: {formatCurrency(work.total_value)}</p>}
                          {work.last_update && <p>Atualização: {new Date(work.last_update).toLocaleDateString('pt-BR')}</p>}
                        </div>
                        <Button size="sm" className="w-full mt-4" onClick={() => navigate(`/obras-publicas/${work.id}`)}>
                          Ver detalhes
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="news">
              {newsLoading ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-surface-raised border-edge-subtle">
                  <p className="text-sm text-content-secondary">Carregando notícias salvas...</p>
                </div>
              ) : favoriteNews.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-surface-raised border-edge-subtle">
                  <p className="text-sm text-content-secondary">Você ainda não salvou nenhuma notícia.</p>
                  <Button className="mt-4" onClick={() => navigate('/noticias')}>
                    Ver notícias
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {favoriteNews.map((n) => (
                    <div
                      key={n.id}
                      className="bg-surface-raised border border-edge-subtle rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition cursor-pointer"
                      onClick={() => navigate(`/noticias/${n.id}`)}
                    >
                      <div className="relative h-36 md:h-40 w-full">
                        {n.image_url ? (
                          <img src={n.image_url} alt={n.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#B45309] via-[#F97316] to-[#F59E0B] flex items-center justify-center">
                            <Newspaper className="w-10 h-10 text-white/90" />
                          </div>
                        )}
                        <button
                          type="button"
                          className="absolute top-2 right-2 bg-black/35 text-white rounded-full w-8 h-8 flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSavedNews(n.id);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0" />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <p className="text-[11px] text-content-secondary">
                          {n.date ? new Date(n.date).toLocaleDateString('pt-BR') : ''}
                        </p>
                        <p className="text-sm font-semibold text-content-primary line-clamp-2">
                          {n.title}
                        </p>
                        <p className="text-xs text-content-secondary line-clamp-2">
                          {n.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

    </Tabs>
  </div>;
}
