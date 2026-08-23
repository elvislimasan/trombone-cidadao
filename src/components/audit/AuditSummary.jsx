import { Check, Timer, Route as RouteIcon, Camera, Ban, Star } from 'lucide-react';
import Confetti from '@/components/patrol/Confetti';
import { PONTOS, avaliarPatrulha } from '@/lib/patrolGame';

// O fim de uma saída de conferência.
//
// POR QUE NÃO É O PatrolSummary
//
// Aquele resumo carrega a patrulha inteira: a fila de broncas por confirmar,
// nível, sequência, títulos de bairro, medalhas, ranking. Reaproveitá-lo aqui
// obrigaria a montar o `usePatrolGame` numa tela que não usa nada disso — e a
// mostrar "0/0 conferidas" para uma atividade onde confirmar bronca nem existe.
//
// Aqui as perguntas são duas: quantos pontos eu fechei, e de que jeito.

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

const Medida = ({ Icone, valor, rotulo, destaque }) => (
  <div className="flex-1 min-w-0 text-center">
    <Icone size={17} className={`mx-auto mb-1.5 ${destaque ? 'text-brand' : 'text-content-tertiary'}`} />
    <p className={`text-xl font-extrabold leading-none tabular-nums ${destaque ? 'text-brand' : 'text-content-primary'}`}>
      {valor}
    </p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mt-1">
      {rotulo}
    </p>
  </div>
);

export default function AuditSummary({
  duracaoS,
  distanciaM,
  registrados,
  vazios,
  salvando,
  onCompartilhar,
  onFechar,
}) {
  const total = (registrados || 0) + (vazios || 0);

  // A mesma regra que decide se a saída conta (avaliarPatrulha, espelhada na
  // migração 192). Sem ação e sem trajeto, não há o que comemorar — e festejar
  // aqui seria o app comemorar o que ele mesmo não vai somar.
  const veredito = avaliarPatrulha({
    duracaoS,
    distanciaM,
    contagens: { confirmadas: 0 },
    feitos: { broncas: registrados, sinais: vazios, missoes: 0 },
  });

  const pontos = (registrados || 0) * PONTOS.missao + (vazios || 0) * PONTOS.vistoria;

  return (
    <div className="fixed inset-0 z-[1004] flex flex-col justify-end bg-black/50">
      <div
        className="relative bg-surface-base rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200 px-5 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <Confetti ativo={!veredito.descartavel} />

        <div className="flex justify-center pb-3">
          <div className="w-10 h-1 rounded-full bg-edge-default" />
        </div>

        <div className="relative flex flex-col items-center mb-4">
          {!veredito.descartavel && (
            <span className="w-16 h-16 rounded-full bg-brand flex items-center justify-center shadow-lg mb-3">
              <Check size={32} className="text-content-onBrand" strokeWidth={3} />
            </span>
          )}
          <h2 className="text-2xl font-extrabold text-content-primary text-center leading-tight">
            {veredito.descartavel ? 'Saída encerrada' : 'Conferência concluída!'}
          </h2>
          <p className="text-sm text-content-secondary mt-1 text-center">
            {total === 0
              ? 'Nada respondido desta vez'
              : `${total} ${total === 1 ? 'problema conferido' : 'problemas conferidos'}`}
          </p>
        </div>

        <div className="flex items-start gap-2 py-3 rounded-2xl bg-surface-subtle">
          <Medida Icone={Timer} valor={formatarDuracao(duracaoS)} rotulo="Tempo" />
          <div className="w-px self-stretch bg-edge-subtle" />
          <Medida Icone={RouteIcon} valor={formatarDistancia(distanciaM)} rotulo="Percorrido" />
          <div className="w-px self-stretch bg-edge-subtle" />
          <Medida Icone={Camera} valor={registrados || 0} rotulo="Registrou" destaque />
          <div className="w-px self-stretch bg-edge-subtle" />
          <Medida Icone={Ban} valor={vazios || 0} rotulo="Vazios" />
        </div>

        {pontos > 0 && (
          <div className="flex items-center justify-center gap-2.5 mt-3 rounded-2xl bg-brand-subtleBg border border-edge-subtle px-4 py-3">
            <Star size={20} className="text-brand shrink-0 fill-current" />
            <div className="min-w-0">
              <p className="text-base font-extrabold text-brand leading-none tabular-nums">
                +{pontos} pontos
              </p>
              <p className="text-xs text-content-secondary mt-0.5">para o seu bairro</p>
            </div>
          </div>
        )}

        {veredito.descartavel && (
          <div className="mt-3 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3.5 py-3">
            <p className="text-xs text-content-secondary leading-snug">
              Sem nenhuma resposta, esta saída fica guardada no seu histórico mas
              não conta como conferência.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-4">
          <button
            type="button"
            disabled={salvando}
            onClick={onCompartilhar}
            className="w-full py-3.5 rounded-xl bg-brand text-content-onBrand font-bold text-sm disabled:opacity-50 active:bg-brand-hover transition-colors"
          >
            Compartilhar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={onFechar}
            className="w-full py-3 rounded-xl text-content-secondary font-semibold text-sm active:bg-surface-subtleHover transition-colors disabled:opacity-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
