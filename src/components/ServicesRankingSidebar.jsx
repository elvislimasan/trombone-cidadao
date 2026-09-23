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
      className="space-y-2"
    >
      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-content-tertiary">
        <Building className="h-4 w-4" />
        Top 5 do Guia da Cidade
      </h3>
      {items.length > 0 ? items.map((item, index) => (
        <motion.div
          key={item.id}
          variants={itemVariants}
        >
          <Link to={`/guia-da-cidade/guia/${item.id}`} className="block rounded-xl border border-edge-subtle bg-surface-subtle p-3 transition-colors hover:border-brand/30 hover:bg-brand-subtleBg">
            <div className="flex items-center justify-between">
              <p className="flex-1 truncate pr-4 text-sm font-semibold text-content-primary">
                <span className="mr-2 font-extrabold text-brand">#{index + 1}</span>
                {item.name}
              </p>
              <div className="flex flex-shrink-0 items-center gap-1 text-xs text-content-tertiary">
                <TrendingUp className="h-3 w-3" />
                <span>{item.views || 0}</span>
              </div>
            </div>
          </Link>
        </motion.div>
      )) : (
        <p className="py-4 text-center text-sm text-content-tertiary">Nenhum item no ranking.</p>
      )}
    </motion.div>
  );

  return (
    <Card className="rounded-2xl border-edge-subtle bg-surface-raised shadow-elevation-1">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-brand">
          <TrendingUp className="h-5 w-5" />
          Mais Populares
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <RankingList items={rankings} />
      </CardContent>
    </Card>
  );
};

export default ServicesRankingSidebar;
