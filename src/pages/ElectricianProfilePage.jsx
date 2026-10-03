import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useOutletContext } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { ArrowRight, Camera, KeyRound, MapPin, Pencil, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { optimizeImageFile } from '@/lib/optimizeImage';

const panelPath = '/prefeitura/eletricista';

function ProfileImage({ user }) {
  if (user?.avatar_url && ['url', 'upload'].includes(user.avatar_type)) {
    return <img src={user.avatar_url} alt="Foto do perfil" className="h-full w-full object-cover" />;
  }
  if (user?.avatar_config) {
    let config = user.avatar_config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    return <Avatar className="h-full w-full" {...config} />;
  }
  const initials = (user?.name || user?.email || 'Eletricista').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span aria-hidden="true" className="flex h-full w-full items-center justify-center bg-brand-subtleBg font-display text-xl font-black text-brand">{initials}</span>;
}

export default function ElectricianProfilePage() {
  const context = useOutletContext();
  const { user, refreshUserProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const photoInput = useRef(null);
  const city = context.municipality?.cidade;
  const cityLabel = [city?.name, city?.states?.uf].filter(Boolean).join(' · ');

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.id) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setError('Escolha uma imagem de até 5 MB.');
      return;
    }
    setUploadingPhoto(true); setError('');
    let path;
    try {
      const image = await optimizeImageFile(file, { maxDimension: 1200, quality: 0.84 });
      const extension = image.name.split('.').pop()?.toLowerCase() || 'jpg';
      path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, image, { contentType: image.type, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_type: 'upload', avatar_url: data.publicUrl, avatar_config: null }).eq('id', user.id);
      if (updateError) throw updateError;
      await refreshUserProfile();
    } catch (cause) {
      if (path) await supabase.storage.from('profile-avatars').remove([path]);
      setError(cause.message || 'Não foi possível salvar a foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    if (!editing) {
      setName(user?.name || '');
      setPhone(user?.phone || '');
    }
  }, [editing, user?.name, user?.phone]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || !user?.id) return;
    setSaving(true); setError('');
    const { error: failure } = await supabase.from('profiles').update({
      name: nextName,
      phone: phone.replace(/\D/g, '') || null,
    }).eq('id', user.id);
    if (failure) {
      setError(failure.message);
      setSaving(false);
      return;
    }
    await refreshUserProfile();
    setSaving(false);
    setEditing(false);
  };

  return <div className="page-shell-fluid min-w-0 py-5 pb-8 sm:py-8">
    <Helmet><title>Meu perfil | Painel do eletricista</title><meta name="robots" content="noindex" /></Helmet>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <aside className="min-w-0 overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-sm">
        <div className="bg-gradient-to-br from-brand-subtleBg via-surface-raised to-accentHighlight/30 p-4 sm:p-5">
          <div className="flex items-center gap-4 lg:flex-col lg:text-center">
            <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-surface-raised bg-surface-subtle shadow-sm"><ProfileImage user={user} /></span>
            <div className="min-w-0"><h1 className="break-words font-display text-xl font-black">{user?.name || 'Eletricista'}</h1><span className="block text-xs text-content-secondary">Equipe de iluminação pública</span></div>
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand-subtleBg px-2 py-1 text-xs font-bold text-brand"><ShieldCheck className="h-3.5 w-3.5" />Acesso ativo</span>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-content-secondary"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{context.municipality?.nome || 'Prefeitura'}{cityLabel && ` · ${cityLabel}`}</p>
        </div>
        <div className="grid gap-2 border-t border-edge-subtle p-3">
          <Button type="button" variant="outline" className="justify-start" onClick={() => photoInput.current?.click()} disabled={uploadingPhoto}><Camera className="mr-2 h-4 w-4 text-brand" />{uploadingPhoto ? 'Enviando foto…' : user?.avatar_type === 'upload' ? 'Trocar foto' : 'Adicionar foto'}</Button>
          <input ref={photoInput} className="sr-only" type="file" accept="image/*" onChange={uploadPhoto} aria-label="Escolher foto do perfil" />
          <Button type="button" variant="outline" className="justify-start" onClick={() => { setError(''); setEditing(true); }}><Pencil className="mr-2 h-4 w-4 text-brand" />Editar dados</Button>
          {user?.username && <Button asChild variant="outline" className="justify-start"><Link to={`/${user.username}`}>Ver perfil público<ArrowRight className="ml-auto h-4 w-4 text-brand" /></Link></Button>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </aside>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 sm:p-5">
          <h2 className="font-display text-base font-extrabold">Dados pessoais</h2><p className="mt-1 text-xs text-content-secondary">Informações usadas para identificar seus atendimentos.</p>
          {editing ? <form className="mt-4 space-y-3" onSubmit={saveProfile}>
            <label className="block text-sm font-semibold">Nome completo<Input className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={saving} autoComplete="name" /></label>
            <label className="block text-sm font-semibold">Telefone<Input className="mt-1.5" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={25} disabled={saving} autoComplete="tel" placeholder="(87) 99999-9999" /></label>
            <p className="text-xs text-content-secondary">E-mail: {user?.email || 'Não informado'}. Para alterá-lo, use as configurações da conta.</p>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-1"><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>Cancelar</Button></div>
          </form> : <dl className="mt-4 grid min-w-0 gap-x-5 sm:grid-cols-2">
            {[['Nome', user?.name || 'Não informado'], ['E-mail', user?.email || 'Não informado'], ['Telefone', user?.phone || 'Não informado'], ['Cidade', cityLabel || 'Não informada']].map(([label, value]) => <div key={label} className="min-w-0 border-t border-edge-subtle py-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-content-tertiary">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}
          </dl>}
        </section>

        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 sm:p-5">
          <h2 className="font-display text-base font-extrabold">Acesso institucional</h2><p className="mt-1 text-xs text-content-secondary">Seu vínculo define as ordens que aparecem neste painel.</p>
          <dl className="mt-4 grid min-w-0 gap-x-5 sm:grid-cols-2">
            {[['Prefeitura', context.municipality?.nome || 'Não informada'], ['Função', 'Eletricista'], ['Área', 'Iluminação pública'], ['Situação', 'Ativo']].map(([label, value]) => <div key={label} className="min-w-0 border-t border-edge-subtle py-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-content-tertiary">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}
          </dl>
        </section>

        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 sm:p-5 2xl:col-span-2">
          <h2 className="font-display text-base font-extrabold">Acesso rápido</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link to={panelPath} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-edge-subtle px-3 text-sm font-semibold hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Minhas ordens<ArrowRight className="h-4 w-4 text-brand" /></Link>
            <Link to="/alterar-senha" className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-edge-subtle px-3 text-sm font-semibold hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand" />Alterar senha</span><ArrowRight className="h-4 w-4 text-brand" /></Link>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
