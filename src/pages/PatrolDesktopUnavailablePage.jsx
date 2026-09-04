import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, MapPin, Smartphone, Volume2 } from 'lucide-react';

const recurso = (Icon, titulo, texto) => (
  <li className="flex items-start gap-3 rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <span>
      <strong className="block text-sm font-extrabold text-content-primary">{titulo}</strong>
      <span className="mt-0.5 block text-xs leading-5 text-content-secondary">{texto}</span>
    </span>
  </li>
);

export default function PatrolDesktopUnavailablePage() {
  return (
    <>
      <Helmet>
        <title>Modo Patrulha no celular | Trombone Cidadão</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
        <Link
          to="/missoes"
          className="inline-flex items-center gap-2 text-sm font-bold text-content-secondary transition-colors hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar às missões
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-content-onBrand shadow-elevation-2">
                <Smartphone className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">
                Experiência de campo
              </p>
              <h1 className="mt-2 max-w-2xl text-3xl font-black leading-tight tracking-tight text-content-primary sm:text-4xl">
                O Modo Patrulha está disponível no celular
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-content-secondary sm:text-base">
                A patrulha acompanha seu deslocamento pela rua e precisa dos recursos do aparelho. Para começar, abra o Trombone Cidadão no navegador do celular ou no aplicativo.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/app"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  Conhecer o aplicativo
                </Link>
                <Link
                  to="/missoes"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-edge-default bg-surface-raised px-5 text-sm font-bold text-content-primary transition hover:bg-surface-subtle"
                >
                  Ver outras missões
                </Link>
              </div>
            </div>

            <div className="border-t border-edge-subtle bg-surface-subtle p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <h2 className="text-base font-extrabold text-content-primary">Por que usar o celular?</h2>
              <ul className="mt-4 space-y-3">
                {recurso(MapPin, 'Localização durante o percurso', 'Encontra ocorrências próximas sem exigir que você procure no mapa.')}
                {recurso(Volume2, 'Alertas por voz', 'Avisa sobre o próximo ponto para você manter os olhos no caminho.')}
                {recurso(Camera, 'Registro no local', 'Permite fotografar e atualizar a situação quando estiver perto da ocorrência.')}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
