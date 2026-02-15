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
    <div className="flex flex-col max-h-[600px]">
      <div className="px-3 md:px-6 py-2 md:py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <div className="inline-flex items-center rounded-full bg-background border border-border px-3 py-1">
          <span className="text-[11px] md:text-xs font-semibold text-foreground">Broncas</span>
        </div>
        <span className="text-[10px] md:text-xs text-muted-foreground">
          {reports.length} {reports.length === 1 ? 'encontrada' : 'encontradas'}
        </span>
      </div>

      <div className="p-2 md:p-4 flex-1 overflow-y-auto">
        {reports.length === 0 ? (
          <div className="text-center py-8 md:py-12">
            <p className="text-muted-foreground text-xs md:text-sm">
              Nenhuma bronca encontrada com os filtros atuais.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 md:space-y-3.5">
            {reports.map((report, index) => {
              const { icon: StatusIcon, color: statusColor, text: statusText } = getStatusInfo(report.status);
              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => onReportClick(report)}
                  className={`rounded-xl border border-border/80 bg-card/80 hover:border-primary/70 hover:bg-card transition-all cursor-pointer shadow-sm hover:shadow-md ${
                    report.status === 'duplicate' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="p-3 md:p-4 space-y-2">
                    <div className="flex items-start gap-3 md:gap-4">
                      <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-lg md:text-2xl">
                        {getCategoryIcon(report.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-xs md:text-sm lg:text-base text-foreground leading-snug line-clamp-2 flex-1">
                            {report.title}
                          </h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {report.is_recurrent && (
                              <Repeat
                                className="w-3 h-3 md:w-4 md:h-4 text-orange-500"
                                title="Bronca Reincidente"
                              />
                            )}
                            {report.is_favorited && (
                              <Star
                                className="w-3 h-3 md:w-4 md:h-4 text-yellow-400 fill-yellow-400"
                                title="Favorito"
                              />
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] md:text-xs lg:text-sm text-muted-foreground mt-0.5 line-clamp-1">
                          {report.address}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60 mt-1">
                      <div className="flex items-center gap-3 text-[10px] md:text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{formatDate(report.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{report.upvotes}</span>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] md:text-xs font-semibold border border-current ${statusColor}`}>
                        <StatusIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
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
    </div>
  );
};

export default ReportList;
