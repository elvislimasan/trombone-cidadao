import {
  Shield,
  Share2,
  Edit,
  Link as LinkIcon,
  Flag,
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
// As acoes administrativas/do autor ficam em tres locais visuais distintos no
// layout original (botoes de admin no corpo, painel de gestao no accordion,
// barra fixa de moderacao no rodape) -- por isso viram tres componentes neste
// arquivo, igual ReportProblemDescription/Details na task 2. Nao decide
// permissao: recebe os booleanos de useReportPermissions e os handlers como
// props, e so renderiza o que lhe for permitido.

// Botoes de admin/oficial publico: WhatsApp, compartilhar, editar, vincular,
// sugerir correcao. Renderizado no corpo da pagina, so quando isAdmin ou
// isPublicOfficial.
export const ReportActionsAdminButtons = ({
  isAdmin,
  isPublicOfficial,
  handleWhatsAppShare,
  handleShare,
  handleEditClick,
  handleOpenLinkModal,
  handleReportError,
  report,
}) => {
  if (!(isAdmin || isPublicOfficial)) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="hidden sm:flex justify-center gap-2 text-sm border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          onClick={handleWhatsAppShare}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 fill-current"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.347-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          WhatsApp Web
        </Button>
        <Button
          variant="outline"
          className="justify-center gap-2 text-sm"
          onClick={handleShare}
        >
          <Share2 className="w-4 h-4" />
          Compartilhar
        </Button>
        <Button
          variant="outline"
          className="justify-center gap-2 text-sm"
          onClick={handleEditClick}
        >
          <Edit className="w-4 h-4" />
          Editar
        </Button>
        <Button
          variant="outline"
          className="justify-center gap-2 text-sm"
          onClick={() => handleOpenLinkModal(report)}
        >
          <LinkIcon className="w-4 h-4" />
          Vincular
        </Button>
      </div>

      <button
        type="button"
        onClick={handleReportError}
        className="w-full inline-flex items-center justify-center gap-2 text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        <Flag className="w-4 h-4" />
        Sugerir correção
      </button>
    </div>
  );
};

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <Accordion type="single" collapsible defaultValue="">
        <AccordionItem value="management" className="border-b-0">
          <AccordionTrigger className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span className="tracking-[0.18em]">Painel de Gestão</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-5 py-4 space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
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
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
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
      className="fixed left-0 right-0 bottom-0 z-[1100] bg-white border-t border-border shadow-[0_-2px_12px_-4px_rgba(25,28,30,0.15)]"
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

export default ReportActionsAdminButtons;
