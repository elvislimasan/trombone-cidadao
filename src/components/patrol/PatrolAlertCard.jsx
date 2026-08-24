import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, X } from 'lucide-react';
import { categoryEmoji } from '@/design-system/icons';

// Card do alerta de proximidade.
//
// Dois botões, ocupando meia tela cada, com 88px de altura: é o alvo de toque
// que se acerta sem olhar. A barra de progresso mostra o tempo restante — sem
// ela, o card sumindo sozinho parece falha do app.
//
// Nada aqui aciona rede: `onResponder` devolve o tipo ao pai, que envia em
// segundo plano e fecha o card na hora. Esperar a resposta do servidor com o
// carro andando é tempo de olho na tela.

export default function PatrolAlertCard({ alerta, duracaoMs, onResponder, onAdiar, bloqueados }) {
  const [progresso, setProgresso] = useState(100);

  useEffect(() => {
    setProgresso(100);
    const inicio = Date.now();
    const id = setInterval(() => {
      const restante = Math.max(0, 1 - (Date.now() - inicio) / duracaoMs);
      setProgresso(restante * 100);
    }, 100);
    return () => clearInterval(id);
  }, [alerta.bronca.id, duracaoMs]);

  const { bronca, distancia } = alerta;
  // Quantas broncas este card responde de uma vez.
  const quantas = alerta.broncas?.length ?? 1;
  const emoji = categoryEmoji(bronca.category);

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1003] pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
      <div className="m-3 rounded-3xl bg-surface-overlay border border-edge-default shadow-2xl overflow-hidden pointer-events-auto animate-in slide-in-from-bottom duration-200">

        <div className="h-1 bg-surface-subtle">
          <div
            className="h-full bg-brand transition-[width] duration-100 ease-linear"
            style={{ width: `${progresso}%` }}
          />
        </div>

        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <span className="text-3xl leading-none shrink-0" aria-hidden="true">{emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-extrabold text-content-primary leading-tight">
              {quantas > 1
                ? `${quantas} ${bronca.categoryName.toLowerCase()} aqui`
                : `${bronca.categoryName} a ${distancia} m`}
            </p>
            <p className="text-sm text-content-secondary truncate mt-0.5">
              {quantas > 1 ? `A menos de ${distancia} m de você` : bronca.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onAdiar}
            aria-label="Responder depois"
            className="shrink-0 w-11 h-11 -mt-1 -mr-1 inline-flex items-center justify-center rounded-full text-content-tertiary hover:bg-surface-subtle transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Com grupo, a pergunta muda de número E o card diz quantas serão
            respondidas de uma vez. Confirmar três broncas com um toque sem
            avisar seria colocar na conta da pessoa uma afirmação que ela não
            fez. */}
        <p className="px-4 pb-3 text-sm font-semibold text-content-secondary">
          {quantas > 1
            ? `Os problemas continuam aí? Sua resposta vale para as ${quantas}.`
            : 'O problema continua aí?'}
        </p>

        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <BotaoResposta
            tipo="still_here"
            Icon={AlertCircle}
            rotulo="AINDA ESTÁ"
            classe="bg-danger text-white"
            bloqueado={bloqueados?.still_here}
            onClick={onResponder}
          />
          <BotaoResposta
            tipo="solved"
            Icon={CheckCircle}
            rotulo="RESOLVIDO"
            classe="bg-success-fg text-white"
            bloqueado={bloqueados?.solved}
            onClick={onResponder}
          />
        </div>

        <button
          type="button"
          disabled={Boolean(bloqueados?.being_solved)}
          onClick={() => onResponder('being_solved')}
          className="w-full flex items-center justify-center gap-2 border-t border-edge-subtle py-3 text-sm font-semibold text-content-secondary disabled:opacity-40 active:bg-surface-subtle transition-colors"
        >
          <Clock size={16} />
          Está sendo resolvido
        </button>
      </div>
    </div>
  );
}

// Botão bloqueado pelo limite semanal continua visível, só que inerte: sumir
// mudaria a posição do outro botão entre um alerta e o seguinte, e a memória
// muscular de quem dirige é o que torna a resposta rápida.
const BotaoResposta = ({ tipo, Icon, rotulo, classe, bloqueado, onClick }) => (
  <button
    type="button"
    disabled={Boolean(bloqueado)}
    onClick={() => onClick(tipo)}
    className={`h-[88px] rounded-2xl flex flex-col items-center justify-center gap-1.5 font-extrabold text-base shadow-lg active:scale-[0.97] transition-transform disabled:opacity-35 disabled:active:scale-100 ${classe}`}
  >
    <Icon size={26} />
    {rotulo}
    {bloqueado && <span className="text-[10px] font-semibold opacity-90">já enviado</span>}
  </button>
);
