import { ArrowLeft, Flag, Trash2, Loader2 } from 'lucide-react';
import { avaliarPatrulha } from '@/lib/patrolGame';

// A pergunta de saída: continuar, encerrar ou descartar.
//
// POR QUE ELA EXISTE SEPARADA DO RESUMO
//
// O resumo era decisão e comemoração na mesma tela: nível, sequência, títulos,
// medalhas — e no fim quatro botões, três deles terminais. Quem tocou no X sem
// querer tinha que atravessar a festa inteira para achar como voltar, e as
// opções competiam com os números pela atenção.
//
// Agora são dois momentos. Aqui só se decide, com o mínimo na tela para a
// decisão ser tomada: quanto tempo, quanto percorreu, o que rendeu. A
// comemoração vem depois de encerrar, quando já não há nada a escolher.
//
// CONTINUAR VEM PRIMEIRO
//
// Esta folha abre pelo X do painel e pelo voltar do aparelho — os dois fáceis
// de tocar sem querer, um deles com o celular no suporte e o carro andando.

const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros || 0));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
};

const Medida = ({ valor, rotulo }) => (
  <div className="flex-1 text-center">
    <p className="text-lg font-extrabold text-content-primary leading-none tabular-nums">
      {valor}
    </p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mt-1">
      {rotulo}
    </p>
  </div>
);

export default function PatrolExitSheet({
  contagens,
  duracaoS,
  distanciaM,
  feitosNaSessao,
  salvando,
  onContinuar,
  onEncerrar,
  onDescartar,
}) {
  const veredito = avaliarPatrulha({
    duracaoS,
    distanciaM,
    contagens,
    feitos: feitosNaSessao,
  });

  const acoes =
    (contagens?.confirmadas || 0) +
    (feitosNaSessao?.sinais || 0) +
    (feitosNaSessao?.missoes || 0) +
    (feitosNaSessao?.broncas || 0);

  return (
    <div
      className="fixed inset-0 z-[1004] flex flex-col justify-end bg-black/50"
      onClick={() => !salvando && onContinuar()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-base rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200 px-4 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="flex justify-center pb-3">
          <div className="w-10 h-1 rounded-full bg-edge-default" />
        </div>

        <h2 className="text-xl font-extrabold text-content-primary text-center">
          Encerrar a patrulha?
        </h2>

        <div className="flex items-stretch gap-2 mt-4 mb-1 py-3 rounded-2xl bg-surface-subtle">
          <Medida valor={formatarDuracao(duracaoS)} rotulo="Tempo" />
          <div className="w-px self-stretch bg-edge-subtle" />
          <Medida valor={formatarDistancia(distanciaM)} rotulo="Percorrido" />
          <div className="w-px self-stretch bg-edge-subtle" />
          <Medida valor={acoes} rotulo={acoes === 1 ? 'Ação' : 'Ações'} />
        </div>

        {/* Aviso só quando há o que avisar. Numa patrulha que rendeu, esta
            faixa seria uma linha a mais entre a pessoa e o botão. */}
        {veredito.descartavel && (
          <div className="mt-3 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3.5 py-3">
            <p className="text-sm font-bold text-status-pendingFg leading-snug">
              {veredito.motivo === 'curta'
                ? 'Essa saída foi muito curta'
                : 'Você quase não saiu do lugar'}
            </p>
            <p className="text-xs text-content-secondary mt-1 leading-snug">
              Sem nenhuma ação, ela não conta como patrulha nem rende pontos.
              Você pode guardá-la assim mesmo, se quiser.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-4">
          <button
            type="button"
            disabled={salvando}
            onClick={onContinuar}
            className="w-full py-3.5 rounded-xl bg-surface-subtle text-content-primary font-bold text-sm flex items-center justify-center gap-2 active:bg-surface-subtleHover disabled:opacity-50 transition-colors"
          >
            <ArrowLeft size={16} />
            Continuar patrulhando
          </button>

          {/* Encerrar salva na hora. O resumo que vem depois é para ver e
              compartilhar — não há mais nada a decidir lá. */}
          <button
            type="button"
            disabled={salvando}
            onClick={onEncerrar}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
              veredito.descartavel
                ? 'bg-surface-subtle text-content-primary active:bg-surface-subtleHover'
                : 'bg-brand text-content-onBrand active:bg-brand-hover'
            }`}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
            Encerrar e salvar
          </button>

          <button
            type="button"
            disabled={salvando}
            onClick={onDescartar}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
              veredito.descartavel
                ? 'bg-danger text-white active:brightness-110'
                : 'text-content-tertiary active:bg-surface-subtleHover'
            }`}
          >
            <Trash2 size={15} />
            Descartar esta saída
          </button>
        </div>

        {/* O que o descarte NÃO leva junto. Sem esta linha, quem registrou uma
            bronca no caminho hesita em descartar o trajeto com medo de perdê-la. */}
        <p className="text-[11px] text-content-tertiary text-center mt-3 leading-snug">
          Descartar apaga só a medida do trajeto. Broncas, sinais e confirmações
          já foram enviados e continuam valendo.
        </p>
      </div>
    </div>
  );
}
