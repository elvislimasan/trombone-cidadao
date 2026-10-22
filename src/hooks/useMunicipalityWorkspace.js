import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { enabledMunicipalCategories, filterMunicipalCategories } from '@/lib/municipalCategories';
import { PERMISSIONS_CHANGED_EVENT, PERMISSIONS_STORAGE_KEY } from '@/lib/permissionUpdates';
import { municipalCapabilities, assertMunicipalWorkspaceIdentity, municipalWorkspaceChannel } from '@/lib/municipalAccess';

const empty = { loading: true, refreshing: false, municipality: null, memberships: [], channels: [], categories: [], enabledCategoryIds: [], reportCreationCategoryIds: [], categoryChannels: [], members: [], serviceRules: [], accesses: [], activeChannelId: '', ...municipalCapabilities([]), isElectrician: false, isAdministrator: false, canEdit: false, error: '' };
const WorkspaceContext = createContext(empty);
export const WORKSPACE_EVENT = 'municipality-workspace-changed';
const workspaceKey = userId => 'municipality-workspace:' + userId;
export function selectMunicipalityWorkspace(userId, id) {
  try { window.localStorage.setItem(workspaceKey(userId), id); } catch { /* Optional preference. */ }
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { id } }));
}
export function MunicipalityWorkspaceProvider({ children }) {
  const { user } = useAuth();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const explicitCity = new URLSearchParams(search).get('cidade');
  const requestedChannel = new URLSearchParams(search).get('secretaria');
  const [state, setState] = useState(empty);
  const [revision, setRevision] = useState(0);
  const [chosenId, setChosenId] = useState('');
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const update = event => { if (event.detail?.id) setChosenId(event.detail.id); refresh(); };
    window.addEventListener(WORKSPACE_EVENT, update);
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, refresh);
    const storage = event => { if (event.key === PERMISSIONS_STORAGE_KEY) refresh(); };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(WORKSPACE_EVENT, update); window.removeEventListener(PERMISSIONS_CHANGED_EVENT, refresh); window.removeEventListener('focus', refresh); window.removeEventListener('storage', storage); };
  }, [refresh]);
  useEffect(() => {
    if (!user?.id) { setState({ ...empty, loading: false }); return undefined; }
    let active = true;
    // Voltar da galeria/câmera devolve o foco e revalida os vínculos. No mesmo
    // contexto, manter a página montada preserva o formulário e seu input file.
    // Uma troca de conta, cidade ou secretaria continua limpando o acesso.
    setState(current => {
      const sameContext = current.userId === user.id && current.municipality
        && (!explicitCity || String(current.municipality.city_id) === String(explicitCity))
        && (requestedChannel === null || current.activeChannelId === municipalWorkspaceChannel(pathname, current.isAdministrator, requestedChannel))
        && (explicitCity || !chosenId || current.municipality.id === chosenId);
      return sameContext ? { ...current, refreshing: true } : { ...empty, userId: user.id };
    });
    (async () => {
      try {
        const { data, error } = await supabase.rpc('municipal_execution_workspace');
        if (error) throw error;
        assertMunicipalWorkspaceIdentity(data, user.id);
        if (data.execution_contract !== 1) throw new Error('Atualize o banco com as migrações 377 e 378 dos executores.');
        const available = data.memberships || [];
        let preference = chosenId;
        try { preference ||= window.localStorage.getItem(workspaceKey(user.id)); } catch { /* Optional preference. */ }
        const membership = explicitCity ? available.find(row => String(row.prefeitura.city_id) === String(explicitCity))
          : available.find(row => row.prefeitura.id === preference) || available[0];
        if (!membership) {
          if (active) setState({ ...empty, loading: false, userId: user.id, error: explicitCity ? 'Sem vínculo municipal nesta cidade.' : '' });
          return;
        }
        const municipality = membership.prefeitura;
        const accesses = (data.accesses || []).filter(row => String(row.city_id) === String(municipality.city_id));
        const isAdministrator = membership.papel === 'administrador';
        const channels = (data.channels || []).filter(row => String(row.city_id) === String(municipality.city_id));
        let selectedChannel = municipalWorkspaceChannel(pathname, isAdministrator, requestedChannel);
        const channelKey = 'municipality-channel:' + user.id + ':' + municipality.id;
        if (selectedChannel === null) {
          try { selectedChannel = window.localStorage.getItem(channelKey) || ''; } catch { selectedChannel = ''; }
          if (!channels.some(row => String(row.id) === selectedChannel)) selectedChannel = '';
        }
        try { window.localStorage.setItem(channelKey, selectedChannel); window.localStorage.setItem(workspaceKey(user.id), municipality.id); } catch { /* Optional preferences. */ }
        if (selectedChannel && !channels.some(row => String(row.id) === selectedChannel)) throw new Error('Secretaria indisponível para esta conta.');
        const caps = municipalCapabilities(accesses, isAdministrator, selectedChannel);
        const [categories, members, mappings, rules] = await Promise.all([
          supabase.from('categories').select('id,name').order('name'),
          channels.length ? supabase.from('orgao_membros').select('canal_id,user_id,papel,ativo,perfil:profiles!orgao_membros_user_id_fkey(name)').eq('ativo', true).in('canal_id', channels.map(row => row.id)) : Promise.resolve({ data: [] }),
          Promise.resolve({ data: (data.category_channels || []).filter(row => String(row.city_id) === String(municipality.city_id)) }),
          caps.canReadAttendance ? supabase.from('prefeitura_servico_regras').select('*').eq('prefeitura_id', municipality.id) : Promise.resolve({ data: [] }),
        ]);
        const failure = [categories, members, mappings, rules].find(result => result.error)?.error;
        if (failure) throw failure;
        const scopeChannels = selectedChannel ? channels.filter(row => String(row.id) === selectedChannel) : channels;
        const categoryIds = enabledMunicipalCategories(municipality).filter(id => (isAdministrator && !selectedChannel) || (mappings.data || []).some(mapping => mapping.category_id === id && scopeChannels.some(channel => channel.id === mapping.canal_id)));
        // O filtro da listagem não limita o cadastro do administrador geral.
        // Funcionários continuam cadastrando somente nas categorias do seu contexto.
        const reportCreationCategoryIds = isAdministrator ? enabledMunicipalCategories(municipality) : categoryIds;
        if (active) setState({
          loading: false, refreshing: false, userId: user.id, municipality, memberships: available, accesses,
          channels: selectedChannel ? channels.filter(row => String(row.id) === selectedChannel) : channels,
          allChannels: channels, activeChannelId: selectedChannel,
          categories: filterMunicipalCategories(categories.data, municipality).filter(category => categoryIds.includes(category.id)), enabledCategoryIds: categoryIds, reportCreationCategoryIds,
          categoryChannels: mappings.data || [], members: (members.data || []).map(member => ({ ...member, especialidades_execucao: (data.execution_team || []).find(row => row.user_id === member.user_id && row.canal_id === member.canal_id)?.especialidades_execucao || [] })), serviceRules: rules.data || [],
          inventoryModules: [...(data.inventories || []), ...(data.inventory_views || [])].filter(row => String(row.city_id) === String(municipality.city_id) && (!selectedChannel || row.canal_id === selectedChannel)).map(row => row.module),
          executionActivities: (data.execution_activities || []).filter(row => String(row.city_id) === String(municipality.city_id) && (!selectedChannel || row.canal_id === selectedChannel)),
          ...caps, isAdministrator, isElectrician: caps.canExecuteLighting, canEdit: caps.canReceive,
          canViewLighting: categoryIds.includes('iluminacao') && (caps.canReadAttendance || caps.canEditLighting || caps.canExecuteLighting),
          canEditLighting: categoryIds.includes('iluminacao') && caps.canEditLighting, error: '',
        });
      } catch (error) {
        if (active) setState({ ...empty, loading: false, userId: user.id, error: ['42883', 'PGRST202'].includes(error.code) ? 'Atualize o banco com as migrações do painel por responsabilidades.' : error.message });
      }
    })();
    return () => { active = false; };
  }, [user?.id, revision, chosenId, explicitCity, requestedChannel, pathname]);
  const valid = state.userId === user?.id && (!explicitCity || !state.municipality || String(state.municipality.city_id) === String(explicitCity)) && (requestedChannel === null || !state.municipality || state.activeChannelId === municipalWorkspaceChannel(pathname, state.isAdministrator, requestedChannel)) && (explicitCity || !chosenId || !state.municipality || state.municipality.id === chosenId);
  useEffect(() => {
    // Essas telas não oferecem filtro de secretaria. Limpa links legados sem
    // remover filtros visíveis como categoria, fase, bairro e visibilidade.
    if (!valid || state.loading || !state.isAdministrator || requestedChannel === null
      || !/^\/prefeitura\/(broncas|mapa|visao-geral)(\/|$)/.test(pathname)) return;
    const params = new URLSearchParams(search);
    params.delete('secretaria');
    navigate({ pathname, search: params.size ? '?' + params : '', hash }, { replace: true });
  }, [valid, state.loading, state.isAdministrator, requestedChannel, pathname, search, hash, navigate]);
  const value = { ...(valid ? state : empty), userName: user?.name || '', refresh };
  return React.createElement(WorkspaceContext.Provider, { value }, children);
}
export default function useMunicipalityWorkspace() { return useContext(WorkspaceContext); }
