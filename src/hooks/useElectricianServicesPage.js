import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const ELECTRICIAN_SERVICES_PAGE_SIZE = 20;
const EMPTY_COUNTS = { fazer: 0, execucao: 0, conferencia: 0, historico: 0 };
const EMPTY_ITEMS = [];

export function useExecutorServicesPage({ municipalityId, userId, tab, stage, query, sortMode, deferred, showDeferred, enabled = true, activity, channelId, all = false, includeAvailable = false }) {
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

  const scope = JSON.stringify({ userId, rpc: activity ? 'listar_painel_executor' : 'listar_painel_eletricista', all, includeAvailable, args: {
    ...(activity ? { p_especialidade: activity, p_canal: channelId || null } : {}),
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
    const { args, rpc, all: loadAll, includeAvailable: combinedMap } = JSON.parse(scope);
    if (!enabled || !args.p_prefeitura) return undefined;
    const controller = new AbortController();
    setPending(true);
    (async () => {
      try {
        const load = async (requestArgs) => {
          const { data, error } = await supabase.rpc(rpc, {
            ...requestArgs, p_pagina: loadAll ? 1 : requestedPage, p_tamanho: loadAll ? 100 : ELECTRICIAN_SERVICES_PAGE_SIZE,
          }).abortSignal(controller.signal);
          if (error) throw error;
          if (controller.signal.aborted) return null;
          if (loadAll) {
            const items = [...(data.items || [])];
            for (let nextPage = 2; items.length < data.total; nextPage++) {
              const next = await supabase.rpc(rpc, { ...requestArgs, p_pagina: nextPage, p_tamanho: 100 }).abortSignal(controller.signal);
              if (next.error) throw next.error;
              if (controller.signal.aborted) return null;
              if (!next.data?.items?.length) throw new Error('A lista de serviços mudou durante a consulta. Atualize o mapa.');
              items.push(...next.data.items);
            }
            return { ...data, items };
          }
          return data;
        };
        let data;
        if (combinedMap) {
          const pages = await Promise.all(['minhas', 'disponiveis'].map(p_aba => load({ ...args, p_aba, p_etapa: 'todas', p_adiadas: [] })));
          if (controller.signal.aborted) return;
          const unique = new Map(pages.flatMap(result => result.items || [])
            .filter(item => !['concluida', 'cancelada', 'recusada'].includes(item.status))
            .map(item => [`${item.tipo}:${item.id}`, item]));
          data = { ...pages[0], items: [...unique.values()], total: unique.size, page: 1 };
        } else data = await load(args);
        if (controller.signal.aborted) return;
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

export const useElectricianServicesPage = useExecutorServicesPage;
