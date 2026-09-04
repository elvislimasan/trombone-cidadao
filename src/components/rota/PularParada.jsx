import { useState } from "react";
import { MOTIVOS_DE_PULO, motivoDePulo } from "@/lib/pularAlvo";

// Pular uma parada, com motivo.
//
// O MOTIVO É OBRIGATÓRIO, E A LISTA É CURTA DE PROPÓSITO
//
// Cinco opções cabem num polegar na calçada. Uma lista de doze vira rolagem, e
// rolagem em pé na rua vira "escolho a primeira" — que produziria um dado pior
// que nenhum, porque pareceria informação.
//
// "NÃO ME SENTI SEGURO" NÃO PEDE DETALHE
//
// É o único motivo sem convite a escrever. Quem está desconfortável num lugar
// quer sair dele, não redigir um relato — e o pedido de detalhe, ali, é mais um
// motivo para ficar parado olhando a tela.

const PularParada = ({ parada, pulosRestantes, enviando, onPular, onCancelar }) => {
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");

  const motivo = motivoDePulo(motivoId);
  const pedeDetalhe = !!motivo && motivo.id !== "risco_no_local";

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-subtle px-3.5 py-3">
      <p className="text-xs font-bold text-content-primary">Por que está pulando?</p>
      <p className="text-2xs text-content-tertiary mt-0.5">
        {pulosRestantes === 1
          ? "Este é seu último pulo nesta rota."
          : `Você pode pular mais ${pulosRestantes} paradas nesta rota.`}
      </p>

      <div className="flex flex-col gap-1.5 mt-2.5">
        {MOTIVOS_DE_PULO.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={enviando}
            onClick={() => setMotivoId(motivoId === m.id ? "" : m.id)}
            className={`text-left text-xs font-semibold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
              motivoId === m.id
                ? "bg-brand text-content-onBrand border-brand"
                : "bg-surface-raised text-content-secondary border-edge-subtle"
            }`}
          >
            {m.rotulo}
            {m.detalhe && (
              <span
                className={`block text-2xs font-normal mt-0.5 ${
                  motivoId === m.id ? "opacity-80" : "text-content-tertiary"
                }`}
              >
                {m.detalhe}
              </span>
            )}
          </button>
        ))}
      </div>

      {pedeDetalhe && (
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Quer detalhar? (opcional)"
          className="w-full mt-2.5 text-xs rounded-xl border border-edge-subtle bg-surface-raised px-3 py-2 text-content-primary placeholder:text-content-tertiary resize-none"
        />
      )}

      {/* Quebra entre os dois: com a fonte do sistema ampliada, "Registrando…"
          e "Voltar" lado a lado estouravam a largura do cartão. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
        <button
          type="button"
          disabled={!motivoId || enviando}
          onClick={() => onPular({ parada, motivoId, observacao })}
          className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
        >
          {enviando ? "Registrando…" : "Pular esta parada"}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={onCancelar}
          className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
        >
          Voltar
        </button>
      </div>
    </div>
  );
};

export default PularParada;
