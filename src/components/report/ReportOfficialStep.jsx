import { useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { ETAPAS, ETAPAS_OFICIAIS, ETAPA_RECUSADA } from "@/lib/reportTimeline";
import { showAppError, showAppNotice } from "@/lib/appError";

// Registrar o que o órgão fez (fase 1, §36.6).
//
// POR QUE É UMA TELA DE MODERAÇÃO DENTRO DA BRONCA
//
// Quem fala com a prefeitura é o embaixador da cidade, e ele descobre que o
// ofício saiu enquanto está olhando aquela bronca — não numa fila separada. Um
// painel próprio significaria abrir outra tela e procurar de novo a mesma
// bronca, que é o tipo de atrito que faz o dado não ser registrado.
//
// PROTOCOLO É O QUE SEPARA INFORMAÇÃO DE AFIRMAÇÃO
//
// Sem número e sem órgão, "encaminhada" é uma palavra que alguém digitou. Com
// eles, qualquer cidadão pode cobrar o andamento na fonte. Não é obrigatório —
// nem todo encaminhamento gera protocolo, e exigir um faria o embaixador
// inventar — mas o campo vem antes da observação de propósito.
//
// A RECUSA EXIGE MOTIVO
//
// É o CHECK `report_official_steps_recusa_tem_motivo` da 207, repetido aqui
// para o botão não oferecer o que o banco recusa. Um "não vai acontecer" sem
// explicação é a pior notificação que este app poderia mandar.

const ROTULO = ETAPAS.reduce((acc, e) => ({ ...acc, [e.id]: e.rotulo }), {
  [ETAPA_RECUSADA]: "Recusada pelo órgão",
});

const ReportOfficialStep = ({ report, onRegistrada }) => {
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [orgao, setOrgao] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Gate de tela, não de segurança: a autoridade real é
  // `pode_registrar_etapa_oficial` na policy da 207. Aqui só decidimos se vale
  // desenhar o formulário.
  const podeVer = !!user && (user.is_admin || user.is_master || user.is_ambassador);
  if (!podeVer || !report?.id) return null;

  const recusa = etapa === ETAPA_RECUSADA;
  const podeEnviar = !!etapa && (!recusa || observacao.trim().length > 0);

  const registrar = async () => {
    if (!podeEnviar || enviando) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase
        .from("report_official_steps")
        .insert({
          report_id: report.id,
          etapa,
          orgao: orgao.trim() || null,
          protocolo: protocolo.trim() || null,
          observacao: observacao.trim() || null,
          registrado_por: user.id,
          registrado_por_papel: user.is_admin ? "admin" : "ambassador",
        })
        .select()
        .single();
      if (error) throw error;

      showAppNotice({
        title: "Etapa registrada",
        description: "Todos que participam desta bronca foram avisados.",
      });
      setEtapa("");
      setOrgao("");
      setProtocolo("");
      setObservacao("");
      setAberto(false);
      onRegistrada?.(data);
    } catch (error) {
      showAppError({
        title: "Não foi possível registrar a etapa",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-brand" />
          <h2 className="text-xs font-bold text-content-primary">
            Registrar etapa do órgão
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-2xs font-semibold text-brand hover:underline"
        >
          {aberto ? "Fechar" : "Registrar"}
        </button>
      </div>

      {aberto && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[...ETAPAS_OFICIAIS, ETAPA_RECUSADA].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setEtapa(etapa === id ? "" : id)}
                className={`text-2xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  etapa === id
                    ? "bg-brand text-content-onBrand border-brand"
                    : "bg-surface-subtle text-content-secondary border-edge-subtle"
                }`}
              >
                {ROTULO[id]}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={orgao}
              onChange={(e) => setOrgao(e.target.value)}
              placeholder="Órgão (ex: Secretaria de Obras)"
              maxLength={120}
              className="flex-1 min-w-0 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary"
            />
            <input
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value)}
              placeholder="Protocolo"
              maxLength={60}
              className="w-32 flex-shrink-0 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary"
            />
          </div>

          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder={
              recusa
                ? "Por que o órgão recusou? (obrigatório)"
                : "Observação (opcional)"
            }
            className="w-full text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary resize-none"
          />

          <p className="text-2xs text-content-tertiary leading-relaxed">
            Isto vira um aviso para todos que participaram da bronca e não pode
            ser apagado depois — uma etapa errada se corrige com outra etapa.
          </p>

          <button
            type="button"
            disabled={!podeEnviar || enviando}
            onClick={registrar}
            className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            {enviando ? "Registrando…" : "Registrar etapa"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ReportOfficialStep;
