import { useEffect, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { creditoNaBronca, fraseDaResolucao } from "@/lib/impact";

// O Recibo de Impacto (fase 1, §36.6 — Aposta 1).
//
// POR QUE "RECIBO", E NÃO "PARABÉNS"
//
// Um recibo presta contas: diz o que você fez, o que aconteceu, quem mais
// participou e de onde saiu cada número. A tela de comemoração faz o contrário
// — afirma um resultado e esconde a origem. Para um app que pede trabalho de
// campo, prestar contas vale mais que celebrar, porque é o que sustenta a
// próxima ida à rua.
//
// A LINGUAGEM É DELIBERADAMENTE MODESTA
//
// "Você contribuiu para registrar, verificar e acompanhar", não "você fez isso
// acontecer" (§36.5). Uma resolução posterior prova participação no
// acompanhamento; não prova, sozinha, que a pessoa causou o conserto. Prometer
// causalidade individual funciona uma vez e corrói a credibilidade do placar
// inteiro depois.
//
// SÓ APARECE PARA QUEM PARTICIPOU
//
// Um recibo entregue a quem passou pela página é propaganda. `creditoNaBronca`
// devolve lista vazia para quem não fez nada aqui, e o componente some.

const ReportImpactReceipt = ({ report, atualizacoes = [], apoiou = false }) => {
  const { user } = useAuth();
  const [participantes, setParticipantes] = useState(null);

  const resolvida = report?.status === "resolved";
  const { creditos, total } = creditoNaBronca({
    report,
    atualizacoes,
    comentarios: report?.comments,
    apoiou,
    user,
  });

  useEffect(() => {
    let vivo = true;
    if (!resolvida || creditos.length === 0 || !report?.id) return () => {};

    (async () => {
      const { data } = await supabase.rpc("report_participants", {
        p_report_id: report.id,
      });
      if (vivo) setParticipantes(Array.isArray(data) ? data.length : null);
    })();

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvida, report?.id, creditos.length]);

  if (!resolvida || creditos.length === 0) return null;

  const frase = fraseDaResolucao({
    titulo: report.title,
    endereco: report.address,
    participantes: participantes ?? 1,
    pontos: total,
  });

  return (
    <div className="bg-surface-raised border border-status-resolvedBorder rounded-2xl px-4 py-4">
      <p className="text-2xs font-bold uppercase tracking-[0.15em] text-status-resolvedFg">
        Recibo de impacto
      </p>
      <p className="text-[13px] font-bold text-content-primary mt-1 leading-tight">
        {frase.titulo}
      </p>
      <p className="text-xs text-content-secondary mt-1 leading-relaxed">
        {/* A frase completa (com os pontos) fica no corpo; a quebra abaixo diz
            de onde cada ponto veio. Um total sem quebra é um número que a
            pessoa tem que acreditar; com a quebra, é um número que ela pode
            conferir. */}
        {frase.corpo}
      </p>

      <ul className="mt-3 space-y-1">
        {creditos.map((c) => (
          <li
            key={c.id}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="text-content-secondary">Você {c.verbo}</span>
            <span className="font-bold text-content-primary tabular-nums">
              +{c.pontos}
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 text-xs pt-1.5 mt-1.5 border-t border-edge-subtle">
          <span className="font-bold text-content-primary">Total nesta bronca</span>
          <span className="font-extrabold text-status-resolvedFg tabular-nums">
            +{total}
          </span>
        </li>
      </ul>

      {/* Sem porcentagem de conclusão: a execução dependeu de terceiro, e barra
          com denominador de apoios ou fotos seria ficção apresentada como
          medida (§36.6). O que aconteceu está na linha do tempo, acima. */}
      <p className="mt-2 text-2xs text-content-tertiary leading-relaxed">
        O andamento completo, com quem informou cada etapa, está na linha do
        tempo desta bronca.
      </p>
    </div>
  );
};

export default ReportImpactReceipt;
