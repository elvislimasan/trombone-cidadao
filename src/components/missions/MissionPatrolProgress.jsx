import { Link } from 'react-router-dom';
import { Shield, ChevronRight } from 'lucide-react';

// A trilha de patrulha, reunida num bloco só.
//
// POR QUE ELA SAI DA LISTA GERAL
//
// As missões de patrulha têm uma diferença prática das outras: elas avançam
// TODAS AO MESMO TEMPO, numa saída só. Quem sai uma vez soma distância, soma
// uma patrulha e confirma broncas — três barras andando juntas.
//
// Espalhadas na lista, cada uma parece uma tarefa separada, e a pessoa lê como
// se precisasse de três idas. Juntas, com um botão só, elas dizem a verdade:
// é uma atividade que rende em três frentes.
//
// A LISTA GERAL CONTINUA TENDO ELAS
//
// Não é um recorte exclusivo — o filtro "Patrulha" mostra as mesmas. Aqui elas
// aparecem resumidas, com a barra e o número, porque este bloco existe para
// convencer a sair, não para explicar cada meta.

const Objetivo = ({ missao }) => (
  <div className="flex items-center gap-2.5 rounded-xl bg-surface-raised border border-edge-subtle px-3 py-2.5">
    <span className="shrink-0 text-base leading-none" aria-hidden="true">
      {missao.icone}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-bold text-content-primary leading-tight truncate">
        {missao.titulo}
      </p>
      <p className="text-[11px] text-content-tertiary tabular-nums mt-0.5">
        {missao.rotulo}
      </p>
      <span className="mt-1.5 block h-1 rounded-full bg-surface-sunken overflow-hidden">
        <span
          className="block h-full rounded-full bg-success-fg transition-[width] duration-500"
          style={{ width: `${Math.round((missao.completa ? 1 : missao.progresso) * 100)}%` }}
        />
      </span>
    </div>
  </div>
);

export default function MissionPatrolProgress({ missoes, para = '/patrulhar' }) {
  const ativas = (missoes || []).filter((m) => !m.bloqueada && !m.completa);
  if (ativas.length === 0) return null;

  const emAndamento = ativas.filter((m) => m.atual > 0).length;

  /**
   * O progresso geral da trilha: a média das etapas em curso.
   *
   * Média simples, e não soma de ações: as três metas contam coisas de escalas
   * diferentes — quilômetros, saídas, confirmações. Somá-las faria a distância
   * dominar o número e as outras duas sumirem dentro dele.
   */
  const geral = Math.round(
    (ativas.reduce((soma, m) => soma + (m.completa ? 1 : m.progresso), 0) / ativas.length) * 100
  );

  return (
    <section className="mt-6 rounded-2xl border border-edge-subtle bg-surface-subtle p-3.5">
      <div className="flex items-center gap-3 mb-3">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-surface-raised ring-1 ring-edge-subtle flex items-center justify-center">
          <Shield size={18} className="text-success-fg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-content-primary leading-tight">
            Patrulha em andamento
          </p>
          <p className="text-[11px] text-content-secondary mt-0.5">
            {ativas.length} {ativas.length === 1 ? 'objetivo ativo' : 'objetivos ativos'}
            {emAndamento > 0 && ` · ${emAndamento} já começou`}
          </p>
        </div>

        {/* Leva à escolha da categoria, que é o passo seguinte real: não existe
            "patrulha" sem dizer o que se vai procurar. */}
        <Link
          to={para}
          className="shrink-0 h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-surface-raised border border-edge-default text-xs font-bold text-success-fg active:scale-[0.98] transition-transform"
        >
          Continuar patrulha
          <ChevronRight size={13} />
        </Link>
      </div>

      {/* O número que resume as três. Sem ele, quem olha o bloco tem que ler
          três barras e fazer a média de cabeça para saber se está perto. */}
      <div className="flex items-center gap-3 mb-3 rounded-xl bg-surface-raised border border-edge-subtle px-3.5 py-2.5">
        <span className="shrink-0 text-lg font-extrabold text-success-fg tabular-nums leading-none">
          {geral}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-content-secondary mb-1.5">
            Progresso geral
          </p>
          <span className="block h-1.5 rounded-full bg-surface-sunken overflow-hidden">
            <span
              className="block h-full rounded-full bg-success-fg transition-[width] duration-700"
              style={{ width: `${geral}%` }}
            />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ativas.slice(0, 3).map((m) => (
          <Objetivo key={m.id} missao={m} />
        ))}
      </div>
    </section>
  );
}
