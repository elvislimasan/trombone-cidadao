import { ShieldAlert, Volume2, Hand, ScanEye } from 'lucide-react';
import { PatrolTravelModeIcon } from './PatrolTravelModePicker';
import { getPatrolTravelMode } from '@/lib/patrolTravelMode';

// Aviso de segurança na entrada do modo.
//
// Não é burocracia: o modo existe para ser usado dentro de um carro, e tanto as
// lojas quanto o bom senso exigem deixar explícito que a resposta pode esperar
// o fim do trajeto. Mostrado uma vez e memorizado — repetir a cada uso vira
// ruído que o usuário aprende a tocar sem ler.

export default function PatrolDisclaimer({
  modoDeslocamento = 'driving',
  onAceitar,
  onCancelar,
}) {
  const modo = getPatrolTravelMode(modoDeslocamento);
  const dirigindo = modo.id === 'driving';

  return (
    <div className="fixed inset-0 z-[1005] flex items-end sm:items-center justify-center bg-black/60 p-3">
      <div className="w-full sm:max-w-md bg-surface-base rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-200">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="w-14 h-14 rounded-2xl bg-status-pendingBg flex items-center justify-center">
            <ShieldAlert size={28} className="text-status-pendingFg" />
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-subtleBg px-3 py-2 text-xs font-bold text-brand">
            <PatrolTravelModeIcon mode={modo.id} size={16} strokeWidth={2.5} />
            {modo.label}
          </span>
        </div>

        <h2 className="text-xl font-extrabold text-content-primary mb-2">
          Antes de começar
        </h2>
        <p className="text-sm text-content-secondary leading-relaxed mb-5">
          O modo patrulha acompanha seu deslocamento e avisa quando você se
          aproxima de uma bronca. Ele não calcula rotas.
        </p>

        <ul className="space-y-3 mb-6">
          {dirigindo ? (
            <Item Icon={Hand}>
              <strong className="text-content-primary">Não interaja dirigindo.</strong>{' '}
              Use um passageiro ou responda aos alertas somente quando estiver parado.
            </Item>
          ) : (
            <Item Icon={ScanEye}>
              <strong className="text-content-primary">Olhe primeiro para o caminho.</strong>{' '}
              Pare em um local seguro antes de fotografar ou responder.
            </Item>
          )}
          <Item Icon={Volume2}>
            Os avisos são falados — você pode manter os olhos ao redor.
          </Item>
        </ul>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAceitar}
            className="w-full py-3.5 rounded-xl bg-brand text-content-onBrand font-bold text-sm active:bg-brand-hover transition-colors"
          >
            Entendi, iniciar {modo.label.toLowerCase()}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="w-full py-3 rounded-xl text-content-secondary font-semibold text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const Item = ({ Icon, children }) => (
  <li className="flex items-start gap-3">
    <Icon size={18} className="text-brand shrink-0 mt-0.5" />
    <span className="text-sm text-content-secondary leading-relaxed">{children}</span>
  </li>
);
