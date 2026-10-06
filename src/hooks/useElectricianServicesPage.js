import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const ELECTRICIAN_SERVICES_PAGE_SIZE = 20;
const EMPTY_COUNTS = { fazer: 0, execucao: 0, conferencia: 0, historico: 0 };
const EMPTY_ITEMS = [];

export function useElectricianServicesPage({ municipalityId, userId, tab, stage, query, sortMode, deferred, showDeferred, enabled = true }) {
  const normalized = query.trim();
  const [term, setTerm] = useState(normalized);
  const [selection, setSelection] = useState({ scope: '', page: 1 });
  const [response, setResponse] = useState(null);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(normalized), 300);
    return () => clearTimeout(timer);
  }, [normalized]);

  const scope = JSON.stringify({ userId, args: {
    p_prefeitura: municipalityId, p_aba: tab, p_etapa: tab === 'minhas' ? stage : 'fazer',
    p_busca: term, p_ordem: sortMode,
    p_adiadas: tab === 'disponiveis' && !showDeferred ? deferred : [],
  } });
  // Uma nova busca sempre começa na primeira página, inclusive ao limpar
  // um filtro e voltar a uma busca que já foi visitada.
  if (selection.scope !== scope) setSelection({ scope, page: 1 });
  const requestedPage = selection.scope === scope ? selection.page : 1;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const { args } = JSON.parse(scope);
    if (!enabled || !args.p_prefeitura) return undefined;
    const controller = new AbortController();
    setPending(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('listar_painel_eletricista', {
          ...args, p_pagina: requestedPage, p_tamanho: ELECTRICIAN_SERVICES_PAGE_SIZE,
        }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) throw error;
        setResponse({ scope, requestedPage, data, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setResponse({ scope, requestedPage, data: null,
          error: error?.message || 'Não foi possível carregar os serviços. Tente atualizar a lista.' });
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    })();
    return () => controller.abort();
  }, [scope, requestedPage, enabled, revision]);

  const current = response?.scope === scope && response.requestedPage === requestedPage ? response : null;
  const total = current?.data?.total || 0;
  const page = current?.data?.page || requestedPage;
  return {
    items: current?.data?.items || EMPTY_ITEMS, total, page,
    pages: Math.max(1, Math.ceil(total / ELECTRICIAN_SERVICES_PAGE_SIZE)),
    stageCounts: current?.data?.stage_counts || EMPTY_COUNTS,
    loading: enabled && (pending || !current || normalized !== term),
    error: current?.error || '', refresh,
    setPage: (next) => setSelection({ scope, page: Math.max(1, next) }),
  };
}
