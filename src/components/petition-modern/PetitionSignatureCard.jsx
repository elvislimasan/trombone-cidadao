import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import ReCAPTCHA from "react-google-recaptcha";

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
  hero,
  guestForm,
  setGuestForm,
  onGuestSign,
  signing,
  verifying,
  errorMessage,
  recaptchaRef,
  onCaptchaChange
}) => {
  const progress = Math.min((signaturesCount / goal) * 100, 100);
  const [showGuestForm, setShowGuestForm] = useState(false);
  useEffect(() => {
    if (hasSigned) setShowGuestForm(false);
  }, [hasSigned]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSign();
  };
  
  const getInitials = (name) => {
      return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'AN';
  };

  return (
    <Card className="border-0 shadow-lg border-t-4 border-primary overflow-visible">
      <AnimatePresence mode="wait" initial={false}>
        {!showGuestForm ? (
          <motion.div
            key="default-view"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ pointerEvents: showGuestForm ? 'none' : 'auto' }}
          >
            <CardHeader className="p-4 md:p-5 pb-3 md:pb-4">
              {hero && <div className="mb-4 md:mb-6">{hero}</div>}
              <div className="text-center">
                <p className="text-xs md:text-sm text-muted-foreground">
                  <strong className="text-base md:text-lg text-primary">{signaturesCount}</strong> pessoas já assinaram. Ajude a chegar em{' '}
                  <strong className="text-foreground">{goal}</strong>!
                </p>
              </div>
              <div className="mt-3 md:mt-4 space-y-1.5 md:space-y-2">
                <Progress value={progress} className="h-2 md:h-2.5" />
                <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground">
                  <span>{Math.round(progress)}% da meta</span>
                  <span>Meta: {goal}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-5 pt-0 md:pt-0 space-y-4 md:space-y-6">
              <div className="space-y-3 md:space-y-4">
                {!compact && (
                  <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-foreground">
                    <PenLine className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                    {hasSigned ? 'Você já assinou!' : 'Assine este abaixo-assinado'}
                  </div>
                )}
                {!hasSigned ? (
                  compact ? (
                    user ? (
                      <Button
                        onClick={onSign}
                        className="h-10 md:h-12 w-full text-sm md:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Assinando...' : 'Assinar Abaixo-assinado'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setShowGuestForm(true)}
                        className="h-10 md:h-12 w-full text-sm md:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Assinando...' : 'Assinar Abaixo-assinado'}
                      </Button>
                    )
                  ) : user ? (
                    <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
                      <div className="space-y-1.5 md:space-y-2">
                        <Label htmlFor="city" className="text-xs md:text-sm font-medium">
                          Cidade
                        </Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Sua cidade"
                          className="h-9 md:h-11 text-sm"
                          required
                        />
                      </div>
                      <div className="space-y-2 md:space-y-3">
                        <div className="flex items-start gap-2">
                          <Checkbox id="anonymous" className="mt-0.5" checked={!isPublic} onCheckedChange={(checked) => setIsPublic(!checked)} />
                          <Label htmlFor="anonymous" className="text-[12px] md:text-sm font-normal leading-tight text-muted-foreground">
                            Não exibir minha assinatura publicamente
                          </Label>
                        </div>
                        <div className="flex items-start gap-2">
                          <Checkbox id="updates" className="mt-0.5" checked={allowNotifications} onCheckedChange={(checked) => setAllowNotifications(checked)} />
                          <Label htmlFor="updates" className="text-[12px] md:text-sm font-normal leading-tight text-muted-foreground">
                            Quero receber novidades sobre esta causa
                          </Label>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="h-10 md:h-12 w-full text-sm md:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Assinando...' : 'Assinar Abaixo-assinado'}
                      </Button>
                      <p className="text-center text-[10px] md:text-xs text-muted-foreground">
                        Ao assinar, você concorda com nossos <a href="/termos" className="text-primary underline-offset-2 hover:underline">Termos de Uso</a> e{' '}
                        <a href="/privacidade" className="text-primary underline-offset-2 hover:underline">Política de Privacidade</a>
                      </p>
                    </form>
                  ) : (
                    <Button
                      onClick={() => setShowGuestForm(true)}
                      className="h-10 md:h-12 w-full text-sm md:text-base font-semibold shadow-md transition-all hover:shadow-lg px-2 whitespace-normal leading-tight"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Assinando...' : 'Assinar Abaixo-assinado'}
                    </Button>
                  )
                ) : (
                  <div className="rounded-lg bg-green-50 p-3 md:p-4 text-center text-green-700 border border-green-200">
                    <CheckCircle2 className="h-6 w-6 md:h-8 md:w-8 mx-auto mb-1.5 md:mb-2" />
                    <p className="text-sm md:font-medium">Obrigado por assinar!</p>
                    <p className="text-xs md:text-sm mt-0.5 md:mt-1">Sua voz faz a diferença.</p>
                  </div>
                )}
              </div>
              <Button variant="outline" className="h-9 md:h-11 w-full gap-2 bg-transparent border-input text-sm px-2" onClick={onShare}>
                <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                <span className="truncate">Compartilhar</span>
              </Button>
              <div className="flex items-center justify-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-600" />
                Assinatura segura e verificada
              </div>
              <div className="border-t pt-3 md:pt-4">
                <div className="mb-2 md:mb-3 flex items-center gap-2 text-xs md:text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                  Últimos Apoiadores
                </div>
                <div className="space-y-2 md:space-y-3">
                  {recentSignatures.slice(0, 3).map((signer, index) => {
                    const isAnonymous = !signer.is_public;
                    const displayName = isAnonymous ? 'Apoiador Anônimo' : signer.name || 'Apoiador Anônimo';
                    const initials = isAnonymous ? 'AN' : getInitials(displayName);
                    return (
                      <div key={index} className="flex items-center gap-2 md:gap-3">
                        <Avatar className="h-7 w-7 md:h-8 md:w-8">
                          <AvatarFallback className="bg-primary/10 text-[10px] md:text-xs text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="text-[12px] md:text-sm min-w-0 flex-1">
                          <p className="font-medium text-foreground break-words overflow-hidden">{displayName}</p>
                          <p className="text-[10px] md:text-xs text-muted-foreground break-words overflow-hidden">
                            {signer.created_at ? formatDistanceToNow(new Date(signer.created_at), { addSuffix: true, locale: ptBR }) : 'Recentemente'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </motion.div>
        ) : (
          <motion.div
            key="guest-form"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ pointerEvents: 'auto', position: 'relative', zIndex: 2 }}
          >
            <CardHeader className="p-4 md:p-5 pb-3 md:pb-4">
  <div className="flex items-center justify-between w-full">
    <div className="text-xs md:text-sm font-semibold text-foreground">
      Assinar como convidado
    </div>
    <Button type="button" variant="outline" onClick={() => setShowGuestForm(false)}>
      Voltar
    </Button>
  </div>
</CardHeader>
            <CardContent className="p-4 md:p-5 pt-0 md:pt-0 space-y-4 md:space-y-6">
              <div className="space-y-3 md:space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="guest-name" className="text-xs md:text-sm font-medium">Nome</Label>
                  <Input id="guest-name" value={guestForm?.name || ''} onChange={(e) => setGuestForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Seu nome completo" className="h-9 md:h-11 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guest-email" className="text-xs md:text-sm font-medium">Email</Label>
                  <Input id="guest-email" type="email" value={guestForm?.email || ''} onChange={(e) => setGuestForm(prev => ({ ...prev, email: e.target.value }))} placeholder="seu@email.com" className="h-9 md:h-11 text-sm" />
                  {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guest-city" className="text-xs md:text-sm font-medium">Cidade</Label>
                  <Input id="guest-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sua cidade" className="h-9 md:h-11 text-sm" />
                </div>
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox id="guest-anonymous" className="mt-0.5" checked={!isPublic} onCheckedChange={(checked) => setIsPublic(!checked)} />
                    <Label htmlFor="guest-anonymous" className="text-[12px] md:text-sm font-normal leading-tight text-muted-foreground">Não exibir minha assinatura publicamente</Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox id="guest-updates" className="mt-0.5" checked={allowNotifications} onCheckedChange={(checked) => setAllowNotifications(checked)} />
                    <Label htmlFor="guest-updates" className="text-[12px] md:text-sm font-normal leading-tight text-muted-foreground">Quero receber novidades sobre esta causa</Label>
                  </div>
                </div>
                <div className="flex justify-center relative" style={{ zIndex: 10, touchAction: 'manipulation', width: '100%' }}>
                  <div style={{ width: 304, maxWidth: '100%' }}>
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                      onChange={onCaptchaChange}
                      size="normal"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={onGuestSign} disabled={signing || verifying}>{verifying ? 'Verificando...' : (signing ? 'Assinando...' : 'Assinar')}</Button>
                 
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

export default PetitionSignatureCard;
