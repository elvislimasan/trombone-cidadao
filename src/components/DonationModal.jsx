import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDonation } from '@/hooks/useDonation';
import { supabase } from '@/lib/customSupabaseClient';
import { Heart, Lock, QrCode, Copy, Download, ChevronLeft, CheckCircle2, CreditCard } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '../contexts/SupabaseAuthContext';

// Initialize Stripe outside component
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_sample';
const stripePromise = loadStripe(stripeKey);

const StripePaymentForm = ({ onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required'
    });

    if (error) {
      setErrorMessage(error.message);
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess();
    } else {
        // Unexpected state
        setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button disabled={!stripe || processing} className="w-full font-bold">
        {processing ? 'Processando...' : 'Confirmar Pagamento'}
      </Button>
      {errorMessage && <div className="text-red-500 text-sm mt-2">{errorMessage}</div>}
    </form>
  )
}

const DonationModal = ({ report, reportId, petitionId, reportTitle, isOpen, onClose, onSuccess, initialAmount = null, donationOptions = [2, 5, 10, 20, 50, 100] }) => {
  const [amount, setAmount] = useState(initialAmount || donationOptions[1] || 5); // Default to provided initial or second option or 5
  const [step, setStep] = useState('select-amount'); // select-amount, processing, qr, stripe-payment, success
  const [pixPayload, setPixPayload] = useState('');
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState(null);
  const [currentDonationId, setCurrentDonationId] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('pix'); // pix or card
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  
  const { user } = useAuth();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestError, setGuestError] = useState('');

  const { createPaymentIntent, finalizeDonation, confirmDonation, loading } = useDonation();
  
  const targetId = (report && report.id) ? report.id : (petitionId ?? reportId);
  const targetTitle = report?.title ?? reportTitle;

  useEffect(() => {
    if (step !== 'qr' || !paymentId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      const res = await finalizeDonation({ provider: 'mercadopago', paymentId });
      if (res.success) {
        setCurrentDonationId(res.donationId || null);
        setStep('success');
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, paymentId, finalizeDonation]);

  useEffect(() => {
    if (step === 'success' && onSuccess) {
      onSuccess();
    }
  }, [step, onSuccess]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('select-amount');
      setPixPayload('');
      setPixQrCodeBase64(null);
      setClientSecret(null);
      setCurrentDonationId(null);
      setStripePaymentIntentId(null);
      setPaymentId(null);
      setGuestName('');
      setGuestEmail('');
      setGuestError('');
    }
  }, [isOpen]);

  const handleDonate = async () => {
    if (!user) {
        if (!guestEmail || !guestName) {
            setGuestError('Por favor, preencha seu nome e email para continuar.');
            return;
        }
        if (!guestEmail.includes('@')) {
            setGuestError('Por favor, insira um email válido.');
            return;
        }
    }
    setGuestError('');
    setStep('processing');
    
    const provider = paymentMethod === 'card' ? 'stripe' : 'mercadopago';
    console.log('Iniciando doação com provider:', provider);

    const guestInfo = !user ? { name: guestName, email: guestEmail } : null;

    const result = await createPaymentIntent(
      targetId,
      amount * 100,
      { kind: report ? 'report' : 'petition' },
      provider,
      guestInfo
    ); // Send in cents
    
    console.log('Resultado do createPaymentIntent:', result);

    if (result.success) {
      if (provider === 'stripe' && result.clientSecret) {
        console.log('Configurando Stripe ClientSecret:', result.clientSecret);
        setClientSecret(result.clientSecret);
        setStripePaymentIntentId(result.stripePaymentIntentId || null);
        setStep('stripe-payment');
      } else if (result.pixPayload) {
        setPixPayload(result.pixPayload);
        setPixQrCodeBase64(result.pixQrCodeBase64 || null);
        setPaymentId(result.paymentId || null);
        setStep('qr');
      } else {
        // Mock mode: confirm immediately
        setStep('select-amount');
      }
    } else {
      setStep('select-amount');
    }
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto pb-24 sm:pb-6" hideClose={true}>
        <div className="flex items-center justify-between mb-2">
           {step === 'qr' ? (
             <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => setStep('select-amount')}>
               <ChevronLeft className="w-4 h-4" /> Voltar
             </Button>
           ) : (
             <div></div> 
           )}
           <Button variant="outline" size="sm" onClick={onClose}>
             Fechar
           </Button>
        </div>

        <DialogHeader className="pt-0">
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" /> 
            Impulsionar Bronca
          </DialogTitle>
          <DialogDescription>
            Ajude a resolver "{targetTitle}" mais rápido. Sua doação aumenta a visibilidade e prioridade.
          </DialogDescription>
        </DialogHeader>

        {step === 'select-amount' && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-3 gap-3">
              {donationOptions.map((value) => (
                <Button
                  key={value}
                  variant={amount === value ? "default" : "outline"}
                  className={`h-12 text-lg ${amount === value ? "bg-red-500 hover:bg-red-600 border-red-500" : ""}`}
                  onClick={() => setAmount(value)}
                >
                  R$ {value}
                </Button>
              ))}
            </div>
            
            <div className="space-y-2">
              <Label>Outro valor (R$)</Label>
              <Input 
                type="number" 
                min="1" 
                value={amount} 
                onChange={(e) => setAmount(Number(e.target.value))}
                className="text-lg"
              />
            </div>

            <div className="mt-4 mb-4">
               <Label className="mb-2 block text-sm font-medium">Forma de Pagamento</Label>
               <Tabs defaultValue="pix" value={paymentMethod} onValueChange={setPaymentMethod} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="pix" className="flex items-center gap-2" title="Pix Automático via Mercado Pago"><QrCode className="w-4 h-4"/> Pix (Mercado Pago)</TabsTrigger>
                      <TabsTrigger value="card" disabled className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Em breve"><CreditCard className="w-4 h-4"/> Cartão (Em breve)</TabsTrigger>
                  </TabsList>
               </Tabs>
               {paymentMethod === 'card' && (
                 <p className="text-xs text-muted-foreground mt-2">
                   Pagamento seguro processado via Stripe.
                 </p>
               )}
               {paymentMethod === 'pix' && (
                 <p className="text-xs text-muted-foreground mt-2">
                   Pagamento via Pix com confirmação automática pelo Mercado Pago.
                 </p>
               )}
            </div>

            {!user && (
                <div className="space-y-3 mb-4 border-t pt-4">
                    <Label className="text-base font-semibold">Seus Dados</Label>
                    <p className="text-xs text-muted-foreground mb-2">Informe seus dados para identificarmos sua doação e enviarmos o comprovante.</p>
                    <div className="space-y-2">
                        <Label htmlFor="guestName">Nome Completo</Label>
                        <Input 
                            id="guestName" 
                            placeholder="Seu nome" 
                            value={guestName} 
                            onChange={(e) => setGuestName(e.target.value)} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="guestEmail">E-mail</Label>
                        <Input 
                            id="guestEmail" 
                            type="email" 
                            placeholder="seu@email.com" 
                            value={guestEmail} 
                            onChange={(e) => setGuestEmail(e.target.value)} 
                        />
                    </div>
                    {guestError && <p className="text-sm text-red-500 font-medium">{guestError}</p>}
                </div>
            )}

            <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-3 text-sm text-muted-foreground">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Pagamento seguro e criptografado. Todo o valor arrecadado é revertido para melhorias na plataforma e ações diretas.</p>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-8 text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
            <p className="text-lg font-medium">Processando pagamento...</p>
          </div>
        )}

        {step === 'stripe-payment' && clientSecret && (
            <div className="py-2">
                <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setStep('select-amount')} className="px-0">
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                </div>
                <div className="text-center mb-6">
                    <h3 className="text-xl font-bold">Pagamento Seguro</h3>
                    <p className="text-sm text-muted-foreground">Insira os dados do seu cartão</p>
                </div>
                {stripeKey === 'pk_test_sample' && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md mb-4 text-sm">
                        <p className="font-bold">Configuração Necessária</p>
                        <p>A chave pública do Stripe não foi encontrada. Adicione <code>VITE_STRIPE_PUBLISHABLE_KEY</code> no seu arquivo .env.</p>
                    </div>
                )}
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                    <StripePaymentForm onSuccess={async () => {
                      const res = await finalizeDonation({ provider: 'stripe', paymentIntentId: stripePaymentIntentId });
                      if (res.success) {
                        setCurrentDonationId(res.donationId || null);
                        setStep('success');
                      }
                    }} />
                </Elements>
            </div>
        )}

        {step === 'qr' && (
          <div className="py-4 space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold">Pague com Pix</h3>
              <p className="text-muted-foreground">Escaneie o QR Code ou copie o código Pix Copia e Cola.</p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 rounded-xl border bg-muted/30">
                {pixQrCodeBase64 ? (
                  <img 
                    src={`data:image/png;base64,${pixQrCodeBase64}`} 
                    alt="QR Code Pix"
                    className="w-[240px] h-[240px] object-contain"
                  />
                ) : (
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixPayload)}`} 
                    alt="QR Code Pix"
                    className="w-[240px] h-[240px]"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 w-full">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(pixPayload)} className="w-full">
                  <Copy className="w-4 h-4 mr-2" /> Copiar Código
                </Button>
                <a 
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(pixPayload)}`} 
                  download={`pix-${targetId ?? 'code'}.png`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <Button variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" /> Baixar QR
                  </Button>
                </a>
              </div>
              <div className="w-full space-y-1">
                  <Label className="text-xs text-muted-foreground">Pix Copia e Cola</Label>
                  <div className="relative">
                    <Input readOnly value={pixPayload} className="font-mono text-xs h-9 pr-10" />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="absolute right-0 top-0 h-9 w-9 px-0"
                      onClick={() => navigator.clipboard.writeText(pixPayload)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2 bg-muted/20 rounded-lg">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </div>
                <p className="font-medium">Aguardando confirmação automática...</p>
              </div>
            </div>
            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4" />
                <span className="text-sm font-semibold">Detalhes</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Valor: R$ {amount.toFixed(2)}</p>
                <p>Após o pagamento, sua doação será confirmada automaticamente.</p>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <Heart className="w-8 h-8 fill-current" />
            </div>
            <h3 className="text-2xl font-bold text-green-600">Obrigado!</h3>
            <p>Sua doação de R$ {amount.toFixed(2)} foi confirmada. A bronca foi impulsionada!</p>
          </div>
        )}

        <DialogFooter className={`sm:justify-end gap-2`}>
          {step === 'select-amount' && (
            <>
               <Button variant="outline" onClick={onClose}>Cancelar</Button>
               <Button onClick={handleDonate} className="bg-red-500 hover:bg-red-600 text-white font-bold">
                 Doar R$ {amount.toFixed(2)}
               </Button>
            </>
          )}
          {step === 'success' && (
            <Button onClick={onClose} className="w-full">Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DonationModal;
