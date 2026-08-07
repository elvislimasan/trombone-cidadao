import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, UserPlus, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, onInvite }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="mb-4 p-3">
      <div className="rounded-2xl border border-red-100 bg-[#FEF2F2] px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-primary uppercase">
                Bem-vindo
              </p>
            </div>
            <p className="mt-1 text-base font-extrabold tracking-tight text-foreground">
              Ajude a melhorar a cidade
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cadastre broncas, seja embaixador e convide alguém para contribuir.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onCreateReport}
            className="rounded-2xl border-2 border-primary/30 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-primary/50 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              Cadastre sua bronca
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')}
            className="rounded-2xl border-2 border-orange-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-orange-300 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              {user?.is_ambassador ? 'Painel do Embaixador' : 'Se torne embaixador'}
            </p>
          </button>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-2xl border-2 border-blue-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-blue-300 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
              Convide alguém
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedWelcomeCard;
