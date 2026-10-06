import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, MapPin, Smartphone } from 'lucide-react';

export default function ElectricianDesktopUnavailable() {
  return <div className="page-shell-fluid flex min-h-full items-center py-8 lg:py-12">
    <Helmet><title>Painel do eletricista no celular | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <section className="grid w-full min-w-0 overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" aria-labelledby="electrician-desktop-title">
      <div className="flex min-w-0 flex-col justify-center p-7 lg:p-10 xl:p-14">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-subtleBg text-brand"><Smartphone className="h-7 w-7" aria-hidden="true" /></span>
        <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Painel do eletricista</p>
        <h1 id="electrician-desktop-title" className="mt-2 max-w-2xl font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl xl:text-5xl">Por enquanto, acesse pelo celular</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-content-secondary">O layout do painel para telas grandes ainda está em preparação. Para consultar serviços, acompanhar suas ordens e registrar atendimentos, abra o Trombone Cidadão no navegador do celular ou no aplicativo.</p>
        <Link to="/app" className="mt-7 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-content-onBrand transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Conhecer o aplicativo<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-edge-subtle bg-surface-subtle p-7 lg:border-l lg:border-t-0 lg:p-10 xl:p-14">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">No celular</p>
        <h2 className="mt-3 font-display text-2xl font-black">Seu trabalho continua de onde parou</h2>
        <p className="mt-3 text-sm leading-6 text-content-secondary">Entre com a mesma conta institucional para acessar o painel.</p>
        <ul className="mt-7 grid gap-3">
          <li className="flex items-center gap-3 rounded-xl border border-edge-subtle bg-surface-raised p-4 text-sm font-semibold"><ClipboardList className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />Ordens e serviços disponíveis</li>
          <li className="flex items-center gap-3 rounded-xl border border-edge-subtle bg-surface-raised p-4 text-sm font-semibold"><MapPin className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />Mapa dos atendimentos</li>
        </ul>
      </div>
    </section>
  </div>;
}
