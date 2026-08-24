import React from 'react';
import { LocateFixed } from 'lucide-react';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';

/**
 * Barreira da aba "Perto de mim" quando ainda nao temos a posicao do usuario.
 *
 * Negado e indisponivel dao mensagens diferentes: negado so o usuario reverte,
 * nas configuracoes do sistema — repetir getCurrentPosition ali nao abre o
 * prompt de novo e daria a impressao de que o botao esta quebrado.
 */
const FeedLocationGate = ({ status, onRequest }) => {
  if (status === 'prompting') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <TromboneSpinner size={28} className="text-content-secondary" />
        <p className="text-sm text-content-secondary">Procurando sua localização…</p>
      </div>
    );
  }

  const denied = status === 'denied';

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-subtleBg text-brand-subtleFg ring-1 ring-edge-subtle flex items-center justify-center">
        <LocateFixed size={26} />
      </div>

      <h2 className="text-base font-bold text-content-primary">
        {denied ? 'Localização bloqueada' : 'Ative a localização'}
      </h2>

      <p className="max-w-xs text-sm text-content-secondary">
        {denied
          ? 'Você negou o acesso à localização. Libere nas configurações do sistema para ver as broncas mais próximas.'
          : 'Precisamos saber onde você está para mostrar as broncas mais próximas de você.'}
      </p>

      {!denied && (
        <button
          type="button"
          onClick={onRequest}
          className="mt-1 flex items-center gap-2 rounded-xl bg-cta-bg border border-cta-border h-11 px-5 text-sm font-semibold text-cta-fg shadow-elevation-1 hover:brightness-110 active:scale-95 transition-all"
        >
          <LocateFixed size={16} />
          Usar minha localização
        </button>
      )}
    </div>
  );
};

export default FeedLocationGate;
