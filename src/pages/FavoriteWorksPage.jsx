import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { HardHat } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';

const FavoriteWorksPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [favoriteWorks, setFavoriteWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    setLoading(true);
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
      toast({ title: "Erro ao buscar obras favoritas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(fav => ({
        ...fav.work,
        location: fav.work.location ? { lat: fav.work.location.coordinates[1], lng: fav.work.location.coordinates[0] } : null,
        categoryName: fav.work.work_category?.name,
        areaName: fav.work.work_area?.name,
      }));
      setFavoriteWorks(formattedData);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const getStatusInfo = status => {
    switch (status) {
      case 'in-progress': return { color: 'bg-blue-500', text: 'Em Andamento' };
      case 'completed': return { color: 'bg-green-500', text: 'Concluída' };
      case 'stalled': return { color: 'bg-red-500', text: 'Paralisada' };
      case 'planned': return { color: 'bg-purple-500', text: 'Prevista' };
      case 'tendered': return { color: 'bg-orange-500', text: 'Licitada' };
      default: return { color: 'bg-gray-500', text: 'Não iniciada' };
    }
  };

  const WorkCard = ({ work }) => {
    const statusInfo = getStatusInfo(work.status);
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-4 hover:shadow-primary/20 transition-shadow">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg mb-2">{work.title}</CardTitle>
          <div className={`text-xs px-2 py-1 rounded-full text-white ${statusInfo.color}`}>{statusInfo.text}</div>
        </div>
        {work.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{work.description}</p>}
        {work.execution_percentage > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-sm font-medium mb-1">
              <span>Progresso</span>
              <span>{work.execution_percentage}%</span>
            </div>
            <Progress value={work.execution_percentage} className="h-2" />
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-4 space-y-1">
          {work.total_value > 0 && <p>Valor Total: {formatCurrency(work.total_value)}</p>}
          {work.last_update && <p>Última atualização: {new Date(work.last_update).toLocaleDateString('pt-BR')}</p>}
        </div>
        <Button size="sm" className="w-full mt-4" onClick={() => navigate(`/obras-publicas/${work.id}`)}>Ver Detalhes</Button>
      </motion.div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Obras Favoritas - Trombone Cidadão</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
            <HardHat className="w-8 h-8 text-tc-red" />
            Minhas Obras Favoritas
          </h1>
          <p className="text-muted-foreground mb-8">
            Acompanhe aqui as atualizações das obras que você marcou como favoritas.
          </p>
        </motion.div>

        {loading ? (
          <p>Carregando suas obras favoritas...</p>
        ) : favoriteWorks.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">Você ainda não favoritou nenhuma obra.</p>
            <p className="text-sm text-muted-foreground mt-2">Clique na estrela ⭐ em uma obra para adicioná-la aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteWorks.map(work => <WorkCard key={work.id} work={work} />)}
          </div>
        )}
      </div>
    </>
  );
};

export default FavoriteWorksPage;