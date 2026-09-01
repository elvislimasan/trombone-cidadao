import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin, SkipForward } from "lucide-react";
import { formatarDistancia } from "@/lib/patrolAlvo";
import { estaParado } from "@/lib/rotaDoDia";
import { rotuloDeCobertura } from "@/lib/recencia";
import { nomeDaCategoria } from "@/lib/reportCategories";
import PularParada from "@/components/rota/PularParada";

// Uma parada da rota.
//
// A PERGUNTA É CEGA ATÉ A RESPOSTA
//
// A §36.5 pede validação inicialmente cega e estruturada: perguntar "o que você
// observa?" e só depois revelar o que estava registrado. A razão é ancoragem —
// mostrar "o vizinho disse que continua" antes produz concordância barata, e
// concordância barata é indistinguível de confirmação real.
//
// `estado.revelarDepois` diz quando isso importa: num ponto que ninguém nunca
// conferiu não há o que ancorar, e esconder o histórico ali seria mistério sem
// propósito.
//
// AÇÃO SÓ COM A PESSOA PARADA
//
// Princípio 8 do produto. Enquanto o GPS reporta movimento, os botões de
// resposta ficam desligados com o motivo à vista — não somem, porque um botão
// que desaparece parece defeito.

const RESPOSTAS = [
  { id: "still_here", rotulo: "O problema está aqui" },
  { id: "being_solved", rotulo: "Estão mexendo nisso" },
  { id: "solved", rotulo: "Não está mais aqui" },
];

const ParadaCard = ({
  parada,
  ativa,
  concluida,
  pulada,
  posicao,
  pulosRestantes,
  podePular,
  enviando,
  onResponder,
  onPular,
}) => {
  const [aberta, setAberta] = useState(false);
  const [pulando, setPulando] = useState(false);
  const [revelado, setRevelado] = useState(false);

  const cobertura = rotuloDeCobertura(parada.estado);
  const parado = estaParado(posicao);
  const feito = concluida || pulada;

  return (
    <li
      className={`rounded-2xl border px-3.5 py-3 ${
        feito
          ? "border-edge-subtle bg-surface-subtle opacity-70"
          : ativa
          ? "border-brand/40 bg-surface-raised"
          : "border-edge-subtle bg-surface-raised"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-2xs font-bold ${
            concluida
              ? "bg-status-resolvedBg text-status-resolvedFg"
              : pulada
              ? "bg-surface-subtle text-content-tertiary"
              : ativa
              ? "bg-brand text-content-onBrand"
              : "bg-surface-subtle text-content-secondary"
          }`}
        >
          {concluida ? (
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          ) : pulada ? (
            <SkipForward className="w-3.5 h-3.5" />
          ) : (
            parada.ordem
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-content-primary leading-tight">
            {parada.title || nomeDaCategoria(parada.category_id)}
          </p>
          <p className="text-2xs text-content-tertiary mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {parada.address || "Sem endereço registrado"}
            </span>
            <span className="flex-shrink-0">· {formatarDistancia(parada.distancia)}</span>
          </p>

          {/* Por que esta parada está na rota. É o que transforma a lista numa
              explicação em vez de num roteiro imposto. */}
          {cobertura && !feito && (
            <p className="text-2xs text-content-secondary mt-1">{cobertura.texto}</p>
          )}
        </div>
      </div>

      {ativa && !feito && (
        <div className="mt-3">
          {!aberta && !pulando && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setAberta(true)}
                className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
              >
                Cheguei — responder
              </button>
              {podePular && (
                <button
                  type="button"
                  onClick={() => setPulando(true)}
                  className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
                >
                  Pular esta parada
                </button>
              )}
              <Link
                to={`/bronca/${parada.id}`}
                className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
              >
                Ver a bronca
              </Link>
            </div>
          )}

          {aberta && (
            <div className="rounded-2xl border border-edge-subtle bg-surface-subtle px-3.5 py-3">
              <p className="text-xs font-bold text-content-primary">
                O que você está vendo agora?
              </p>

              {!parado && (
                <p className="text-2xs text-status-pendingFg bg-status-pendingBg rounded-xl px-3 py-2 mt-2">
                  Pare antes de responder. O app não pede interação em
                  movimento.
                </p>
              )}

              <div className="flex flex-col gap-1.5 mt-2.5">
                {RESPOSTAS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!parado || enviando}
                    onClick={async () => {
                      const ok = await onResponder({ parada, updateType: r.id });
                      if (ok) setAberta(false);
                    }}
                    className="text-left text-xs font-semibold px-3 py-2 rounded-xl border border-edge-subtle bg-surface-raised text-content-secondary disabled:opacity-40"
                  >
                    {r.rotulo}
                  </button>
                ))}
              </div>

              {/* O histórico fica atrás de um toque, e só onde havia o que
                  ancorar. Depois de responder ele deixa de enviesar — e passa
                  a ser o contexto que a pessoa merece ter. */}
              {parada.estado?.revelarDepois && (
                <button
                  type="button"
                  onClick={() => setRevelado((v) => !v)}
                  className="mt-2 text-2xs text-content-tertiary underline underline-offset-2"
                >
                  {revelado
                    ? "Esconder o que já registraram"
                    : "Ver o que já registraram (pode influenciar sua resposta)"}
                </button>
              )}
              {revelado && (
                <p className="text-2xs text-content-secondary mt-1.5">
                  {parada.estado.rotulo}
                  {parada.estado.diasDesdeUltima != null
                    ? ` · última notícia há ${parada.estado.diasDesdeUltima} dias`
                    : ""}
                </p>
              )}

              <button
                type="button"
                onClick={() => setAberta(false)}
                className="mt-2.5 text-2xs font-semibold text-content-tertiary underline underline-offset-2"
              >
                Ainda não cheguei
              </button>
            </div>
          )}

          {pulando && (
            <PularParada
              parada={parada}
              pulosRestantes={pulosRestantes}
              enviando={enviando}
              onCancelar={() => setPulando(false)}
              onPular={async (args) => {
                const r = await onPular(args);
                if (r?.ok) setPulando(false);
              }}
            />
          )}
        </div>
      )}
    </li>
  );
};

export default ParadaCard;
