import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import Pix from '@/utils/pix';

export const useDonation = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // id: reportId ou petitionId, conforme contexto.kind
  const createPaymentIntent = async (id, amount, contexto = {}, provider = 'pix_manual', guestInfo = null) => {
    setLoading(true);
    try {
      // Sempre usa a Edge Function para gerar o payload e convidar usuário se necessário
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
            amount,
            [contexto.kind === 'petition' ? 'petition_id' : 'report_id']: id,
            provider: provider,
            action: 'init',
            guestInfo
        }
      });

      if (error) throw error;
      
      if (provider === 'stripe' || provider === 'mercadopago') {
        if (provider === 'mercadopago' && !data.paymentId) {
            console.warn("Atenção: paymentId não retornado pelo backend. O polling de confirmação não funcionará.");
        }

        return {
            success: true,
            clientSecret: data.clientSecret, // Stripe specific
            stripePaymentIntentId: data.stripePaymentIntentId, // Stripe specific
            pixPayload: data.pixPayload, // MP specific
            pixQrCodeBase64: data.pixQrCodeBase64, // MP specific
            provider: data.provider,
            paymentId: data.paymentId // MP
        };
      }

      // Pix Manual: Inserção local no banco
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        user_id: user ? user.id : (data.guest_user_id || null), // Usa ID retornado pelo backend (convite) se houver
        amount: amount,
        status: 'pending',
        provider: 'pix_manual',
        payment_id: data.paymentId,
        guest_email: guestInfo?.email || null,
        guest_name: guestInfo?.name || null
      };

      if (contexto.kind === 'petition') {
        payload.petition_id = id || null;
      } else {
        payload.report_id = id || null;
      }

      const { data: donation, error: insertError } = await supabase
        .from('donations')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return {
        success: true,
        donationId: donation.id,
        pixPayload: data.pixPayload,
        pixKey: data.pixKey
      };
    } catch (error) {
      console.error('Erro ao criar intenção de pagamento:', error);
      toast({
        title: "Erro no pagamento",
        description: "Não foi possível iniciar o processo de doação. Tente novamente.",
        variant: "destructive"
      });
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const finalizeDonation = async ({ provider, paymentIntentId, paymentId }) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          provider,
          action: 'finalize',
          payment_intent_id: paymentIntentId,
          payment_id: paymentId
        }
      });
      if (error) throw error;
      if (data && data.confirmed) {
        return { success: true, donationId: data.donationId };
      }
      return { success: false };
    } catch (error) {
      console.error("Erro ao finalizar doação:", error);
      return { success: false, error };
    }
  };

  const confirmDonation = async (donationId) => {
    try {
        const { error } = await supabase
            .from('donations')
            .update({ status: 'paid' })
            .eq('id', donationId);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Erro ao confirmar doação:", error);
        return { success: false, error };
    }
  };

  return {
    createPaymentIntent,
    finalizeDonation,
    confirmDonation,
    loading
  };
};
