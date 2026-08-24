import React, { useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Check, FileText, Layout, Grid, Palette, Contrast, ThumbsUp, Megaphone, MapPin, AlertCircle } from "lucide-react";
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { salvarImagemNaGaleria } from '@/lib/nativeDownload';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const FLYER_TEMPLATES = [
  {
    id: 'classic',
    name: 'Denúncia',
    description: 'Estilo de cartaz de denúncia com bordas de alerta.',
    icon: AlertCircle
  },
  {
    id: 'modern',
    name: 'Impacto',
    description: 'Visual de alto contraste focado na voz da comunidade.',
    icon: Megaphone
  },
  {
    id: 'minimalist',
    name: 'Direto',
    description: 'Simples e eficiente para espalhar a bronca.',
    icon: Grid
  }
];

const ReportFlyerModal = ({ isOpen, onClose, report, qrCodeUrl }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('classic');
  const [isColor, setIsColor] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const flyerRef = useRef(null);
  const { toast } = useToast();

  const handleDownload = useCallback(async () => {
    if (!flyerRef.current) return;
    
    setIsGenerating(true);
    try {
      // Pequeno delay para garantir que as imagens (QR Code) estejam carregadas
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const dataUrl = await toPng(flyerRef.current, {
        cacheBust: true,
        pixelRatio: 3, // Alta qualidade para impressão
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      const fileName = `panfleto-bronca-${report?.id || 'id'}-${selectedTemplate}.png`;

      if (Capacitor.isNativePlatform()) {
        // Escrevia em `Pictures/TromboneCidadao/` sob ExternalStorage, que o
        // Android nega desde a API 29 — ver lib/nativeDownload.
        await salvarImagemNaGaleria({
          base64: dataUrl.split(',')[1] || '',
          fileName,
        });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      toast({
        title: "Panfleto pronto!",
        description: "O modelo foi baixado e já pode ser impresso.",
      });
      onClose();
    } catch (error) {
      console.error('Erro ao gerar panfleto:', error);
      toast({
        title: "Erro ao gerar panfleto",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [report, selectedTemplate, onClose, toast]);

  // ATENCAO: tudo dentro de renderFlyerTemplate() e o CONTEUDO do panfleto
  // (a imagem baixada via toPng, ver flyerRef). As cores aqui (bg-white,
  // text-gray-*, text-black, tc-red, etc.) sao fixas de proposito: o
  // panfleto e impresso/compartilhado e deve ficar igual independente do
  // tema do app. Nao trocar por tokens do design system.
  const renderFlyerTemplate = () => {
    const title = report?.title || 'Título da Bronca';
    const logoClass = isColor ? 'h-10 w-auto' : 'h-10 w-auto grayscale';
    const primaryTextClass = isColor ? 'text-tc-red' : 'text-black';
    const primaryBgClass = isColor ? 'bg-tc-red' : 'bg-black';
    const primaryBorderClass = isColor ? 'border-tc-red' : 'border-black';
    
    const flyerContainerClass = "w-full aspect-[1/1.6] bg-white relative overflow-hidden flex flex-col items-center shadow-sm";

    const getFontSize = (baseSize, titleText) => {
      const length = titleText.length;
      if (length > 120) return 'text-xs';
      if (length > 90) return 'text-sm';
      if (length > 60) return 'text-base';
      if (length > 40) return 'text-lg';
      return baseSize;
    };

    switch (selectedTemplate) {
      case 'classic':
        return (
          <div className={`${flyerContainerClass} border-[16px] ${isColor ? 'border-tc-red' : 'border-black'} p-8 justify-between`}>
            {/* Logo e Nome no Topo */}
            <div className="w-full flex items-center justify-center mb-4">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className={isColor ? "h-10 w-auto" : "h-10 w-auto grayscale"} />
                <div className="flex flex-col">
                  <span className={`text-base font-black tracking-tight ${primaryTextClass}`}>TROMBONE CIDADÃO</span>
                  <span className="text-[8px] font-bold uppercase opacity-60">Voz da Comunidade</span>
                </div>
              </div>
            </div>

            {/* Alerta de Bronca */}
            <div className={`w-full py-2 mb-4 text-center ${primaryBgClass} text-white font-black skew-x-[-12deg]`}>
              <span className="text-xl uppercase tracking-tighter italic">DENÚNCIA ATIVA</span>
            </div>

            {/* Título em Destaque */}
            <div className="w-full text-center my-2">
              <h2 className={`${getFontSize('text-xl', title)} font-black uppercase leading-tight text-gray-900`}>
                {title}
              </h2>
            </div>

            {/* Área Central do QR Code (A Placa) */}
            <div className="flex-1 flex flex-col items-center justify-center w-full relative">
              <div className="text-center mb-8">
                <p className={`font-black text-lg ${primaryTextClass} uppercase italic tracking-tighter mb-1`}>
                  APOIE ESTA BRONCA AGORA
                </p>
                <div className={`flex justify-center ${primaryTextClass}`}>
                   <Megaphone size={32} />
                </div>
              </div>

              <div className="relative z-10">
                {/* A placa (Sign) */}
                <div className={`${primaryBgClass} p-4 rounded-2xl shadow-xl rotate-[2deg]`}>
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
              </div>
            </div>
            
          
          </div>
        );
      
      case 'modern':
        return (
          <div className={`${flyerContainerClass} p-8 justify-between pb-12 bg-white`}>
            {/* Logo e Nome no Topo */}
            <div className="w-full flex items-center justify-center mb-4">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
                <div className="flex flex-col">
                  <span className={`text-base font-black tracking-tight ${primaryTextClass}`}>TROMBONE CIDADÃO</span>
                  <span className="text-[8px] font-bold uppercase text-gray-500">Sua voz é o motor da mudança</span>
                </div>
              </div>
            </div>

            <div className="w-full mb-6 text-center relative">
              <div className={`absolute -top-4 -left-4 w-12 h-12 ${isColor ? 'bg-tc-red/10' : 'bg-black/10'} rounded-full blur-xl`}></div>
              <h1 className={`text-3xl font-black ${primaryTextClass} mb-2 uppercase italic tracking-tighter leading-none`}>
                DÊ SUA VOZ!
              </h1>
              <div className={`h-1.5 w-20 ${primaryBgClass} mx-auto mb-6 rounded-full`}></div>
              <h2 className={`${getFontSize('text-lg', title)} font-bold leading-snug px-2 text-gray-900`}>
                {title}
              </h2>
            </div>
            
            <div className={`flex-1 flex flex-col items-center justify-center gap-4 w-full bg-gray-50 rounded-[2rem] border-2 ${primaryBorderClass} p-8 shadow-sm relative`}>
              <div className="bg-white p-4 rounded-3xl shadow-xl relative z-10 flex items-center justify-center">
                <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44 object-contain" />
              </div>
              <div className="text-center relative z-10 mt-2">
                <p className={`font-black text-sm ${primaryTextClass} uppercase tracking-widest mb-1`}>APOIE AGORA</p>
                <p className="text-[10px] font-medium text-gray-500 italic">Quanto mais gente apoiar, mais barulho faremos!</p>
              </div>
            </div>
          </div>
        );

      case 'minimalist':
        return (          <div className={`${flyerContainerClass} p-8 border-2 ${primaryBorderClass} justify-between pb-12`}>
            <div className="w-full">
              <div className="flex justify-between items-center mb-4">
                <img src="/logo.png" className={logoClass} alt="Logo" />
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">Apoio Popular</span>
              </div>
              <div className={`w-full h-1 ${primaryBgClass} mb-4`}></div>
              <h2 className={`${getFontSize('text-xl', title)} font-black text-center uppercase leading-tight py-4`}>
                {title}
              </h2>
              <div className={`w-full h-1 ${primaryBgClass} mt-4`}></div>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
              <div className={`p-4 border-2 ${primaryBorderClass} rounded-lg`}>
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </div>
              
              <div className="text-center space-y-2">
                <p className={`text-xl font-black uppercase italic tracking-tighter ${primaryTextClass}`}>ESCANEIE E APOIE ESTA BRONCA</p>
                <p className="text-[10px] font-bold text-gray-600 max-w-[200px] mx-auto leading-tight">O Trombone Cidadão une a comunidade para cobrar soluções.</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[95vh] sm:h-[90vh] lg:h-[85vh] p-0 flex flex-col overflow-hidden border-none shadow-2xl">
        {/* Interface do modal (cabecalho) - acompanha o tema */}
        <DialogHeader className="p-4 sm:p-6 border-b border-edge-subtle bg-surface-raised flex-shrink-0">
          <DialogTitle className="text-xl sm:text-2xl text-content-primary">Escolha um modelo de panfleto</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm hidden xs:block text-content-secondary">
            Baixe e imprima para divulgar a sua bronca.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4 sm:p-6 lg:p-4 bg-surface-base no-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 sm:gap-8 lg:gap-4 h-full">
            <div className="space-y-4 sm:space-y-6 lg:space-y-4">
              <div>
                <h3 className="text-[10px] sm:text-sm font-semibold uppercase tracking-wider text-content-tertiary mb-2 sm:mb-4 lg:mb-2">
                  Modelos Disponíveis
                </h3>
                <div className="flex flex-row sm:flex-col gap-1.5 sm:gap-2 overflow-x-visible sm:overflow-x-auto pb-1 sm:pb-0">
                  {FLYER_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`flex items-center sm:items-start flex-row gap-1.5 sm:gap-4 lg:gap-2 p-1.5 sm:p-4 lg:p-2 rounded-xl text-left transition-all border-2 flex-1 sm:flex-none ${
                        selectedTemplate === t.id
                          ? 'border-brand bg-brand/10 shadow-sm ring-1 ring-brand/20'
                          : 'border-transparent hover:bg-surface-subtleHover bg-surface-subtle'
                      }`}
                    >
                      <div className={`p-1 sm:p-2 rounded-lg transition-colors ${selectedTemplate === t.id ? 'bg-brand text-content-onBrand' : 'bg-surface-sunken text-content-tertiary'}`}>
                        <t.icon size={14} className="sm:w-5 sm:h-5 lg:w-4 lg:h-4" />
                      </div>
                      <div className='flex flex-col min-w-0'>
                        <div className={`font-bold text-[10px] sm:text-sm lg:text-xs flex items-center gap-1 sm:gap-2 lg:gap-1 truncate ${selectedTemplate === t.id ? 'text-brand' : 'text-content-primary'}`}>
                          {t.name === 'Minimalista' ? 'Minimal' : t.name}
                          {selectedTemplate === t.id && <Check size={10} className="text-brand sm:w-3.5 sm:h-3.5 lg:w-3 lg:h-3 flex-shrink-0" />}
                        </div>
                        <p className="text-[10px] hidden sm:block text-content-tertiary mt-1 leading-relaxed lg:line-clamp-1">
                          {t.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 sm:pt-2 border-t border-edge-subtle sm:border-none">
                <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-content-tertiary mb-2 sm:mb-3">
                  Estilo e Cores
                </h3>
                <div className="bg-surface-sunken rounded-xl p-1 sm:p-1.5">
                  <ToggleGroup type="single" value={isColor ? 'color' : 'bw'} onValueChange={(v) => v && setIsColor(v === 'color')} className="flex flex-row sm:flex-col lg:flex-row gap-1">
                    <ToggleGroupItem
                      value="color"
                      className={`flex-1 gap-1.5 px-3 h-9 sm:h-10 lg:h-9 justify-center sm:justify-start lg:justify-center rounded-lg transition-all duration-200 ${
                        isColor
                          ? 'bg-surface-raised text-brand shadow-sm border border-brand/20 font-bold'
                          : 'text-content-tertiary hover:bg-surface-raised/50'
                      }`}
                    >
                      <Palette size={14} className={isColor ? 'text-brand' : 'text-content-tertiary'} />
                      <span className="text-[10px] sm:text-xs">Colorido</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="bw"
                      className={`flex-1 gap-1.5 px-3 h-9 sm:h-10 lg:h-9 justify-center sm:justify-start lg:justify-center rounded-lg transition-all duration-200 ${
                        !isColor
                          ? 'bg-surface-raised text-content-primary shadow-sm border border-edge-strong font-bold'
                          : 'text-content-tertiary hover:bg-surface-raised/50'
                      }`}
                    >
                      <Contrast size={14} className={!isColor ? 'text-content-primary' : 'text-content-tertiary'} />
                      <span className="text-[10px] sm:text-xs">P & B</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:gap-4 lg:gap-2 h-full">
              <div className="bg-surface-sunken rounded-2xl p-2 sm:p-4 lg:p-2 flex items-start justify-center border border-dashed border-edge-default overflow-hidden h-[360px] xs:h-[400px] sm:h-[480px] lg:h-[350px] xl:h-[480px] flex-shrink-0">
                  <div className="transform scale-[0.5] xs:scale-[0.55] sm:scale-[0.6] lg:scale-[0.45] xl:scale-[0.65] origin-top center flex-shrink-0 pt-2">
                    {/* Este e o no capturado por toPng (flyerRef): bg-white e o fundo do panfleto gerado, fixo de proposito */}
                    <div
                      ref={flyerRef}
                      className="w-[400px] shadow-2xl relative overflow-hidden bg-white"
                    >
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={selectedTemplate}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                        >
                          {renderFlyerTemplate()}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interface do modal (rodape) - acompanha o tema */}
        <div className="p-4 sm:p-6 lg:p-4 border-t border-edge-subtle bg-surface-raised flex items-center justify-center sm:justify-end gap-3 flex-shrink-0">
          <Button
            onClick={handleDownload}
            disabled={isGenerating}
            className="bg-cta-bg hover:bg-cta-bg/90 text-cta-fg border border-cta-border gap-2 h-10 sm:h-12 lg:h-10 px-6 sm:px-8 lg:px-6 font-bold shadow-lg shadow-brand/20 flex-1 sm:flex-none"
          >
            {isGenerating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cta-fg"></div>
            ) : (
              <Download size={18} className="lg:w-4 lg:h-4" />
            )}
            {isGenerating ? 'Gerando...' : 'Baixar Panfleto'}
          </Button>
          {/* variant ghost nao define cor de texto propria; sem token explicito o texto fica invisivel no tema escuro */}
          <Button variant="ghost" onClick={onClose} className="h-10 sm:h-12 lg:h-10 px-4 sm:px-8 lg:px-4 font-bold text-content-primary">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportFlyerModal;
