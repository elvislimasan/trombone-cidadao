import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';

const formatarPrazo = (data) => {
  if (!data) return 'Sem prazo definido';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${data}T00:00:00`))
    .replace('.', '')}`;
};

const CommunityGoalsBanner = () => {
  const { activeCityId } = useCity();
  const [metas, setMetas] = useState([]);

  useEffect(() => {
    let ativo = true;

    if (!activeCityId) {
      setMetas([]);
      return () => { ativo = false; };
    }

    supabase
      .from('community_goals')
      .select('id, titulo, descricao, alvo_percentual, bairro_ids, fim, inicio')
      .eq('city_id', activeCityId)
      .eq('status', 'aberta')
      .order('inicio', { ascending: false })
      .limit(2)
      .then(({ data, error }) => {
        if (ativo && !error) setMetas(data || []);
      });

    return () => { ativo = false; };
  }, [activeCityId]);

  if (metas.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-brand/25 bg-brand-subtleBg/45">
      <div className="flex items-center gap-3 border-b border-brand/15 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-content-onBrand"><Target className="h-4 w-4" /></span>
        <div><p className="text-sm font-extrabold text-content-primary">Metas da comunidade</p><p className="text-2xs text-content-tertiary">Ajude a confirmar informações das ruas da sua cidade.</p></div>
      </div>
      <div className="divide-y divide-brand/10">
        {metas.map((meta) => (
          <Link key={meta.id} to={`/meta/${meta.id}`} className="group flex items-center gap-3 bg-surface-raised/65 px-4 py-3 transition-colors hover:bg-surface-raised">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold text-content-primary">{meta.titulo}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-content-tertiary">
                <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" /> Alvo de {meta.alvo_percentual}%</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {meta.bairro_ids?.length || 0} bairro(s)</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatarPrazo(meta.fim)}</span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
};

export default CommunityGoalsBanner;
