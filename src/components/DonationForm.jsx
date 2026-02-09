import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDonation } from '@/hooks/useDonation';
import { Heart, Lock, QrCode, Copy, Download, ChevronLeft, CreditCard, TrendingUp } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '../contexts/SupabaseAuthContext';
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

const DonationForm = ({ 
    report, 
    reportId, 
    petitionId, 
    reportTitle, 
    onSuccess, 
    onCancel, 
    initialAmount = null, 
    donationOptions = [2, 5, 10, 20, 50, 100],
    className,
    showHeader = true,
    donationGoal = null,
    totalDonations = 0
}) => {
  const [amount, setAmount] = useState(initialAmount || donationOptions[1] || 5);
  const [step, setStep] = useState('select-amount'); // select-amount, details, processing, qr, stripe-payment, success
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
  
  // Progress Data
  const raised = totalDonations || 0;
  const goal = Number(donationGoal);
  const progress = (goal && goal > 0) ? Math.min((raised / goal) * 100, 100) : 0;
  const hasGoal = !isNaN(goal) && goal > 0;

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

  const handleDetailsSubmit = async () => {
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
      ); 
      
      console.log('Resultado do createPaymentIntent:', result);
  
      if (result.success) {
        if (provider === 'stripe' && result.clientSecret) {
          setClientSecret(result.clientSecret);
          setStripePaymentIntentId(result.stripePaymentIntentId || null);
          setStep('stripe-payment');
        } else if (result.pixPayload) {
          setPixPayload(result.pixPayload);
          setPixQrCodeBase64(result.pixQrCodeBase64 || null);
          setPaymentId(result.paymentId || null);
          setStep('qr');
        } else {
          setStep('select-amount');
        }
      } else {
        setStep('select-amount');
      }
  };

  const renderSelectAmount = () => (
    <div className="space-y-6">
        {showHeader && hasGoal && (
            <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-primary">
                    <TrendingUp className="h-4 w-4" />
                    R$ {raised.toFixed(2).replace('.', ',')} arrecadados
                    </span>
                    <span className="text-muted-foreground">Meta: R$ {goal.toFixed(2).replace('.', ',')}</span>
                </div>
                <Progress value={progress} className="h-2" />
            </div>
        )}

      <div className="grid grid-cols-3 gap-2">
        {donationOptions.map((value) => (
          <Button
            key={value}
            variant={amount === value ? "default" : "outline"}
            className={cn(
                "h-11 font-semibold transition-all",
                amount === value ? "shadow-md" : ""
            )}
            onClick={() => setAmount(value)}
          >
            R$ {value}
          </Button>
        ))}
      </div>
      
      <div className="relative">
        <Input 
          type="number" 
          min="1" 
          value={amount} 
          onChange={(e) => setAmount(Number(e.target.value))}
          className="h-11 pl-10 text-lg"
          placeholder="Outro valor"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
        </span>
      </div>

      <Button 
        className="h-12 w-full text-base font-semibold shadow-md transition-all hover:shadow-lg"
        onClick={() => setStep('details')}
      >
        Contribuir agora
      </Button>

      <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-3 text-sm text-muted-foreground">
        <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>Pagamento seguro e criptografado. Todo o valor arrecadado é revertido para melhorias na plataforma.</p>
      </div>
    </div>
  );

  const renderDetails = () => (
      <div className="space-y-6">
           <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('select-amount')} className="px-0">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Alterar Valor
                </Button>
                <span className="font-bold text-lg">R$ {amount.toFixed(2)}</span>
           </div>

           <div className="space-y-4">
               <div>
                   <Label className="mb-2 block text-sm font-medium">Forma de Pagamento</Label>
                   <Tabs defaultValue="pix" value={paymentMethod} onValueChange={setPaymentMethod} className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="pix" className="flex items-center gap-2"><QrCode className="w-4 h-4"/> Pix</TabsTrigger>
                          <TabsTrigger value="card" disabled className="flex items-center gap-2 opacity-50 cursor-not-allowed"><CreditCard className="w-4 h-4"/> Cartão</TabsTrigger>
                      </TabsList>
                   </Tabs>
               </div>

               {!user && (
                    <div className="space-y-3 pt-2 border-t">
                        <Label className="text-base font-semibold">Seus Dados</Label>
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

                <Button onClick={handleDetailsSubmit} className="w-full h-12 text-lg font-bold mt-4 bg-green-600 hover:bg-green-700">
                    Pagar R$ {amount.toFixed(2)}
                </Button>
           </div>
      </div>
  );

  return (
    <div className={cn("bg-background", className)}>
      {step === 'select-amount' && renderSelectAmount()}
      {step === 'details' && renderDetails()}
      
      {step === 'processing' && (
        <div className="py-8 text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
          <p className="text-lg font-medium">Processando pagamento...</p>
        </div>
      )}

      {step === 'stripe-payment' && clientSecret && (
        <div className="py-2">
            <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={() => setStep('details')} className="px-0">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Voltar
                </Button>
            </div>
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
            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('details')} className="px-0">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Voltar
                </Button>
            </div>
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
                    className="w-[200px] h-[200px] object-contain"
                  />
                ) : (
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixPayload)}`} 
                    alt="QR Code Pix"
                    className="w-[200px] h-[200px]"
                  />
                )}
              </div>
              <div className="w-full space-y-1">
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
              
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2 bg-muted/20 rounded-lg w-full">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </div>
                <p className="font-medium">Aguardando confirmação...</p>
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
          {onCancel && (
            <Button onClick={onCancel} className="w-full mt-4">Fechar</Button>
          )}
        </div>
      )}
    </div>
  );
};

export default DonationForm;
