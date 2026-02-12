import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft, Info } from 'lucide-react';

const steps = [
  {
    target: '#tour-step-indicator',
    title: 'Passos da Petição',
    content: 'Acompanhe seu progresso através dos diferentes estágios da criação.',
    position: 'bottom'
  },
  {
    target: '#title',
    title: 'Título da Campanha',
    content: 'Crie um título curto e impactante para atrair mais assinaturas.',
    position: 'bottom'
  },
  {
    target: '#tour-validation-info',
    title: 'Validação em Tempo Real',
    content: 'Agora as validações aparecem instantaneamente abaixo dos campos se algo estiver faltando.',
    position: 'top'
  },
  {
    target: '#tour-next-step',
    title: 'Avançar',
    content: 'Clique aqui para salvar e ir para o próximo passo quando terminar.',
    position: 'top'
  }
];

export function PetitionTour({ onComplete, userId }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if tour was already completed for this user
    const tourKey = `petition_tour_completed_${userId}`;
    const completed = localStorage.getItem(tourKey);
    
    if (!completed && userId) {
      // Delay start slightly for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [userId]);

  useEffect(() => {
    if (isVisible) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords);
      return () => {
        window.removeEventListener('resize', updateCoords);
        window.removeEventListener('scroll', updateCoords);
      };
    }
  }, [isVisible, currentStep]);

  const updateCoords = () => {
    const step = steps[currentStep];
    let selector = step.target;
    
    // Handle mobile/desktop specific targets
    if (selector === '#tour-step-indicator' && window.innerWidth < 768) {
      selector = '#tour-step-indicator-mobile';
    }

    const element = document.querySelector(selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      });
      
      // Scroll to element if not in view
      if (rect.top < 100 || rect.bottom > window.innerHeight - 100) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    const tourKey = `petition_tour_completed_${userId}`;
    localStorage.setItem(tourKey, 'true');
    if (onComplete) onComplete();
  };

  if (!isVisible) return null;

  const currentStepData = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Backdrop with hole */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        style={{
          clipPath: `polygon(
            0% 0%, 
            0% 100%, 
            ${coords.left}px 100%, 
            ${coords.left}px ${coords.top}px, 
            ${coords.left + coords.width}px ${coords.top}px, 
            ${coords.left + coords.width}px ${coords.top + coords.height}px, 
            ${coords.left}px ${coords.top + coords.height}px, 
            ${coords.left}px 100%, 
            100% 100%, 
            100% 0%
          )`
        }}
        onClick={handleComplete}
      />

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute z-[101] w-72 md:w-80 bg-card p-5 rounded-2xl shadow-2xl border border-primary/20 pointer-events-auto"
          style={{
            top: currentStepData.position === 'bottom' 
              ? coords.top + coords.height + 16 
              : coords.top - 180, // Approximate height of tooltip
            left: Math.max(16, Math.min(window.innerWidth - 320, coords.left + (coords.width / 2) - 160))
          }}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Info className="w-4 h-4" />
              <span>{currentStepData.title}</span>
            </div>
            <button 
              onClick={handleComplete}
              className="p-1 hover:bg-muted rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            {currentStepData.content}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentStep ? 'bg-primary' : 'bg-muted'}`} 
                />
              ))}
            </div>
            
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handlePrev}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
              )}
              <Button 
                size="sm" 
                onClick={handleNext}
                className="h-8 px-3 rounded-full"
              >
                {currentStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
                {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>

          {/* Arrow */}
          <div 
            className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-l border-t border-primary/20 rotate-45 ${
              currentStepData.position === 'bottom' ? '-top-2 border-l-0 border-t-0 border-r border-b rotate-[-135deg]' : '-bottom-2'
            }`}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
