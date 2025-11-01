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
    <div className="p-4 md:p-6 max-h-[600px] overflow-y-auto">
      {reports.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">Nenhuma bronca encontrada com os filtros atuais.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report, index) => {
            const { icon: StatusIcon, color: statusColor, text: statusText } = getStatusInfo(report.status);
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onReportClick(report)}
                className={`bg-background rounded-lg p-4 border border-border hover:border-primary transition-colors cursor-pointer ${report.status === 'duplicate' ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl mt-1">{getCategoryIcon(report.category)}</span>
                    <div>
                      <h3 className="font-bold text-foreground flex items-center gap-2">
                        {report.title}
                        {report.is_recurrent && <Repeat className="w-4 h-4 text-orange-500" title="Bronca Reincidente" />}
                        {report.is_favorited && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" title="Favorito" />}
                      </h3>
                      <p className="text-sm text-muted-foreground">{report.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-4 md:mt-0 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(report.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ThumbsUp className="w-4 h-4" />
                      <span>{report.upvotes}</span>
                    </div>
                    <div className={`flex items-center gap-1 font-semibold ${statusColor}`}>
                      <StatusIcon className="w-4 h-4" />
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