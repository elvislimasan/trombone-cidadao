import Icon from "@/design-system/icons";
import TimeAgo from "@/components/TimeAgo";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Redesenhado na task 4 da fase 2: titulo em font-display, endereco com icone
// "location" em text-brand, e a secao de autor -- "Denunciado por <nome>" com
// avatar -- que ate entao nao existia aqui apesar de authorName/authorAvatar
// ja virem preenchidos de ReportPage (fetchReport). E adicao, nao
// preservacao: precisa respeitar is_anonymous (bronca anonima nao identifica
// quem denunciou). Segue o mesmo padrao de avatar com fallback de iniciais
// usado em FeedCard (AuthorAvatar).
const AuthorAvatar = ({ name, avatarUrl }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-surface-sunken"
        loading="lazy"
      />
    );
  }
  const initial = (name || "C")[0].toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-surface-sunken text-content-secondary flex items-center justify-center text-2xs font-bold flex-shrink-0 select-none">
      {initial}
    </div>
  );
};

const ReportSummary = ({
  title,
  address,
  createdAt,
  protocol,
  isAnonymous,
  authorName,
  authorAvatar,
}) => {
  const showAuthor = !isAnonymous && !!authorName;

  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-content-primary leading-tight">
        {title}
      </h1>

      {address && (
        <div className="flex items-start gap-1.5 text-sm text-content-secondary">
          <Icon name="location" size={16} className="flex-shrink-0 mt-0.5 text-brand" />
          <span className="leading-snug">{address}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {showAuthor ? (
            <>
              <AuthorAvatar name={authorName} avatarUrl={authorAvatar} />
              <span className="text-xs text-content-secondary truncate">
                Denunciado por{" "}
                <span className="font-semibold text-content-primary">
                  {authorName}
                </span>
              </span>
            </>
          ) : (
            <span className="text-xs text-content-tertiary">
              Denúncia anônima
            </span>
          )}
        </div>

        <TimeAgo date={createdAt} className="text-2xs text-content-tertiary flex-shrink-0" />
      </div>

      {protocol && (
        <span className="inline-flex items-center bg-surface-subtle px-3 py-1 rounded-full font-mono text-2xs font-semibold text-content-secondary tabular-nums">
          #{protocol}
        </span>
      )}
    </div>
  );
};

export default ReportSummary;
