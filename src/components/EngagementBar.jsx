import React from 'react';
import Icon from '@/design-system/icons';

const EngagementBar = ({
  upvotes = 0,
  commentsCount = 0,
  isUpvoted = false,
  isFavorited = false,
  onUpvote,
  onComment,
  onShare,
  onBookmark,
  className = '',
}) => (
  <div className={`flex items-center gap-1 px-3 py-1.5 border-t border-edge-subtle ${className}`}>
    <button
      onClick={onUpvote}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
        isUpvoted
          ? 'text-brand bg-brand/10'
          : 'text-content-secondary hover:text-content-primary hover:bg-surface-sunken'
      }`}
      aria-label="Apoiar bronca"
      aria-pressed={isUpvoted}
    >
      <Icon name="support" size={16} />
      <span className="text-xs tabular-nums">{upvotes > 0 ? upvotes : ''}</span>
    </button>

    <button
      onClick={onComment}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-sunken transition-colors"
      aria-label="Ver comentários"
    >
      <Icon name="comment" size={16} />
      <span className="text-xs tabular-nums">{commentsCount > 0 ? commentsCount : ''}</span>
    </button>

    <button
      onClick={onShare}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-sunken transition-colors"
      aria-label="Compartilhar"
    >
      <Icon name="share" size={16} />
    </button>

    <button
      onClick={onBookmark}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ml-auto text-sm transition-colors active:scale-95 ${
        isFavorited
          ? 'text-accentHighlight'
          : 'text-content-secondary hover:text-content-primary hover:bg-surface-sunken'
      }`}
      aria-label="Salvar nos favoritos"
      aria-pressed={isFavorited}
    >
      <Icon name="save" size={16} className={isFavorited ? 'fill-current' : ''} />
    </button>
  </div>
);

export default React.memo(EngagementBar);
