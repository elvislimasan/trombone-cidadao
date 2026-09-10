import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Search, Link as LinkIcon, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';

const EMPTY_REPORTS = [];

const LinkReportModal = ({ sourceReport, allReports = EMPTY_REPORTS, onClose, onLink }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [availableReports, setAvailableReports] = useState(allReports || []);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [linking, setLinking] = useState(false);

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

  // A lista nao pode depender do feed que abriu o modal. Na pagina de detalhe,
  // `allReports` era vazia; em Favoritos, continha apenas os favoritos.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingReports(true);
      setLoadError('');

      let query = supabase
        .from('reports')
        .select('id, title, description, status, city_id, category_id, address, created_at')
        .eq('moderation_status', 'approved')
        .neq('id', sourceReport.id)
        .neq('status', 'duplicate')
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(80);

      if (sourceReport.city_id) query = query.eq('city_id', sourceReport.city_id);
      const term = searchTerm.trim().replace(/[,()%]/g, ' ');
      if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setLoadError('Não foi possível carregar as broncas disponíveis.');
        setAvailableReports(allReports || []);
      } else {
        setAvailableReports(data || []);
      }
      setLoadingReports(false);
    }, searchTerm ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allReports, searchTerm, sourceReport.city_id, sourceReport.id]);

  const potentialTargets = (availableReports || []).filter((report) =>
    report.id !== sourceReport.id &&
    report.status !== 'duplicate' &&
    report.status !== 'resolved' &&
    (
      (report.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleLink = async () => {
    if (!selectedTargetId || linking) return;
    setLinking(true);
    try {
      await onLink(sourceReport.id, selectedTargetId);
    } finally {
      setLinking(false);
    }
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
              {loadingReports ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando broncas...
                </div>
              ) : potentialTargets.length > 0 ? (
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
                    {target.address && (
                      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" /> {target.address}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {loadError || 'Nenhuma bronca compatível encontrada nesta cidade.'}
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
              disabled={!selectedTargetId || linking}
              className="bg-primary hover:bg-primary/90 gap-2"
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              {linking ? 'Vinculando...' : 'Vincular'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
};

export default LinkReportModal;
