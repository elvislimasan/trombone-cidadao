import { Link } from 'react-router-dom';
import { Check, Clock, ChevronRight } from 'lucide-react';

// As três de hoje.
//
// POR QUE FICA NO TOPO, ACIMA DAS TRILHAS
//
// A central respondia "o que dá para fazer" com um catálogo de vida inteira.
// Quem abre o app numa terça à noite não quer escolher entre doze missões
// permanentes — quer saber o que dá para fazer AGORA, e ir.
//
// Três cartões com meta pequena e um relógio correndo respondem isso; a lista
// completa continua logo abaixo, para quem quiser escolher.
//
// O RELÓGIO É O QUE TRANSFORMA A LISTA EM CONVITE
//
// Sem ele, "3 diárias" é mais uma lista de pendências — e lista de pendências
// se adia. "4h restantes" é a única parte do cartão que diz por que é hoje.
//
// Some quando as três fecham: quem terminou não precisa de pressão, precisa do
// reconhecimento. É o que a faixa de dia perfeito faz no lugar dele.

const Diaria = ({ d }) => {
  const conteudo = (
    <>
      <span
        aria-hidden="true"
        className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base ${
          d.completa ? 'bg-status-resolvedBg' : 'bg-surface-sunken'
        }`}
      >
        {d.completa ? (
          <Check size={16} className="text-status-resolvedFg" strokeWidth={3} />
        ) : (
          d.icone
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] font-bold leading-tight truncate ${
            d.completa
              ? 'text-content-tertiary line-through'
              : 'text-content-primary'
          }`}
        >
          {d.titulo}
        </span>

        {d.completa ? (
          <span className="block text-[11px] text-status-resolvedFg font-semibold mt-0.5">
            Concluída · +{d.xp} XP
          </span>
        ) : (
          <>
            <span className="block text-[11px] text-content-tertiary mt-0.5 truncate">
              {d.descricao}
            </span>
            <span className="flex items-center gap-2 mt-1.5">
              <span className="h-1.5 flex-1 rounded-full bg-surface-sunken overflow-hidden">
                <span
                  className="block h-full rounded-full bg-status-progressFg transition-[width] duration-500"
                  style={{ width: `${Math.round(d.progresso * 100)}%` }}
                />
              </span>
              <span className="text-[10px] font-bold text-content-secondary tabular-nums shrink-0">
                {d.rotulo}
              </span>
            </span>
          </>
        )}
      </span>

      {!d.completa && (
        <ChevronRight size={16} className="shrink-0 text-content-tertiary" />
      )}
    </>
  );

  // Concluída não é link: não há para onde mandar quem já terminou, e um
  // cartão riscado que ainda navega parece que não registrou o fim.
  return d.completa ? (
    <li className="flex items-center gap-3 px-4 py-2.5">{conteudo}</li>
  ) : (
    <li>
      <Link
        to={d.acao.para}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-subtleHover transition-colors"
      >
        {conteudo}
      </Link>
    </li>
  );
};

export default function DailyCard({ diarias, resumo, tempoRestante }) {
  if (!diarias?.length) return null;

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold text-content-primary leading-tight">
            Missões de hoje
          </p>
          <p className="text-xs font-bold text-content-secondary mt-0.5 tabular-nums">
            {resumo.rotulo} concluídas
          </p>
        </div>

        {!resumo.perfeito && tempoRestante && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1">
            <Clock size={12} className="text-content-tertiary" />
            <span className="text-[11px] font-bold text-content-secondary tabular-nums">
              {tempoRestante.rotulo}
            </span>
          </span>
        )}
      </div>

      <ul className="divide-y divide-edge-subtle border-t border-edge-subtle">
        {diarias.map((d) => (
          <Diaria key={d.id} d={d} />
        ))}
      </ul>

      {resumo.perfeito && (
        <p className="bg-status-resolvedBg px-4 py-2.5 text-center text-xs font-extrabold text-status-resolvedFg">
          Dia perfeito. Volte amanhã para três novas.
        </p>
      )}
    </div>
  );
}
