import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { Clock, Loader2, Target, Users } from 'lucide-react';
import BackButton from '@/components/BackButton';
import CartoesDeMapa from '@/components/map/CartoesDeMapa';
import MetaRuasMapa, { ESTADOS_FALTANDO } from '@/components/missions/MetaRuasMapa';
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
// promessa que "encaminhada" fazia antes da fase 1. É também por isso que as
// duas metades do relatório dividem a mesma linha, com o mesmo peso: a que
// costuma sumir não pode ser a menor das duas.
//
// O LAYOUT É O DAS PÁGINAS DE DETALHE DO DESKTOP
//
// A página inteira vivia em `max-w-2xl` com tudo em 12px: num monitor ela era um
// print de celular centralizado no vazio, e o dado principal ("0 de 20 ruas")
// tinha o mesmo tamanho da letra miúda que o explica. Agora ela usa o arranjo
// que `CityEventPage` fixou para as telas de detalhe — 100rem de largura, coluna
// de leitura à esquerda, lateral de 22rem grudada (`sticky`) à direita — e a
// faixa de números de `CartoesDeMapa`, a mesma das telas de mapa.
//
// O QUE VAI PARA A LATERAL: quem participou, a comparação entre bairros e a
// distribuição. São os números SOBRE a meta. A coluna larga fica com o que é
// tarefa (o mapa e a lista de ruas) e com o relatório, que é leitura.

const Cartao = ({ children, className = '' }) => (
  <section
    className={`rounded-3xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5 ${className}`}
  >
    {children}
  </section>
);

