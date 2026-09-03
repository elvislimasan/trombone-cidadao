import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, MapPin } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { formatarDistancia } from '@/lib/patrolAlvo';
import {
  colecaoDe,
  fraseDaDescoberta,
  podeDescobrir,
  proximosDaColecao,
} from '@/lib/colecao';
import { showAppError, showAppNotice } from '@/lib/appError';

// A coleção da cidade.
//
// O QUE ESTA TELA NÃO MOSTRA, E POR QUÊ
//
// Não há "quem descobriu primeiro", não há ranking, não há quantas pessoas
// conheceram o lugar. A coleção é pessoal, e a ausência desses números é o que a
// separa de território — que está fora do roadmap (§36.14) e contraria o
// princípio 6.
//
// O verbo é "conhecer". Não se conquista uma praça.
//
// A COLEÇÃO NÃO PRODUZ DADO PARA A CIDADE, E A TELA ADMITE ISSO
//
// Diferente da Rota do Dia, aqui não há valor de informação: visitar o coreto
// não atualiza nada que a prefeitura precise. É passeio, e passeio é um motivo
// legítimo de abrir o app — desde que não se venda como fiscalização.

const ColecaoPage = () => {
  const { user } = useAuth();
  const { activeCityId } = useCity();
  const { coords, status, request } = useUserLocation();

  const [pontos, setPontos] = useState([]);
  const [descobertas, setDescobertas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [registrando, setRegistrando] = useState(null);

  const carregar = useCallback(async () => {
    if (!activeCityId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);

    const [catalogo, minhas] = await Promise.all([
      supabase.rpc('colecao_da_cidade', { p_city_id: activeCityId }),
      user
        ? supabase.from('collectible_discoveries').select('ponto_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);

    setPontos((catalogo.data || []).map((p) => ({ ...p, nome: p.nome })));
    setDescobertas(minhas.data || []);
    setCarregando(false);
  }, [activeCityId, user]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const colecao = useMemo(() => colecaoDe(pontos, descobertas), [pontos, descobertas]);
  const posicao = coords || null;
  const proximos = useMemo(
    () => proximosDaColecao(colecao, posicao),
    [colecao, posicao]
  );

  const registrar = async (ponto) => {
    const check = podeDescobrir({ ponto, posicao });
    if (!check.ok) {
      showAppNotice({ title: 'Ainda não dá', description: check.texto });
      return;
    }

    setRegistrando(ponto.id);
    const { error } = await supabase.from('collectible_discoveries').insert({
      user_id: user.id,
      ponto_id: String(ponto.id),
      tipo: ponto.tipo?.id || 'marco_cultural',
    });
    setRegistrando(null);

    if (error && error.code !== '23505') {
      showAppError({ title: 'Erro ao registrar', description: error.message, variant: 'destructive' });
      return;
    }

    const frase = fraseDaDescoberta(ponto);
    showAppNotice({ title: frase.titulo, description: frase.corpo });
    setDescobertas((atuais) => [...atuais, { ponto_id: String(ponto.id) }]);
  };

  return (
    <>
      <Helmet>
        <title>Coleção da cidade — Trombone Cidadão</title>
        <meta
          name="description"
          content="Ruas com história, pontos de interesse e marcos culturais da sua cidade."
        />
      </Helmet>

      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-24 lg:max-w-[100rem] lg:px-8 lg:pt-8 lg:pb-12">
        <PageHeader
          titulo="Coleção da cidade"
          subtitulo="Lugares que valem uma parada — conhecer não tira de ninguém"
          paraOnde="/missoes"
        />

        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : colecao.total === 0 ? (
          <p className="text-xs text-content-tertiary py-10 text-center leading-relaxed">
            Esta cidade ainda não tem lugares na coleção. Eles aparecem conforme a
            moderação registra a história das ruas e os marcos culturais.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
              <p className="text-xs font-bold text-content-primary">{colecao.rotulo}</p>
              <div className="mt-2 h-2 rounded-full bg-surface-subtle overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: `${Math.round(colecao.fracao * 100)}%` }}
                />
              </div>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {colecao.porTipo.map((t) => (
                  <li
                    key={t.id}
                    className="text-2xs bg-surface-subtle text-content-secondary rounded-full px-2.5 py-1"
                  >
                    {t.emoji} {t.rotulo}: {t.descobertos}/{t.total}
                  </li>
                ))}
              </ul>

              <p className="text-2xs text-content-tertiary mt-2 leading-relaxed">
                A coleção é sua e não vale pontos no placar. Ela não atualiza dado
                da cidade — é passeio, e isso já basta.
              </p>
            </div>

            {status !== 'granted' && (
              <button
                type="button"
                onClick={request}
                className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
              >
                Ativar localização para registrar visitas
              </button>
            )}

            {proximos.length > 0 && (
              <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
                <p className="text-xs font-bold text-content-primary">
                  Mais perto de você
                </p>

                <ul className="mt-2 space-y-2">
                  {proximos.map((p) => {
                    const check = podeDescobrir({ ponto: p, posicao });
                    return (
                      <li key={p.id} className="flex items-start gap-3">
                        <span className="text-base flex-shrink-0">{p.tipo?.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-content-primary leading-tight">
                            {p.nome}
                          </p>
                          <p className="text-2xs text-content-tertiary flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {formatarDistancia(p.distancia)}
                            {p.resumo ? ` · ${p.resumo}` : ''}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={!check.ok || registrando === p.id || !user}
                          onClick={() => registrar(p)}
                          className="flex-shrink-0 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-40"
                          title={check.texto || ''}
                        >
                          {registrando === p.id ? '…' : 'Estou aqui'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 xl:grid-cols-3">
              {colecao.itens.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
                    p.descoberto
                      ? 'bg-surface-raised text-content-primary'
                      : 'bg-surface-subtle text-content-tertiary'
                  }`}
                >
                  <span>{p.descoberto ? p.tipo?.emoji : '·'}</span>
                  <span className="truncate">{p.nome}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
};

export default ColecaoPage;
