import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Download, Heart, ArrowRight, CheckCircle, Copy, MessageSquare, UserPlus } from 'lucide-react';
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

const PetitionJourney = ({ isOpen, onClose, petitionTitle, petitionUrl, onDonate, isGuest, donationOptions, donationEnabled = true, userName, guestEmail }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(donationEnabled ? 'donation' : (isGuest ? 'account-creation' : 'share')); // donation, account-creation, share, complete
  const { toast } = useToast();
  
  // Skip donation step if no options provided or disabled (though caller should handle enablement)
  // But here we just render what we have.
  
  const handleNext = () => {
    if (step === 'donation') setStep(isGuest ? 'account-creation' : 'share');
    else if (step === 'account-creation') setStep('share');
    else if (step === 'share') setStep('complete');
    else onClose();
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleShare = async () => {
    const shareData = {
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
          await navigator.clipboard.writeText(shareData.url);
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
      handleNext(); // Move to next step while modal opens on top
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

  const renderAccountCreationStep = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center">
        <div className="bg-primary/10 p-4 rounded-full">
          <UserPlus className="w-12 h-12 text-primary" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">Não perca nenhuma atualização!</h3>
        <p className="text-muted-foreground">
          Crie sua conta gratuita para acompanhar o progresso desta causa, editar sua assinatura e apoiar outros movimentos.
        </p>
      </div>
      <div className="space-y-3">
        <Button 
          onClick={() => {
            navigate('/cadastro', { state: { name: userName, email: guestEmail } });
            onClose();
          }} 
          className="w-full text-lg py-6 font-bold"
        >
          Criar Minha Conta
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Agora não
        </Button>
      </div>
    </div>
  );

  const renderShareStep = () => {
    const encodedUrl = encodeURIComponent(petitionUrl);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedUrl}`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    return (
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

      <div className="grid grid-cols-2 gap-3">
        <Button 
          variant="outline"
          className="w-full gap-2 border-green-500 text-green-600 hover:bg-green-50"
          onClick={() => window.open(whatsappUrl, '_blank')}
        >
          <MessageSquare className="w-4 h-4" />
          WhatsApp
        </Button>
        <Button 
          variant="outline"
          className="w-full gap-2 border-blue-600 text-blue-600 hover:bg-blue-50"
          onClick={() => window.open(facebookUrl, '_blank')}
        >
          <Share2 className="w-4 h-4" />
          Facebook
        </Button>
      </div>

      <div className="space-y-3">
        <Button 
          onClick={handleShare} 
          className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
        >
          Outras Opções
        </Button>
        <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
          Pular
        </Button>
      </div>
    </div>
  );
  };

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
      <DialogContent className="sm:max-w-md bg-card max-h-[95vh] overflow-y-auto">
        {step === 'donation' && renderDonationStep()}
        {step === 'account-creation' && renderAccountCreationStep()}
        {step === 'share' && renderShareStep()}
        {step === 'complete' && renderCompleteStep()}
        
        <div className="flex justify-center gap-2 mt-4">
          {['donation', 'account-creation', 'share', 'complete']
            .filter(s => {
                if (s === 'donation' && !donationEnabled) return false;
                if (s === 'account-creation' && !isGuest) return false;
                return true;
            })
            .map((s, i) => (
            <div 
              key={s} 
              className={`h-2 w-2 rounded-full transition-all ${
                s === step ? 'bg-primary w-6' : 
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
