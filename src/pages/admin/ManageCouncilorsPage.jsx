import { useCallback, useMemo, useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Landmark, Loader2, Pencil, PlusCircle, Search, ShieldCheck, User, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CityCombobox from '@/components/CityCombobox';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, FormDialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import CouncilorPhotoUploader from '@/components/CouncilorPhotoUploader';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { autoresDaRua, chaveDeAutor, rotaDoVereador, slugDeVereador } from '@/lib/pavementStreetHistory';

const EMPTY_FORM = {
  city_id: '',
  name: '',
  nickname: '',
  photo_url: '',
  party: '',
  biography: '',
  phone: '',
  email: '',
  instagram_url: '',
  is_in_office: '',
  user_id: '',
  verified: false,
};

const nullable = (value) => String(value || '').trim() || null;

export default function ManageCouncilorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [councilors, setCouncilors] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [linkRequests, setLinkRequests] = useState([]);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [councilorsResult, streetsResult, profilesResult, requestsResult] = await Promise.all([
      supabase.from('councilors').select('*, city:cities(name, states(uf))').order('name'),
      supabase.from('pavement_streets').select('id, city_id, historical_documents'),
      supabase.from('profiles').select('id, name, username, avatar_url, city_id').order('name'),
      supabase.from('councilor_link_requests').select('id, councilor_id, requester_id, status, created_at').eq('status', 'pending').order('created_at'),
    ]);

    if (councilorsResult.error) {
      showAppError({
        title: 'Não foi possível carregar os vereadores',
        description: `${councilorsResult.error.message}. Confira se a migration 243 foi aplicada.`,
        variant: 'destructive',
      });
      setCouncilors([]);
    } else {
      const linkedCounts = new Map();
      (streetsResult.data || []).forEach((street) => {
        new Set(autoresDaRua(street).map(chaveDeAutor)).forEach((authorKey) => {
          const key = `${street.city_id}:${authorKey}`;
          linkedCounts.set(key, (linkedCounts.get(key) || 0) + 1);
        });
      });
      const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
      setCouncilors((councilorsResult.data || []).map((councilor) => ({
        ...councilor,
        manager: profilesById.get(councilor.user_id) || null,
        linked_streets: linkedCounts.get(`${councilor.city_id}:${councilor.normalized_name}`) || 0,
      })));
    }

    if (profilesResult.error) {
      showAppError({ title: 'Não foi possível carregar as contas', description: profilesResult.error.message, variant: 'destructive' });
      setProfiles([]);
    } else {
      setProfiles(profilesResult.data || []);
    }
    if (requestsResult.error) {
      showAppError({ title: 'Não foi possível carregar as solicitações de vínculo', description: `${requestsResult.error.message}. Confira se a migration 247 foi aplicada.`, variant: 'destructive' });
      setLinkRequests([]);
    } else {
      const councilorsById = new Map((councilorsResult.data || []).map((item) => [item.id, item]));
      const profilesById = new Map((profilesResult.data || []).map((item) => [item.id, item]));
      setLinkRequests((requestsResult.data || []).map((request) => ({
        ...request,
        councilor: councilorsById.get(request.councilor_id) || null,
        requester: profilesById.get(request.requester_id) || null,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const linkableProfiles = useMemo(() => {
    const linkedElsewhere = new Set(councilors
      .filter((item) => item.id !== editing?.id && item.user_id)
      .map((item) => item.user_id));
    return profiles.filter((profile) => !linkedElsewhere.has(profile.id));
  }, [councilors, editing?.id, profiles]);

  const filtered = useMemo(() => {
    const term = chaveDeAutor(search);
    return councilors.filter((councilor) => {
      if (cityFilter !== 'all' && String(councilor.city_id) !== cityFilter) return false;
      if (!term) return true;
      const cityName = `${councilor.city?.name || ''} ${councilor.city?.states?.uf || ''}`;
      return [councilor.name, councilor.nickname, councilor.party, cityName, councilor.manager?.name, councilor.manager?.username].some((value) => chaveDeAutor(value).includes(term));
    });
  }, [councilors, search, cityFilter]);

  const openNew = () => {
    setEditing({ id: null });
    setForm({ ...EMPTY_FORM, city_id: cityFilter === 'all' ? '' : cityFilter });
    setMergeTargetId('');
    setUploadingPhoto(false);
  };

  const openEdit = (councilor) => {
    setEditing(councilor);
    setForm({
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, councilor[key] || ''])),
      user_id: councilor.user_id || '',
      verified: councilor.claim_status === 'verified',
      is_in_office: councilor.is_in_office === true ? 'yes' : councilor.is_in_office === false ? 'no' : '',
    });
    setMergeTargetId('');
    setUploadingPhoto(false);
  };

  useEffect(() => {
    const requestedCouncilorId = searchParams.get('editar');
    if (loading || !requestedCouncilorId || editing) return;
    const requestedCouncilor = councilors.find((item) => item.id === requestedCouncilorId);
    if (requestedCouncilor) openEdit(requestedCouncilor);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('editar');
    setSearchParams(nextParams, { replace: true });
  }, [councilors, editing, loading, searchParams, setSearchParams]);

  const mergeTargets = useMemo(() => councilors
    .filter((item) => editing?.id && item.id !== editing.id && item.city_id === editing.city_id)
    .map((item) => ({ value: item.id, label: item.name })), [councilors, editing]);

  const mergeProfile = async () => {
    const target = councilors.find((item) => item.id === mergeTargetId);
    if (!editing?.id || !target) return;
    if (!window.confirm(`Unificar “${editing.name}” com “${target.name}”? As ruas serão transferidas para “${target.name}” e o cadastro duplicado será removido.`)) return;
    setMerging(true);
    const { data, error } = await supabase.rpc('merge_councilor_profiles', {
      p_source_id: editing.id,
      p_target_id: target.id,
    });
    setMerging(false);
    if (error) {
      showAppError({ title: 'Não foi possível unificar os vereadores', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({ title: 'Cadastros unificados', description: `${data || 0} rua(s) atualizada(s) para ${target.name}.` });
    setEditing(null);
    setMergeTargetId('');
    await load();
  };

  const save = async () => {
    const name = form.name.trim();
    if (!form.city_id || !name) {
      showAppError({ title: 'Informe a cidade e o nome do vereador', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (editing?.id && name !== editing.name) {
      const { error: renameError } = await supabase.rpc('rename_councilor_profile', {
        p_councilor_id: editing.id,
        p_new_name: name,
      });
      if (renameError) {
        setSaving(false);
        showAppError({
          title: 'Não foi possível alterar o nome',
          description: `${renameError.message}. Confira se a migration 253 foi aplicada.`,
          variant: 'destructive',
        });
        return;
      }
    }
    const details = {
      nickname: nullable(form.nickname),
      photo_url: nullable(form.photo_url),
      party: nullable(form.party),
      biography: nullable(form.biography),
      phone: nullable(form.phone),
      email: nullable(form.email),
      instagram_url: nullable(form.instagram_url),
      is_in_office: form.is_in_office === 'yes' ? true : form.is_in_office === 'no' ? false : null,
    };
    const query = editing?.id
      ? supabase.from('councilors').update(details).eq('id', editing.id).select('id').single()
      : supabase.from('councilors').insert({
        ...details,
        city_id: Number(form.city_id),
        name,
        normalized_name: chaveDeAutor(name),
        slug: slugDeVereador(name),
      }).select('id').single();
    const { data: savedCouncilor, error } = await query;
    if (error) {
      setSaving(false);
      showAppError({
        title: 'Não foi possível salvar o vereador',
        description: error.code === '23505' ? 'Já existe um vereador com esse nome nesta cidade.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    const { error: linkError } = await supabase.rpc('set_councilor_account_link', {
      p_councilor_id: savedCouncilor.id,
      p_user_id: form.user_id || null,
      p_verified: Boolean(form.user_id && form.verified),
    });
    setSaving(false);
    if (linkError) {
      showAppError({
        title: 'Os dados foram salvos, mas a conta não foi vinculada',
        description: `${linkError.message}. Confira se a migration 246 foi aplicada.`,
        variant: 'destructive',
      });
      await load();
      return;
    }
    showAppNotice({ title: editing?.id ? 'Perfil atualizado.' : 'Vereador cadastrado.' });
    setEditing(null);
    await load();
  };

  const reviewLinkRequest = async (request, approve) => {
    if (!approve && !window.confirm(`Recusar a solicitação de ${request.requester?.name || 'esta conta'}?`)) return;
    setReviewingRequestId(request.id);
    const { error } = await supabase.rpc('review_councilor_link_request', {
      p_request_id: request.id,
      p_approve: approve,
      p_review_note: approve ? null : 'Solicitação não aprovada pela moderação.',
    });
    setReviewingRequestId(null);
    if (error) {
      showAppError({ title: 'Não foi possível analisar a solicitação', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({
      title: approve ? 'Vínculo aprovado' : 'Solicitação recusada',
      description: approve ? 'A conta já pode gerenciar a página. A verificação continua separada.' : undefined,
    });
    await load();
  };

  return (
    <>
      <Helmet><title>Gerenciar vereadores - Admin</title></Helmet>
      <div className="mx-auto w-full max-w-6xl px-3 py-8 sm:px-5 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button asChild variant="outline" size="icon"><Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <h1 className="text-3xl font-extrabold text-content-primary">Vereadores</h1>
              <p className="mt-1 text-sm text-content-secondary">Cadastre perfis e confira as ruas vinculadas aos projetos de lei.</p>
            </div>
          </div>
          <Button className="gap-2" onClick={openNew}><PlusCircle className="h-4 w-4" /> Cadastrar vereador</Button>
        </header>

        <Card className="mt-6 border-brand/20 bg-brand-subtleBg">
          <CardContent className="flex gap-3 p-4 text-sm text-content-secondary">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <p><strong className="text-content-primary">Os cadastros antigos não são perdidos.</strong> Os nomes existentes nos projetos de lei são importados quando a estrutura de vereadores é criada. Depois disso, todo novo autor informado em uma rua também gera ou atualiza seu perfil automaticamente.</p>
          </CardContent>
        </Card>

        {linkRequests.length > 0 && (
          <Card className="mt-5 border-status-progressFg/25">
            <CardHeader>
              <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-status-progressFg" /><CardTitle>Solicitações de vínculo</CardTitle></div>
              <CardDescription>{linkRequests.length} {linkRequests.length === 1 ? 'solicitação aguarda' : 'solicitações aguardam'} análise.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {linkRequests.map((request) => (
                <article key={request.id} className="flex flex-col gap-3 rounded-2xl border border-edge-subtle p-4 sm:flex-row sm:items-center">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-subtle text-content-tertiary">
                    {request.requester?.avatar_url ? <img src={request.requester.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-content-primary">{request.requester?.name || 'Conta sem nome'}{request.requester?.username ? ` (@${request.requester.username})` : ''}</p>
                    <p className="mt-0.5 text-xs text-content-secondary">Solicita gerenciar <strong>{request.councilor?.name || 'página de vereador'}</strong>{request.councilor?.city?.name ? ` · ${request.councilor.city.name}` : ''}</p>
                    <p className="mt-1 text-2xs text-content-tertiary">Enviada em {new Date(request.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={reviewingRequestId === request.id} onClick={() => reviewLinkRequest(request, false)}><XCircle className="h-4 w-4" /> Recusar</Button>
                    <Button size="sm" className="gap-1.5" disabled={reviewingRequestId === request.id} onClick={() => reviewLinkRequest(request, true)}>{reviewingRequestId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar</Button>
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Perfis cadastrados</CardTitle>
            <CardDescription>{councilors.length} vereador{councilors.length === 1 ? '' : 'es'} na base.</CardDescription>
            <div className="grid gap-3 pt-3 sm:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, partido ou cidade" className="pl-9" /></div>
              <CityCombobox value={cityFilter} onChange={(value) => setCityFilter(String(value))} includeAll placeholder="Filtrar cidade" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-content-secondary">Nenhum vereador encontrado.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.map((councilor) => (
                  <article key={councilor.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-edge-subtle p-3 sm:flex">
                    {councilor.photo_url ? <img src={councilor.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-content-tertiary"><User className="h-7 w-7" /></span>}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-extrabold text-content-primary">{councilor.name}</h2>
                      {councilor.nickname && <p className="truncate text-xs font-semibold text-content-secondary">Conhecido como {councilor.nickname}</p>}
                      <p className="truncate text-xs text-content-secondary">{councilor.city?.name || 'Cidade'}{councilor.city?.states?.uf ? ` - ${councilor.city.states.uf}` : ''}{councilor.party ? ` · ${councilor.party}` : ''}</p>
                      <p className="mt-1 text-xs font-bold text-brand">{councilor.linked_streets} {councilor.linked_streets === 1 ? 'rua vinculada' : 'ruas vinculadas'}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-content-secondary">
                        {councilor.claim_status === 'verified' && <ShieldCheck className="h-3.5 w-3.5 text-success-fg" />}
                        {councilor.claim_status === 'verified'
                          ? `Conta verificada${councilor.manager?.username ? ` · @${councilor.manager.username}` : ''}`
                          : councilor.claim_status === 'linked'
                            ? `Conta vinculada${councilor.manager?.username ? ` · @${councilor.manager.username}` : ''}`
                            : 'Página criada a partir do acervo'}
                      </p>
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-edge-subtle pt-2 sm:col-span-1 sm:flex sm:shrink-0 sm:border-0 sm:pt-0">
                      <Button variant="ghost" size="sm" className="gap-2 sm:h-10 sm:w-10 sm:px-0" title="Editar" onClick={() => openEdit(councilor)}><Pencil className="h-4 w-4" /><span className="sm:hidden">Editar</span></Button>
                      <Button asChild variant="ghost" size="sm" className="gap-2 sm:h-10 sm:w-10 sm:px-0" title="Abrir página pública"><Link to={rotaDoVereador(councilor.city_id, councilor.slug)}><ExternalLink className="h-4 w-4" /><span className="sm:hidden">Ver perfil</span></Link></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <FormDialogContent className="h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-2xl">
          <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
            <DialogTitle className="text-xl font-bold text-content-primary">{editing?.id ? 'Editar vereador' : 'Cadastrar vereador'}</DialogTitle>
            <p className="text-sm text-content-tertiary">Dados públicos, conta responsável e identificação da página.</p>
          </DialogHeader>
          <form
            className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-6">
            <label className="grid gap-1.5"><Label>Cidade</Label><CityCombobox value={form.city_id || ''} onChange={(value) => setForm((current) => ({ ...current, city_id: value }))} disabled={Boolean(editing?.id)} modal /></label>
            <label className="grid gap-1.5"><Label htmlFor="councilor-name">Nome</Label><Input id="councilor-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome completo" /></label>
            <label className="grid gap-1.5"><Label htmlFor="councilor-nickname">Apelido <span className="font-normal text-content-tertiary">(opcional)</span></Label><Input id="councilor-nickname" value={form.nickname} onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))} placeholder="Como é conhecido" /></label>
            <label className="grid gap-1.5"><Label htmlFor="councilor-party">Partido</Label><Input id="councilor-party" value={form.party} onChange={(event) => setForm((current) => ({ ...current, party: event.target.value }))} /></label>
            <label className="grid gap-1.5"><Label htmlFor="councilor-office-status">Situação do mandato</Label><select id="councilor-office-status" value={form.is_in_office} onChange={(event) => setForm((current) => ({ ...current, is_in_office: event.target.value }))} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Não informado</option><option value="yes">Em exercício</option><option value="no">Fora do exercício</option></select></label>
            <div className="sm:col-span-2"><CouncilorPhotoUploader value={form.photo_url || ''} onChange={(photo_url) => setForm((current) => ({ ...current, photo_url }))} onUploadingChange={setUploadingPhoto} councilorId={editing?.id || 'novo'} name={form.name || 'vereador'} disabled={saving} /></div>
            <label className="grid gap-1.5"><Label htmlFor="councilor-phone">Telefone</Label><Input id="councilor-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label className="grid gap-1.5"><Label htmlFor="councilor-email">E-mail</Label><Input id="councilor-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="grid gap-1.5 sm:col-span-2"><Label htmlFor="councilor-instagram">Instagram</Label><Input id="councilor-instagram" value={form.instagram_url} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} placeholder="@usuario ou URL" /></label>
            <label className="grid gap-1.5 sm:col-span-2"><Label htmlFor="councilor-biography">Apresentação</Label><Textarea id="councilor-biography" rows={5} value={form.biography} onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))} /></label>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Conta responsável</Label>
              <Combobox
                options={[
                  { value: 'none', label: 'Sem conta vinculada' },
                  ...linkableProfiles.map((profile) => ({
                    value: profile.id,
                    label: `${profile.name || 'Usuário'}${profile.username ? ` (@${profile.username})` : ''}`,
                  })),
                ]}
                value={form.user_id || 'none'}
                onChange={(value) => setForm((current) => ({ ...current, user_id: value === 'none' ? '' : value, verified: value === 'none' ? false : current.verified }))}
                placeholder="Buscar uma conta..."
                searchPlaceholder="Buscar por nome ou @usuário..."
                modal
              />
              <p className="text-xs text-content-tertiary">A conta vinculada poderá editar apenas foto, apresentação e canais públicos desta página.</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-edge-subtle p-3 sm:col-span-2">
              <div><Label htmlFor="councilor-verified">Identidade confirmada</Label><p className="mt-0.5 text-xs text-content-tertiary">Exibe o selo de página legislativa verificada.</p></div>
              <Switch id="councilor-verified" checked={Boolean(form.verified)} disabled={!form.user_id} onCheckedChange={(verified) => setForm((current) => ({ ...current, verified }))} />
            </div>
            {editing?.id && <p className="text-xs text-content-tertiary sm:col-span-2">Ao corrigir o nome, a autoria nos projetos das ruas também será atualizada.</p>}
            {editing?.id && mergeTargets.length > 0 && (
              <div className="rounded-2xl border border-status-pendingBorder bg-status-pendingBg/50 p-4 sm:col-span-2">
                <Label>Cadastro duplicado</Label>
                <p className="mt-1 text-xs leading-relaxed text-content-secondary">Escolha o cadastro correto que permanecerá. As ruas e as informações disponíveis serão reunidas nele.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1"><Combobox options={mergeTargets} value={mergeTargetId} onChange={setMergeTargetId} placeholder="Unificar com..." searchPlaceholder="Buscar vereador da mesma cidade..." modal /></div>
                  <Button type="button" variant="outline" onClick={mergeProfile} disabled={!mergeTargetId || merging}>{merging ? 'Unificando...' : 'Unificar cadastros'}</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" className="h-11 rounded-xl sm:min-w-28" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" className="h-11 rounded-xl sm:min-w-32" disabled={saving || uploadingPhoto}>{uploadingPhoto ? 'Enviando foto...' : saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
          </form>
        </FormDialogContent>
      </Dialog>
    </>
  );
}
