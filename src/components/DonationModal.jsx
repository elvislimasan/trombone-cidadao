import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const DonationModal = ({ report, reportId, petitionId, reportTitle, isOpen, onClose, onSuccess, initialAmount = null, donationOptions = [2, 5, 10, 20, 50, 100], initialGuestName = '', initialGuestEmail = '' }) => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState(initialAmount || donationOptions[1] || 5); // Default to provided initial or second option or 5
  const [step, setStep] = useState('select-amount'); // select-amount, processing, qr, stripe-payment, success
  const [mobileSubStep, setMobileSubStep] = useState(1); // 1: amount/payment, 2: guest info (mobile only)
  const [pixPayload, setPixPayload] = useState('');
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState(null);
  const [currentDonationId, setCurrentDonationId] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('pix'); // pix or card
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  
  const { user } = useAuth();
  const [guestName, setGuestName] = useState(initialGuestName);
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [guestError, setGuestError] = useState('');

  const { createPaymentIntent, finalizeDonation, confirmDonation, loading } = useDonation();
  
  const targetId = (report && report.id) ? report.id : (petitionId ?? reportId);
  const targetTitle = report?.title ?? reportTitle;
  const isPlatformDonation = !targetId;

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

  // Reset state when modal closes, or update when opens
  useEffect(() => {
    if (!isOpen) {
      setStep('select-amount');
      setMobileSubStep(1);
      setPixPayload('');
      setPixQrCodeBase64(null);
      setClientSecret(null);
      setCurrentDonationId(null);
      setStripePaymentIntentId(null);
      setPaymentId(null);
      setGuestError('');
      // Only clear if we don't have initial props, otherwise we want them to persist/reset to initial
      if (!initialGuestName) setGuestName('');
      if (!initialGuestEmail) setGuestEmail('');
    } else {
      // When opening, pre-fill if available
      if (initialGuestName) setGuestName(initialGuestName);
      if (initialGuestEmail) setGuestEmail(initialGuestEmail);
    }
  }, [isOpen, initialGuestName, initialGuestEmail]);

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
      { kind: isPlatformDonation ? 'platform' : (report ? 'report' : 'petition') },
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
      <DialogContent className="sm:max-w-lg md:max-w-4xl max-h-[90vh] overflow-y-auto pb-24 sm:pb-6" hideClose={true}>
        <div className="flex flex-col md:flex-row gap-8">
            {/* Left Column (Desktop) - Info & Hero */}
            <div className="hidden md:flex flex-col justify-between w-1/3 border-r pr-6 space-y-6">
                <div>
                    <div className="flex items-center gap-2 mb-4 text-primary">
                        <Heart className="w-8 h-8 fill-current" />
                        <h2 className="text-xl font-bold">Faça a diferença</h2>
                    </div>
                    <h3 className="text-2xl font-bold leading-tight mb-2">
                        {isPlatformDonation 
                            ? 'Apoie a Plataforma' 
                            : (petitionId ? 'Impulsionar Abaixo-assinado' : 'Impulsionar Bronca')
                        }
                    </h3>
                    <p className="text-muted-foreground">
                        {isPlatformDonation 
                            ? 'Ajude a manter e evoluir nossa tecnologia para amplificar mais vozes.'
                            : <>Ajude a resolver <span className="font-semibold text-foreground">"{petitionId ? (reportTitle || targetTitle) : targetTitle}"</span> mais rápido.</>
                        }
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-xl space-y-3">
                         <div className="flex items-start gap-3">
                            <div className="bg-green-100 p-2 rounded-full text-green-600">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm">Visibilidade Ampliada</h4>
                                <p className="text-xs text-muted-foreground">Sua doação coloca esta causa em destaque para mais pessoas.</p>
                            </div>
                         </div>
                         <div className="flex items-start gap-3">
                            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm">Prioridade na Plataforma</h4>
                                <p className="text-xs text-muted-foreground">Aumente a pressão por uma solução rápida e eficaz.</p>
                            </div>
                         </div>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Lock className="w-3 h-3" />
                        Pagamento 100% seguro e transparente.
                    </div>
                </div>
            </div>

            {/* Right Column (Desktop) / Full Width (Mobile) - Form */}
            <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                {step === 'qr' || step === 'stripe-payment' || (step === 'select-amount' && mobileSubStep === 2) ? (
                    <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => {
                        if (step === 'select-amount' && mobileSubStep === 2) {
                            setMobileSubStep(1);
                        } else {
                            setStep('select-amount');
                            setMobileSubStep(user ? 1 : 2);
                        }
                    }}>
                    <ChevronLeft className="w-4 h-4" /> Voltar
                    </Button>
                ) : (
                    <div className="md:hidden"></div> 
                )}
                <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
                    Fechar
                </Button>
                </div>

                <div className="md:hidden mb-6">
                    <DialogHeader className="pt-0 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <Heart className="w-5 h-5 text-red-500 fill-red-500" /> 
                        {isPlatformDonation 
                            ? 'Apoiar Plataforma' 
                            : `Impulsionar ${petitionId ? 'Abaixo-assinado' : 'Bronca'}`
                        }
                    </DialogTitle>
                    <DialogDescription>
                        {isPlatformDonation 
                            ? 'Ajude a manter e evoluir nossa tecnologia.'
                            : `Ajude a resolver "${petitionId ? (reportTitle || targetTitle) : targetTitle}" mais rápido.`
                        }
                    </DialogDescription>
                    </DialogHeader>
                </div>

                {step === 'select-amount' && (
                <div className="space-y-6 py-2">
                    {/* Passo 1: Valor e Método de Pagamento */}
                    <div className={mobileSubStep === 2 ? "hidden md:block space-y-6" : "space-y-6"}>
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
                    </div>

                    {!user && (
                        <div className={mobileSubStep === 1 ? "hidden md:block space-y-3 mb-4 border-t pt-4" : "space-y-3 mb-4 border-t pt-4"}>
                            <Label className="text-base font-semibold">Seus Dados</Label>
                            <p className="text-xs text-muted-foreground mb-2">Informe seus dados para identificarmos sua doação e enviarmos o comprovante.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            </div>
                            {guestError && <p className="text-sm text-red-500 font-medium">{guestError}</p>}
                        </div>
                    )}

                    <div className="md:hidden bg-muted/50 p-3 rounded-lg flex items-start gap-3 text-sm text-muted-foreground">
                    <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>Pagamento seguro e criptografado.</p>
                    </div>
                </div>
                )}

                {step === 'processing' && (
                <div className="py-12 text-center space-y-6">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-500 mx-auto"></div>
                    <div>
                        <h3 className="text-xl font-bold mb-2">Processando doação...</h3>
                        <p className="text-muted-foreground">Estamos gerando seu pagamento de R$ {amount.toFixed(2)}</p>
                    </div>
                </div>
                )}

                {step === 'stripe-payment' && clientSecret && (
                    <div className="py-2">
                        <div className="text-center mb-6 md:hidden">
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
                <div className="py-2 space-y-6">
                    <div className="text-center space-y-2 md:text-left">
                    <h3 className="text-xl font-bold">Pague com Pix</h3>
                    <p className="text-muted-foreground">Escaneie o QR Code ou copie o código Pix Copia e Cola.</p>
                    </div>
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                    <div className="p-3 rounded-xl border bg-muted/30 shrink-0">
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
                    <div className="w-full space-y-4">
                        <div className="grid grid-cols-1 gap-2 w-full">
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
                            <Button variant="outline" onClick={() => navigator.clipboard.writeText(pixPayload)} className="w-full">
                                <Copy className="w-4 h-4 mr-2" /> Copiar Código
                            </Button>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 bg-muted/20 rounded-lg px-3">
                            <div className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </div>
                            <p className="font-medium text-xs">Aguardando confirmação automática...</p>
                        </div>
                    </div>
                    </div>
                </div>
                )}

                {step === 'success' && (
                <div className="py-8 text-center space-y-4">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Heart className="w-10 h-10 fill-current" />
                    </div>
                    <h3 className="text-3xl font-bold text-green-600">Muito Obrigado!</h3>
                    <p className="text-lg text-muted-foreground max-w-sm mx-auto">Sua doação de <span className="font-bold text-foreground">R$ {amount.toFixed(2)}</span> foi confirmada. A bronca foi impulsionada com sucesso!</p>
                    
                    {!user && (
                        <div className="bg-muted/30 p-6 rounded-xl border mt-8 text-left space-y-4">
                           <div>
                               <h4 className="font-bold text-lg text-foreground">Acompanhe seu impacto</h4>
                               <p className="text-sm text-muted-foreground">Crie uma conta para salvar seu histórico de doações e receber atualizações sobre esta causa.</p>
                           </div>
                           <Button onClick={() => { onClose(); navigate('/cadastro', { state: { name: guestName, email: guestEmail } }); }} variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 font-bold">
                              Criar Minha Conta
                           </Button>
                        </div>
                    )}
                </div>
                )}

                <DialogFooter className={`sm:justify-end gap-2 mt-6 ${step === 'select-amount' ? 'border-t pt-4' : ''}`}>
                {step === 'select-amount' && (
                    <>
                    <Button variant="outline" onClick={onClose} className="hidden md:flex">Cancelar</Button>
                    
                    {/* Botões Mobile */}
                    <div className="flex flex-col w-full gap-2 md:hidden">
                        {mobileSubStep === 1 && !user ? (
                            <Button onClick={() => setMobileSubStep(2)} className="bg-red-500 hover:bg-red-600 text-white font-bold w-full">
                                Continuar
                            </Button>
                        ) : (
                            <Button onClick={handleDonate} className="bg-red-500 hover:bg-red-600 text-white font-bold w-full">
                                Doar R$ {amount.toFixed(2)}
                            </Button>
                        )}
                        <Button variant="outline" onClick={onClose} className="w-full">Cancelar</Button>
                    </div>

                    {/* Botão Desktop */}
                    <Button onClick={handleDonate} className="hidden md:flex bg-red-500 hover:bg-red-600 text-white font-bold w-full sm:w-auto">
                        Doar R$ {amount.toFixed(2)}
                    </Button>
                    </>
                )}
                {step === 'success' && (
                    <Button onClick={onClose} className="w-full">Concluir</Button>
                )}
                </DialogFooter>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DonationModal;
