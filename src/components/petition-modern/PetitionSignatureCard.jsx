import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Share2, CheckCircle2, Shield, PenLine, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const PetitionSignatureCard = ({ 
  signaturesCount, 
  goal, 
  onSign, 
  isSubmitting,
  hasSigned,
  user,
  city,
  setCity,
  isPublic,
  setIsPublic,
  allowNotifications,
  setAllowNotifications,
  onShare,
  recentSignatures = [],
  compact = false,
  hero
}) => {
  const progress = Math.min((signaturesCount / goal) * 100, 100);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSign();
  };
  
  const getInitials = (name) => {
      return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'AN';
  };

  return (
    <Card className="border-0 shadow-lg border-t-4 border-primary">
      <CardHeader className="pb-4">
        {hero && <div className="mb-6">{hero}</div>}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            <strong className="text-lg text-primary">{signaturesCount}</strong> pessoas já assinaram. Ajude a chegar em{` `}
            <strong className="text-foreground">{goal}</strong>!
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <Progress value={progress} className="h-2.5" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress)}% da meta</span>
            <span>Meta: {goal}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          {!compact && (
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PenLine className="h-4 w-4 text-primary" />
                {hasSigned ? "Você já assinou!" : "Assine este abaixo-assinado"}
              </div>
          )}

          {!hasSigned ? (
            compact ? (
                <Button
                    onClick={onSign}
                    className="h-12 w-full text-sm sm:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Assinando..." : "Assinar Abaixo-assinado"}
                </Button>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-medium">
                    Cidade
                    </Label>
                    <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Sua cidade"
                    className="h-11"
                    required
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-start gap-2">
                    <Checkbox 
                        id="anonymous" 
                        className="mt-0.5" 
                        checked={!isPublic}
                        onCheckedChange={(checked) => setIsPublic(!checked)}
                    />
                    <Label
                        htmlFor="anonymous"
                        className="text-sm font-normal leading-tight text-muted-foreground"
                    >
                        Não exibir minha assinatura publicamente
                    </Label>
                    </div>
                    <div className="flex items-start gap-2">
                    <Checkbox 
                        id="updates" 
                        className="mt-0.5" 
                        checked={allowNotifications}
                        onCheckedChange={(checked) => setAllowNotifications(checked)}
                    />
                    <Label
                        htmlFor="updates"
                        className="text-sm font-normal leading-tight text-muted-foreground"
                    >
                        Quero receber novidades sobre esta causa
                    </Label>
                    </div>
                </div>

              <Button 
                type="submit" 
                className="h-12 w-full text-sm sm:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                disabled={isSubmitting}
              >
                    {isSubmitting ? "Assinando..." : "Assinar Abaixo-assinado"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                    Ao assinar, você concorda com nossos{" "}
                    <a href="/termos" className="text-primary underline-offset-2 hover:underline">
                    Termos de Uso
                    </a>{" "}
                    e{" "}
                    <a href="/privacidade" className="text-primary underline-offset-2 hover:underline">
                    Política de Privacidade
                    </a>
                </p>
                </form>
            )
          ) : (
            <div className="rounded-lg bg-green-50 p-4 text-center text-green-700 border border-green-200">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
              <p className="font-medium">Obrigado por assinar!</p>
              <p className="text-sm mt-1">Sua voz faz a diferença.</p>
            </div>
          )}
        </div>

        <Button variant="outline" className="h-11 w-full gap-2 bg-transparent border-input text-sm sm:text-base px-2" onClick={onShare}>
          <Share2 className="h-4 w-4 shrink-0" />
          <span className="truncate">Compartilhar</span>
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4 text-green-600" />
          Assinatura segura e verificada
        </div>

        <div className="border-t pt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Últimos Apoiadores
          </div>
          <div className="space-y-3">
            {recentSignatures.slice(0, 3).map((signer, index) => {
              const isAnonymous = !signer.is_public;
              const displayName = isAnonymous ? "Apoiador Anônimo" : (signer.name || "Apoiador Anônimo");
              const initials = isAnonymous ? "AN" : getInitials(displayName);

              return (
                <div key={index} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <p className="font-medium text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">
                        {signer.created_at ? formatDistanceToNow(new Date(signer.created_at), { addSuffix: true, locale: ptBR }) : 'Recentemente'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PetitionSignatureCard;
