import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const AdminModuleHero = ({
  eyebrow,
  title,
  description,
  icon: Icon,
  stats = [],
  backTo = '/admin',
}) => (
  <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-[#171717] via-[#26070b] to-[#7f1220] p-6 text-white shadow-elevation-2 md:p-8 lg:flex lg:min-h-52 lg:items-center">
    <div className="grid w-full items-center gap-7 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-white/65 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand md:h-14 md:w-14">
            <Icon className="h-6 w-6 md:h-7 md:w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{description}</p>
          </div>
        </div>
      </div>

      <div className={`grid gap-3 text-center ${stats.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {stats.map(({ label, value, tone = '' }) => (
          <div key={label} className="min-w-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <strong className={`block text-xl font-extrabold tabular-nums ${tone}`}>{value}</strong>
            <span className="text-[10px] text-white/60">{label}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default AdminModuleHero;
