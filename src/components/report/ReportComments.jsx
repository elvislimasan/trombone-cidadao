import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import Icon from "@/design-system/icons";

// Avatar com fallback de iniciais -- mesmo padrao de AuthorAvatar em
// ReportSummary.jsx (task 4 da fase 2).
const CommentAvatar = ({ name, avatarUrl }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-surface-sunken"
        loading="lazy"
      />
    );
  }
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-surface-sunken text-content-secondary flex items-center justify-center text-2xs font-bold flex-shrink-0 select-none">
      {initial}
    </div>
  );
};

const COMMENTS_VISIBLE_COUNT = 4;

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 3 da fase 2).
// Redesenhado na task 6 da fase 2: cartao surface-raised com borda
// edge-subtle, seguindo o mesmo padrao visual dos demais blocos (task 4/5).
// Nao ha ordenacao propria: comments ja vem filtrado/ordenado de fetchReport
// em ReportPage -- por isso nao existe seletor de ordenacao aqui (nunca
// existiu um pra preservar). O contador de curtidas so aparece quando o
// comentario tem o campo likes/like_count, ja que hoje nao existe curtida de
// comentario no banco -- nao inventamos dado que a API nao fornece.
// "Ver todos os comentarios" faz expand/collapse local (nao ha paginacao
// server-side pra comentarios).
const ReportComments = ({
  comments,
  user,
  newComment,
  setNewComment,
  handleSubmitComment,
  formatDateTime,
}) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? comments : comments.slice(0, COMMENTS_VISIBLE_COUNT);
  const hasMore = comments.length > COMMENTS_VISIBLE_COUNT;

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon name="comment" size={14} className="text-brand" />
        <h2 className="text-xs font-bold text-content-primary">
          Comentários ({comments.length})
        </h2>
      </div>

      <div className="space-y-3">
        {visible.length > 0 ? (
          visible.map((comment) => {
            const likeCount = comment.likes ?? comment.like_count;
            return (
              <div key={comment.id} className="flex items-start gap-3">
                <CommentAvatar
                  name={comment.authorName || comment.author?.name}
                  avatarUrl={comment.author?.avatar_url}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-content-primary truncate">
                      {comment.authorName || comment.author?.name || "Anônimo"}
                    </p>
                    <span className="text-2xs text-content-tertiary flex-shrink-0">
                      {formatDateTime
                        ? formatDateTime(comment.created_at)
                        : null}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2 mt-0.5">
                    <p className="text-xs text-content-secondary break-words leading-relaxed">
                      {comment.text}
                    </p>
                    {typeof likeCount === "number" && (
                      <span className="inline-flex items-center gap-1 text-2xs text-content-tertiary flex-shrink-0">
                        <Heart className="w-3 h-3" strokeWidth={1.75} />
                        {likeCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-content-tertiary text-center py-4">
            Ainda não há comentários.
          </p>
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full text-center text-2xs font-semibold text-brand hover:underline py-1.5 border-t border-edge-subtle"
        >
          {showAll
            ? "Ver menos"
            : `Ver todos os comentários (${comments.length})`}
        </button>
      )}

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
            className="flex-1 text-xs sm:text-sm bg-surface-subtle text-content-primary placeholder:text-content-tertiary px-4 py-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <Button
            type="submit"
            size="icon"
            className="flex-shrink-0 rounded-full bg-brand hover:bg-brand/90 text-content-onBrand"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        </form>
      ) : (
        <div className="mt-4 text-center px-4 py-3 bg-surface-subtle rounded-xl text-xs text-content-tertiary">
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Faça login
          </Link>{" "}
          ou{" "}
          <Link to="/cadastro" className="font-semibold text-brand hover:underline">
            cadastre-se
          </Link>{" "}
          para comentar e acompanhar esta bronca.
        </div>
      )}
    </div>
  );
};

export default ReportComments;
