import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('SENDER_API_KEY')
    if (!apiKey) {
      throw new Error('SENDER_API_KEY is not set in environment variables')
    }

    const { newsId, relatedReportId, petitionUpdateId } = await req.json()
    if (!newsId && !petitionUpdateId) throw new Error('newsId or petitionUpdateId is required')

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
        
        const BRAND_PRIMARY = '#E63946'
        const BRAND_TEXT = '#111827'
        const BRAND_MUTED = '#6B7280'
        const CARD_BG = '#ffffff'
        const CARD_BORDER = '#e5e7eb'
        const MUTED_BG = '#F9FAFB'

        const bannerHtml = petitionImage
          ? `<img src="${petitionImage}" alt="${update.title}" style="width:100%; max-height:300px; object-fit:cover; display:block; border-radius: 12px; margin-bottom: 16px;" />`
          : ''
        
        emailHtml = `
          <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
            <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
              ${bannerHtml}
              <h1 style="margin:0 0 8px 0; color:${BRAND_TEXT}; font-size:22px;">${update.title}</h1>
              <p style="margin:0 0 16px 0; color:${BRAND_MUTED}; font-size:14px;">
                Atualização sobre a campanha: <strong style="color:${BRAND_TEXT};">${petitionTitle}</strong>
              </p>
              
              <div style="line-height:1.6; margin-bottom: 20px; white-space: pre-wrap; color:${BRAND_TEXT};">
                ${update.content}
              </div>
              
              <div style="text-align:center; margin: 16px 0;">
                <a href="${appUrl}/abaixo-assinado/${update.petition_id}" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">
                  Ver Campanha
                </a>
              </div>
              
              <p style="margin-top:24px; font-size:12px; color:${BRAND_MUTED}; text-align:center;">
                Você está recebendo este email porque assinou e optou por receber atualizações desta campanha.
              </p>
            </div>
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
        const BRAND_PRIMARY = '#E63946'
        const BRAND_TEXT = '#111827'
        const BRAND_MUTED = '#6B7280'
        const CARD_BG = '#ffffff'
        const CARD_BORDER = '#e5e7eb'
        const MUTED_BG = '#F9FAFB'
        const bannerHtmlNews = news.image_url
          ? `<img src="${news.image_url}" alt="${news.title}" style="width:100%; max-height:300px; object-fit:cover; display:block; border-radius: 12px; margin-bottom: 16px;" />`
          : ''
        emailHtml = `
          <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
            <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
              ${bannerHtmlNews}
              <h1 style="margin:0 0 8px 0; color:${BRAND_TEXT}; font-size:22px;">${news.title}</h1>
              <p style="margin:0 0 16px 0; color:${BRAND_MUTED}; font-size:14px;">
                Publicado em ${new Date(news.date).toLocaleDateString('pt-BR')} • Fonte: ${news.source || 'Trombone Cidadão'}
              </p>
              
              <div style="line-height:1.6; margin-bottom: 20px; color:${BRAND_TEXT};">
                ${news.description || ''}
              </div>
              
              <div style="text-align:center; margin: 16px 0;">
                <a href="${appUrl}/noticias/${news.id}" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">
                  Ler Matéria Completa
                </a>
              </div>
              
              <p style="margin-top:24px; font-size:12px; color:${BRAND_MUTED}; text-align:center;">
                Você está recebendo este email porque optou por receber novidades do Trombone Cidadão. 
                <a href="${appUrl}/configuracoes" style="color:${BRAND_MUTED}; text-decoration: underline;">Gerenciar notificações</a>
              </p>
            </div>
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

    let emailList = Array.from(recipients)

    const fromEnv = Deno.env.get('SENDER_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <contato@exemplo.com>'
    let fromEmail = fromEnv
    let fromName = 'Trombone Cidadão'
    const fromMatch = fromEnv.match(/^(.*)<(.+@.+)>$/)
    if (fromMatch) {
      fromName = fromMatch[1].trim()
      fromEmail = fromMatch[2].trim()
    }

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
        let batchError: { message: string; status?: number } | null = null

        for (const recipient of batch) {
          const payload = {
            from: {
              email: fromEmail,
              name: fromName,
            },
            to: {
              email: recipient,
            },
            subject: emailSubject,
            html: emailHtml,
          }

          try {
            const response = await fetch('https://api.sender.net/v2/message/send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            })

            if (!response.ok) {
              const errorText = await response.text()
              if (!batchError) {
                batchError = { message: errorText || 'Sender API error', status: response.status }
              }
            }
          } catch (err) {
            const e = err as Error
            if (!batchError) {
              batchError = { message: e.message || 'Unknown error' }
            }
          }
        }

        results.push({ batchSize: batch.length, success: !batchError, error: batchError })
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
