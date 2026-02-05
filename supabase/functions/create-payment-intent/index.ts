import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'

console.log("Create Payment Intent Function Invoked")

// Pix Helper
class Pix {
  private static formatField(id: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  }

  private static crc16(str: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  static generate(key: string, name: string, city: string, amount: string, txid: string = '***'): string {
    const amountStr = parseFloat(amount).toFixed(2);
    const merchantAccount = Pix.formatField('00', 'br.gov.bcb.pix') + Pix.formatField('01', key);
    
    let payload = 
      '000201' +
      Pix.formatField('26', merchantAccount) +
      Pix.formatField('52', '0000') +
      Pix.formatField('53', '986') +
      Pix.formatField('54', amountStr) +
      Pix.formatField('58', 'BR') +
      Pix.formatField('59', name) +
      Pix.formatField('60', city) +
      Pix.formatField('62', Pix.formatField('05', txid)) +
      '6304';

    return payload + Pix.crc16(payload);
  }
}

function cleanMetadata(metadata: Record<string, any>) {
  const result: Record<string, string> = {};
  Object.keys(metadata).forEach(key => {
    if (metadata[key] !== null && metadata[key] !== undefined) {
      result[key] = String(metadata[key]);
    }
  });
  return result;
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log("Function Version: 2.2 (Fixes applied)")
    let { amount, report_id, petition_id, pix_key, pix_name, pix_city, provider = 'pix_manual', action = 'init', payment_intent_id, payment_id, guestInfo } = body
    
    const safeGuestInfo = guestInfo || {};


    // Detect Mercado Pago Webhook
    if (body.type === 'payment' && body.data && body.data.id) {
        console.log("Detected Mercado Pago Webhook for Payment:", body.data.id);
        provider = 'mercadopago';
        action = 'finalize';
        payment_id = body.data.id;
    }
    // Detect Stripe Webhook (if we were using it directly, but for now client calls finalize)
    
    if (action !== 'finalize' && (!amount || (!report_id && !petition_id))) {
      throw new Error('Missing amount or target id (report_id or petition_id)')
    }

    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()

    // Create admin client to bypass RLS for guest donations and inserts
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let resultData = {};

    if (provider === 'stripe' && action === 'init') {
        console.log('Provider is Stripe');
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (!stripeKey) {
            console.error('Stripe Secret Key missing in Secrets');
            throw new Error('CONFIG_ERROR: Stripe Secret Key not configured in Supabase Secrets');
        }
        
        // Log key prefix for debugging (safe)
        console.log(`Using Stripe Key: ${stripeKey.substring(0, 7)}...`);

        if (stripeKey.startsWith('sk_live') && amount < 100) {
             console.warn("Warning: Using Live Stripe Key for small amount");
        }

        const stripe = new Stripe(stripeKey, {
            apiVersion: '2023-10-16',
            httpClient: Stripe.createFetchHttpClient(),
        });

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'brl',
            automatic_payment_methods: { enabled: true },
            metadata: cleanMetadata({
                report_id: report_id,
                petition_id: petition_id,
                user_id: user ? user.id : 'guest',
                guest_email: guestInfo?.email,
                guest_name: guestInfo?.name
            })
        });

