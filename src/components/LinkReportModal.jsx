import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Search, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LinkReportModal = ({ sourceReport, allReports, onClose, onLink }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState(null);

  // === Portal target ===
  const portalTarget = useMemo(() => {
    // Usa <div id="modal-root" /> se existir; senão, body
    return document.getElementById('modal-root') || document.body;
  }, []);

  // === Body scroll lock enquanto o modal estiver aberto ===
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // === Lista filtrada de possíveis alvos ===
  const potentialTargets = (allReports || []).filter((report) =>
    report.id !== sourceReport.id &&
    report.status !== 'duplicate' &&
    report.status !== 'resolved' &&
    (
      (report.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleLink = () => {
    if (selectedTargetId) onLink(sourceReport.id, selectedTargetId);
  };

  // === Conteúdo do modal ===
  const modalContent = (
    // Usamos um wrapper com z-index altíssimo para ficar acima de QUALQUER outro modal
    <div
      className="fixed inset-0 z-[10000] pointer-events-auto"
      aria-modal="true"
      role="dialog"
      aria-labelledby="link-report-title"
      onClick={onClose}
    >
      {/* Backdrop separado para garantir clique fora */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="absolute inset-0 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col border border-border">
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 id="link-report-title" className="text-xl font-bold text-foreground">
                Vincular Bronca Duplicada
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione a bronca principal para vincular.
            </p>
          </div>

          {/* Body */}
          <div className="p-6 flex-grow overflow-y-auto">
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground">
                Bronca a ser vinculada (duplicada):
              </p>
              <p className="text-sm text-muted-foreground font-semibold p-2 bg-background rounded-md mt-1">
                {sourceReport?.title}
              </p>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar bronca principal..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-input"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              {potentialTargets.length > 0 ? (
                potentialTargets.map((target) => (
                  <div
                    key={target.id}
                    onClick={() => setSelectedTargetId(target.id)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedTargetId === target.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-accent'
                    }`}
                    role="button"
                    aria-pressed={selectedTargetId === target.id}
                  >
                    <p className="font-semibold text-foreground text-sm">{target.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {target.description}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Nenhuma bronca compatível encontrada.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selectedTargetId}
              className="bg-primary hover:bg-primary/90 gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              Vincular
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
};

export default LinkReportModal;