const MetaComunitariaPage = () => {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);
  const [ruas, setRuas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  // O recorte que os cartões ligam. Vive na página porque ele governa duas
  // coisas ao mesmo tempo: o anel do cartão e o que o mapa desenha.
  const [estadoAtivo, setEstadoAtivo] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);

    const { data: metaData } = await supabase
      .from('community_goals')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    setMeta(metaData || null);

    if (metaData?.city_id) {
      const bairrosDaMeta = metaData.bairro_ids?.length ? metaData.bairro_ids : null;
      const consultaTracados = supabase
        .from('pavement_streets')
        .select('id,path')
        .eq('city_id', metaData.city_id)
        .not('path', 'is', null);
      if (bairrosDaMeta) consultaTracados.in('bairro_id', bairrosDaMeta);

      const [{ data: ruasData }, { data: tracadosData }] = await Promise.all([
        supabase.rpc('cobertura_de_area', {
          p_city_id: metaData.city_id,
          p_bairro_ids: bairrosDaMeta,
        }),
        consultaTracados,
      ]);
      const tracadoPorRua = new Map((tracadosData || []).map((rua) => [rua.id, rua.path]));

      setRuas(
        (ruasData || []).map((r) => ({
          rua: {
            id: r.id,
            name: r.name,
            status: r.status,
            bairro_id: r.bairro_id,
            bairro: { name: r.bairro_nome },
            path: tracadoPorRua.get(r.id) || null,
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

  // A FAIXA DE NÚMEROS É A LEGENDA DO MAPA
  //
  // Os quatro estados aparecem sempre, mesmo em zero: "nenhuma rua com
  // divergência" é informação, e uma faixa que muda de duas para quatro colunas
  // conforme o dia reposiciona os números embaixo do dedo de quem já sabia onde
  // eles ficavam. Zero não vira filtro — botão que liga um recorte vazio não faz
  // nada (é a regra de `PavementStats`).
  //
  // O TOTAL DE VERIFICADAS NÃO ESTÁ AQUI: ele é o número grande do cartão de
  // cima. Repetido como cartão, seria o mesmo dado dito duas vezes a dois
  // centímetros de distância.
  const cartoes = useMemo(() => {
    const total = progresso?.cobertura.total || 0;
    return ESTADOS_FALTANDO.map(({ id: estadoId, classe, texto, Icone }) => {
      const quantidade = progresso?.cobertura.porEstado?.[estadoId] || 0;
      const parte = total > 0 ? Math.round((quantidade / total) * 100) : null;
      return {
        id: estadoId,
        Icone,
        cor: classe,
        rotulo: texto,
        valor: `${quantidade} ${quantidade === 1 ? 'rua' : 'ruas'}${
          parte != null ? ` · ${parte}%` : ''
        }`,
        ativo: estadoAtivo === estadoId,
        aoClicar:
          quantidade > 0
            ? () => setEstadoAtivo((atual) => (atual === estadoId ? null : estadoId))
            : null,
      };
    });
  }, [progresso, estadoAtivo]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-24 text-sm text-content-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando a meta…
      </div>
    );
  }

  if (!meta || !progresso) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-content-tertiary">
        Esta meta não existe ou ainda não foi publicada.
      </div>
    );
  }

  const publico = rotuloPublico(progresso.cobertura);

  // O TOM DIZ O ESTADO DA META, E ELE FICA NO CARTÃO DO NÚMERO
  //
  // "Meta atingida" era um parágrafo verde no fim do cartão, abaixo da letra
  // miúda. Como rótulo do próprio cartão, ele muda a cor da moldura e da barra
  // junto — e quem abre a página não precisa ler nada para saber onde a meta
  // está.
  const tom = progresso.atingida
    ? {
        fundo: 'bg-status-resolvedBg',
        borda: 'border-status-resolvedBorder',
        texto: 'text-status-resolvedFg',
        barra: 'bg-status-resolvedFg',
        rotulo: 'Meta atingida',
      }
    : progresso.encerrada
    ? {
        fundo: 'bg-status-pendingBg',
        borda: 'border-status-pendingBorder',
        texto: 'text-status-pendingFg',
        barra: 'bg-status-pendingFg',
        rotulo: 'Meta encerrada',
      }
    : {
        fundo: 'bg-surface-raised',
        borda: 'border-edge-subtle',
        texto: 'text-brand',
        barra: 'bg-brand',
        rotulo: 'Meta em andamento',
      };

  const mostrarComparacao = Boolean(meta.comparacao_entre_bairros) && times.length >= 2;
  const mostrarDistribuicao = relatorio.distribuicao.length > 1;
  // Sem nada para a lateral, a coluna de 22rem seria um buraco de 22rem: a
  // grade só nasce quando há o que colocar nela.
  const temLateral = pessoas.length > 0 || mostrarComparacao || mostrarDistribuicao;

  return (
    <>
      <Helmet>
        <title>{meta.titulo} — Trombone Cidadão</title>
        <meta
          name="description"
          content={`${publico.texto}. Meta comunitária de cobertura de ruas.`}
        />
      </Helmet>

      <div className="mx-auto w-full max-w-[100rem] px-3 pb-24 pt-4 sm:px-5 lg:px-8 lg:pb-12">
        <BackButton paraOnde="/" className="-ml-3" />

        {/* O título fica na largura de leitura mesmo numa tela de 1920: linha
            de 100rem cansa, e o nome de uma meta pode ter duas frases. */}
        <header className="mt-2 max-w-3xl">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-content-primary sm:text-3xl md:text-4xl">
            {meta.titulo}
          </h1>
          {meta.descricao && (
            <p className="mt-2 text-sm leading-relaxed text-content-secondary sm:text-base">
              {meta.descricao}
            </p>
          )}
        </header>

        <div className="mt-5 grid gap-4 lg:gap-6">
          {/* ── O progresso ── */}
          <section
            className={`rounded-3xl border p-4 shadow-elevation-1 sm:p-6 ${tom.fundo} ${tom.borda}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p
                className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] ${tom.texto}`}
              >
                <Target className="h-3.5 w-3.5" />
                {tom.rotulo}
              </p>

              {progresso.diasRestantes != null && !progresso.encerrada && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-3 py-1.5 text-xs font-bold text-content-secondary">
                  <Clock className="h-3.5 w-3.5" />
                  {progresso.diasRestantes === 0
                    ? 'Último dia'
                    : `${progresso.diasRestantes} dias restantes`}
                </span>
              )}
            </div>

            {/* O NÚMERO GRANDE É O NUMERADOR, E O DENOMINADOR VEM COLADO NELE
                Separar os dois em tamanhos diferentes é o que faz "0" e "20"
                serem lidos como uma fração, e não como dois números. */}
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums text-content-primary sm:text-5xl">
                {progresso.cobertura.cobertos}
              </span>
              <span className="text-base font-bold text-content-secondary sm:text-lg">
                de {progresso.ruasParaAlvo} ruas confirmadas
              </span>
            </p>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-content-primary/10">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${tom.barra}`}
                style={{ width: `${Math.round(progresso.fracao * 100)}%` }}
              />
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-content-secondary">
              {/* O que a barra mede, dito em texto. Uma barra sem legenda é uma
                  barra que cada pessoa interpreta como quiser — e a §36.6 pede
                  justamente que o denominador seja explícito. */}
              A meta é ter verificação confirmada por duas pessoas em{' '}
              {Math.round(progresso.alvo * 100)}% das {progresso.cobertura.total} ruas
              da área. {publico.texto}.
            </p>
          </section>

          {/* A repartição do que falta, logo abaixo do número da meta: a pessoa
              vê POR QUE as ruas faltam antes de ver onde elas ficam. */}
          <CartoesDeMapa
            cartoes={cartoes}
            rodape={`Os números são das ${progresso.cobertura.total} ruas da área. Toque num cartão para ver só essas ruas no mapa.`}
          />

          {/* 1100px, E NÃO O `lg` (980px) DESTE PROJETO
              É o mesmo limiar que `TelaDeMapa` fixou para as telas de mapa: em
              980px, descontada a lateral de 22rem, sobram 540px para o mapa —
              menos útil que o mapa inteiro com os números empilhados embaixo. */}
          <div
            className={
              temLateral
                ? 'grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_22rem] min-[1100px]:items-start min-[1100px]:gap-6'
                : 'grid gap-4'
            }
          >
            <div className="grid min-w-0 gap-4">
              {/* O número da meta vira território reconhecível: a pessoa vê
                  quais ruas faltam e por quê, em vez de receber só "0 de 20". */}
              <MetaRuasMapa
                faltando={progresso.cobertura.faltando}
                estadoAtivo={estadoAtivo}
              />

              {/* ── O relatório ── */}
              <Cartao>
                <h2 className="text-base font-bold text-content-primary">Relatório público</h2>
                <p className="mt-1 text-xs text-content-tertiary sm:text-sm">
                  O que a meta produziu, e o que foi feito com isso.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6">
                  <div>
                    <p className="text-sm font-bold text-content-primary">O que foi produzido</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">
                      {relatorio.produzido.texto}
                    </p>
                  </div>

                  <div className="border-t border-edge-subtle pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                    <p className="text-sm font-bold text-content-primary">
                      O que foi feito com isso
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">
                      {relatorio.usado.texto}
                    </p>
                  </div>
                </div>
              </Cartao>
            </div>

            {/* `sticky` mede a partir da JANELA, e o cabeçalho do app é
                `fixed`: com `top-4` a lateral grudaria debaixo dele e o primeiro
                cartão ficaria sob a barra vermelha. O deslocamento usa as mesmas
                variáveis do layout global, então ele acompanha o banner do app e
                a área segura do celular sem número mágico. */}
            {temLateral && (
              <aside className="grid min-w-0 gap-4 min-[1100px]:sticky min-[1100px]:top-[calc(var(--header-bar-height)+var(--header-safe-top,0px)+1rem)]">
                {/* ── Quem participou ── */}
                {pessoas.length > 0 && (
                  <Cartao>
                    <h2 className="flex items-center gap-2 text-base font-bold text-content-primary">
                      <Users className="h-4 w-4 shrink-0 text-brand" />
                      {pessoas.length}{' '}
                      {pessoas.length === 1 ? 'pessoa participou' : 'pessoas participaram'}
                    </h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-content-tertiary">
                      Em ordem alfabética. Esta meta não tem ranking: a rua verificada
                      vale o mesmo, tenha sido a primeira ou a trigésima.
                    </p>

                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {pessoas.map((p) => (
                        <li
                          key={p.userId}
                          className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-content-secondary"
                        >
                          {p.nome} · {p.ruas} {p.ruas === 1 ? 'rua' : 'ruas'}
                        </li>
                      ))}
                    </ul>
                  </Cartao>
                )}

                {/* ── Comparação entre bairros, quando faz sentido ──
                    Opcional em dois níveis (fase 4, §36.7): o organizador liga, e
                    ainda assim `timesComparaveis` recusa grupos de tamanhos muito
                    diferentes. Quando recusa, a tela DIZ por quê — "não comparável" é,
                    ele mesmo, informação honesta sobre a cidade. */}
                {mostrarComparacao && (
                  <Cartao>
                    <h2 className="text-base font-bold text-content-primary">
                      Como os bairros estão indo
                    </h2>

                    {comparacao.ok ? (
                      <>
                        <ul className="mt-3 space-y-2.5">
                          {times.map((t) => (
                            <li key={t.id}>
                              <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate text-content-secondary">{t.nome}</span>
                                <span className="flex-shrink-0 font-bold tabular-nums text-content-primary">
                                  {t.cobertas}/{t.totalDeRuas}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-content-primary/10">
                                <div
                                  className="h-full rounded-full bg-brand"
                                  style={{
                                    width: `${Math.round((t.cobertas / t.totalDeRuas) * 100)}%`,
                                  }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs leading-relaxed text-content-tertiary">
                          Isto não é um ranking de cidadania: bairros diferentes têm
                          números diferentes de ruas, de moradores e de tempo livre.
                        </p>
                      </>
                    ) : (
                      <p className="mt-1.5 text-xs leading-relaxed text-content-tertiary">
                        {comparacao.texto}
                      </p>
                    )}
                  </Cartao>
                )}

                {/* ── A distribuição ── */}
                {mostrarDistribuicao && (
                  <Cartao>
                    <h2 className="text-base font-bold text-content-primary">
                      Como o esforço se espalhou
                    </h2>
                    <ul className="mt-2 divide-y divide-edge-subtle">
                      {relatorio.distribuicao.map((b) => (
                        <li
                          key={b.nome}
                          className="flex items-baseline justify-between gap-3 py-2 text-sm"
                        >
                          <span className="truncate text-content-secondary">{b.nome}</span>
                          <span className="flex-shrink-0 font-bold tabular-nums text-content-primary">
                            {b.cobertas}/{b.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Cartao>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MetaComunitariaPage;
