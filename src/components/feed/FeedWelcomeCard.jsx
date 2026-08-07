import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/design-system/icons';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, onInvite }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="mb-4 p-3">
      <div className="rounded-2xl border border-brand/20 bg-brand-subtleBg px-4 py-4 shadow-elevation-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand" />
              <p className="text-2xs font-extrabold tracking-[0.18em] text-brand uppercase">
                Bem-vindo
              </p>
            </div>
            <p className="mt-1 text-base font-extrabold tracking-tight text-content-primary">
              Ajude a melhorar a cidade
            </p>
            <p className="mt-0.5 text-xs text-content-secondary">
              Cadastre broncas, seja embaixador e convide alguém para contribuir.
            </p>
          </div>
        </div>

        {/* Borda unica e neutra nos tres atalhos. Vermelho/laranja/azul lado a lado
            pareciam semaforo — e essas cores significam status de bronca no
            sistema, entao usa-las como decoracao aqui confundiria. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onCreateReport}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-3 text-center shadow-elevation-1 hover:border-brand/40 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="trombone" size={20} />
            </div>
            <p className="mt-2 text-2xs font-bold leading-snug text-content-primary">
              Cadastre sua bronca
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-3 text-center shadow-elevation-1 hover:border-brand/40 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="ambassador" size={20} />
            </div>
            <p className="mt-2 text-2xs font-bold leading-snug text-content-primary">
              {user?.is_ambassador ? 'Painel do Embaixador' : 'Se torne embaixador'}
            </p>
          </button>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-3 text-center shadow-elevation-1 hover:border-brand/40 transition-colors"
          >
            <div className="mx-auto w-9 h-9 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="profile" size={20} />
            </div>
            <p className="mt-2 text-2xs font-bold leading-snug text-content-primary">
              Convide alguém
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedWelcomeCard;
