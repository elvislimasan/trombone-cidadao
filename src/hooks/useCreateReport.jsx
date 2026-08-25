import { useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMissionProgress } from '@/contexts/MissionProgressContext';

const STORAGE_KEYS = {
  reportsSubmitted: 'tc_reports_submitted_count',
};

const readInt = (value, fallback = 0) => {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return fallback;
};

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Envio cancelado.');
  error.name = 'AbortError';
  throw error;
};

export function useCreateReport({ onCreated } = {}) {
  const { user } = useAuth();
  const { celebrate } = useMissionProgress();
  const [submittedCount, setSubmittedCount] = useState(() => {
    try {
      return readInt(localStorage.getItem(STORAGE_KEYS.reportsSubmitted), 0);
    } catch {
      return 0;
    }
  });

  const createReport = useCallback(
    async (newReportData, uploadMediaCallback, { signal } = {}) => {
      throwIfAborted(signal);
      if (!user) throw new Error('Sua sessão expirou. Entre novamente para enviar a bronca.');
      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
        city_id: geocodedCityId,
        neighborhood,
      } = newReportData;

      const normPole = (raw) =>
        String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

      // city_id vem SEMPRE do marcador (resolvido no ReportModal). Nunca usar a
      // cidade do filtro ativo nem a do perfil do usuário — a bronca pertence ao
      // local marcado no mapa.
      const cityId = geocodedCityId ?? null;

      let insertQuery = supabase
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
          // Bairro do MARCADOR, pela mesma razão do city_id: a bronca pertence ao
          // lugar marcado no mapa, não ao bairro onde quem registra está.
          // Alimenta os títulos e as medalhas de bairro (migração 174).
          neighborhood: neighborhood?.trim() || null,
          status: 'pending',
          moderation_status: user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
          city_id: cityId,
        })
        .select('id')
        .single();

      if (signal && typeof insertQuery.abortSignal === 'function') {
        insertQuery = insertQuery.abortSignal(signal);
      }

      const { data, error } = await insertQuery;

      if (error) {
        throw error;
      }

      try {
        throwIfAborted(signal);
        if (uploadMediaCallback) {
          await uploadMediaCallback(data.id, { signal });
          throwIfAborted(signal);
        }
      } catch (submitError) {
        await supabase.from('reports').delete().eq('id', data.id);
        throw submitError;
      }

      celebrate();

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

      onCreated?.(data.id);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [submittedCount, user, onCreated, celebrate]
  );

  return { createReport, submittedCount };
}

export default useCreateReport;
