import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Camera, Image as GalleryIcon, AlertCircle, Clock,
  CheckCircle2, Send, Check, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import MediaViewer from '@/components/MediaViewer';

// ─── Tipos ────────────────────────────────────────────────────────────────────
const UPDATE_TYPES = [
  {
    id: 'still_here',
    label: 'O problema ainda está aqui',
    description: 'O problema persiste no local',
    icon: AlertCircle,
    color: 'text-red-600',
    selectedText: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-400',
    dot: 'bg-red-500',
    glow: 'shadow-red-100',
  },
  {
    id: 'being_solved',
    label: 'Está sendo resolvido',
    description: 'Já iniciaram o processo de resolução',
    icon: Clock,
    color: 'text-amber-600',
    selectedText: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    dot: 'bg-amber-500',
    glow: 'shadow-amber-100',
  },
  {
    id: 'solved',
    label: 'O problema foi resolvido',
    description: 'O problema foi completamente solucionado',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    selectedText: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    dot: 'bg-emerald-500',
    glow: 'shadow-emerald-100',
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────
// Todos os estados que precisam sobreviver a remounts vivem em ReportPage e são passados como props:
//   cam           → useNativeCamera (fotos)
//   selectedType  → tipo de atualização selecionado
//   onSelectType  → setter do tipo
//   message       → texto descritivo
//   onMessageChange → setter da mensagem
const ReportUpdateModal = ({
  onClose,
  onSubmit,
  submitting = false,
  disabledTypes = {},
  cam,
  selectedType,
  onSelectType,
  message,
  onMessageChange,
}) => {
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const { toast } = useToast();

  // Converte photoItems para o formato que MediaViewer espera
  const viewerMedia = cam.photoItems.map((item) => ({
    url: item.preview,
    type: 'image',
  }));

  const openPreview = useCallback((index) => {
    setViewer({ open: true, index });
  }, []);

  const handleSubmit = () => {
    if (!selectedType) {
      toast({ title: 'Selecione o tipo de atualização', variant: 'destructive' });
      return;
    }
    // selectedType, message e fotos vivem em ReportPage — onSubmit não precisa de parâmetros
    onSubmit();
  };

  const selectedInfo = UPDATE_TYPES.find((t) => t.id === selectedType);

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[3000]"
      onClick={onClose}
    >
      {/* Web fallback file input */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={cam.fileInputRef}
        onChange={cam.handleFileChange}
        className="hidden"
      />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: '94vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#111827] tracking-tight">
              Enviar Atualização
            </h2>
            <p className="text-xs text-[#9ca3af] mt-0.5">O que você encontrou no local?</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb] transition-colors active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Fotos — sempre visível ── */}
        <div className="px-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-widest">
              Fotos
            </span>
            {cam.photoItems.length > 0 && (
              <span className="text-[11px] text-[#9ca3af]">
                {cam.photoItems.length}/5
              </span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <AnimatePresence>
              {cam.photoItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0"
                >
                  {/* Clique na imagem abre preview fullscreen */}
                  <button
                    type="button"
                    onClick={() => openPreview(idx)}
                    className="w-full h-full"
                  >
                    <img
                      src={item.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                  {/* Botão de remover */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cam.removePhoto(item.id); }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center active:scale-90"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Spinner enquanto processa */}
            {cam.addingPhoto && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-[72px] h-[72px] rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0"
              >
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </motion.div>
            )}

            {/* Botões câmera + galeria */}
            {cam.canAdd && (
              <>
                <button
                  type="button"
                  onClick={cam.handleCamera}
                  className="w-[72px] h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-dashed border-[#b61722]/30 bg-[#fff7f7] hover:bg-[#ffe8e8] hover:border-[#b61722]/60 transition-colors active:scale-90 flex-shrink-0"
                >
                  <Camera className="w-5 h-5 text-[#b61722]" />
                  <span className="text-[9px] font-semibold text-[#b61722]">Câmera</span>
                </button>
                <button
                  type="button"
                  onClick={cam.handleGallery}
                  className="w-[72px] h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors active:scale-90 flex-shrink-0"
                >
                  <GalleryIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-[9px] font-semibold text-gray-500">Galeria</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="h-px bg-gray-100 mx-5 flex-shrink-0" />

        {/* Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-5 pt-4 pb-2 space-y-3">
            {/* Tipo */}
            <div>
              <p className="text-[11px] font-bold text-[#6b7280] uppercase tracking-widest mb-2">
                Qual é a situação?
              </p>
              <div className="space-y-2">
                {UPDATE_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  const blockedUntil = disabledTypes[type.id];

                  if (blockedUntil) {
                    const days = Math.ceil(
                      (blockedUntil.getTime() - Date.now()) / 86400000
                    );
                    return (
                      <div
                        key={type.id}
                        className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      >
                        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-gray-300" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-400 leading-tight">
                            {type.label}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Disponível {days <= 1 ? 'amanhã' : `em ${days} dias`}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <motion.button
                      key={type.id}
                      type="button"
                      onClick={() => onSelectType(type.id)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                        isSelected
                          ? `${type.bg} ${type.border} shadow-md ${type.glow}`
                          : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isSelected ? type.bg : 'bg-gray-50'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${isSelected ? type.color : 'text-gray-400'}`}
                          strokeWidth={2}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-bold leading-tight ${
                            isSelected ? type.selectedText : 'text-[#111827]'
                          }`}
                        >
                          {type.label}
                        </p>
                        <p className="text-[11px] text-[#9ca3af] mt-0.5">
                          {type.description}
                        </p>
                      </div>
                      {isSelected ? (
                        <div
                          className={`w-6 h-6 rounded-full ${type.dot} flex items-center justify-center flex-shrink-0 shadow-sm`}
                        >
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Descrição */}
            <div className="pb-2">
              <label className="text-[11px] font-bold text-[#6b7280] uppercase tracking-widest mb-2 block">
                Descrição{' '}
                <span className="normal-case font-normal text-gray-400">(opcional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Descreva o que você observou no local..."
                rows={3}
                className="w-full px-3.5 py-3 rounded-2xl border border-gray-200 text-sm text-[#111827] placeholder-gray-300 resize-none focus:outline-none focus:border-[#b61722] focus:ring-2 focus:ring-[#b61722]/10 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 bg-white border-t border-gray-100"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          {/* Banner do tipo selecionado */}
          <AnimatePresence>
            {selectedInfo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  className={`mx-5 mt-3 px-3.5 py-2 rounded-xl ${selectedInfo.bg} flex items-center gap-2`}
                >
                  <selectedInfo.icon
                    className={`w-3.5 h-3.5 ${selectedInfo.color} flex-shrink-0`}
                    strokeWidth={2.5}
                  />
                  <span
                    className={`text-xs font-semibold ${selectedInfo.selectedText} leading-tight`}
                  >
                    {selectedInfo.label}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 px-5 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-2xl h-12 text-sm font-semibold border-gray-200"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedType || submitting}
              className={`flex-[2] rounded-2xl h-12 gap-2 text-sm font-bold text-white transition-all ${
                selectedType
                  ? 'bg-[#b61722] hover:bg-[#9f1520] shadow-lg shadow-red-200 active:scale-[0.98]'
                  : 'bg-gray-200 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar atualização
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>

    {/* Preview fullscreen das fotos — z-index acima do modal */}
    {viewer.open && viewerMedia.length > 0 && (
      <MediaViewer
        media={viewerMedia}
        startIndex={viewer.index}
        onClose={() => setViewer({ open: false, index: 0 })}
      />
    )}
    </>
  );
};

export default ReportUpdateModal;
