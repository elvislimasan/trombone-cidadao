// hooks/useUpvote.js - ATUALIZADO PARA ASSINATURAS
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';

export const useUpvote = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const handleUpvote = useCallback(async (reportId, currentUpvotes = 0, currentUserHasUpvoted = false) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login', { state: { from: location } });
      return { 
        success: false, 
        action: null,
        error: 'Usuário não autenticado' 
      };
    }

    setLoading(true);

    try {
  
      // Verificar se o usuário já assinou esta bronca
      const { data: existingSignature, error: checkError } = await supabase
        .from('signatures')
        .select('id')
        .eq('report_id', reportId)
        .eq('user_id', user.id);

      if (checkError) {
        console.error('Erro ao verificar assinatura:', checkError);
        throw new Error(`Erro ao verificar apoio: ${checkError.message}`);
      }


      let action;
      let newUpvotes;
      let newUserHasUpvoted;

      // Se já existe uma assinatura, remover (cancelar assinatura)
      if (existingSignature && existingSignature.length > 0) {
        
        const { error: deleteError } = await supabase
          .from('signatures')
          .delete()
          .eq('report_id', reportId)
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Erro ao deletar assinatura:', deleteError);
          throw new Error(`Erro ao remover apoio: ${deleteError.message}`);
        }

        action = 'removed';
        newUpvotes = Math.max(0, currentUpvotes - 1);
        newUserHasUpvoted = false;
        
      } else {

        
        const { error: insertError } = await supabase
          .from('signatures')
          .insert({ 
            report_id: reportId, 
            user_id: user.id 
          });

        if (insertError) {
          console.error('Erro ao inserir assinatura:', insertError);
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
