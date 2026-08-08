import Icon from "@/design-system/icons";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Redesenhado na task 5 da fase 2: cartao surface-raised com borda edge-subtle,
// seguindo o mesmo padrao visual de ReportHeader/ReportSummary/ReportMedia
// (task 4). Descricao do problema + grade de informacoes, incluindo os campos
// de iluminacao publica (poste, placa, tipo de problema) que so aparecem
// quando category === 'iluminacao'.
// section: "description" renderiza so o card de descricao; "details" renderiza
// so a grade de informacoes. Existem porque no layout original o mapa
// (mobile) fica intercalado entre os dois cards.
export const ReportProblemDescription = ({ description }) => {
  if (!description) return null;
  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <h2 className="text-xs font-bold text-content-primary mb-2">
        Sobre o problema
      </h2>
      <p className="text-sm leading-relaxed text-content-secondary whitespace-pre-line break-words [overflow-wrap:anywhere]">
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
  // Campos de iluminacao publica (poste, placa, tipo de problema) so fazem
  // sentido para category === 'iluminacao' -- demais categorias nao tem
  // poste/plaqueta associados.
  const rows = [
    {
      icon: "received",
      label: "Cadastrado",
      value: formatDateTime(createdAt).replace(",", " às"),
    },
    category === "buracos" && {
      icon: "waterleak",
      label: `Abertura ${waterUtilityName || "COMPESA"}`,
      value: isFromWaterUtility ? "Sim" : "Não",
    },
    category === "iluminacao" && {
      icon: "lighting",
      label: "Tipo",
      value: issueType ? getLightingIssueTypeLabel(issueType) : "—",
    },
    category === "iluminacao" && {
      icon: "flag",
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
  ].filter(Boolean);

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4 space-y-3">
      <h2 className="text-xs font-bold text-content-primary">Informações</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-surface-subtle px-3 py-2.5 rounded-xl"
          >
            <div className="w-8 h-8 rounded-lg bg-surface-raised flex items-center justify-center flex-shrink-0">
              <Icon name={item.icon} size={16} className="text-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-2xs font-semibold text-content-tertiary leading-tight">
                {item.label}
              </div>
              <div className="text-xs text-content-primary break-words leading-tight">
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
