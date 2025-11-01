import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, Bus, Landmark, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from '@/lib/customSupabaseClient';

const ServicesRankingSidebar = ({ currentServiceType, currentServiceId }) => {
  const [rankings, setRankings] = useState({
    transport: [],
    tourist_spots: [],
    directory: [],
  });

  useEffect(() => {
    const fetchRankings = async () => {
      const tables = ['transport', 'tourist_spots', 'directory'];
      const newRankings = {};

      for (const table of tables) {
        const { data, error } = await supabase
          .from(table)
          .select('id, name, views')
          .order('views', { ascending: false })
          .limit(6); // Fetch 6 to have a fallback if current is in top 5

        if (!error) {
          newRankings[table] = data.filter(item => item.id !== currentServiceId).slice(0, 5);
        }
      }
      setRankings(newRankings);
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

  const getLink = (item, type) => {
    switch (type) {
      case 'transport': return `/servicos/transporte/${item.id}`;
      case 'tourist_spots': return `/servicos/ponto-turistico/${item.id}`;
      case 'directory': return `/servicos/guia/${item.id}`;
      default: return '#';
    }
  };

  const RankingList = ({ items, type, icon: Icon }) => (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      <h3 className="font-semibold text-md flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-5 h-5" />
        Top 5 {type === 'transport' ? 'Transportes' : type === 'tourist_spots' ? 'Pontos Turísticos' : 'Guia Comercial'}
      </h3>
      {items.length > 0 ? items.map((item, index) => (
        <motion.div
          key={item.id}
          variants={itemVariants}
        >
          <Link to={getLink(item, type)} className="block p-3 rounded-lg bg-background hover:bg-muted transition-colors border border-transparent hover:border-primary/50">
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
        {currentServiceType !== 'transport' && <RankingList items={rankings.transport} type="transport" icon={Bus} />}
        {currentServiceType !== 'tourist_spots' && <RankingList items={rankings.tourist_spots} type="tourist_spots" icon={Landmark} />}
        {currentServiceType !== 'directory' && <RankingList items={rankings.directory} type="directory" icon={Phone} />}
      </CardContent>
    </Card>
  );
};

export default ServicesRankingSidebar;