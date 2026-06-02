import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, AlertCircle, Clock, CheckCircle2, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const UPDATE_TYPES = [
  {
    id: 'still_here',
    label: 'O problema ainda está aqui',
    description: 'O problema persiste e não foi resolvido',
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    activeBg: 'bg-red-100',
    activeBorder: 'border-red-500',
    ringColor: 'ring-red-200',
    dotColor: 'bg-red-500',
  },
  {
    id: 'being_solved',
    label: 'O problema está sendo resolvido',
    description: 'Já iniciaram o processo de resolução',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    activeBg: 'bg-amber-100',
    activeBorder: 'border-amber-500',
    ringColor: 'ring-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    id: 'solved',
    label: 'O problema foi resolvido',
    description: 'O problema foi completamente solucionado',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    activeBg: 'bg-emerald-100',
    activeBorder: 'border-emerald-500',
    ringColor: 'ring-emerald-200',
    dotColor: 'bg-emerald-500',
  },
];

// disabledTypes: { still_here: Date, being_solved: Date, solved: Date } — tipos bloqueados com data de liberação
const ReportUpdateModal = ({ onClose, onSubmit, submitting = false, disabledTypes = {} }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newPhotos = [];
    const newPreviews = [];

    for (const file of files) {
      try {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        // Usar JPEG — bucket reports-media não aceita WebP
        const blob = await new Promise((res, rej) => {
          if (canvas.convertToBlob) {
            canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }).then(res).catch(rej);
          } else {
            canvas.toBlob((b) => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.85);
          }
        });
        const jpegFile = new File(
          [blob],
          file.name.replace(/\.(webp|png)$/i, '.jpg'),
          { type: 'image/jpeg' }
        );
        newPhotos.push(jpegFile);
        newPreviews.push(URL.createObjectURL(jpegFile));
      } catch (_) {
        newPhotos.push(file);
        newPreviews.push(URL.createObjectURL(file));
      }
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    setPhotoPreviews((prev) => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const removePhoto = (index) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!selectedType) {
      toast({ title: 'Selecione o tipo de atualização', variant: 'destructive' });
      return;
    }
    onSubmit({ updateType: selectedType, message: message.trim(), photos });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[3000]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-[#191c1e]">Enviar Atualização</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">Informe o status atual do problema</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6b7280] hover:bg-[#f2f4f7] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Update type selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
              Qual é a situação?
            </p>
            {UPDATE_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = selectedType === type.id;
              const blockedUntil = disabledTypes[type.id];
              const isDisabled = !!blockedUntil;

              if (isDisabled) {
                const diffDays = Math.ceil((blockedUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const label = diffDays <= 1 ? 'amanhã' : `em ${diffDays} dias`;
                return (
                  <div
                    key={type.id}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-400 leading-tight">{type.label}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Disponível {label}</div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedType(type.id)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                    isSelected
                      ? `${type.activeBg} ${type.activeBorder}`
                      : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? type.activeBg : type.bg}`}>
                    <Icon className={`w-5 h-5 ${type.color}`} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold leading-tight ${isSelected ? type.color : 'text-[#191c1e]'}`}>
                      {type.label}
                    </div>
                    <div className="text-xs text-[#6b7280] mt-0.5">{type.description}</div>
                  </div>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full ${type.dotColor} flex items-center justify-center flex-shrink-0`}>
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5 block">
              Descrição (opcional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o que você observou no local..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#191c1e] placeholder-gray-400 resize-none focus:outline-none focus:border-[#b61722] focus:ring-2 focus:ring-[#b61722]/20 transition-colors"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5 block">
              Fotos (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            {photoPreviews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photoPreviews.map((preview, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {photoPreviews.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-[10px] text-gray-400">Adicionar</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-5 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-400">Toque para adicionar fotos</span>
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl h-11"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedType || submitting}
              className="flex-1 rounded-xl h-11 gap-2 bg-[#b61722] hover:bg-[#9f1520] text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ReportUpdateModal;
