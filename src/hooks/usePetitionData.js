import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '../lib/customSupabaseClient';

/**
 * Custom hook to manage petition data fetching and state.
 * Handles fetching petition details, signatures, user status, updates, and related petitions.
 *
 * @param {string} id - The UUID of the petition to fetch
 * @returns {Object} An object containing all petition data and state setters
 * @property {Object|null} petition - The petition details object
 * @property {Array} signatures - List of signatures for the petition
 * @property {boolean} loading - Loading state indicator
 * @property {Object|null} user - The current logged-in user
 * @property {boolean} hasSigned - Whether the current user has signed the petition
 * @property {Function} setHasSigned - Setter for hasSigned state
 * @property {Array} updates - List of updates posted for the petition
 * @property {Array} otherPetitions - List of related petitions
 * @property {Array} recentDonations - List of recent donations (mocked or real)
 * @property {Function} refreshData - Function to reload all data
 * @property {Function} setSignatures - Setter for signatures state
 */
export const usePetitionData = (id) => {
  const [petition, setPetition] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [hasSigned, setHasSigned] = useState(false);
  const [updates, setUpdates] = useState([]);
  const [otherPetitions, setOtherPetitions] = useState([]);
  const [recentDonations, setRecentDonations] = useState([]);
  const [totalDonations, setTotalDonations] = useState(0);
  const { toast } = useToast();

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    return user;
  };

  const fetchPetition = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('petitions')
        .select(`
          *,
          petition_updates (
            id,
            title,
            content,
            image_url,
            created_at
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      setPetition({
        ...data,
        goal: data.goal || 1000,
        signatureCount: data.current_signatures || 0
      });
      
      if (data.petition_updates) {
        setUpdates(data.petition_updates);
      }

    } catch (error) {
      console.error('Erro ao carregar abaixo-assinado:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar os detalhes do abaixo-assinado."
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  const fetchSignatures = useCallback(async (currentUser) => {
    try {
      const { data, error } = await supabase
        .from('signatures')
        .select('*')
        .eq('petition_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSignatures(data);

      if (currentUser) {
        const userSignature = data.find(s => s.user_id === currentUser.id);
        if (userSignature) setHasSigned(true);
      }

    } catch (error) {
      console.error('Erro ao carregar assinaturas:', error);
    }
  }, [id]);

  const fetchDonations = useCallback(async () => {
    try {
      const { data: donations, error } = await supabase
        .from('donations')
        .select('amount, created_at, user_id, profiles(name)')
        .eq('petition_id', id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      setRecentDonations(donations || []);

      const { data: totalData, error: totalError } = await supabase
        .from('donations')
        .select('amount')
        .eq('petition_id', id)
        .eq('status', 'paid');

      if (totalError) throw totalError;

      const totalAmount = totalData
        ? totalData.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
        : 0;

      setTotalDonations(totalAmount);
    } catch (error) {
      console.error('Erro ao carregar doações:', error);
    }
  }, [id]);

  const fetchOtherPetitions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('petitions')
        .select('*')
        .neq('id', id)
        .limit(6);

      if (error) throw error;
      setOtherPetitions(data);
    } catch (error) {
      console.error('Erro ao carregar outros abaixo-assinados:', error);
    }
  }, [id]);

  const refreshData = async () => {
      const currentUser = await fetchUser();
      await fetchPetition();
      await fetchSignatures(currentUser);
      await fetchOtherPetitions();
      await fetchDonations();
  };

  useEffect(() => {
    refreshData();
  }, [id, fetchPetition, fetchSignatures, fetchOtherPetitions, fetchDonations]);

  return {
    petition,
    signatures,
    loading,
    user,
    hasSigned,
    setHasSigned,
    updates,
    otherPetitions,
    recentDonations,
    totalDonations,
    refreshData,
    setSignatures // Exporting this to allow optimistic updates
  };
};
