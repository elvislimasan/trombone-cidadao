import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { verifyReportMediaAccess } from "../_shared/reportMediaAccess.js";

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mimeTypes = { photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], video: ['video/mp4', 'video/quicktime', 'video/webm'] };
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  try {
    const { action, reportId, recoveryToken, media } = await req.json();
    if (!uuid.test(reportId || '') || !uuid.test(media?.id || '') || !['prepare', 'complete'].includes(action)
      || !['photo', 'video'].includes(media?.type) || !mimeTypes[media.type as 'photo' | 'video'].includes(media?.contentType)) {
      return json({ error: 'Dados do anexo inválidos.' }, 400);
    }
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false } });
    const { data: report, error } = await db.from('reports').select('id,author_id,is_anonymous,moderation_status,city_id,is_public').eq('id', reportId).maybeSingle();
    if (error) throw error;
    if (!report || report.moderation_status === 'rejected') return json({ error: 'Bronca indisponível.' }, 404);
    let allowed = false;
    if (!report.author_id && report.is_anonymous && recoveryToken) {
      allowed = await verifyReportMediaAccess(reportId, recoveryToken, secret);
    } else {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: auth } = await db.auth.getUser(jwt);
      const userId = auth?.user?.id;
      if (userId) {
        allowed = userId === report.author_id;
        if (!allowed && media.type === 'photo') {
          const [{ data: profile }, { data: ambassador }] = await Promise.all([
            db.from('profiles').select('is_admin,is_master').eq('id', userId).maybeSingle(),
            db.rpc('is_ambassador_of', { p_user: userId, p_city_id: report.city_id }),
          ]);
          allowed = profile?.is_admin === true || profile?.is_master === true || (report.is_public === true && ambassador === true);
        }
      }
    }
    if (!allowed) return json({ error: 'Você não tem permissão para anexar arquivos a esta bronca.' }, 403);

    const { data: existing, error: existingError } = await db.from('report_media').select('id,report_id').eq('id', media.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing.report_id === reportId ? json({ completed: true }) : json({ error: 'Anexo inválido.' }, 403);
    const folder = `${report.author_id || 'anonymous'}/${reportId}`;
    const filename = `${media.id}.${extensions[media.contentType]}`;
    const filePath = `${folder}/${filename}`;
    const bucket = db.storage.from('reports-media');
    const { data: files, error: listError } = await bucket.list(folder, { search: filename, limit: 100 });
    if (listError) throw listError;
    const stored = files?.find(file => file.name === filename && Number(file.metadata?.size) > 0);
    if (action === 'prepare') {
      if (stored) return json({ uploaded: true, filePath });
      const { data: signed, error: signedError } = await bucket.createSignedUploadUrl(filePath);
      if (signedError) throw signedError;
      return json({ signedUrl: signed.signedUrl, filePath });
    }
    if (!stored) return json({ error: 'O arquivo ainda não chegou. Tente reenviar.' }, 409);
    if (!mimeTypes[media.type as 'photo' | 'video'].includes(stored.metadata?.mimetype)) return json({ error: 'Formato do arquivo inválido. Troque a imagem.' }, 400);
    const maxSize = media.type === 'photo' ? 100 * 1024 * 1024 : 1024 * 1024 * 1024;
    if (Number(stored.metadata.size) > maxSize) return json({ error: 'Arquivo muito grande. Escolha outro.' }, 400);
    const { data: { publicUrl } } = bucket.getPublicUrl(filePath);
    const { error: insertError } = await db.from('report_media').upsert({
      id: media.id, report_id: reportId, url: publicUrl, type: media.type,
      name: String(media.name || filename).slice(0, 255),
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    return json({ completed: true, publicUrl });
  } catch (error) {
    console.error('[report-media]', error);
    return json({ error: 'Não foi possível enviar o anexo. A bronca continua salva. Tente novamente.' }, 500);
  }
});
