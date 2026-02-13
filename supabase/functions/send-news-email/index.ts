import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from "npm:resend@2.0.0"


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set in environment variables')
    }
    const resend = new Resend(apiKey)

    const { newsId, relatedReportId, petitionUpdateId } = await req.json()
    if (!newsId && !petitionUpdateId) throw new Error('newsId or petitionUpdateId is required')

    // Create Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const recipients = new Set<string>()
    const userIdsToFetch = new Set<string>()
    let emailSubject = ''
    let emailHtml = ''
    const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'

    if (petitionUpdateId) {
         // --- PETITION UPDATE LOGIC ---
         const { data: update, error: updateError } = await supabaseAdmin
            .from('petition_updates')
            .select('*')
            .eq('id', petitionUpdateId)
            .single()
        
        if (updateError || !update) throw new Error('Update not found')

        // Fetch Petition Details explicitly to be safe regarding foreign key naming
        const { data: petition, error: petitionError } = await supabaseAdmin
            .from('petitions')
            .select('title, image_url')
            .eq('id', update.petition_id)
            .single()

        const petitionTitle = petition?.title || 'Campanha'
        const petitionImage = update.image_url || petition?.image_url
        
        emailSubject = `Atualização: ${update.title}`
        
        emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h1 style="color: #E63946; margin-bottom: 10px;">${update.title}</h1>
                <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
                    Atualização sobre a campanha: <strong>${petitionTitle}</strong>
                </p>
                
                ${petitionImage ? `<img src="${petitionImage}" alt="${update.title}" style="width: 100%; border-radius: 8px; margin-bottom: 20px; object-fit: cover; max-height: 300px;" />` : ''}
                
                <div style="line-height: 1.6; margin-bottom: 25px; white-space: pre-wrap;">
                    ${update.content}
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${appUrl}/abaixo-assinado/${update.petition_id}" style="background-color: #E63946; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        Ver Campanha
                    </a>
                </div>
                
                <p style="margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 15px; text-align: center;">
                  Você está recebendo este email porque assinou e optou por receber atualizações desta campanha.
                </p>
            </div>
        `

        // Fetch Signers who allowed notifications
        const { data: signers, error: signersError } = await supabaseAdmin
            .from('signatures')
            .select('email, user_id')
            .eq('petition_id', update.petition_id)
            .eq('allow_notifications', true)

        if (signers) {
            signers.forEach(s => {
                if (s.email && s.email.includes('@')) recipients.add(s.email)
                if (s.user_id) userIdsToFetch.add(s.user_id)
            })
        }

    } else {
        // --- NEWS LOGIC ---
        // 1. Fetch News Data
        const { data: news, error: newsError } = await supabaseAdmin
          .from('news')
          .select('*')
          .eq('id', newsId)
          .single()

        if (newsError || !news) throw new Error('News not found')
        
        emailSubject = `Novidade: ${news.title}`
        emailHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h1 style="color: #E63946; margin-bottom: 10px;">${news.title}</h1>
                <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
                  Publicado em ${new Date(news.date).toLocaleDateString('pt-BR')} • Fonte: ${news.source || 'Trombone Cidadão'}
                </p>
                
                ${news.image_url ? `<img src="${news.image_url}" alt="${news.title}" style="width: 100%; border-radius: 8px; margin-bottom: 20px; object-fit: cover; max-height: 300px;" />` : ''}
                
                <div style="line-height: 1.6; margin-bottom: 25px;">
                  ${news.description || ''}
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${appUrl}/noticias/${news.id}" style="background-color: #E63946; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        Ler Matéria Completa
                    </a>
                </div>
                
                <p style="margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 15px; text-align: center;">
                  Você está recebendo este email porque optou por receber novidades do Trombone Cidadão.
                  <br/>
                  <a href="${appUrl}/configuracoes" style="color: #666; text-decoration: underline;">Gerenciar notificações</a>
                </p>
              </div>
        `

        // 2a. Guest Users (from signatures - assuming petitions/global interest)
        // Note: If relatedReportId is present, we might want to LIMIT to that report's guests if reports supported guests?
        // Currently reports don't seem to support guest signatures easily, but petitions do.
        // We will keep the global "allow_notifications" guests for now as "Newsletter Subscribers".
        
        const { data: guests, error: guestsError } = await supabaseAdmin
          .from('signatures')
          .select('email')
          .eq('allow_notifications', true)
          .not('email', 'is', null)
        
        if (!guestsError && guests) {
          guests.forEach(g => {
              if (g.email && g.email.includes('@')) recipients.add(g.email)
          })
        }

        // 2b. Registered Users (Global Newsletter)
        const { data: prefs, error: prefsError } = await supabaseAdmin
            .from('user_preferences')
            .select('user_id')
            .eq('notifications_enabled', true)
        
        if (!prefsError && prefs) {
            prefs.forEach(p => userIdsToFetch.add(p.user_id))
        }

        // 2c. Report Stakeholders (if relatedReportId is provided)
        if (relatedReportId) {
            console.log(`Fetching stakeholders for report ${relatedReportId}`)
            
            // Fetch Report Author
            const { data: report, error: reportError } = await supabaseAdmin
                .from('reports')
                .select('author_id')
                .eq('id', relatedReportId)
                .single()
            
            if (report && report.author_id) {
                userIdsToFetch.add(report.author_id)
            }

            // Fetch Upvoters (Signatures on Report)
            const { data: upvoters, error: upvotersError } = await supabaseAdmin
                .from('signatures')
                .select('user_id')
                .eq('report_id', relatedReportId)
                .not('user_id', 'is', null)

            if (upvoters) {
                upvoters.forEach(u => userIdsToFetch.add(u.user_id))
            }

            // Fetch Commenters
            const { data: commenters, error: commentsError } = await supabaseAdmin
                .from('comments')
                .select('author_id')
                .eq('report_id', relatedReportId)
                .not('author_id', 'is', null)

            if (commenters) {
                commenters.forEach(c => userIdsToFetch.add(c.author_id))
            }
        }
    }

    // Resolve User IDs to Emails
    if (userIdsToFetch.size > 0) {
        let page = 1
        let done = false
        
        while (!done) {
            const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
                page: page,
                perPage: 1000
            })
            
            if (usersError || !users || users.length === 0) {
                done = true
                break
            }
            
            users.forEach(u => {
                if (userIdsToFetch.has(u.id) && u.email) {
                    recipients.add(u.email)
                }
            })
            
            if (users.length < 1000) done = true
            page++
        }
    }

    // 3. Send Emails in Batches
    let emailList = Array.from(recipients)
    
    // --- CONFIGURAÇÃO DE PRODUÇÃO VS TESTE ---
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <novidades@resend.dev>'
    const isTestingDomain = FROM_EMAIL.includes('resend.dev')
    const TEST_EMAIL = 'lairtondasilva07@gmail.com'

    if (isTestingDomain) {
        console.log(`Modo de Teste Resend Detectado (@resend.dev): Filtrando destinatários para evitar erro 403.`);
        // No modo de teste, só podemos enviar para o email verificado da conta
        emailList = emailList.filter(email => email === TEST_EMAIL);
        
        // Se a lista ficar vazia no modo teste, mas havia destinatários, forçamos o envio para o admin para validação
        if (emailList.length === 0 && recipients.size > 0) {
            emailList = [TEST_EMAIL];
        }
        
        console.log(`Lista de envio ajustada para modo teste: ${JSON.stringify(emailList)}`);
    }
    // ---------------------------------
    
    console.log(`Sending emails to ${emailList.length} recipients`)
    
    if (emailList.length === 0) {
          return new Response(
          JSON.stringify({ message: 'No recipients found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }
    const BATCH_SIZE = 50
    const batches = []
    for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
        batches.push(emailList.slice(i, i + BATCH_SIZE))
    }

    const results = []

    for (const batch of batches) {
        // Using bcc to hide recipients from each other
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: isTestingDomain ? [TEST_EMAIL] : [FROM_EMAIL], // Se em prod, envia para o próprio remetente e bcc para os outros
            bcc: batch,
            subject: emailSubject,
            html: emailHtml
        })
        results.push({ batchSize: batch.length, success: !error, error })
    }

    return new Response(
      JSON.stringify({ 
        message: `Emails processed for ${emailList.length} recipients`,
        batches: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
