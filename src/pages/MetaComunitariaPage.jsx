import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { Loader2, Target, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { rotuloPublico } from '@/lib/cobertura';
import {
  participacao,
  progressoDaMeta,
  relatorioPublico,
  timesComparaveis,
} from '@/lib/metaComunitaria';

// A meta comunitária e o relatório público do que ela produziu.
//
// A BARRA DESTA PÁGINA É A ÚNICA QUE ESTE PRODUTO PODE DESENHAR
//
// A §36.6 proíbe barra de progresso cujo denominador não esteja sob controle
// dos participantes — nada de "72% concluído" quando a execução depende da
// prefeitura. Aqui o denominador é a lista de ruas da área: não muda, o
// numerador só sobe com trabalho de quem participa, e nenhum terceiro precisa
// fazer nada para a barra andar.
//
// O PLACAR É COLETIVO, E A LISTA DE PESSOAS NÃO É ORDENADA POR CONTRIBUIÇÃO
//
// `participacao` devolve em ordem alfabética de propósito. Um ranking dentro de
// uma meta de bairro transforma vizinhos em concorrentes por um bem público, faz
// quem chegou depois desistir, e mede tempo livre em vez de contribuição
// (§36.7).
//
// A SEGUNDA METADE DO RELATÓRIO É A QUE COSTUMA SUMIR
//
// Dizer quantas ruas foram verificadas é fácil. Dizer o que a prefeitura fez com
// isso é o que sustenta a próxima meta — e quando não há o que dizer, a página
// diz isso, em vez de omitir a seção. Omitir seria a versão silenciosa da mesma
// promessa que "encaminhada" fazia antes da fase 1.

const MetaComunitariaPage = () => {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);
  const [ruas, setRuas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);

    const { data: metaData } = await supabase
      .from('community_goals')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    setMeta(metaData || null);

    if (metaData?.city_id) {
      const { data: ruasData } = await supabase.rpc('cobertura_de_area', {
        p_city_id: metaData.city_id,
        p_bairro_ids: metaData.bairro_ids?.length ? metaData.bairro_ids : null,
      });

      setRuas(
        (ruasData || []).map((r) => ({
          rua: {
            id: r.id,
            name: r.name,
            status: r.status,
            bairro_id: r.bairro_id,
            bairro: { name: r.bairro_nome },
          },
          sugestoes: Array.isArray(r.sugestoes) ? r.sugestoes : [],
        }))
      );
    }

    setCarregando(false);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const progresso = useMemo(
    () => (meta ? progressoDaMeta(meta, ruas) : null),
    [meta, ruas]
  );

  const pessoas = useMemo(
    () => participacao(ruas.flatMap((r) => r.sugestoes)),
    [ruas]
  );

  // Os "times" são os bairros da área. Bairro com menos de 3 ruas fica de fora:
  // não é um grupo, é ruído — e comparar um bairro de duas ruas com um de
  // quarenta é o caso que a §36.7 manda evitar.
  const times = useMemo(
    () =>
      (progresso?.cobertura.porBairro || [])
        .filter((b) => b.total >= 3)
        .map((b) => ({
          id: b.bairroId,
          nome: b.nome || 'Sem bairro',
          totalDeRuas: b.total,
          cobertas: b.cobertos,
        })),
    [progresso]
  );

  const comparacao = useMemo(() => timesComparaveis(times), [times]);

  const relatorio = useMemo(
    () =>
      meta && progresso
        ? relatorioPublico({
            meta,
            progresso,
            participantes: pessoas,
            uso: meta.uso_texto ? { texto: meta.uso_texto } : null,
          })
        : null,
    [meta, progresso, pessoas]
  );

  if (carregando) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-xs text-content-tertiary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando a meta…
      </div>
    );
  }

  if (!meta || !progresso) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-xs text-content-tertiary">
        Esta meta não existe ou ainda não foi publicada.
      </div>
    );
  }

  const publico = rotuloPublico(progresso.cobertura);

  return (
    <>
      <Helmet>
        <title>{meta.titulo} — Trombone Cidadão</title>
        <meta
          name="description"
          content={`${publico.texto}. Meta comunitária de cobertura de ruas.`}
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        <PageHeader titulo={meta.titulo} subtitulo={meta.descricao} paraOnde="/" />

        <div className="space-y-3">
          {/* ── O progresso ── */}
          <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-content-primary flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-brand" />
                {progresso.rotulo}
              </span>
              {progresso.diasRestantes != null && !progresso.encerrada && (
                <span className="text-2xs text-content-tertiary">
                  {progresso.diasRestantes === 0
                    ? 'último dia'
                    : `${progresso.diasRestantes} dias restantes`}
                </span>
              )}
            </div>

            <div className="mt-2.5 h-2 rounded-full bg-surface-subtle overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all"
                style={{ width: `${Math.round(progresso.fracao * 100)}%` }}
              />
            </div>

            <p className="text-2xs text-content-tertiary mt-2 leading-relaxed">
              {/* O que a barra mede, dito em texto. Uma barra sem legenda é uma
                  barra que cada pessoa interpreta como quiser — e a §36.6 pede
                  justamente que o denominador seja explícito. */}
              A meta é ter verificação confirmada por duas pessoas em{' '}
              {Math.round(progresso.alvo * 100)}% das {progresso.cobertura.total} ruas
              da área. {publico.texto}.
            </p>

            {progresso.atingida && (
              <p className="mt-2 text-2xs font-bold text-status-resolvedFg bg-status-resolvedBg rounded-xl px-3 py-2">
                Meta atingida.
              </p>
            )}
          </div>

          {/* ── Quem participou ── */}
          {pessoas.length > 0 && (
            <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
              <p className="text-xs font-bold text-content-primary flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-brand" />
                {pessoas.length}{' '}
                {pessoas.length === 1 ? 'pessoa participou' : 'pessoas participaram'}
              </p>
              <p className="text-2xs text-content-tertiary mt-1">
                Em ordem alfabética. Esta meta não tem ranking: a rua verificada
                vale o mesmo, tenha sido a primeira ou a trigésima.
              </p>

              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {pessoas.map((p) => (
                  <li
                    key={p.userId}
                    className="text-2xs bg-surface-subtle text-content-secondary rounded-full px-2.5 py-1"
                  >
                    {p.nome} · {p.ruas} {p.ruas === 1 ? 'rua' : 'ruas'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Comparação entre bairros, quando faz sentido ──
              Opcional em dois níveis (fase 4, §36.7): o organizador liga, e
              ainda assim `timesComparaveis` recusa grupos de tamanhos muito
              diferentes. Quando recusa, a tela DIZ por quê — "não comparável" é,
              ele mesmo, informação honesta sobre a cidade. */}
          {meta.comparacao_entre_bairros && times.length >= 2 && (
            <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
              <p className="text-xs font-bold text-content-primary">
                Como os bairros estão indo
              </p>

              {comparacao.ok ? (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {times.map((t) => (
                      <li key={t.id}>
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="text-content-secondary truncate">{t.nome}</span>
                          <span className="text-content-primary font-semibold tabular-nums flex-shrink-0">
                            {t.cobertas}/{t.totalDeRuas}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full"
                            style={{
                              width: `${Math.round((t.cobertas / t.totalDeRuas) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-2xs text-content-tertiary mt-2 leading-relaxed">
                    Isto não é um ranking de cidadania: bairros diferentes têm
                    números diferentes de ruas, de moradores e de tempo livre.
                  </p>
                </>
              ) : (
                <p className="text-2xs text-content-tertiary mt-1.5 leading-relaxed">
                  {comparacao.texto}
                </p>
              )}
            </div>
          )}

          {/* ── A distribuição ── */}
          {relatorio.distribuicao.length > 1 && (
            <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
              <p className="text-xs font-bold text-content-primary">
                Como o esforço se espalhou
              </p>
              <ul className="mt-2 space-y-1">
                {relatorio.distribuicao.map((b) => (
                  <li
                    key={b.nome}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-content-secondary truncate">{b.nome}</span>
                    <span className="text-content-primary font-semibold tabular-nums flex-shrink-0">
                      {b.cobertas}/{b.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── O relatório ── */}
          <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
            <p className="text-2xs font-bold uppercase tracking-[0.15em] text-content-tertiary">
              Relatório público
            </p>

            <p className="text-xs text-content-secondary mt-2 leading-relaxed">
              <strong className="text-content-primary">O que foi produzido: </strong>
              {relatorio.produzido.texto}
            </p>

            <p className="text-xs text-content-secondary mt-2 leading-relaxed">
              <strong className="text-content-primary">O que foi feito com isso: </strong>
              {relatorio.usado.texto}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default MetaComunitariaPage;
