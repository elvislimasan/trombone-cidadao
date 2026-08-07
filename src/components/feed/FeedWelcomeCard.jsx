import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/design-system/icons';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, onInvite }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="mb-4 p-3">
      {/* Sem bloco institucional: so os atalhos. O texto de boas-vindas empurrava
          o feed para baixo, e o conteudo e que deve ser o protagonista.
          Bordas neutras iguais nos tres — vermelho/laranja/azul pareciam
          semaforo, e essas cores significam status de bronca no sistema. */}
      <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onCreateReport}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-4 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-11 h-11 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="trombone" size={22} />
            </div>
            <p className="mt-2.5 text-xs font-bold leading-tight text-content-primary">
              Cadastrar
              <br />
              sua bronca
            </p>
            <p className="mt-1 text-2xs leading-tight text-content-tertiary">
              É rápido e fácil
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-4 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-11 h-11 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="ambassador" size={22} />
            </div>
            <p className="mt-2.5 text-xs font-bold leading-tight text-content-primary">
              {user?.is_ambassador ? (
                <>
                  Painel do
                  <br />
                  Embaixador
                </>
              ) : (
                <>
                  Se torne
                  <br />
                  embaixador
                </>
              )}
            </p>
            <p className="mt-1 text-2xs leading-tight text-content-tertiary">
              Acompanhe ações
            </p>
          </button>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-4 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-11 h-11 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
              <Icon name="profile" size={22} />
            </div>
            <p className="mt-2.5 text-xs font-bold leading-tight text-content-primary">
              Convidar
              <br />
              alguém
            </p>
            <p className="mt-1 text-2xs leading-tight text-content-tertiary">
              Mais vozes,
              <br />
              mais mudanças
            </p>
          </button>
      </div>
    </div>
  );
};

export default FeedWelcomeCard;
