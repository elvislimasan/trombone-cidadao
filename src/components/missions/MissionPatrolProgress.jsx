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
// A LISTA GERAL CONTINUA TENDO ELAS, E POR ISSO AQUI NÃO SE REPETE NENHUMA
//
// Não é um recorte exclusivo — o filtro "Patrulha", logo acima, mostra as
// mesmas com título, meta e recompensa. Este bloco chegou a desenhar as três
// de novo, em cartões próprios, o que contrariava a própria razão dele: ele
// existe para convencer a SAIR, não para explicar cada meta.
//
// O que sobrou é o que só ele sabe dizer: quantas correm juntas, o quanto
// andaram no conjunto, e o caminho para a rua. Três frases e um botão.

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
    <section className="rounded-2xl border border-edge-subtle bg-surface-subtle p-3.5">
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
      <div className="flex items-center gap-3 rounded-xl bg-surface-raised border border-edge-subtle px-3.5 py-2.5">
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

    </section>
  );
}
