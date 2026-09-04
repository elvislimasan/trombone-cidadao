import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useCity } from '@/contexts/CityContext';
import { campanhaVigente, chamadaDaCampanha } from '@/lib/campanhas';

// A campanha sazonal, quando há uma.
//
// UMA SÓ, E COM ASSINATURA
//
// `campanhaVigente` devolve no máximo uma: duas campanhas simultâneas competem
// pela mesma atenção e cancelam as duas. E o nome de quem assina fica no corpo,
// não no rodapé — é o que diz ao leitor que uma pessoa decidiu isto, e não um
// gatilho de calendário.
//
// SOME SOZINHA
//
// Passou do fim, o componente devolve null. Ninguém precisa lembrar de
// despublicar, e o app não fica com um banner de outubro em dezembro — que é
// como banners param de ser lidos.
//
// NÃO OFERECE NADA A MAIS
//
// A campanha aponta para a Rota do Dia ou para a central: fluxos que já existem,
// pagando o que sempre pagaram. Prêmio de campanha seria prêmio por volume com
// tema, e está fora do roadmap (§36.14).

const CampanhaBanner = () => {
  const { activeCityId } = useCity();
  const [campanha, setCampanha] = useState(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*, editor:profiles!campaigns_editor_id_fkey(name)')
        .eq('status', 'publicada')
        .order('inicio', { ascending: false })
        .limit(20);

      // Sem a 214 aplicada, a tabela não existe e a central segue sem banner.
      if (!vivo || error) return;
      setCampanha(campanhaVigente(data || [], activeCityId ?? null));
    })();

    return () => {
      vivo = false;
    };
  }, [activeCityId]);

  const c = chamadaDaCampanha(campanha);
  if (!c) return null;

  return (
    <div className="bg-surface-raised border border-brand/30 rounded-2xl px-4 py-4">
      <p className="text-2xs font-bold uppercase tracking-[0.15em] text-brand">
        Campanha {c.prazo ? `· ${c.prazo}` : ''}
      </p>
      <p className="text-[13px] font-bold text-content-primary mt-1 leading-tight">
        {c.titulo}
      </p>
      {c.chamada && (
        <p className="text-xs text-content-secondary mt-1 leading-relaxed">{c.chamada}</p>
      )}
      {c.corpo && (
        <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">{c.corpo}</p>
      )}

      <div className="flex items-center justify-between gap-3 mt-3">
        <Link
          to={c.acao.para}
          className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
        >
          {c.acao.rotulo}
        </Link>
        {c.assinatura && (
          <span className="text-2xs text-content-tertiary">por {c.assinatura}</span>
        )}
      </div>
    </div>
  );
};

export default CampanhaBanner;
