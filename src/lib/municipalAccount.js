import { supabase } from '@/lib/customSupabaseClient';

export async function createMunicipalAccount(body) {
  const { data, error } = await supabase.functions.invoke('create-municipal-account', { body });
  if (error) {
    let response;
    try { response = await error.context?.json(); } catch { /* Resposta sem JSON. */ }
    if (response?.code === 'NOT_FOUND' || error.context?.status === 404) {
      throw new Error('A criação de acessos está indisponível no servidor. Entre em contato com a administração da plataforma.');
    }
    if (error.context?.status === 401) {
      throw new Error('Sua sessão expirou. Entre novamente para criar o acesso.');
    }
    if (typeof response?.error === 'string' && response.error) throw new Error(response.error);
    if (error.name === 'FunctionsFetchError') {
      throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.');
    }
    throw new Error('Não foi possível criar o acesso. Tente novamente ou entre em contato com a administração.');
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
