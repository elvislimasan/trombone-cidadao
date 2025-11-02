// hooks/useUpvote.js - VERSÃO MELHORADA
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';

export const useUpvote = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleUpvote = useCallback(async (reportId, currentUpvotes = 0, currentUserHasUpvoted = false) => {
    if (!user) {
      return { 
        success: false, 
        action: null,
        error: 'Usuário não autenticado' 
      };
    }

    setLoading(true);

    try {
  
      // Verificar se o usuário já apoiou esta bronca
      const { data: existingUpvote, error: checkError } = await supabase
        .from('upvotes')
        .select('id')
        .eq('report_id', reportId)
        .eq('user_id', user.id);

      if (checkError) {
        console.error('Erro ao verificar upvote:', checkError);
        throw new Error(`Erro ao verificar apoio: ${checkError.message}`);
      }


      let action;
      let newUpvotes;
      let newUserHasUpvoted;

      // Se já existe um upvote, remover
      if (existingUpvote && existingUpvote.length > 0) {
        
        const { error: deleteError } = await supabase
          .from('upvotes')
          .delete()
          .eq('report_id', reportId)
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Erro ao deletar upvote:', deleteError);
          throw new Error(`Erro ao remover apoio: ${deleteError.message}`);
        }

        action = 'removed';
        newUpvotes = Math.max(0, currentUpvotes - 1);
        newUserHasUpvoted = false;
        
      } else {

        
        const { error: insertError } = await supabase
          .from('upvotes')
          .insert({ 
            report_id: reportId, 
            user_id: user.id 
          });

        if (insertError) {
          console.error('Erro ao inserir upvote:', insertError);
          throw new Error(`Erro ao apoiar: ${insertError.message}`);
        }

        action = 'added';
        newUpvotes = currentUpvotes + 1;
        newUserHasUpvoted = true;
        
      }

      setLoading(false);
      return { 
        success: true, 
        action, 
        newUpvotes, 
        newUserHasUpvoted 
      };

    } catch (error) {
      console.error('Erro geral no handleUpvote:', error);
      setLoading(false);
      return { 
        success: false, 
        action: null,
        error: error.message 
      };
    }
  }, [user]);

  return {
    handleUpvote,
    loading
  };
};