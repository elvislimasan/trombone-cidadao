import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

// Novo na task 6 da fase 2: barra fixa "Adicionar comentario" na base da
// tela de detalhe da bronca (so mobile -- lg:hidden, igual ReportModerationBar
// e BottomNav). Usa os tokens cta-bg/cta-fg/cta-border, que ja alternam
// sozinhos entre preenchido (tema claro) e contorno (tema escuro) -- ver
// src/design-system/tokens/semantic.css.
//
// Preserva handleSubmitComment e o fluxo de envio inteiro: este componente
// so renderiza o form, a logica de submit continua em ReportPage.jsx.
//
// Posicionamento: BottomNav (src/components/BottomNav.jsx) e fixa no rodape
// so em mobile (lg:hidden) com altura minima de 4.5rem + safe-area. Esta
// barra tambem e mobile-only (lg:hidden) -- no desktop o formulario inline
// dentro de ReportComments.jsx ja cobre a mesma acao, e duplicar como barra
// fixa nao faz sentido numa tela sem bottom nav pra brigar por espaco. Fica
// posicionada acima da BottomNav (bottom-[4.5rem]) pra nao cobri-la.
const ReportCommentBar = ({ user, newComment, setNewComment, handleSubmitComment }) => {
  if (!user) {
    return (
      <div
        className="fixed left-0 right-0 bottom-[4.5rem] z-[1050] bg-cta-bg border-t border-cta-border pb-safe lg:hidden"
      >
        <div className="max-w-3xl mx-auto px-4 py-3 text-center text-xs text-cta-fg">
          <Link to="/login" className="font-semibold underline underline-offset-2">
            Faça login
          </Link>{" "}
          para adicionar um comentário.
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed left-0 right-0 bottom-[4.5rem] z-[1050] bg-cta-bg border-t border-cta-border pb-safe lg:hidden"
    >
      <form
        onSubmit={handleSubmitComment}
        className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Adicionar comentário..."
          className="flex-1 text-sm bg-cta-fg/10 text-cta-fg placeholder:text-cta-fg/60 px-4 py-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-cta-fg/40"
        />
        <Button
          type="submit"
          size="icon"
          className="flex-shrink-0 rounded-full bg-cta-fg text-cta-bg hover:bg-cta-fg/90"
        >
          <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
      </form>
    </div>
  );
};

export default ReportCommentBar;
