import React, { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, Share2, Heart, CreditCard, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from '@/components/ui/use-toast';

export const PetitionProgress = ({ signatures = 0, supporters = [] }) => {
  const calculateGoal = (current) => {
    if (current < 100) return 100;
    if (current < 500) return 500;
    if (current < 1000) return 1000;
    if (current < 5000) return 5000;
    if (current < 10000) return 10000;
    return Math.ceil((current + 1000) / 1000) * 1000;
  };

  const goal = calculateGoal(signatures);
  const progress = Math.min((signatures / goal) * 100, 100);
  
  // Dynamic color based on progress percentage
  const getProgressColor = (percent) => {
    if (percent >= 90) return "bg-green-500";
    if (percent >= 50) return "bg-yellow-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
             <h3 className="text-xl font-bold text-foreground">Impacto</h3>
             {progress >= 90 && <span className="text-xs font-bold text-green-600 animate-pulse">QUASE LÁ!</span>}
        </div>
        
        <Progress value={progress} className="h-3 bg-secondary" indicatorClassName={getProgressColor(progress)} />
        <div className="flex justify-between text-sm font-medium">
          <span className="text-primary font-bold">{signatures} <span className="text-muted-foreground font-normal">Assinaturas</span></span>
          <span className="text-muted-foreground">{goal} <span className="font-normal">Próxima meta</span></span>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
            {goal - signatures} assinaturas para o próximo marco!
        </p>
      </div>

      <div className="space-y-3">
        {supporters.map((supporter, index) => (
          <div key={index} className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{supporter.name ? supporter.name.charAt(0) : 'A'}</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <span className="font-semibold">{supporter.name || 'Anônimo'}</span>
              <span className="text-muted-foreground"> {supporter.action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PetitionActions = ({ onContribute, onShare }) => {
  return (
    <div className="space-y-4 pt-4">
      <Button 
        onClick={onContribute} 
        className="w-full text-lg font-bold py-8 bg-yellow-400 hover:bg-yellow-500 text-black shadow-md transition-transform active:scale-95 whitespace-normal leading-tight"
      >
        Sim, vou contribuir com R$ 15 para ajudar a atingir a meta do abaixo-assinado
      </Button>

      <Button 
        onClick={onShare} 
        variant="outline" 
        className="w-full text-lg font-semibold py-6 border-2 hover:bg-muted transition-colors"
      >
        Não, prefiro compartilhar
      </Button>

      <div className="flex justify-center gap-4 py-4 opacity-70 grayscale hover:grayscale-0 transition-all">
        {/* Placeholder icons for payment methods */}
        <div className="flex gap-2">
          <CreditCard className="w-8 h-8" />
          <QrCode className="w-8 h-8" />
          {/* Add more icons as images if available, or just SVGs */}
        </div>
      </div>
      
      <div className="text-center space-y-2 pt-4 border-t border-border">
        <div className="flex justify-center">
            <Heart className="w-12 h-12 text-yellow-500 animate-pulse" />
        </div>
        <h3 className="text-xl font-bold">Junte-se à comunidade!</h3>
        <p className="text-muted-foreground">
            Sua contribuição ajuda a manter esta petição em destaque e pressiona por soluções.
        </p>
      </div>
    </div>
  );
};

export const ShareModal = ({ isOpen, onClose, url, title }) => {
    const handleCopy = () => {
        navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
    };

    const shareSocial = (platform) => {
        const text = `Assine e compartilhe esta petição: ${title}`;
        let shareLink = '';
        
        switch(platform) {
            case 'whatsapp':
                shareLink = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
                break;
            case 'facebook':
                shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
                break;
            case 'twitter':
                shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
                break;
            case 'email':
                shareLink = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + ' ' + url)}`;
                break;
        }
        
        window.open(shareLink, '_blank');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-card">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-center">O compartilhamento leva a muito mais assinaturas.</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                    <p className="text-center text-muted-foreground">
                        👋 631 novas assinaturas foram adicionadas a essa petição graças às pessoas que a compartilharam. Junte-se a eles!
                    </p>

                    <div className="p-4 bg-muted rounded-lg flex flex-col gap-3">
                        <Input value={url} readOnly className="bg-background" />
                        <Button onClick={handleCopy} className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold">
                            <Copy className="w-4 h-4 mr-2" /> Copiar link
                        </Button>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                         <button onClick={() => shareSocial('facebook')} className="flex flex-col items-center gap-2 group">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" /> {/* Replace with FB icon */}
                            </div>
                            <span className="text-xs">Facebook</span>
                         </button>
                         <button onClick={() => shareSocial('whatsapp')} className="flex flex-col items-center gap-2 group">
                            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" /> {/* Replace with WA icon */}
                            </div>
                            <span className="text-xs">WhatsApp</span>
                         </button>
                         <button onClick={() => shareSocial('email')} className="flex flex-col items-center gap-2 group">
                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" /> 
                            </div>
                            <span className="text-xs">E-mail</span>
                         </button>
                         <button onClick={() => shareSocial('twitter')} className="flex flex-col items-center gap-2 group">
                            <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                <Share2 className="w-6 h-6" /> 
                            </div>
                            <span className="text-xs">X</span>
                         </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
