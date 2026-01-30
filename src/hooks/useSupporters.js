import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const useSupporters = (reportId) => {
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSupporters = useCallback(async () => {
    if (!reportId) return;
    
    try {
        setLoading(true);
        
        // Fetch Donations (Paid only)
        // Using the FK to profiles we created
        const { data: donations, error: donationsError } = await supabase
            .from('donations')
            .select(`
                amount,
                created_at,
                user_id,
                profiles (name, avatar_url)
            `)
            .eq('report_id', reportId)
            .eq('status', 'paid')
            .order('created_at', { ascending: false })
            .limit(10);

        if (donationsError) {
            console.error("Error fetching donations:", donationsError);
        }

        // Fetch Recent Signatures
        // Signatures might have user_id (linked to profiles) or just name (if we allow anonymous/unregistered signing later, but currently RLS requires auth)
        const { data: signatures, error: signaturesError } = await supabase
            .from('signatures')
            .select(`
                created_at,
                user_id,
                name,
                city,
                is_public,
                profiles:user_id (name, avatar_url)
            `)
            .eq('report_id', reportId)
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (signaturesError) {
            console.error("Error fetching signatures:", signaturesError);
        }

        // Merge and format
        const formattedDonations = (donations || []).map(d => ({
            id: `don-${d.created_at}`,
            type: 'donation',
            name: d.profiles?.name || 'Anônimo',
            avatar: d.profiles?.avatar_url,
            action: `turbinou com R$ ${(d.amount / 100).toFixed(0)}`,
            date: new Date(d.created_at)
        }));

        const formattedSignatures = (signatures || []).map(s => ({
            id: `sig-${s.created_at}`,
            type: 'signature',
            name: s.is_public ? (s.profiles?.name || s.name || 'Anônimo') : 'Um apoiador',
            avatar: s.is_public ? s.profiles?.avatar_url : null,
            action: 'assinou agora mesmo',
            date: new Date(s.created_at),
            city: s.is_public ? s.city : null
        }));

        // Combine and sort by date desc
        const allSupporters = [...formattedDonations, ...formattedSignatures]
            .sort((a, b) => b.date - a.date)
            .slice(0, 5); // Show top 5 recent activities

        setSupporters(allSupporters);
    } catch (error) {
        console.error("Error fetching supporters:", error);
    } finally {
        setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchSupporters();

    // Realtime subscription
    const channel = supabase
      .channel(`supporters-${reportId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'donations', filter: `report_id=eq.${reportId}` }, () => {
        fetchSupporters();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signatures', filter: `report_id=eq.${reportId}` }, () => {
        fetchSupporters();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportId, fetchSupporters]);

  return { supporters, loading };
};
