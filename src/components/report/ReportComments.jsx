import { Link } from "react-router-dom";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 3 da fase 2).
// Lista de comentarios + formulario de envio (barra de comentario). No
// layout original os dois ficam no mesmo bloco visual (mesma div
// bg-[#f2f4f7]), por isso nao existe um ReportCommentBar separado -- nao ha
// bloco separado para extrair. Nao ha ordenacao propria: comments ja vem
// filtrado/ordenado de fetchReport em ReportPage.
const ReportComments = ({
  comments,
  user,
  newComment,
  setNewComment,
  handleSubmitComment,
  formatDateTime,
}) => {
  return (
    <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-[#9f3f3b]" strokeWidth={1.5} />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#9f3f3b]">
          Comentários
        </h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-white font-semibold text-[#6b7280]">
          {comments.length}
        </span>
      </div>
      <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#b61722]/10 flex items-center justify-center text-xs font-bold text-[#b61722] flex-shrink-0">
                {(comment.authorName || comment.author?.name || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 bg-white rounded-xl px-3 py-2.5 shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-[#191c1e] truncate">
                    {comment.authorName || comment.author?.name || "Anônimo"}
                  </p>
                  <p className="text-[10px] text-[#6b7280] flex-shrink-0">
                    {formatDateTime(comment.created_at)}
                  </p>
                </div>
                <p className="text-xs text-[#191c1e] break-words leading-relaxed">
                  {comment.text}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-[#6b7280] text-center py-4">
            Ainda não há comentários.
          </p>
        )}
      </div>
      {user ? (
        <form
          onSubmit={handleSubmitComment}
          className="mt-4 flex gap-2 items-center"
        >
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Adicione seu comentário..."
            className="flex-1 text-xs sm:text-sm bg-white px-4 py-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-[#b61722] shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]"
          />
          <Button
            type="submit"
            size="icon"
            className="flex-shrink-0 rounded-full bg-[#b61722] hover:bg-[#9f1520] text-white"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        </form>
      ) : (
        <div className="mt-4 text-center px-4 py-3 bg-white rounded-xl text-xs text-[#6b7280]">
          <Link
            to="/login"
            className="font-semibold text-[#b61722] hover:underline"
          >
            Faça login
          </Link>{" "}
          ou{" "}
          <Link
            to="/cadastro"
            className="font-semibold text-[#b61722] hover:underline"
          >
            cadastre-se
          </Link>{" "}
          para comentar e acompanhar esta bronca.
        </div>
      )}
    </div>
  );
};

export default ReportComments;
