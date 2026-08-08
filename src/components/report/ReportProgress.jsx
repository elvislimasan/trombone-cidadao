import Icon from "@/design-system/icons";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Redesenhado na task 5 da fase 2: em vez da lista vertical generica de
// report_timeline, vira uma barra horizontal de 4 etapas fixas (Recebido,
// Em analise, Em execucao, Resolvido) derivada do status oficial da bronca
// (report.status) -- mesma fonte que StatusBadge usa. report_timeline nunca
// e escrito em nenhum lugar do app (so lido) e nao tem coluna de etapa, entao
// nao da pra confiar nele pra decidir a etapa atual; ele so serve, quando tem
// registros, pra tentar achar uma data mais especifica para a etapa atual.
//
// Mapeamento status -> etapa (indice 0-based), precisa cobrir os 4 status do
// banco:
//   pending     -> etapa 0 (Recebido)
//   in-progress -> etapa 2 (Em execucao) -- pula "Em analise" porque o banco
//                  nao tem um status intermediario para analise; a etapa fica
//                  marcada como concluida por inferencia (ja passou por ela).
//   resolved    -> etapa 3 (Resolvido)
//   duplicate   -> etapa 0 (Recebido), com fallback explicito. Duplicada nao
//                  segue o fluxo normal de apuracao, mas escondemos a
//                  timeline classica so quando NAO ha nenhum status
//                  reconhecido; para 'duplicate' mantemos a barra na etapa 1
//                  em vez de esconder, porque o usuario ainda se beneficia de
//                  ver "isto foi recebido" e o texto explica que foi
//                  marcada como duplicada (ver STEP_HINT).
const STEPS = [
  { key: "received", label: "Recebido", icon: "received" },
  { key: "analysis", label: "Em análise", icon: "analysis" },
  { key: "execution", label: "Em execução", icon: "execution" },
  { key: "resolved", label: "Resolvido", icon: "resolved" },
];

const STATUS_STEP_INDEX = {
  pending: 0,
  "in-progress": 2,
  resolved: 3,
  duplicate: 0,
};

const STEP_HINT = {
  duplicate: "Esta bronca foi marcada como duplicada de outra já registrada.",
};

const ReportProgress = ({ status, timeline, formatDateTime }) => {
  const currentIndex = STATUS_STEP_INDEX[status] ?? 0;

  // report_timeline nao tem coluna de etapa/status hoje, entao so usamos ele
  // para achar uma data especifica da etapa atual, caso algum registro no
  // futuro venha com item.status/item.stage batendo com a chave da etapa.
  // Sem isso, caimos no ultimo registro (mais recente) como aproximacao.
  const currentStepKey = STEPS[currentIndex]?.key;
  const matchedEntry =
    timeline?.find((item) => item.status === currentStepKey || item.stage === currentStepKey) ||
    (timeline && timeline.length > 0 ? timeline[timeline.length - 1] : null);
  const currentDate = matchedEntry?.date ? formatDateTime(matchedEntry.date) : null;

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <h2 className="text-xs font-bold text-content-primary mb-4">
        Acompanhe o andamento
      </h2>

      <div className="flex items-start">
        {STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;
          const isActive = isCurrent || isComplete;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.key} className={`flex flex-col items-center ${isLast ? "flex-none" : "flex-1"}`}>
              {/* Icone + linha conectora ficam na mesma linha para o traco
                  atravessar o centro do circulo (h-9 = 36px, metade = 18px) */}
              <div className="flex items-center w-full">
                <div
                  className={
                    isActive
                      ? "w-9 h-9 rounded-full bg-brand text-content-onBrand flex items-center justify-center flex-shrink-0"
                      : "w-9 h-9 rounded-full border border-edge-default text-content-tertiary flex items-center justify-center flex-shrink-0"
                  }
                >
                  <Icon name={step.icon} size={16} />
                </div>
                {!isLast && (
                  <div
                    className={`h-0 flex-1 border-t-2 ${
                      isComplete ? "border-brand" : "border-edge-default"
                    }`}
                  />
                )}
              </div>

              <div className="mt-1.5 text-center w-16">
                <span
                  className={`text-2xs font-semibold leading-tight block ${
                    isActive ? "text-brand" : "text-content-tertiary"
                  }`}
                >
                  {step.label}
                </span>
                {isCurrent && currentDate && (
                  <span className="text-2xs text-content-tertiary leading-tight block">
                    {currentDate}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {STEP_HINT[status] && (
        <p className="mt-3 text-2xs text-content-tertiary">{STEP_HINT[status]}</p>
      )}
    </div>
  );
};

export default ReportProgress;
