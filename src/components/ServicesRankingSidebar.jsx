import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from '@/lib/customSupabaseClient';

const ServicesRankingSidebar = ({ currentServiceId }) => {
  const [rankings, setRankings] = useState([]);

  useEffect(() => {
    const fetchRankings = async () => {
      const { data, error } = await supabase
        .from('directory')
        .select('id, name, views')
        .eq('status', 'approved')
        .order('views', { ascending: false })
        .limit(6);

      if (!error) setRankings((data || []).filter(item => String(item.id) !== String(currentServiceId)).slice(0, 5));
    };

    fetchRankings();
  }, [currentServiceId]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  const RankingList = ({ items }) => (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      <h3 className="font-semibold text-md flex items-center gap-2 text-muted-foreground mb-2">
        <Building className="w-5 h-5" />
        Top 5 do Guia da Cidade
      </h3>
      {items.length > 0 ? items.map((item, index) => (
        <motion.div
          key={item.id}
          variants={itemVariants}
        >
          <Link to={`/servicos/guia/${item.id}`} className="block p-3 rounded-lg bg-background hover:bg-muted transition-colors border border-transparent hover:border-primary/50">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground truncate pr-4 flex-1">
                <span className="text-primary font-bold mr-2">#{index + 1}</span>
                {item.name}
              </p>
              <div className="flex items-center text-xs text-muted-foreground gap-1 flex-shrink-0">
                <TrendingUp className="w-3 h-3" />
                <span>{item.views || 0}</span>
              </div>
            </div>
          </Link>
        </motion.div>
      )) : (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum item no ranking.</p>
      )}
    </motion.div>
  );

  return (
    <Card className="bg-card border-border rounded-2xl shadow-lg h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-tc-red">
          <TrendingUp className="w-5 h-5" />
          Mais Populares
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RankingList items={rankings} />
      </CardContent>
    </Card>
  );
};

export default ServicesRankingSidebar;
