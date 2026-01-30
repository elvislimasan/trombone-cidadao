import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import Pix from '@/utils/pix';

export const useDonation = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // id: reportId ou petitionId, conforme contexto.kind
  const createPaymentIntent = async (id, amount, contexto = {}, provider = 'pix_manual') => {
    setLoading(true);
    try {
      if (provider === 'stripe' || provider === 'mercadopago') {
        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
            body: {
                amount,
                [contexto.kind === 'petition' ? 'petition_id' : 'report_id']: id,
                provider: provider
            }
        });

        if (error) throw error;
        
        return {
            success: true,
            donationId: data.donationId,
            clientSecret: data.clientSecret, // Stripe specific
            pixPayload: data.pixPayload, // MP specific
            pixQrCodeBase64: data.pixQrCodeBase64, // MP specific
            provider: data.provider
        };
      }

      const txid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const pixKey = import.meta.env.VITE_PIX_KEY;
      const pixName = import.meta.env.VITE_PIX_NAME;
      const pixCity = import.meta.env.VITE_PIX_CITY || 'Recife';

      if (!pixKey || !pixName) {
        console.warn('Pix keys missing in environment');
        if (!pixKey) throw new Error('Chave Pix não configurada');
      }

      const amountFloat = amount / 100;
      const cleanTxid = txid.substring(0, 25);
      const pixPayload = Pix.generate(pixKey, pixName, pixCity, amountFloat, cleanTxid);

      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        user_id: user ? user.id : null,
        amount: amount,
        status: 'pending',
        provider: 'pix_manual',
        payment_id: cleanTxid,
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
        pixPayload: pixPayload,
        pixKey: pixKey
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
    confirmDonation,
    loading
  };
};
