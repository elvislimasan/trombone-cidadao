import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

// O cartão da segunda moeda.
//
// POR QUE ELE EXISTE AO LADO DO DE NÍVEL, E NÃO DENTRO DELE
//
// XP e Impacto respondem perguntas diferentes — "quanto você trabalhou" e
// "quanto mudou" — e é justamente a distância entre os dois números que conta a
// história. Alguém com 400 XP e 0 de impacto está reclamando no vazio: o app
// precisa conseguir mostrar isso, e um total somado esconderia.
//
// A COR É A DO "RESOLVIDA", E ISSO NÃO É DECORAÇÃO
//
// MissionLevelCard fixou três papéis de cor: vermelho para marca e toque, azul
// para toda barra de progresso, neutro para moldura. Impacto precisa de um
// quarto papel, e o app já tinha a cor certa parada: `status-resolved`, o verde
// que marca bronca fechada em toda tela do produto.
//
// Reusá-la faz o cartão se explicar sem legenda — a pessoa já associa aquele
// verde a problema que acabou. Inventar uma quinta cor seria pedir que ela
// aprendesse um código novo para ler o mesmo fato.
//
// A barra continua azul, como todas as outras. A cor da barra é do papel
// "progresso", não do assunto.
//
// QUANDO NÃO HÁ IMPACTO NENHUM, O CARTÃO AINDA APARECE
//
// É a única tela do app que consegue dizer, sem acusar ninguém, que registrar
// não é o fim do trabalho. Um zero aqui é informação — e é o convite para a
// única ação que produz impacto: ir conferir se o que foi marcado como
// resolvido de fato foi.

export default function ImpactCard({ impacto, aoVerComo }) {
  const [aberto, setAberto] = useState(false);
  if (!impacto) return null;

  const { impacto: total, resolvidas, selo, creditos, proximo } = impacto;
  const vazio = total === 0;

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 overflow-hidden">
      <div className="flex items-start gap-3.5 px-4 pt-4 pb-3.5">
        <span
          aria-hidden="true"
          className="shrink-0 w-12 h-12 rounded-xl bg-status-resolvedBg flex items-center justify-center text-2xl"
        >
          {vazio ? <Sparkles size={22} className="text-status-resolvedFg" /> : selo.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-status-resolvedFg leading-tight">
            {vazio ? 'Nenhum conserto ainda' : selo.rotulo}
          </p>
          <p className="text-xs font-bold text-content-secondary mt-0.5">
            {vazio
              ? 'Impacto conta o que foi resolvido'
              : `${resolvidas} ${resolvidas === 1 ? 'problema resolvido' : 'problemas resolvidos'} com sua ajuda`}
          </p>
        </div>

        <div className="shrink-0 rounded-xl bg-status-resolvedBg px-3 py-2 text-center">
          <p className="text-2xl font-extrabold text-status-resolvedFg leading-none tabular-nums">
            {total}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-status-resolvedFg mt-1 opacity-80">
            Impacto
          </p>
        </div>
      </div>

      {/* O zero não ganha barra: uma barra vazia com "faltam 25" transforma o
          convite numa pendência. Ganha a frase que diz de onde vem a moeda. */}
      {vazio ? (
        <div className="px-4 pb-4">
          <p className="text-[11px] text-content-tertiary leading-relaxed">
            XP conta o que você faz. Impacto só conta quando um problema é
            resolvido — e é dividido entre todos que ajudaram, inclusive quem só
            apoiou ou comentou.
          </p>
          {aoVerComo && (
            <button
              type="button"
              onClick={aoVerComo}
              className="mt-2 text-xs font-bold text-brand hover:underline"
            >
              Como eu ganho impacto?
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 pb-3.5">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs font-bold text-status-resolvedFg tabular-nums">
              {proximo ? `${total} / ${proximo.minimo}` : `${total}`}
            </span>
            <span className="text-[11px] text-content-tertiary">
              {proximo
                ? `Faltam ${proximo.faltam} para ${proximo.rotulo}`
                : 'Selo máximo alcançado'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
            <div
              className="h-full rounded-full bg-status-progressFg transition-[width] duration-700"
              style={{ width: `${Math.round((proximo ? proximo.fracao : 1) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {creditos.length > 0 && (
        <div className="border-t border-edge-subtle bg-surface-subtle">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-[11px] font-semibold text-content-secondary"
          >
            <span>De onde vem seu impacto</span>
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
            />
          </button>

          {aberto && (
            <ul className="px-4 pb-3 space-y-1.5">
              {creditos.map((c) => (
                <li
                  key={c.id}
                  className="flex items-baseline justify-between gap-3 text-[11px]"
                >
                  <span className="text-content-secondary min-w-0 truncate">
                    {c.rotulo}
                  </span>
                  <span className="shrink-0 tabular-nums text-content-tertiary">
                    {c.quantidade} × {c.peso} ={' '}
                    <strong className="text-status-resolvedFg font-bold">
                      {c.pontos}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
