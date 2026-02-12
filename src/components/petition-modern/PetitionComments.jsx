import PropTypes from 'prop-types';
import { MessageSquare, Send } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Component for displaying and posting comments on a petition.
 * Features a sorting toggle (newest/oldest) and comment input area.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} [props.user] - The current logged-in user
 * @param {Array} props.comments - List of signature objects with comments
 * @param {string} props.commentSort - Current sort order ('newest' or 'oldest')
 * @param {Function} props.setCommentSort - State setter for sort order
 * @param {string} props.newComment - Current value of the new comment input
 * @param {Function} props.setNewComment - State setter for new comment input
 * @param {Function} props.onPostComment - Handler to submit a new comment
 * @returns {JSX.Element} The rendered comments section
 */
const PetitionComments = ({
  user,
  comments,
  commentSort,
  setCommentSort,
  newComment,
  setNewComment,
  onPostComment
}) => {
  const { toast } = useToast();

  const handlePost = () => {
    if (!newComment.trim()) return;
    onPostComment(newComment);
    setNewComment('');
    toast({ title: "Comentário enviado", description: "Obrigado por compartilhar sua opinião!" });
  };

  return (
    <Card className="border shadow-sm bg-white" data-testid="petition-comments">
      <CardContent className="p-3 md:p-4 space-y-4 md:space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 border-b pb-1.5 md:pb-2">
            <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h3 className="text-base md:text-lg font-bold">O que as pessoas estão dizendo</h3>
          </div>
          <ToggleGroup type="single" value={commentSort} onValueChange={(val) => val && setCommentSort(val)} className="justify-start">
            <ToggleGroupItem 
              value="newest" 
              aria-label="Mais recentes" 
              className="text-[10px] md:text-xs font-medium border-b-2 border-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary rounded-none px-2 py-0.5 md:py-1"
            >
              Recentes
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="oldest" 
              aria-label="Mais antigos" 
              className="text-[10px] md:text-xs font-medium border-b-2 border-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary rounded-none px-2 py-0.5 md:py-1"
            >
              Antigos
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Comments List */}
        <div className="grid gap-2 md:gap-3">
          {comments.length > 0 ? (
            comments
              .sort((a, b) => {
                  const dateA = new Date(a.created_at);
                  const dateB = new Date(b.created_at);
                  return commentSort === 'newest' ? dateB - dateA : dateA - dateB;
              })
              .map((sig, i) => (
              <div key={i} className="flex gap-2 md:gap-3 p-3 md:p-4 rounded-xl bg-white border shadow-sm hover:shadow-md transition-all">
                <Avatar className="w-8 h-8 md:w-10 md:h-10 border-2 border-background ring-2 ring-primary/10 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-[10px] md:text-xs">
                    {sig.is_public ? (sig.name ? sig.name.substring(0, 2).toUpperCase() : 'AN') : 'AN'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1 w-full">
                  <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                    <span className="font-semibold text-[12px] md:text-sm text-foreground">
                      {sig.is_public ? (sig.name || 'Anônimo') : 'Apoiador Anônimo'}
                    </span>
                    <span className="text-[10px] md:text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sig.city || 'Brasil'}</span>
                    <span className="text-[10px] md:text-xs text-muted-foreground">• {formatDistanceToNow(new Date(sig.created_at), { addSuffix: true, locale: ptBR })}</span>
                  </div>
                  {sig.comment && (
                    <p className="text-[12px] md:text-sm text-foreground/80 leading-relaxed">"{sig.comment}"</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 bg-muted/20 rounded-xl border border-dashed">
               <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
               <p className="text-sm text-muted-foreground italic">Seja o primeiro a deixar um comentário!</p>
            </div>
          )}
        </div>

        {/* Input Section - Standard Layout but at Bottom */}
        <div className="flex gap-3 items-start pt-4 border-t">
          <Avatar className="w-10 h-10 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
              {user ? (user.user_metadata?.name ? user.user_metadata.name.substring(0, 2).toUpperCase() : 'EU') : 'EU'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea 
              placeholder="Eu estou assinando porque..." 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px] bg-background resize-none focus-visible:ring-primary text-sm p-3 rounded-xl border-border"
            />
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={handlePost}
                disabled={!newComment.trim()}
                className="font-bold gap-2 px-4"
              >
                <Send className="w-3 h-3" />
                Publicar Comentário
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

PetitionComments.propTypes = {
  user: PropTypes.object,
  comments: PropTypes.array.isRequired,
  commentSort: PropTypes.string.isRequired,
  setCommentSort: PropTypes.func.isRequired,
  newComment: PropTypes.string.isRequired,
  setNewComment: PropTypes.func.isRequired,
  onPostComment: PropTypes.func.isRequired,
};

export default PetitionComments;
