import React from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, MessageSquare, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RankingSidebar = ({ reports, onReportClick }) => {
  const getTopReports = (key, length = 5) => {
    return [...reports]
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, length);
  };

  const topUpvoted = getTopReports('upvotes');
  const topCommented = getTopReports('comments_count');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  const RankingList = ({ items, icon: Icon, dataKey }) => (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-2 md:space-y-3"
    >
      {items.length > 0 ? items.map((report, index) => (
        <motion.div
          key={report.id}
          variants={itemVariants}
          className="p-2 md:p-3 rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer border border-transparent hover:border-primary/50"
          onClick={() => onReportClick(report)}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm font-medium text-foreground truncate pr-2 md:pr-4 flex-1">
              <span className="text-primary font-bold mr-1.5 md:mr-2">#{index + 1}</span>
              {report.title}
            </p>
            <div className="flex items-center text-[10px] md:text-xs text-muted-foreground gap-1 flex-shrink-0">
              <Icon className="w-2.5 h-2.5 md:w-3 md:h-3" />
              <span>{report[dataKey] || 0}</span>
            </div>
          </div>
        </motion.div>
      )) : (
        <p className="text-xs md:text-sm text-muted-foreground text-center py-6 md:py-8">Nenhuma bronca para exibir no ranking.</p>
      )}
    </motion.div>
  );

  return (
    <Card className="bg-card border-border rounded-xl md:rounded-2xl shadow-xl md:shadow-2xl h-full">
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg text-tc-red">
          <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
          Ranking de Broncas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
        <Tabs defaultValue="upvotes" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9 md:h-10">
            <TabsTrigger value="upvotes" className="gap-1 text-xs md:text-sm">
              <ThumbsUp className="w-3 h-3 md:w-4 md:h-4" /> Mais Apoiadas
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1 text-xs md:text-sm">
              <MessageSquare className="w-3 h-3 md:w-4 md:h-4" /> Mais Comentadas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upvotes" className="mt-3 md:mt-4 max-h-[450px] overflow-y-auto pr-1 md:pr-2">
            <RankingList items={topUpvoted} icon={ThumbsUp} dataKey="upvotes" />
          </TabsContent>
          <TabsContent value="comments" className="mt-3 md:mt-4 max-h-[450px] overflow-y-auto pr-1 md:pr-2">
            <RankingList items={topCommented} icon={MessageSquare} dataKey="comments_count" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RankingSidebar;