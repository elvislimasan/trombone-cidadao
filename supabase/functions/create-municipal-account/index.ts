import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Criação de acessos ainda não configurada.' }, 503);
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
    if (body.kind === 'administrator' && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 160)) return json({ error: 'Informe o nome da prefeitura.' }, 400);
    const args = { p_kind: body.kind, p_city: body.city_id ?? null, p_prefeitura: body.prefeitura_id ?? null, p_channel: body.channel_id ?? null, p_roles: body.roles ?? [] };
    const { error: permissionError } = await client.rpc('validate_municipal_provisioning', args);
    if (permissionError) return json({ error: permissionError.message }, 403);
    // 144 bits de aleatoriedade, sem enviar e-mail de convite.
    const password = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join('') + 'aA1!';
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { municipal_provisioned: true, municipal_created_by: auth.user.id },
      user_metadata: { contexto_cadastro: 'prefeitura' },
    });
    if (createError || !created.user) return json({ error: createError?.code === 'email_exists' || createError?.status === 422 ? 'Este e-mail já possui uma conta. Use a opção de vincular conta existente; a senha atual foi preservada.' : 'Não foi possível criar o acesso. Verifique o e-mail e tente novamente.' }, 400);
    createdUserId = created.user.id;
    const { data, error: provisionError } = await client.rpc('provision_municipal_account', { ...args, p_user: created.user.id, p_name: body.name ?? null });
    if (provisionError) {
      await admin.auth.admin.deleteUser(created.user.id);
      createdUserId = null;
      return json({ error: provisionError.message }, 400);
    }
    createdUserId = null;
    return json({ ...data, email, temporary_password: password });
  } catch {
    if (createdUserId) {
      try { await admin.auth.admin.deleteUser(createdUserId); } catch { /* Mantém o erro sem expor credenciais. */ }
    }
    return json({ error: 'Não foi possível criar o acesso. Confira os dados e tente novamente.' }, 500);
  }
});
