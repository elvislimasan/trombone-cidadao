import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { pipaRpc } from '@/lib/pipaApi';
import MunicipalDrawer from './MunicipalDrawer';

export default function PipaLoginDetails({ driver, onClose }) {
  const { user, resetPassword } = useAuth();
  const [loadedAccount, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false);
  const scope = `${user?.id}:${driver.id}:${driver.user_id}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const account = loadedAccount?.scope === scope ? loadedAccount : null;

  useEffect(() => {
    let active = true;
    activeScope.current = scope;
    setAccount(null); setError(''); setNotice(''); setLoading(true);
    setBusy(false); busyRef.current = false;
    if (!user?.id) { setLoading(false); setError('Entre novamente para consultar o login.'); return; }
    pipaRpc('pipa_driver_login_details', { p_driver: driver.id }).then(data => {
      if (!data || data.user_id !== driver.user_id) throw new Error('O vínculo de login mudou. Atualize a lista de pipeiros.');
      if (active) setAccount({ ...data, scope });
    }).catch(failure => { if (active) setError(failure.message || 'Não foi possível consultar o login.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (activeScope.current === scope) activeScope.current = null; };
  }, [scope, attempt]);

  const sendReset = async () => {
    if (!account?.email || busyRef.current || notice) return;
    const sentScope = scope;
    busyRef.current = true; setBusy(true); setError('');
    try {
      // Revalida a permissão e o vínculo imediatamente antes do envio.
      const current = await pipaRpc('pipa_driver_login_details', { p_driver: driver.id });
      if (activeScope.current !== sentScope) return;
      if (current?.user_id !== account.user_id || current?.email !== account.email) {
        setAccount(null); throw new Error('Os dados do login mudaram. Consulte novamente antes de redefinir a senha.');
      }
      const result = await resetPassword(current.email);
      if (result?.error) throw result.error;
      if (activeScope.current === sentScope) setNotice(`Redefinição solicitada para ${current.email}. Confira a caixa de entrada e o spam.`);
    } catch (failure) {
      if (activeScope.current === sentScope) setError(failure.status === 429 ? 'Aguarde alguns minutos antes de solicitar outra redefinição.' : failure.message || 'Não foi possível solicitar a redefinição. Tente novamente.');
    } finally {
      if (activeScope.current === sentScope) { busyRef.current = false; setBusy(false); }
    }
  };

  return <MunicipalDrawer open onClose={onClose} busy={busy} title="Dados do login" description={driver.name} placement="center"
    footer={<div className="pipa-actions justify-end"><Button variant="outline" onClick={onClose} disabled={busy}>Fechar</Button>
      {account && <Button onClick={sendReset} disabled={loading || busy || !account.email || Boolean(notice)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{notice ? 'Redefinição solicitada' : 'Redefinir senha'}</Button>}</div>}>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando login…</p> : account && <>
      <dl className="grid min-w-0 gap-4 text-sm">
        {[['Nome da conta', account.name], ['E-mail de login', account.email], ['Telefone', account.phone]].map(([label, value]) => <div key={label}><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words font-semibold">{value || 'Não informado'}</dd></div>)}
      </dl>
      <p className="pipa-note mt-4">{account.email ? `A recuperação será enviada para ${account.email}. A senha atual só muda quando o pipeiro confirmar a nova senha.` : 'Esta conta não possui e-mail cadastrado para redefinição de senha.'}</p>
    </>}
    {notice && account && <p role="status" className="pipa-success mt-4">{notice}</p>}
    {error && <div role="alert" className="mt-4 space-y-2"><p className="pipa-error">{error}</p>{!account && !loading && <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button>}</div>}
  </MunicipalDrawer>;
}
