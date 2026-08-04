import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

// Avisa o usuário logado que existe um convite de embaixador pendente para o
// e-mail dele, independente de como ele chegou ao login (redirect do link de
// convite, login direto pela tela normal, confirmação de e-mail em outro
// dispositivo). O sessionStorage do redirect pós-login não cobre esses casos.
const PendingInviteBanner = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [invite, setInvite] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id || user.is_ambassador) { setInvite(null); return; }
    supabase.rpc('get_my_pending_invite').then(({ data }) => {
      if (data && data.length > 0) setInvite(data[0]);
      else setInvite(null);
    });
  }, [user?.id, user?.is_ambassador]);

  if (!invite || dismissed) return null;
  if (location.pathname.startsWith('/convite/')) return null;

  const cityLabel = invite.city_uf ? `${invite.city_name} (${invite.city_uf})` : invite.city_name;

  return (
    <div className="bg-tc-red text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm relative">
      <ShieldCheck className="w-4 h-4 shrink-0" />
      <span className="text-center">
        Você tem um convite para ser embaixador de <strong>{cityLabel}</strong>.
      </span>
      <Link
        to={`/convite/${invite.token}`}
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 shrink-0"
      >
        Ver convite <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/15 rounded-full"
        aria-label="Fechar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default PendingInviteBanner;
