import { Calendar, Droplet, AlertCircle, Hash } from "lucide-react";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Descricao do problema + grade de informacoes, incluindo os campos de
// iluminacao publica (poste, placa, tipo de problema) que so aparecem
// quando category === 'iluminacao'.
// section: "description" renderiza so o card de descricao; "details" renderiza
// so a grade de informacoes. Existem porque no layout original o mapa
// (mobile) fica intercalado entre os dois cards.
export const ReportProblemDescription = ({ description }) => {
  if (!description) return null;
  return (
    <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#9f3f3b] mb-2">
        <span className="inline-block w-1 h-3.5 rounded bg-[#b61722]" />
        Descrição
      </div>
      <p className="text-sm leading-relaxed text-[#191c1e] whitespace-pre-line break-words [overflow-wrap:anywhere]">
        {description}
      </p>
    </div>
  );
};

export const ReportProblemDetails = ({
  category,
  createdAt,
  waterUtilityName,
  isFromWaterUtility,
  issueType,
  pole,
  poleNumber,
  reportedPlate,
  reportedPostIdentifier,
  formatDateTime,
  getLightingIssueTypeLabel,
  formatPoleLabel,
}) => {
  return (
    <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#9f3f3b]">
        <span className="inline-block w-1 h-3.5 rounded bg-[#b61722]" />
        Informações
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          {
            icon: <Calendar className="w-4 h-4 text-[#b61722]" strokeWidth={1.5} />,
            label: "Cadastrado",
            value: formatDateTime(createdAt).replace(",", " às"),
          },
          category === "buracos" && {
            icon: <Droplet className="w-4 h-4 text-[#b61722]" strokeWidth={1.5} />,
            label: `Abertura ${waterUtilityName || "COMPESA"}`,
            value: isFromWaterUtility ? "Sim" : "Não",
          },
          category === "iluminacao" && {
            icon: <AlertCircle className="w-4 h-4 text-[#b61722]" strokeWidth={1.5} />,
            label: "Tipo",
            value: issueType ? getLightingIssueTypeLabel(issueType) : "—",
          },
          category === "iluminacao" && {
            icon: <Hash className="w-4 h-4 text-[#b61722]" strokeWidth={1.5} />,
            label: "Poste / plaqueta",
            value:
              formatPoleLabel(
                pole?.plate ||
                  pole?.identifier ||
                  poleNumber ||
                  reportedPlate ||
                  reportedPostIdentifier
              ) || "—",
          },
        ]
          .filter(Boolean)
          .map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white px-3 py-2.5 rounded-xl shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]"
            >
              <div className="w-8 h-8 rounded-lg bg-[#b61722]/10 flex items-center justify-center flex-shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#6b7280] leading-tight">
                  {item.label}
                </div>
                <div className="text-xs text-[#191c1e] break-words leading-tight">
                  {item.value}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
