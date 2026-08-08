import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/design-system/icons';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, onInvite }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="mb-3 px-3 pt-2">
      {/* Sem bloco institucional: so os atalhos. O texto de boas-vindas empurrava
          o feed para baixo, e o conteudo e que deve ser o protagonista.
          Sem subtitulos: o rotulo ja diz o que o botao faz, e a linha extra
          so alongava o card. Bordas neutras iguais nos tres — vermelho/laranja/
          azul pareciam semaforo, e essas cores significam status de bronca. */}
      <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onCreateReport}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2 py-3 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-10 h-10 rounded-xl bg-brand-subtleBg text-brand-subtleFg ring-1 ring-edge-subtle flex items-center justify-center">
              <Icon name="trombone" size={20} />
            </div>
            <p className="mt-2 text-xs font-bold leading-tight text-content-primary">
              Cadastrar
              <br />
              sua bronca
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2 py-3 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-10 h-10 rounded-xl bg-brand-subtleBg text-brand-subtleFg ring-1 ring-edge-subtle flex items-center justify-center">
              <Icon name="ambassador" size={20} />
            </div>
            <p className="mt-2 text-xs font-bold leading-tight text-content-primary">
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
          </button>

          <button
            type="button"
            onClick={onInvite}
            className="rounded-2xl border border-edge-subtle bg-surface-raised px-2 py-3 text-center shadow-elevation-1 hover:bg-surface-subtle transition-colors"
          >
            <div className="mx-auto w-10 h-10 rounded-xl bg-brand-subtleBg text-brand-subtleFg ring-1 ring-edge-subtle flex items-center justify-center">
              <Icon name="profile" size={20} />
            </div>
            <p className="mt-2 text-xs font-bold leading-tight text-content-primary">
              Convidar
              <br />
              alguém
            </p>
          </button>
      </div>
    </div>
  );
};

export default FeedWelcomeCard;
