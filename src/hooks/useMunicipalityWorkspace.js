import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { enabledMunicipalCategories, filterMunicipalCategories } from '@/lib/municipalCategories';

const empty = { loading: true, municipality: null, memberships: [], channels: [], categories: [], enabledCategoryIds: [], categoryChannels: [], members: [], serviceRules: [], editableChannelIds: [], electricianChannelIds: [], isElectrician: false, isAdministrator: false, canEdit: false, canEditLighting: false, error: '' };
export const WORKSPACE_EVENT = 'municipality-workspace-changed';
const workspaceKey = (userId) => 'municipality-workspace:' + userId;
export function selectMunicipalityWorkspace(userId, id) {
  try { window.localStorage.setItem(workspaceKey(userId), id); } catch { /* Selection still applies to this tab. */ }
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { id } }));
}
export default function useMunicipalityWorkspace() {
  const { user } = useAuth();
  const [state, setState] = useState(empty);
  const [revision, setRevision] = useState(0);
  const [chosenId, setChosenId] = useState('');
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const update = (event) => { if (event.detail?.id) setChosenId(event.detail.id); refresh(); };
    window.addEventListener(WORKSPACE_EVENT, update);
    return () => window.removeEventListener(WORKSPACE_EVENT, update);
  }, [refresh]);
  useEffect(() => {
    if (!user?.id) { setState({ ...empty, loading: false }); return undefined; }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    (async () => {
      try {
        const { data: memberships, error } = await supabase.from('prefeitura_membros')
          .select('papel, prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(id,city_id,nome,status,categorias_habilitadas,cidade:cities(name,states(uf)))')
          .eq('user_id', user.id).eq('ativo', true);
        if (error) throw error;
        const available = (memberships || []).filter((item) => item.prefeitura?.status === 'ativa');
        let preference = chosenId;
        try { preference ||= window.localStorage.getItem(workspaceKey(user.id)); } catch { /* Storage is optional. */ }
        const membership = available.find((item) => item.prefeitura.id === preference) || available[0];
        if (!membership) { if (active) setState({ ...empty, loading: false, userId: user.id }); return; }
        const cityId = membership.prefeitura.city_id;
        const [channels, categories, members, mappings, rules] = await Promise.all([
          supabase.from('orgao_canais').select('id,nome,city_id,ativo,canal_triagem').eq('city_id', cityId).eq('canal_triagem', false).order('nome'),
          supabase.from('categories').select('id,name').order('name'),
          supabase.from('orgao_membros').select('canal_id,user_id,papel,ativo,perfil:profiles!orgao_membros_user_id_fkey(name)').eq('ativo', true),
          supabase.from('orgao_categorias').select('canal_id,category_id').eq('city_id', cityId),
          supabase.from('prefeitura_servico_regras').select('*').eq('prefeitura_id', membership.prefeitura.id),
        ]);
        const failure = [channels, categories, members, mappings, rules].find((result) => result.error)?.error;
        if (failure) throw failure;
        const channelIds = new Set((channels.data || []).map((channel) => String(channel.id)));
        const cityMembers = (members.data || []).filter((member) => channelIds.has(String(member.canal_id)));
        const roles = cityMembers.filter((member) => member.user_id === user.id);
        const lightingIds = new Set((mappings.data || []).filter((item) => item.category_id === 'iluminacao').map((item) => String(item.canal_id)));
        const isAdministrator = membership.papel === 'administrador';
        const editableChannelIds = isAdministrator ? [...channelIds] : roles.filter((role) => ['gestor', 'operador'].includes(role.papel)).map((role) => String(role.canal_id));
        const electricianChannelIds = roles.filter((role) => role.papel === 'eletricista').map((role) => String(role.canal_id));
        if (active) setState({
          loading: false, userId: user.id, municipality: membership.prefeitura, memberships: available,
          channels: channels.data || [], categories: filterMunicipalCategories(categories.data, membership.prefeitura),
          enabledCategoryIds: enabledMunicipalCategories(membership.prefeitura), categoryChannels: mappings.data || [], members: cityMembers,
          serviceRules: rules.data || [], isAdministrator, editableChannelIds, electricianChannelIds,
          isElectrician: !isAdministrator && editableChannelIds.length === 0 && electricianChannelIds.length > 0,
          canEdit: isAdministrator || editableChannelIds.length > 0,
          canEditLighting: enabledMunicipalCategories(membership.prefeitura).includes('iluminacao')
            && (isAdministrator || roles.some((role) => lightingIds.has(String(role.canal_id)) && role.papel === 'gestor')), error: '',
        });
      } catch (error) {
        if (active) setState({ ...empty, loading: false, userId: user.id, error: ['42P01', 'PGRST205'].includes(error.code) ? 'O banco precisa da atualização do fluxo de atendimento municipal (migração 275).' : error.message });
      }
    })();
    return () => { active = false; };
  }, [user?.id, revision, chosenId]);
  return { ...state, userName: user?.name || user?.user_metadata?.name || '', refresh };
}
