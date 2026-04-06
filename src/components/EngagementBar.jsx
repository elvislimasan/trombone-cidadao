import React from 'react';
import { ThumbsUp, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { motion } from 'framer-motion';

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
}) => {
  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 border-t border-border/60 ${className}`}>
      {/* Apoiar */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={onUpvote}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isUpvoted
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
        aria-label="Apoiar bronca"
      >
        <ThumbsUp
          size={16}
          className={isUpvoted ? 'fill-primary' : ''}
        />
        <span className="text-xs">{upvotes > 0 ? upvotes : ''}</span>
      </motion.button>

      {/* Comentar */}
      <button
        onClick={onComment}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Ver comentários"
      >
        <MessageCircle size={16} />
        <span className="text-xs">{commentsCount > 0 ? commentsCount : ''}</span>
      </button>

      {/* Compartilhar */}
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Compartilhar"
      >
        <Share2 size={16} />
      </button>

      {/* Salvar */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={onBookmark}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ml-auto text-sm transition-colors ${
          isFavorited
            ? 'text-yellow-500'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
        aria-label="Salvar nos favoritos"
      >
        <Bookmark size={16} className={isFavorited ? 'fill-yellow-500' : ''} />
      </motion.button>
    </div>
  );
};

export default EngagementBar;