        resultData = {
            clientSecret: paymentIntent.client_secret,
            stripePaymentIntentId: paymentIntent.id,
            provider: 'stripe'
        };

    } else if (provider === 'mercadopago' && action === 'init') {
        console.log('Provider is Mercado Pago');
        const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
        if (!mpAccessToken) {
            console.error('Mercado Pago Access Token missing');
            throw new Error('Mercado Pago Access Token not configured');
        }

        const transactionAmount = parseFloat((amount / 100).toFixed(2));
        
        const paymentData = {
            transaction_amount: transactionAmount,
            description: `Doação`,
            payment_method_id: "pix",
            payer: {
                email: (user && user.email) ? user.email : (safeGuestInfo.email || "guest@horizons.com.br"),
                first_name: safeGuestInfo.name?.split(' ')[0] || "Doador",
                last_name: safeGuestInfo.name?.split(' ').slice(1).join(' ') || "Anônimo"
            },
            metadata: cleanMetadata({
                report_id: report_id,
                petition_id: petition_id,
                user_id: user ? user.id : 'guest',
                guest_email: safeGuestInfo.email,
                guest_name: safeGuestInfo.name
            })
        };

        const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${mpAccessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": crypto.randomUUID()
            },
            body: JSON.stringify(paymentData)
        });

        const mpResult = await mpResponse.json();

        if (!mpResponse.ok) {
            console.error('Mercado Pago Error:', mpResult);
            throw new Error(mpResult.message || 'Failed to create Mercado Pago payment');
        }

        const qrCode = mpResult.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = mpResult.point_of_interaction?.transaction_data?.qr_code_base64;
        const paymentId = mpResult.id.toString();

        resultData = {
            pixPayload: qrCode,
            pixQrCodeBase64: qrCodeBase64,
            paymentId: paymentId,
            provider: 'mercadopago'
        };

    } else if (action === 'init') {
        const pixKey = pix_key || Deno.env.get('PIX_KEY') || Deno.env.get('VITE_PIX_KEY') || 'admin@horizons.com.br';
        const pixName = pix_name || Deno.env.get('PIX_NAME') || Deno.env.get('VITE_PIX_NAME') || 'Horizons App';
        const pixCity = pix_city || Deno.env.get('PIX_CITY') || Deno.env.get('VITE_PIX_CITY') || 'Recife';
        
        // Amount comes in cents (e.g. 1500 for R$ 15,00), convert to string "15.00"
        const amountBrl = (amount / 100).toFixed(2);
        const txid = `DOACAO${Date.now().toString().slice(-10)}`;

        const payload = Pix.generate(pixKey, pixName, pixCity, amountBrl, txid);

        // Handle Guest User for Pix Manual (Invite immediately as there is no finalize step)
        let guestUserId = null;
        if (!user && guestInfo?.email) {
             try {
                 const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(guestInfo.email, {
                    data: { full_name: guestInfo.name }
                 });
                 if (userData?.user) {
                     guestUserId = userData.user.id;
                 } else {
                     console.log("Pix Manual Invite failed:", inviteError?.message);
                 }
             } catch (e) {
                 console.warn("Pix Manual Invite exception:", e);
             }
        }

        resultData = {
            pixPayload: payload,
            pixKey: pixKey,
            paymentId: txid,
            provider: 'pix_manual',
            guest_user_id: guestUserId
        };
    } else if (action === 'finalize' && provider === 'stripe') {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (!stripeKey) {
            throw new Error('CONFIG_ERROR: Stripe Secret Key not configured in Supabase Secrets');
        }
        if (!payment_intent_id) {
            throw new Error('Missing payment_intent_id');
        }
        const stripe = new Stripe(stripeKey, {
            apiVersion: '2023-10-16',
            httpClient: Stripe.createFetchHttpClient(),
        });
        const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (intent.status !== 'succeeded') {
            return new Response(JSON.stringify({ confirmed: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // Check for existing donation to ensure idempotency
        const { data: existingDonation } = await supabaseAdmin
            .from('donations')
            .select('id')
            .eq('payment_id', intent.id)
            .maybeSingle();

        if (existingDonation) {
            console.log(`Stripe Payment ${intent.id} already processed.`);
            resultData = { donationId: existingDonation.id, confirmed: true };
        } else {
            // Handle Guest User for Stripe
            let userId = (intent.metadata?.user_id ?? null) as unknown;
            const guestEmail = intent.metadata?.guest_email || null;
            const guestName = intent.metadata?.guest_name || null;

            if (userId === 'guest') userId = null;

            if (!userId && guestEmail) {
                 try {
                     const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(guestEmail, {
                        data: { full_name: guestName }
                     });
                     if (userData?.user) {
                         userId = userData.user.id;
                     } else {
                         console.log("Stripe Invite failed:", inviteError?.message);
                     }
                 } catch (e) {
                     console.warn("Stripe Invite exception:", e);
                 }
            }

            const insertPayload: Record<string, unknown> = {
                report_id: (intent.metadata?.report_id ?? null) as unknown,
                petition_id: (intent.metadata?.petition_id ?? null) as unknown,
                user_id: userId,
                guest_email: guestEmail,
                guest_name: guestName,
                amount: intent.amount,
                status: 'paid',
                payment_id: intent.id,
                provider: 'stripe'
            };
            const { data: donationData, error: insertError } = await supabaseAdmin
                .from('donations')
                .insert(insertPayload)
                .select()
                .single();
            if (insertError) throw insertError;
            resultData = { donationId: donationData.id, confirmed: true };
        }
    } else if (action === 'finalize' && provider === 'mercadopago') {
        const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
        if (!mpAccessToken) {
            throw new Error('Mercado Pago Access Token not configured');
        }
        if (!payment_id) {
            throw new Error('Missing payment_id');
        }
        const resp = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${mpAccessToken}`,
                "Content-Type": "application/json"
            }
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.message || 'Failed to verify Mercado Pago payment');
        }
        if (data.status !== 'approved') {
            return new Response(JSON.stringify({ confirmed: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // Check for existing donation to ensure idempotency
        const { data: existingDonation } = await supabaseAdmin
            .from('donations')
            .select('id')
            .eq('payment_id', String(payment_id))
            .maybeSingle();

        if (existingDonation) {
            console.log(`Mercado Pago Payment ${payment_id} already processed.`);
            resultData = { donationId: existingDonation.id, confirmed: true };
        } else {
            const amountCents = Math.round((data.transaction_amount || 0) * 100);
            
            // Handle Guest User for Mercado Pago
            let userId = (data.metadata?.user_id ?? null) as unknown;
            const guestEmail = data.metadata?.guest_email || null;
            const guestName = data.metadata?.guest_name || null;

            if (userId === 'guest') userId = null;

            if (!userId && guestEmail) {
                 try {
                     const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(guestEmail, {
                        data: { full_name: guestName }
                     });
                     if (userData?.user) {
                         userId = userData.user.id;
                     } else {
                         console.log("MP Invite failed:", inviteError?.message);
                     }
                 } catch (e) {
                     console.warn("MP Invite exception:", e);
                 }
            }

            const insertPayload: Record<string, unknown> = {
                report_id: (data.metadata?.report_id ?? null) as unknown,
                petition_id: (data.metadata?.petition_id ?? null) as unknown,
                user_id: userId,
                guest_email: guestEmail,
                guest_name: guestName,
                amount: amountCents,
                status: 'paid',
                payment_id: String(payment_id),
                provider: 'mercadopago'
            };
            const { data: donationData, error: insertError } = await supabaseAdmin
                .from('donations')
                .insert(insertPayload)
                .select()
                .single();
            if (insertError) throw insertError;
            resultData = { donationId: donationData.id, confirmed: true };
        }
    }

    return new Response(
      JSON.stringify(resultData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
