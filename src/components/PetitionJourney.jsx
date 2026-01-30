import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Download, Heart, ArrowRight, CheckCircle, Copy, MessageSquare } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

// This component manages the post-signing journey
// Steps:
// 1. Donation (Upsell)
// 2. App Install / Complete Profile (Retention)
// 3. Share (Growth)
// 4. Next Petition (Engagement)

const PetitionJourney = ({ isOpen, onClose, petitionTitle, petitionUrl, onDonate, isGuest, donationOptions, donationEnabled = true }) => {
  const [step, setStep] = useState(donationEnabled ? 'donation' : 'app-install'); // donation, app-install, share, complete
  const { toast } = useToast();
  
  // Skip donation step if no options provided or disabled (though caller should handle enablement)
  // But here we just render what we have.
  
  const handleNext = () => {
    if (step === 'donation') setStep('app-install');
    else if (step === 'app-install') setStep('share');
    else if (step === 'share') setStep('complete');
    else onClose();
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleShare = async () => {
    const shareData = {
      title: `Assine: ${petitionTitle}`,
      text: `Acabei de assinar este abaixo-assinado: ${petitionTitle}. Assine você também!`,
      url: petitionUrl,
      dialogTitle: 'Compartilhar Abaixo-Assinado',
    };

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share(shareData);
      } else {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
          toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
        }
      }
      handleNext();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDonateClick = () => {
    if (onDonate) {
      onDonate();
    } else {
      toast({ title: "Funcionalidade em breve", description: "O sistema de doações está sendo integrado." });
      handleNext();
    }
  };

  const renderDonationStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center">
        <div className="bg-primary/10 p-4 rounded-full">
          <Heart className="w-12 h-12 text-primary fill-primary animate-pulse" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">Você pode fazer mais!</h3>
        <p className="text-muted-foreground">
          Abaixo-assinados com impulsionamento financeiro têm 4x mais chances de sucesso.
          Contribua com qualquer valor para mostrar a força desta causa.
        </p>
      </div>
      <div className="space-y-3">
        <Button 
          onClick={handleDonateClick} 
          className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
        >
          Sim, quero contribuir
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Não, vou apenas assinar
        </Button>
      </div>
    </div>
  );

  const renderAppInstallStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center">
        <div className="bg-primary/10 p-4 rounded-full">
          <Download className="w-12 h-12 text-primary" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">{isGuest ? "Acompanhe sua assinatura" : "Acompanhe esta petição"}</h3>
        <p className="text-muted-foreground">
          {isGuest 
            ? "Para garantir que sua assinatura seja contabilizada e receber atualizações, baixe o app e crie sua conta."
            : "Baixe o app Trombone Cidadão para receber notificações sobre vitórias e atualizações desta causa."
          }
        </p>
      </div>
      <div className="space-y-3">
        <Button 
          onClick={() => {
            // Link to store or download page
            window.open('https://play.google.com/store/apps/details?id=com.trombonecidadao.app', '_blank');
            handleNext();
          }} 
          className="w-full text-lg py-6 font-bold"
        >
          Baixar Aplicativo
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Pular esta etapa
        </Button>
      </div>
    </div>
  );

  const renderShareStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center">
        <div className="bg-primary/10 p-4 rounded-full">
          <Share2 className="w-12 h-12 text-primary" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">Multiplique seu impacto</h3>
        <p className="text-muted-foreground">
          Compartilhar nas redes sociais é a forma mais eficiente de conseguir mais assinaturas.
        </p>
      </div>
      
      <div className="bg-muted p-3 rounded-lg flex items-center gap-2 mb-2">
        <Input value={petitionUrl} readOnly className="bg-background" />
        <Button size="icon" variant="ghost" onClick={() => {
            navigator.clipboard.writeText(petitionUrl);
            toast({ title: "Copiado!" });
        }}>
            <Copy className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <Button 
          onClick={handleShare} 
          className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
        >
          Compartilhar Agora
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Pular
        </Button>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center">
        <div className="bg-green-100 p-4 rounded-full">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">Obrigado pelo seu apoio!</h3>
        <p className="text-muted-foreground">
          Sua assinatura foi registrada e ajudará a fazer a diferença.
        </p>
      </div>
      <div className="space-y-3">
        <Button 
          onClick={onClose} 
          className="w-full text-lg py-6 font-bold"
        >
          Concluir e Voltar
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card">
        {step === 'donation' && renderDonationStep()}
        {step === 'app-install' && renderAppInstallStep()}
        {step === 'share' && renderShareStep()}
        {step === 'complete' && renderCompleteStep()}
        
        <div className="flex justify-center gap-2 mt-4">
          {['donation', 'app-install', 'share', 'complete']
            .filter(s => s !== 'donation' || donationEnabled)
            .map((s, i) => (
            <div 
              key={s} 
              className={`h-2 w-2 rounded-full transition-all ${
                s === step ? 'bg-primary w-6' : 
                // Mark previous steps as completed/colored
                // Logic is tricky with filtered array, simplified:
                'bg-muted'
              }`} 
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PetitionJourney;
