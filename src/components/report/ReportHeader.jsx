import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@/design-system/icons";

// Novo cabecalho da tela de detalhe da bronca (task 4 da fase 2). Substitui a
// barra "TOP NAV" antiga em ReportPage.jsx (so no modo web/nao-nativo -- no
// app nativo o cabecalho continua sendo o MobileHeader global).
//
// O menu "..." nao decide permissao: recebe os booleanos de
// useReportPermissions e os handlers como props, igual ReportActionsMenu.
// Cada item so aparece se sua permissao for verdadeira.
//
// showAdminActions (isAdmin || isPublicOfficial) gate vincular/editar/whatsapp
// -- mesma condicao usada antes em ReportActionsAdminButtons, so movida para
// dentro do menu.
const ReportHeader = ({
  onBack,
  protocol,
  showAdminActions,
  handleOpenLinkModal,
  handleEditClick,
  handleWhatsAppShare,
  handleCopyShareLink,
  handleShare,
}) => {
  return (
    <div className="bg-surface-raised sticky top-0 z-30 border-b border-edge-subtle">
      <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl bg-surface-subtle hover:bg-surface-subtleHover flex-shrink-0"
            onClick={onBack}
            aria-label="Voltar"
          >
            <Icon name="chevronright" size={18} className="rotate-180 text-content-primary" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-content-primary leading-tight truncate">
              Detalhes da denúncia
            </h1>
            {protocol && (
              <p className="text-2xs text-content-tertiary leading-tight truncate">
                ID #{protocol}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border-cta-border text-brand bg-transparent hover:bg-surface-subtle"
            onClick={handleShare}
          >
            <Icon name="share" size={14} />
            Compartilhar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-xl bg-surface-subtle hover:bg-surface-subtleHover"
                aria-label="Mais opções"
              >
                <MoreVertical className="w-4 h-4 text-content-primary" strokeWidth={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                className="sm:hidden gap-2 cursor-pointer"
                onClick={handleShare}
              >
                <Icon name="share" size={14} />
                Compartilhar
              </DropdownMenuItem>

              {showAdminActions && (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={handleOpenLinkModal}
                >
                  <Icon name="trombone" size={14} />
                  Vincular a outra bronca
                </DropdownMenuItem>
              )}

              {showAdminActions && (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={handleEditClick}
                >
                  <Icon name="profile" size={14} />
                  Editar
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {showAdminActions && (
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={handleWhatsAppShare}
                >
                  <Icon name="share" size={14} />
                  Compartilhar por WhatsApp
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={handleCopyShareLink}
              >
                <Icon name="save" size={14} />
                Copiar link
              </DropdownMenuItem>

            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export default ReportHeader;
