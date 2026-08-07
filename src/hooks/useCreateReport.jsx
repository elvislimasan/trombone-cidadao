import { useState, useCallback, useEffect, useRef } from 'react';
import React from 'react';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const STORAGE_KEYS = {
  reportsSubmitted: 'tc_reports_submitted_count',
};

const readInt = (value, fallback = 0) => {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return fallback;
};

const AnimatedNumber = ({ value, durationMs = 650, className = '' }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, value]);

  return <span className={className}>{display}</span>;
};

export function useCreateReport({ onCreated } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submittedCount, setSubmittedCount] = useState(() => {
    try {
      return readInt(localStorage.getItem(STORAGE_KEYS.reportsSubmitted), 0);
    } catch {
      return 0;
    }
  });

  const createReport = useCallback(
    async (newReportData, uploadMediaCallback) => {
      if (!user) return;
      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
        city_id: geocodedCityId,
      } = newReportData;

      const normPole = (raw) =>
        String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

      // city_id vem SEMPRE do marcador (resolvido no ReportModal). Nunca usar a
      // cidade do filtro ativo nem a do perfil do usuário — a bronca pertence ao
      // local marcado no mapa.
      const cityId = geocodedCityId ?? null;

      const { data, error } = await supabase
        .from('reports')
        .insert({
          title,
          description,
          category_id: category,
          address,
          location: `POINT(${location.lng} ${location.lat})`,
          author_id: user.id,
          protocol: `TROMB-${Date.now()}`,
          pole_number: category === 'iluminacao' ? pole_number : null,
          pole_id: category === 'iluminacao' ? pole_id : null,
          reported_post_identifier:
            category === 'iluminacao'
              ? normPole(reported_post_identifier) || normPole(pole_number) || null
              : null,
          reported_plate:
            category === 'iluminacao'
              ? normPole(reported_plate) || normPole(pole_number) || null
              : null,
          reported_pole_distance_m:
            category === 'iluminacao' ? reported_pole_distance_m : null,
          issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
          is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
          is_anonymous: !!is_anonymous,
          status: 'pending',
          moderation_status: user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
          city_id: cityId,
        })
        .select('id')
        .single();

      if (error) {
        toast({ title: 'Erro ao criar bronca', description: error.message, variant: 'destructive' });
        return;
      }

      if (uploadMediaCallback) {
        try {
          await uploadMediaCallback(data.id);
        } catch (uploadError) {
          await supabase.from('reports').delete().eq('id', data.id);
          throw uploadError;
        }
      }

      const nextSubmitted = submittedCount + 1;
      setSubmittedCount(nextSubmitted);
      try {
        localStorage.setItem(STORAGE_KEYS.reportsSubmitted, String(nextSubmitted));
      } catch {}

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {}
      }
      try {
        confetti({
          particleCount: 90,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'],
        });
      } catch {}

      const isPublishedDirectly = user?.is_admin || user?.is_master;
      toast({
        title: 'Você acabou de ajudar sua cidade 🔥',
        description: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{isPublishedDirectly ? 'Bronca publicada.' : 'Bronca enviada para moderação — após aprovada, estará disponível no feed.'}</span>
            <span className="text-muted-foreground">
              Total: <AnimatedNumber value={nextSubmitted} className="font-semibold text-foreground" />
            </span>
          </span>
        ),
        duration: 5500,
      });

      onCreated?.(data.id);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [submittedCount, user, toast, onCreated]
  );

  return { createReport, submittedCount };
}

export default useCreateReport;
