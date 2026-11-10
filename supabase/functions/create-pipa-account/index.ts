import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Criação de acessos não configurada.' }, 503);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Entre novamente.' }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  let createdUserId: string | null = null;
  try {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ error: 'Sua sessão expirou.' }, 401);
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Informe um e-mail válido.' }, 400);
    if (typeof body.driver_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.driver_id)) return json({ error: 'Pipeiro inválido.' }, 400);
    const { error: denied } = await client.rpc('pipa_validate_driver_account', { p_driver: body.driver_id });
    if (denied) return json({ error: denied.message }, 403);
    const password = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join('') + 'aA1!';
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { pipa_driver: true, pipa_created_by: auth.user.id, municipal_provisioned: true },
      user_metadata: { contexto_cadastro: 'pipeiro' } });
    if (error || !created.user) return json({ error: error?.status === 422 ? 'Este e-mail já possui conta. Utilize outro e-mail para o acesso do pipeiro.' : 'Não foi possível criar a conta.' }, 400);
    createdUserId = created.user.id;
    const { error: linkError } = await client.rpc('pipa_link_driver_account', { p_driver: body.driver_id, p_user: createdUserId });
    if (linkError) {
      await admin.auth.admin.deleteUser(createdUserId);
      createdUserId = null;
      return json({ error: linkError.message }, 400);
    }
    createdUserId = null;
    return json({ email, temporary_password: password, login_path: '/operacao-pipa/pipeiro', password_expires_at: new Date(Date.now() + 86400000).toISOString() });
  } catch {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    return json({ error: 'Não foi possível criar o acesso.' }, 500);
  }
});
