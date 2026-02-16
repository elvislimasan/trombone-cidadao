import React from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, Eye, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RankingSidebar = ({ reports, onReportClick, embedded = false }) => {
  const getTopReports = (key, length = 5) => {
    return [...reports]
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, length);
  };

  const topUpvoted = getTopReports('upvotes');
  const topViewed = getTopReports('views');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  const rankBadgeClasses = [
    'bg-red-500 text-white',
    'bg-orange-400 text-black',
    'bg-yellow-400 text-black',
    'bg-gray-200 text-gray-700',
    'bg-gray-200 text-gray-700'
  ];

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
          className="p-2 md:p-3 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer border border-transparent hover:border-border"
          onClick={() => onReportClick(report)}
        >
          <div className="flex items-center gap-2 md:gap-3">
            <div className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold ${rankBadgeClasses[index] || 'bg-gray-200 text-gray-700'}`}>
              #{index + 1}
            </div>
            <div className="flex-1 flex items-center justify-between gap-2">
              <p className="text-xs md:text-sm font-medium text-foreground truncate">
                {report.title}
              </p>
              <div className="flex items-center text-[10px] md:text-xs text-muted-foreground gap-1 flex-shrink-0">
                <Icon className="w-2.5 h-2.5 md:w-3 md:h-3" />
                <span>{report[dataKey] || 0}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )) : (
        <p className="text-xs md:text-sm text-muted-foreground text-center py-6 md:py-8">Nenhuma bronca para exibir no ranking.</p>
      )}
    </motion.div>
  );

  const Wrapper = embedded ? 'div' : Card;

  return (
    <Wrapper
      className={
        embedded
          ? 'h-full flex flex-col'
          : 'bg-white border border-[#E5E7EB] rounded-2xl shadow-sm h-full lg:h-[32rem] xl:h-[32rem] flex flex-col'
      }
    >
      <CardHeader className="p-4 md:px-6 pb-2 ">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg text-tc-red">
          <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
          Ranking de Broncas
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-3 pb-0 md:px-6 pt-0 md:pt-0">
        <Tabs defaultValue="upvotes" className="w-full">
          <TabsList className="relative grid w-full grid-cols-2 h-9 md:h-10 bg-transparent p-0 border-b border-border rounded-none">
            <TabsTrigger
              value="upvotes"
              className="gap-1 text-xs md:text-sm rounded-none data-[state=active]:text-tc-red data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-tc-red data-[state=inactive]:text-muted-foreground"
            >
              <ThumbsUp className="w-3 h-3 md:w-4 md:h-4" /> Mais Apoiadas
            </TabsTrigger>
            <TabsTrigger
              value="views"
              className="gap-1 text-xs md:text-sm rounded-none data-[state=active]:text-tc-red data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-tc-red data-[state=inactive]:text-muted-foreground"
            >
              <Eye className="w-3 h-3 md:w-4 md:h-4" /> Mais Visualizadas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upvotes" className="mt-3 md:mt-4 max-h-[450px] overflow-y-auto overflow-x-hidden pr-1 md:pr-2">
            <RankingList items={topUpvoted} icon={ThumbsUp} dataKey="upvotes" />
          </TabsContent>
          <TabsContent value="views" className="mt-3 md:mt-4 max-h-[450px] overflow-y-auto overflow-x-hidden pr-1 md:pr-2">
            <RankingList items={topViewed} icon={Eye} dataKey="views" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Wrapper>
  );
};

export default RankingSidebar;
