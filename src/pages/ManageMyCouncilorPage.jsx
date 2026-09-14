import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Instagram, Landmark, Loader2, Mail, Phone, Save, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import CouncilorPhotoUploader from '@/components/CouncilorPhotoUploader';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError, showAppNotice } from '@/lib/appError';
import { supabase } from '@/lib/customSupabaseClient';
import { rotaDoVereador } from '@/lib/pavementStreetHistory';

const EMPTY_FORM = { photo_url: '', biography: '', phone: '', email: '', instagram_url: '' };

export default function ManageMyCouncilorPage() {
  const { councilorId } = useParams();
  const { user } = useAuth();
  const [councilor, setCouncilor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('councilors')
      .select('id, user_id, claim_status, name, slug, city_id, photo_url, party, biography, phone, email, instagram_url, is_in_office, city:cities(name, states(uf))')
      .eq('id', councilorId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          showAppError({ title: 'Não foi possível carregar a página legislativa', description: error.message, variant: 'destructive' });
        }
        setCouncilor(data || null);
        setForm({ ...EMPTY_FORM, ...(data || {}) });
        setLoading(false);
      });
    return () => { active = false; };
  }, [councilorId]);

  const isOwner = Boolean(
    user?.id
    && councilor?.user_id === user.id
    && ['linked', 'verified'].includes(councilor?.claim_status)
  );
  const publicPath = councilor ? rotaDoVereador(councilor.city_id, councilor.slug) : '/perfil';

  const save = async () => {
    if (!isOwner) return;
    setSaving(true);
    const nullable = (value) => String(value || '').trim() || null;
    const { error } = await supabase.rpc('update_my_councilor_page', {
      p_councilor_id: councilor.id,
      p_photo_url: nullable(form.photo_url),
      p_biography: nullable(form.biography),
      p_phone: nullable(form.phone),
      p_email: nullable(form.email),
      p_instagram_url: nullable(form.instagram_url),
    });
    setSaving(false);
    if (error) {
      showAppError({ title: 'Não foi possível salvar a página', description: error.message, variant: 'destructive' });
      return;
    }
    setCouncilor((current) => ({ ...current, ...form }));
    showAppNotice({ title: 'Página legislativa atualizada.' });
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;

  if (!councilor || !isOwner) return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <ShieldCheck className="h-10 w-10 text-content-tertiary" />
      <h1 className="mt-4 text-2xl font-extrabold text-content-primary">Gestão não disponível</h1>
      <p className="mt-2 text-sm leading-6 text-content-secondary">Somente a conta vinculada pode alterar a apresentação e os canais públicos desta página.</p>
      <Button asChild variant="outline" className="mt-5"><Link to={publicPath}>Voltar</Link></Button>
    </main>
  );

  const cityName = `${councilor.city?.name || 'Cidade'}${councilor.city?.states?.uf ? ` - ${councilor.city.states.uf}` : ''}`;

  return (
    <main className="min-h-screen bg-surface-subtle py-8">
      <Helmet><title>Gerenciar {councilor.name} | Trombone Cidadão</title></Helmet>
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-5 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" className="gap-2"><Link to="/perfil"><ArrowLeft className="h-4 w-4" /> Meu perfil</Link></Button>
          <Button asChild variant="ghost" className="gap-2"><Link to={publicPath}>Ver página pública <ExternalLink className="h-4 w-4" /></Link></Button>
        </header>

        <section className="mt-5 overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
          <div className="flex items-center gap-4 border-b border-edge-subtle bg-gradient-to-r from-brand-subtleBg to-status-pendingBg p-5 sm:p-7">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand shadow-sm">
              <Landmark className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-brand">Gestão da página legislativa</p>
              <h1 className="mt-1 text-2xl font-black text-content-primary sm:text-3xl">{councilor.name}</h1>
              <p className="mt-1 text-sm text-content-secondary">{cityName}{councilor.party ? ` · ${councilor.party}` : ''}</p>
              {councilor.is_in_office !== null && <p className="mt-2 text-xs font-bold text-content-secondary">Situação: {councilor.is_in_office ? 'Em exercício' : 'Fora do exercício'}</p>}
            </div>
          </div>

          <div className="p-5 sm:p-7">
            <div className="mb-6">
              <h2 className="text-lg font-extrabold text-content-primary">Apresentação pública</h2>
              <p className="mt-1 text-sm text-content-secondary">Nome, cidade, partido e vínculo são protegidos e administrados pela plataforma.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><CouncilorPhotoUploader value={form.photo_url || ''} onChange={(photo_url) => setForm((current) => ({ ...current, photo_url }))} onUploadingChange={setUploadingPhoto} councilorId={councilor.id} name={councilor.name} disabled={saving} /></div>
              <label className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="councilor-biography">Apresentação</Label>
                <Textarea id="councilor-biography" rows={6} value={form.biography || ''} onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))} placeholder="Conte sua atuação, prioridades e relação com a cidade." />
              </label>
            </div>

            <div className="my-7 border-t border-edge-subtle" />

            <div className="mb-5">
              <h2 className="text-lg font-extrabold text-content-primary">Canais públicos</h2>
              <p className="mt-1 text-sm text-content-secondary">Preencha apenas os canais pelos quais deseja receber contato dos moradores.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-1.5"><Label htmlFor="councilor-phone">Telefone</Label><div className="relative"><Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" /><Input id="councilor-phone" className="pl-9" value={form.phone || ''} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div></label>
              <label className="grid gap-1.5"><Label htmlFor="councilor-email">E-mail</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" /><Input id="councilor-email" type="email" className="pl-9" value={form.email || ''} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div></label>
              <label className="grid gap-1.5 sm:col-span-2"><Label htmlFor="councilor-instagram">Instagram</Label><div className="relative"><Instagram className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" /><Input id="councilor-instagram" className="pl-9" value={form.instagram_url || ''} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} placeholder="@usuario ou URL" /></div></label>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-2 border-t border-edge-subtle pt-5 sm:flex-row sm:justify-end">
              <Button asChild variant="outline"><Link to={publicPath}>Cancelar</Link></Button>
              <Button onClick={save} disabled={saving || uploadingPhoto} className="gap-2"><Save className="h-4 w-4" /> {uploadingPhoto ? 'Enviando foto...' : saving ? 'Salvando...' : 'Salvar alterações'}</Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
