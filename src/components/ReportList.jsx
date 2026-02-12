import React from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, Calendar, AlertTriangle, Clock, CheckCircle, Link as LinkIcon, Repeat, Star } from 'lucide-react';

const ReportList = ({ reports, onReportClick }) => {
  const getCategoryIcon = (category) => {
    const icons = { 'iluminacao': '💡', 'buracos': '🕳️', 'esgoto': '🚰', 'limpeza': '🧹', 'poda': '🌳', 'outros': '📍' };
    return icons[category] || '📍';
  };

  const getStatusInfo = (status) => {
    const statusInfo = {
      'pending': { icon: AlertTriangle, text: 'Pendente', color: 'text-primary' },
      'in-progress': { icon: Clock, text: 'Em Andamento', color: 'text-secondary' },
      'resolved': { icon: CheckCircle, text: 'Resolvido', color: 'text-green-500' },
      'duplicate': { icon: LinkIcon, text: 'Duplicada', color: 'text-gray-500' }
    };
    return statusInfo[status] || { icon: AlertTriangle, text: 'Pendente', color: 'text-muted-foreground' };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Data inválida';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="p-2 md:p-6 max-h-[600px] overflow-y-auto">
      {reports.length === 0 ? (
        <div className="text-center py-8 md:py-16">
          <p className="text-muted-foreground text-xs md:text-base">Nenhuma bronca encontrada com os filtros atuais.</p>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-4">
          {reports.map((report, index) => {
            const { icon: StatusIcon, color: statusColor, text: statusText } = getStatusInfo(report.status);
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onReportClick(report)}
                className={`bg-background rounded-lg p-2 md:p-4 border border-border hover:border-primary transition-colors cursor-pointer ${report.status === 'duplicate' ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                  <div className="flex items-start gap-2 md:gap-4 min-w-0">
                    <span className="text-lg md:text-2xl mt-0.5 md:mt-1 flex-shrink-0">{getCategoryIcon(report.category)}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-xs md:text-base text-foreground flex items-center gap-1 md:gap-2 truncate">
                        {report.title}
                        {report.is_recurrent && <Repeat className="w-2.5 h-2.5 md:w-4 md:h-4 text-orange-500 flex-shrink-0" title="Bronca Reincidente" />}
                        {report.is_favorited && <Star className="w-2.5 h-2.5 md:w-4 md:h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" title="Favorito" />}
                      </h3>
                      <p className="text-[10px] md:text-sm text-muted-foreground truncate">{report.address}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:gap-6 mt-1 md:mt-0 text-[9px] md:text-sm border-t md:border-t-0 pt-2 md:pt-0">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="w-2.5 h-2.5 md:w-4 md:h-4" />
                      <span>{formatDate(report.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ThumbsUp className="w-2.5 h-2.5 md:w-4 md:h-4" />
                      <span>{report.upvotes}</span>
                    </div>
                    <div className={`flex items-center gap-1 font-semibold ${statusColor} ml-auto md:ml-0`}>
                      <StatusIcon className="w-2.5 h-2.5 md:w-4 md:h-4" />
                      <span>{statusText}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportList;