import {
  Shield,
  X,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Combobox } from "@/components/ui/combobox";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 3 da fase 2).
// As acoes administrativas/do autor ficam em dois locais visuais distintos no
// layout original (painel de gestao no accordion, barra fixa de moderacao no
// rodape) -- por isso viram dois componentes neste arquivo, igual
// ReportProblemDescription/Details na task 2. Nao decide permissao: recebe os
// booleanos de useReportPermissions e os handlers como props, e so renderiza
// o que lhe for permitido.
//
// O terceiro bloco que existia aqui (ReportActionsAdminButtons: WhatsApp,
// compartilhar, editar, vincular, sugerir correcao) foi removido na task 6 da
// fase 2 -- a task 4 ja tinha movido essas mesmas acoes para o menu "..." de
// ReportHeader.jsx, e o bloco antigo continuava renderizando no corpo da
// pagina, duplicando os botoes. As acoes continuam alcancaveis via
// ReportHeader (handleWhatsAppShare/handleEditClick/handleOpenLinkModal/
// handleReportError/handleShare/handleCopyShareLink).

// Painel de gestao (accordion): alterar status, categoria e se veio da
// companhia de agua/esgoto. So aparece quando canMarkResolved e a bronca ja
// foi aprovada na moderacao.
export const ReportManagementPanel = ({
  canMarkResolved,
  moderationStatus,
  reportStatus,
  reportCategory,
  isFromWaterUtility,
  isUserAdmin,
  canEditCategory,
  canEditWaterUtility,
  categories,
  handleAdminStatusChange,
  handleAdminCategoryChange,
  handleAdminWaterUtilityChange,
}) => {
  if (!(canMarkResolved && moderationStatus === "approved")) return null;
  return (
    <div className="bg-surface-raised rounded-2xl shadow-elevation-1 border border-edge-subtle">
      <Accordion type="single" collapsible defaultValue="">
        <AccordionItem value="management" className="border-b-0">
          <AccordionTrigger className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-content-tertiary flex items-center gap-2 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span className="tracking-[0.18em]">Painel de Gestão</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-5 py-4 space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary mb-1">
                Alterar Status
              </div>
              <Combobox
                options={[
                  { value: "pending", label: "Pendente" },
                  { value: "in-progress", label: "Em Andamento" },
                  {
                    value: "pending_resolution",
                    label: "Verificando Resolução",
                  },
                  ...(isUserAdmin
                    ? [{ value: "resolved", label: "Resolvido" }]
                    : []),
                ]}
                value={reportStatus}
                onChange={handleAdminStatusChange}
                placeholder="Selecione o status"
                searchPlaceholder="Buscar status..."
                notFoundText="Status não encontrado"
              />
            </div>
            {canEditCategory && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary mb-1">
                  Alterar Categoria
                </div>
                <Combobox
                  options={Object.entries(categories).map(([key, value]) => ({
                    value: key,
                    label: value,
                  }))}
                  value={reportCategory}
                  onChange={handleAdminCategoryChange}
                  placeholder="Selecione a categoria"
                  searchPlaceholder="Buscar categoria..."
                  notFoundText="Categoria não encontrada"
                />
              </div>
            )}
            {canEditWaterUtility && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary mb-1">
                  Aberto pela COMPESA?
                </div>
                <Combobox
                  options={[
                    { value: "yes", label: "Sim" },
                    { value: "no", label: "Não" },
                  ]}
                  value={isFromWaterUtility ? "yes" : "no"}
                  onChange={handleAdminWaterUtilityChange}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar..."
                  notFoundText="Opção não encontrada"
                />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

// Barra fixa de moderacao do embaixador (aprovar/rejeitar), so aparece
// quando canModerate.
export const ReportModerationBar = ({
  canModerate,
  moderating,
  handleModerate,
}) => {
  if (!canModerate) return null;
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[1100] bg-surface-raised border-t border-edge-subtle shadow-elevation-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <Button
          variant="outline"
          className="h-11 px-4 text-red-600 border-red-300 hover:bg-red-50 flex-1"
          disabled={moderating}
          onClick={() => handleModerate(false)}
        >
          {moderating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <X className="w-4 h-4 mr-1.5" /> Rejeitar
            </>
          )}
        </Button>
        <Button
          className="h-11 px-4 bg-green-600 hover:bg-green-700 text-white flex-1"
          disabled={moderating}
          onClick={() => handleModerate(true)}
        >
          {moderating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar bronca
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ReportManagementPanel;
