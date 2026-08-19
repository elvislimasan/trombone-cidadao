import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Loader2, Route, Timer, MapPin, CheckCircle, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

// Patrulha compartilhada, aberta pelo link.
//
// A RLS decide o que aparece: quem não é dono só enxerga linhas com
// `is_public`. Uma patrulha privada, ou um id inventado, cai no mesmo "não
// encontrada" — de propósito, para o link não confirmar a existência de nada.
//
// Não há mapa aqui porque não há percurso gravado: publicar a rota publicaria
// de onde a pessoa saiu.

const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros || 0));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
};

const Numero = ({ Icon, valor, rotulo, destaque }) => (
  <div className="flex-1 min-w-0 text-center">
    <div className="flex items-center justify-center gap-1.5 mb-1">
      {Icon && <Icon size={16} className="text-content-tertiary shrink-0" />}
      <span className={`text-3xl font-extrabold tabular-nums leading-none ${
        destaque ? 'text-brand' : 'text-content-primary'
      }`}>
        {valor}
      </span>
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary">
      {rotulo}
    </p>
  </div>
);

export default function PatrolPage() {
  const { id } = useParams();
  const [patrulha, setPatrulha] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      const { data } = await supabase
        .from('patrols')
        .select(
          'id, ended_at, duration_seconds, distance_meters, passed_count, ' +
          'confirmed_count, city:cities(name, state:states(uf)), ' +
          'author:profiles!patrols_user_id_fkey(name)'
        )
        .eq('id', id)
        .maybeSingle();
      if (!cancelado) {
        setPatrulha(data || null);
        setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]);

  if (carregando) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand" />
      </div>
    );
  }

  if (!patrulha) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-content-primary">Patrulha não encontrada</h1>
        <p className="text-sm text-content-secondary max-w-sm">
          Ela pode ter sido removida ou não estar compartilhada.
        </p>
        <Link
          to="/mapa"
          className="mt-2 px-5 py-3 rounded-xl bg-brand text-content-onBrand font-bold text-sm"
        >
          Ver o mapa da minha cidade
        </Link>
      </div>
    );
  }

  const cidade = patrulha.city
    ? `${patrulha.city.name}${patrulha.city.state?.uf ? ` · ${patrulha.city.state.uf}` : ''}`
    : null;
  const autor = patrulha.author?.name || 'Um cidadão';
  const titulo = `${autor} patrulhou ${patrulha.passed_count} ${
    patrulha.passed_count === 1 ? 'bronca' : 'broncas'
  }`;

  return (
    <div className="flex-1 px-4 py-6">
      <Helmet>
        <title>{titulo} — Trombone Cidadão</title>
        <meta
          name="description"
          content={`${patrulha.confirmed_count} confirmações em ${formatarDistancia(
            patrulha.distance_meters
          )} percorridos.`}
        />
      </Helmet>

      <div className="max-w-md mx-auto">
        <div className="rounded-3xl border border-edge-subtle bg-surface-raised shadow-lg overflow-hidden">
          <div className="px-5 pt-6 pb-5 text-center border-b border-edge-subtle">
            <p className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              Patrulha cidadã
            </p>
            <h1 className="text-xl font-extrabold text-content-primary leading-tight">
              {titulo}
            </h1>
            {cidade && (
              <p className="flex items-center justify-center gap-1.5 text-sm text-content-secondary mt-2">
                <MapPin size={14} className="text-content-tertiary" />
                {cidade}
              </p>
            )}
            <p className="text-xs text-content-tertiary mt-1">
              {new Date(patrulha.ended_at).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div className="flex items-start gap-2 px-4 py-6">
            <Numero Icon={Timer} valor={formatarDuracao(patrulha.duration_seconds)} rotulo="Tempo" />
            <div className="w-px self-stretch bg-edge-subtle" />
            <Numero Icon={Route} valor={formatarDistancia(patrulha.distance_meters)} rotulo="Percorrido" />
            <div className="w-px self-stretch bg-edge-subtle" />
            <Numero Icon={CheckCircle} valor={patrulha.confirmed_count} rotulo="Confirmadas" destaque />
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-brand-subtleBg border border-edge-subtle p-5 text-center">
          <Megaphone size={22} className="text-brand mx-auto mb-2" />
          <p className="text-sm font-semibold text-content-primary mb-1">
            Patrulhar é confirmar o que ainda não foi resolvido.
          </p>
          <p className="text-xs text-content-secondary mb-4">
            Quanto mais gente confirma, mais claro fica o que a cidade precisa consertar primeiro.
          </p>
          <Link
            to="/mapa"
            className="inline-block px-5 py-3 rounded-xl bg-brand text-content-onBrand font-bold text-sm"
          >
            Fazer a minha patrulha
          </Link>
        </div>
      </div>
    </div>
  );
}
