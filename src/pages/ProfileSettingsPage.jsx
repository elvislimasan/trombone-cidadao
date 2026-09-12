import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Bell, Briefcase, KeyRound, LogOut, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import { useNotifications } from '@/contexts/NotificationContext';
import Icon from '@/design-system/icons';

function SettingsLink({ to, icon, label, description, danger = false }) {
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-subtleHover ${danger ? 'text-danger' : 'text-content-primary'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-danger-subtleBg text-danger' : 'bg-surface-subtle text-content-secondary'}`}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span>{description && <span className="block text-xs text-content-secondary">{description}</span>}</span>
      <Icon name="chevronright" size={18} className="shrink-0 text-content-tertiary" />
    </Link>
  );
}

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const { notificationsEnabled, toggleNotifications, loading: notificationsLoading } = useNotifications();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <main className="min-h-screen bg-surface-base pb-20">
      <Helmet><title>Configurações — Trombone Cidadão</title></Helmet>

      <div className="sticky top-0 z-20 border-b border-edge-subtle bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-xl" onClick={() => navigate('/perfil')} aria-label="Voltar ao perfil"><ArrowLeft className="h-5 w-5" /></Button>
          <div><h1 className="text-base font-extrabold text-content-primary">Configurações</h1><p className="text-2xs text-content-secondary">Preferências, segurança e conta</p></div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1">
          <h2 className="text-sm font-extrabold text-content-primary">Aparência</h2>
          <p className="mt-0.5 text-xs text-content-secondary">Escolha como o aplicativo deve ser exibido.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[{ key: 'light', label: 'Claro' }, { key: 'dark', label: 'Escuro' }, { key: 'system', label: 'Automático' }].map((option) => {
              const active = preference === option.key;
              return <button key={option.key} type="button" onClick={() => setPreference(option.key)} aria-pressed={active} className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${active ? 'border-brand bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-base text-content-secondary hover:text-content-primary'}`}>{option.label}</button>;
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-2 shadow-elevation-1">
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-content-secondary"><Bell className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-content-primary">Notificações do site</span><span className="block text-xs text-content-secondary">{notificationsEnabled ? 'Ativadas' : 'Desativadas'}</span></span>
            <Switch checked={notificationsEnabled} onCheckedChange={() => { toggleNotifications().catch(() => {}); }} disabled={notificationsLoading} aria-label="Notificações do site" />
          </div>
          <SettingsLink to="/settings/notifications" icon={<Bell className="h-4 w-4" />} label="Preferências de notificação" description="Escolha quais avisos deseja receber" />
        </section>

        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-2 shadow-elevation-1">
          <SettingsLink to="/alterar-senha" icon={<KeyRound className="h-4 w-4" />} label="Alterar senha" />
          <SettingsLink to="/termos-de-uso" icon={<Shield className="h-4 w-4" />} label="Privacidade e termos" />
          {Capacitor.isNativePlatform() && <SettingsLink to="/perfil/preferencias" icon={<Briefcase className="h-4 w-4" />} label="Preferências do aplicativo" />}
        </section>

        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-2 shadow-elevation-1">
          <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-content-primary transition hover:bg-surface-subtleHover">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-content-secondary"><LogOut className="h-4 w-4" /></span><span className="flex-1 text-left text-sm font-bold">Sair da conta</span>
          </button>
          <SettingsLink to="/excluir-conta" icon={<Trash2 className="h-4 w-4" />} label="Excluir conta" description="Remove permanentemente seus dados" danger />
        </section>
      </div>
    </main>
  );
}
