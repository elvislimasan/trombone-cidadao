import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { municipalCredentialsText } from '@/lib/municipalAccount';

export default function MunicipalCredentials({ credentials }) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  if (!credentials) return null;
  const copy = async (target) => {
    try {
      await navigator.clipboard.writeText(target === 'password'
        ? credentials.temporary_password
        : municipalCredentialsText(credentials, window.location.origin));
      setCopied(target); setError('');
    } catch { setError('Não foi possível copiar. Selecione os dados acima para compartilhá-los.'); }
  };
  return <div role="status" className="mt-4 space-y-2 rounded-xl border border-success-border bg-success-bg p-4 text-sm text-success-fg">
    <p className="font-bold">Acesso criado</p>
    <dl className="space-y-2 break-all"><div><dt className="font-semibold">E-mail</dt><dd>{credentials.email}</dd></div><div><dt className="font-semibold">Senha temporária</dt><dd className="select-all font-mono">{credentials.temporary_password}</dd></div></dl>
    <p className="text-xs">Entre em {window.location.origin}/login. O usuário completa o cadastro no primeiro acesso. A troca de senha será obrigatória em {new Date(credentials.password_expires_at).toLocaleString('pt-BR')}, 24 horas após a geração.</p>
    <p className="text-xs">Copie agora: a senha é exibida somente nesta criação.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => copy('password')}><Copy className="mr-2 h-3.5 w-3.5" />{copied === 'password' ? 'Senha copiada' : 'Copiar senha'}</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => copy('access')}><Copy className="mr-2 h-3.5 w-3.5" />{copied === 'access' ? 'Credenciais copiadas' : 'Copiar acesso'}</Button>
    </div>
    {error && <p role="alert" className="text-xs">{error}</p>}
  </div>;
}
