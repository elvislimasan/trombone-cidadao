import { useState } from "react";
import { RESPOSTAS } from "@/lib/reportRevisit";
import { useReportRevisit } from "@/hooks/useReportRevisit";

// O convite de revisita (fase 1 do roadmap revisado, §36.6 — Aposta 2).
//
// UMA PERGUNTA, CINCO RESPOSTAS, UM TOQUE
//
// O formulário inteiro cabe numa fileira de botões porque o custo de responder
// é o que decide se alguém responde. Foto e texto existem, mas escondidos atrás
// da resposta — pedir os dois de cara transforma "como está agora?" numa
// tarefa, e tarefa não se faz no ponto de ônibus.
//
// "NÃO CONSIGO VERIFICAR" É UM BOTÃO DE PRIMEIRA CLASSE
//
// Não é o botão de escapar: é a resposta honesta de quem se mudou, está sem
// tempo ou não conseguiu chegar. Um formulário sem saída honesta colhe a
// resposta mais fácil, não a verdadeira — e uma pesquisa de estado da rua que
// colhe resposta fácil é pior que pesquisa nenhuma, porque o mapa fica errado
// com aparência de atualizado.
//
// SEM CULPA, SEM CONTAGEM REGRESSIVA
//
// O texto diz há quanto tempo, e para por aí (princípio 13: a participação pode
// ser episódica e o produto não fabrica culpa). Quem registrou já fez a parte
// difícil.

const ReportRevisitPrompt = ({ report, atualizacoes = [] }) => {
  const { mostrar, enviando, convite, responder, dispensar } = useReportRevisit(
    report,
    atualizacoes
  );
  const [escolhida, setEscolhida] = useState(null);
  const [mensagem, setMensagem] = useState("");

  if (!mostrar) return null;

  const enviar = async (querLembrete) => {
    const r = await responder({ respostaId: escolhida, mensagem, querLembrete });
    if (r.ok) {
      setEscolhida(null);
      setMensagem("");
    }
  };

  return (
    <div className="bg-surface-raised border border-brand/30 rounded-2xl px-4 py-4">
      <p className="text-[13px] font-bold text-content-primary leading-tight">
        {convite.titulo}
      </p>
      <p className="text-xs text-content-secondary mt-0.5">{convite.pergunta}</p>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {RESPOSTAS.map((r) => {
          const ativa = escolhida === r.id;
          return (
            <button
              key={r.id}
              type="button"
              disabled={enviando}
              onClick={() => setEscolhida(ativa ? null : r.id)}
              className={`text-2xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                ativa
                  ? "bg-brand text-content-onBrand border-brand"
                  : "bg-surface-subtle text-content-secondary border-edge-subtle hover:text-content-primary"
              }`}
            >
              {r.rotulo}
            </button>
          );
        })}
      </div>

      {escolhida && (
        <div className="mt-3 space-y-2">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={2}
            maxLength={400}
            placeholder="Quer contar mais? (opcional)"
            className="w-full text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary resize-none"
          />

          <p className="text-2xs text-content-tertiary">{convite.rodape}</p>

          {/* A escolha do próximo lembrete é feita NO MOMENTO da resposta, não
              numa tela de preferências que ninguém abre. É onde a pessoa tem
              contexto para decidir. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => enviar(true)}
              className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar e me lembrar de novo"}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => enviar(false)}
              className="text-2xs font-semibold text-content-secondary underline underline-offset-2 disabled:opacity-50"
            >
              Enviar e não perguntar mais
            </button>
          </div>
        </div>
      )}

      {!escolhida && (
        <button
          type="button"
          onClick={dispensar}
          className="mt-3 text-2xs text-content-tertiary underline underline-offset-2"
        >
          Não quero ser perguntado sobre esta bronca
        </button>
      )}
    </div>
  );
};

export default ReportRevisitPrompt;
