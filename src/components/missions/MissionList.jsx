import { Lock, Check, ChevronRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

// As missões, agrupadas por trilha.
//
// CADA CARTÃO DIZ O PRÓXIMO PASSO, NÃO O ACUMULADO
//
// "Faltam 2" move alguém; "4 de 25" faz a pessoa calcular. A barra mede o
// degrau atual — quem está em 4 numa escada 3→5 fez metade DESTE degrau, e não
// 16% do caminho todo. Medindo sobre o total, a barra apareceria quase cheia e
// o passo seguinte pareceria um empurrão de nada.
//
// A ESCADA APARECE
//
// "Etapa 2 de 4" existe para a missão não parecer terminada quando o primeiro
// alvo cai. Sem isso, cumprir 3 e ver a meta virar 5 pareceria a meta ter
// mudado sozinha.

const Etapas = ({ etapa, etapas, completa }) => (
  <div className="flex items-center gap-1" aria-label={`Etapa ${etapa} de ${etapas}`}>
    {Array.from({ length: etapas }, (_, i) => (
      <span
        key={i}
        className={`h-1.5 rounded-full transition-colors ${
          completa || i < etapa - 1
            ? 'w-4 bg-status-progressFg'
            : i === etapa - 1
            ? 'w-4 bg-status-progressFg opacity-50'
            : 'w-1.5 bg-edge-default'
        }`}
      />
    ))}
  </div>
);

// O botão que leva a fazer.
//
// DOIS DESTINOS DIFERENTES DISFARÇADOS DE UM
//
// A maioria das missões aponta para outra tela (`/patrulhar/buracos`,
// `/mapa`). Mas "Saia em patrulha" aponta para `#patrulhas`, que é uma âncora
// DESTA MESMA tela — a lista de patrulhas por categoria, mais abaixo.
//
// Como <Link>, esse segundo caso não fazia nada: o React Router troca o hash da
// URL e pronto; rolar até a âncora é comportamento do navegador em navegação
// de documento, que aqui não acontece. O botão existia, era clicável, e a tela
// ficava parada — que foi exatamente o relato.
const BotaoDaMissao = ({ acao }) => {
  const classe =
    'mt-2.5 inline-flex items-center gap-1 rounded-lg bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand active:scale-[0.98] transition-transform';

  if (acao.para.startsWith('#')) {
    return (
      <button
        type="button"
        className={classe}
        onClick={() => {
          document
            .getElementById(acao.para.slice(1))
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        {acao.rotulo}
        <ChevronRight size={13} />
      </button>
    );
  }

  return (
    <Link to={acao.para} className={classe}>
      {acao.rotulo}
      <ChevronRight size={13} />
    </Link>
  );
};

const CartaoMissao = ({ missao }) => {
  if (missao.bloqueada) {
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-3.5 opacity-70">
        <span className="shrink-0 w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center">
          <Lock size={16} className="text-content-tertiary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-content-secondary leading-tight">
            {missao.titulo}
          </p>
          <p className="text-xs text-content-tertiary mt-0.5">
            Abre no nível {missao.nivelMinimo}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${
        missao.completa
          ? 'border-edge-subtle bg-brand-subtleBg'
          : 'border-edge-subtle bg-surface-raised shadow-elevation-1'
      }`}
    >
      <span className="shrink-0 w-10 h-10 rounded-xl bg-surface-subtle ring-1 ring-edge-subtle flex items-center justify-center text-xl">
        {missao.completa ? <Check size={18} className="text-brand" /> : missao.icone}
      </span>

      <div className="min-w-0 flex-1">
        {/* O SELO SÓ APARECE DEPOIS DOS DEGRAUS ESCRITOS.
            Dentro deles, "faltam 2" já diz o passo. Passado o último, sem o
            número da etapa a missão pareceria nunca sair do lugar — a meta
            dobra, e quem não vê o degrau lê como se a régua tivesse mudado. */}
        <p className="flex items-center gap-2 text-sm font-bold text-content-primary leading-tight">
          <span className="min-w-0 truncate">{missao.titulo}</span>
          {missao.alemDaEscada && (
            <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-content-tertiary">
              Etapa {missao.etapa}
            </span>
          )}
        </p>

        <p className="text-xs text-content-secondary mt-0.5 leading-snug">
          {missao.completa ? 'Todas as etapas concluídas' : missao.descricao}
        </p>

        {!missao.completa && (
          <>
            {/* A barra e o contador na MESMA linha, e o selo do que falta ao
                lado. Empilhados, os três diziam a mesma coisa em três alturas
                diferentes e a linha ficava com o dobro do tamanho. */}
            <div className="flex items-center gap-2.5 mt-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full bg-status-progressFg transition-[width] duration-500"
                  style={{ width: `${missao.progresso * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-bold text-brand tabular-nums">
                {missao.rotulo}
              </span>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  missao.faltam === 1
                    ? 'bg-success-bg text-success-fg'
                    : 'bg-surface-subtle text-content-tertiary'
                }`}
              >
                {missao.faltam === 1 ? 'Só falta 1' : `Faltam ${missao.faltam}`}
              </span>
            </div>

            {missao.acao && <BotaoDaMissao acao={missao.acao} />}
          </>
        )}

        {missao.completa && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <Etapas etapa={missao.etapas} etapas={missao.etapas} completa />
            {(missao.medalhas || []).map((q) => (
              <span
                key={q.id}
                title={q.conquistada ? `${q.nome} — conquistada` : q.nome}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                  q.conquistada ? 'text-content-secondary' : 'text-content-tertiary'
                }`}
              >
                <span className={q.conquistada ? '' : 'opacity-40'}>{q.emoji}</span>
                {q.nome}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* O PRÊMIO FICA NUMA COLUNA PRÓPRIA, À DIREITA.

          Antes ele vinha embaixo, na mesma coluna do texto — e como o texto é
          longo e o prêmio é curto, a linha crescia para acomodar uma faixa
          quase vazia. À direita ele ocupa a altura que já existe.

          O número é o total de fechar a etapa: o bônus dela mais o que as ações
          que faltam já pagam sozinhas. Sem ele, quem vê "faltam 2" não sabe se
          são 4 pontos ou 40. */}
      {!missao.completa && (
        <div className="shrink-0 flex flex-col items-end gap-1 pl-1 max-w-[42%]">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand tabular-nums">
            <Zap size={11} />
            +{missao.xpAteAEtapa} XP
          </span>

          {/* As medalhas que esta missão empurra. As já ganhas continuam aqui,
              apagadas: sumir faria o cartão prometer menos hoje do que prometia
              ontem, sem explicação. */}
          {(missao.medalhas || []).map((q) => (
            <span
              key={q.id}
              title={
                q.conquistada
                  ? `${q.nome} — já conquistada`
                  : `${q.nome} — falta chegar a ${q.alvo}`
              }
              className={`inline-flex items-center gap-1 text-[11px] font-semibold text-right ${
                q.conquistada
                  ? 'text-content-tertiary line-through decoration-content-tertiary'
                  : 'text-content-secondary'
              }`}
            >
              <span className={q.conquistada ? 'opacity-40' : ''}>{q.emoji}</span>
              <span className="truncate">{q.nome}</span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
};

export default function MissionList({ trilhas }) {
  return (
    <div className="flex flex-col gap-6">
      {trilhas.map((trilha) => (
        <section key={trilha.id}>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-content-tertiary mb-2.5">
            {trilha.nome}
          </h3>
          <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {trilha.missoes.map((missao) => (
              <CartaoMissao key={missao.id} missao={missao} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
