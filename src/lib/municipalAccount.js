import { supabase } from '@/lib/customSupabaseClient';

export async function createMunicipalAccount(body) {
  const { data, error } = await supabase.functions.invoke('create-municipal-account', { body });
  if (error) {
    let message;
    try { message = (await error.context?.json())?.error; } catch { /* Resposta sem JSON. */ }
    throw new Error(message || 'Não foi possível criar o acesso. Verifique a configuração do servidor e tente novamente.');
  }
  if (!data?.temporary_password || !data.email) throw new Error(data?.error || 'O servidor não retornou as credenciais.');
  return data;
}

export function municipalSetupStep(status) {
  if (status?.profile_required) return 'profile';
  if (status?.password_required) return 'password';
  return null;
}

export function municipalCredentialsText(credentials, origin) {
  return `Acesso: ${origin}/login\nE-mail: ${credentials.email}\nSenha temporária: ${credentials.temporary_password}\nTroca obrigatória a partir de: ${new Date(credentials.password_expires_at).toLocaleString('pt-BR')}\nComplete seu cadastro no primeiro acesso.`;
}
