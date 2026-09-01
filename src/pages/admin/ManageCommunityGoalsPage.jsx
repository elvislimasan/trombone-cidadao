import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Plus, Target } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { ABERTA, ENCERRADA, RASCUNHO } from '@/lib/metaComunitaria';
import { REQUISITOS, podeEncerrar, podePublicar } from '@/lib/mutirao';
import { showAppError, showAppNotice } from '@/lib/appError';

// Gestão das metas comunitárias e dos mutirões.
//
// POR QUE OS DOIS NA MESMA TELA
//
// Um mutirão existe para avançar uma meta — é o que `mutiroes.community_goal_id`
// diz no banco. Separar as telas faria o organizador criar mutirão sem meta,
// que é o encontro sem objetivo de dados que a §36.7 proíbe no sexto requisito.
//
// A LISTA DE REQUISITOS É A TELA, NÃO UM AVISO
//
// `podePublicar` devolve O QUE falta, e o formulário mostra item por item. Um
// botão desabilitado sem explicação faz o organizador desistir; uma lista de
// sete itens com três marcados faz ele completar os quatro. A validação de
// verdade está no CHECK da migração 213 — isto aqui é o que evita a viagem até
// o erro.
//
// "REGISTRAR O USO" É UM CAMPO DE PRIMEIRA CLASSE
//
// É a metade do relatório público que costuma sumir. Deixá-lo escondido numa
// tela de edição faria a seção "o que foi feito com isso" ficar eternamente
// dizendo que não há registro — que é honesto, mas é o pior desfecho possível
// para quem verificou 25 ruas.

const vazio = {
  titulo: '',
  descricao: '',
  alvo_percentual: 80,
  bairro_ids: [],
  fim: '',
  recorrencia: '',
};

const Campo = ({ label, children, ajuda }) => (
  <label className="block">
    <span className="text-2xs font-bold text-content-secondary">{label}</span>
    {children}
    {ajuda && <span className="block text-2xs text-content-tertiary mt-0.5">{ajuda}</span>}
  </label>
);

const entrada =
  'w-full mt-1 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary';

const ManageCommunityGoalsPage = () => {
  const { user } = useAuth();
  const { cities } = useCity();

  const [metas, setMetas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [mutiroes, setMutiroes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cidadeId, setCidadeId] = useState('');
  const [nova, setNova] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [usoPorMeta, setUsoPorMeta] = useState({});
  const [mutiraoDe, setMutiraoDe] = useState(null);
  const [novoMutirao, setNovoMutirao] = useState({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [m, mu] = await Promise.all([
      supabase.from('community_goals').select('*').order('inicio', { ascending: false }),
      supabase.from('mutiroes').select('*').order('inicio_em', { ascending: false }),
    ]);
    setMetas(m.data || []);
    setMutiroes(mu.data || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!cidadeId) {
      setBairros([]);
      return;
    }
    supabase
      .from('bairros')
      .select('id, name')
      .eq('city_id', cidadeId)
      .order('name')
      .then(({ data }) => setBairros(data || []));
  }, [cidadeId]);

  const criarMeta = async () => {
    if (!cidadeId || !nova.titulo.trim() || nova.bairro_ids.length === 0) {
      showAppError({
        title: 'Faltam dados',
        description: 'Cidade, título e pelo menos um bairro são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from('community_goals').insert({
      city_id: Number(cidadeId),
      titulo: nova.titulo.trim(),
      descricao: nova.descricao.trim() || null,
      alvo_percentual: Number(nova.alvo_percentual) || 80,
      bairro_ids: nova.bairro_ids,
      recorrencia: nova.recorrencia || null,
      fim: nova.fim || null,
      status: ABERTA,
      criada_por: user?.id || null,
    });
    setSalvando(false);

    if (error) {
      showAppError({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return;
    }
    setNova(vazio);
    carregar();
  };

  const salvarUso = async (meta) => {
    const texto = (usoPorMeta[meta.id] ?? '').trim();
    if (!texto) return;

    const { error } = await supabase
      .from('community_goals')
      .update({ uso_texto: texto, uso_registrado_em: new Date().toISOString() })
      .eq('id', meta.id);

    if (error) {
      showAppError({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({
      title: 'Uso registrado',
      description: 'Aparece agora no relatório público da meta.',
    });
    carregar();
  };

  /**
   * Abre o próximo ciclo de uma meta recorrente.
   *
   * É um clique, e não um cron, porque este projeto não tem um — e criar
   * infraestrutura de agendamento para poupar um clique do embaixador seria uma
   * peça a mais para manter. O efeito colateral é bom: quem repete a meta olha o
   * alvo antes, que é o que qualquer organizador faria de qualquer forma.
   */
  const repetirMeta = async (meta) => {
    const passo = meta.recorrencia === 'trimestral' ? 3 : 1;
    const inicio = new Date();
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + passo);

    const { error } = await supabase.from('community_goals').insert({
      city_id: meta.city_id,
      titulo: meta.titulo,
      descricao: meta.descricao,
      bairro_ids: meta.bairro_ids,
      alvo_percentual: meta.alvo_percentual,
      recorrencia: meta.recorrencia,
      ciclo: (Number(meta.ciclo) || 1) + 1,
      meta_anterior_id: meta.id,
      comparacao_entre_bairros: meta.comparacao_entre_bairros,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      status: ABERTA,
      criada_por: user?.id || null,
    });

    if (error) {
      showAppError({ title: 'Erro ao repetir', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({
      title: 'Próximo ciclo aberto',
      description: 'A meta anterior continua com o histórico dela.',
    });
    carregar();
  };

  const alternarComparacao = async (meta) => {
    const { error } = await supabase
      .from('community_goals')
      .update({ comparacao_entre_bairros: !meta.comparacao_entre_bairros })
      .eq('id', meta.id);
    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  const encerrarMeta = async (meta) => {
    const { error } = await supabase
      .from('community_goals')
      .update({ status: ENCERRADA })
      .eq('id', meta.id);
    if (error) {
      showAppError({ title: 'Erro ao encerrar', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  const criarMutirao = async (meta) => {
    const dados = {
      ...novoMutirao,
      inicio_em: novoMutirao.inicio_em ? new Date(novoMutirao.inicio_em) : null,
      organizador_id: user?.id || null,
    };

    const check = podePublicar(dados);
    if (!check.ok) {
      showAppError({
        title: 'Ainda não dá para publicar',
        description:
          check.horario.texto ||
          `Falta: ${check.faltando.map((f) => f.rotulo).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('mutiroes').insert({
      city_id: meta.city_id,
      community_goal_id: meta.id,
      titulo: novoMutirao.titulo?.trim() || meta.titulo,
      organizador_id: user?.id || null,
      area_descricao: novoMutirao.area_descricao,
      ponto_de_encontro: novoMutirao.ponto_de_encontro,
      orientacao: novoMutirao.orientacao,
      canal_suporte: novoMutirao.canal_suporte,
      objetivo_dados: novoMutirao.objetivo_dados,
      alternativa_remota: novoMutirao.alternativa_remota,
      inicio_em: dados.inicio_em.toISOString(),
      status: 'publicado',
    });

    if (error) {
      showAppError({ title: 'Erro ao publicar', description: error.message, variant: 'destructive' });
      return;
    }
    setMutiraoDe(null);
    setNovoMutirao({});
    carregar();
  };

  const encerrarMutirao = async (m, relatorio) => {
    const check = podeEncerrar({ ...m, relatorio_publico: relatorio });
    if (!check.ok) {
      showAppError({ title: 'Falta o relatório', description: check.texto, variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('mutiroes')
      .update({ status: 'encerrado', relatorio_publico: relatorio })
      .eq('id', m.id);
    if (error) {
      showAppError({ title: 'Erro ao encerrar', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  return (
    <>
      <Helmet>
        <title>Metas comunitárias — Trombone Cidadão</title>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
        <PageHeader
          titulo="Metas comunitárias"
          subtitulo="Cobertura de ruas numa área definida, e os mutirões que a avançam"
          paraOnde="/admin"
        />

        {/* ── Nova meta ── */}
        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4 space-y-3">
          <p className="text-xs font-bold text-content-primary flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-brand" /> Nova meta
          </p>

          <Campo label="Cidade">
            <select
              value={cidadeId}
              onChange={(e) => {
                setCidadeId(e.target.value);
                setNova((n) => ({ ...n, bairro_ids: [] }));
              }}
              className={entrada}
            >
              <option value="">Selecione…</option>
              {(cities || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Título" ajuda="Ex: Atualizar a situação das ruas no entorno das escolas">
            <input
              value={nova.titulo}
              onChange={(e) => setNova((n) => ({ ...n, titulo: e.target.value }))}
              className={entrada}
              maxLength={120}
            />
          </Campo>

          <Campo label="Descrição">
            <textarea
              value={nova.descricao}
              onChange={(e) => setNova((n) => ({ ...n, descricao: e.target.value }))}
              rows={2}
              className={`${entrada} resize-none`}
              maxLength={400}
            />
          </Campo>

          <Campo
            label="Bairros da área"
            ajuda="A área é uma lista de bairros: é a unidade que a pessoa usa para dizer onde mora, e a que o mapa de pavimentação já usa."
          >
            <div className="mt-1 flex flex-wrap gap-1.5">
              {bairros.map((b) => {
                const ativo = nova.bairro_ids.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setNova((n) => ({
                        ...n,
                        bairro_ids: ativo
                          ? n.bairro_ids.filter((x) => x !== b.id)
                          : [...n.bairro_ids, b.id],
                      }))
                    }
                    className={`text-2xs font-semibold px-3 py-1.5 rounded-full border ${
                      ativo
                        ? 'bg-brand text-content-onBrand border-brand'
                        : 'bg-surface-subtle text-content-secondary border-edge-subtle'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
              {cidadeId && bairros.length === 0 && (
                <span className="text-2xs text-content-tertiary">
                  Esta cidade ainda não tem bairros cadastrados.
                </span>
              )}
            </div>
          </Campo>

          <div className="flex gap-3">
            <Campo label="Alvo (%)">
              <input
                type="number"
                min={10}
                max={100}
                value={nova.alvo_percentual}
                onChange={(e) => setNova((n) => ({ ...n, alvo_percentual: e.target.value }))}
                className={`${entrada} w-24`}
              />
            </Campo>
            <Campo label="Prazo (opcional)">
              <input
                type="date"
                value={nova.fim}
                onChange={(e) => setNova((n) => ({ ...n, fim: e.target.value }))}
                className={entrada}
              />
            </Campo>
            <Campo label="Repete?" ajuda="O próximo ciclo é aberto por você, não por agendador.">
              <select
                value={nova.recorrencia}
                onChange={(e) => setNova((n) => ({ ...n, recorrencia: e.target.value }))}
                className={entrada}
              >
                <option value="">Meta única</option>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
              </select>
            </Campo>
          </div>

          <button
            type="button"
            disabled={salvando}
            onClick={criarMeta}
            className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar meta'}
          </button>
        </div>

        {/* ── As metas ── */}
        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {metas.map((meta) => {
              const meus = mutiroes.filter((m) => m.community_goal_id === meta.id);

              return (
                <li
                  key={meta.id}
                  className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-content-primary flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-brand" />
                        {meta.titulo}
                      </p>
                      <p className="text-2xs text-content-tertiary mt-0.5">
                        alvo {meta.alvo_percentual}% · {meta.bairro_ids?.length || 0} bairro(s) ·{' '}
                        {meta.status}
                      </p>
                    </div>
                    <Link
                      to={`/meta/${meta.id}`}
                      className="flex-shrink-0 text-2xs font-bold text-brand underline underline-offset-2"
                    >
                      Ver página pública
                    </Link>
                  </div>

                  {/* Registrar o uso — a metade do relatório que costuma sumir. */}
                  <div className="mt-3">
                    <Campo
                      label="O que foi feito com este dado"
                      ajuda="Aparece no relatório público. Enquanto vazio, a página diz que não há registro de uso."
                    >
                      <textarea
                        rows={2}
                        value={usoPorMeta[meta.id] ?? meta.uso_texto ?? ''}
                        onChange={(e) =>
                          setUsoPorMeta((u) => ({ ...u, [meta.id]: e.target.value }))
                        }
                        className={`${entrada} resize-none`}
                        maxLength={600}
                        placeholder="Ex: A lista das 25 ruas foi entregue à Secretaria de Obras em 12/10."
                      />
                    </Campo>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => salvarUso(meta)}
                        className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
                      >
                        Registrar uso
                      </button>
                      {meta.status !== ENCERRADA && meta.status !== RASCUNHO && (
                        <button
                          type="button"
                          onClick={() => encerrarMeta(meta)}
                          className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
                        >
                          Encerrar meta
                        </button>
                      )}
                      {meta.recorrencia && (
                        <button
                          type="button"
                          onClick={() => repetirMeta(meta)}
                          className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
                        >
                          Abrir próximo ciclo
                        </button>
                      )}
                      {/* Comparação entre bairros nasce desligada. Ligar é
                          decisão editorial — e mesmo ligada, a página pública
                          recusa comparar grupos de tamanhos muito diferentes. */}
                      <button
                        type="button"
                        onClick={() => alternarComparacao(meta)}
                        className="text-2xs font-semibold text-content-tertiary underline underline-offset-2"
                      >
                        {meta.comparacao_entre_bairros
                          ? 'Desligar comparação entre bairros'
                          : 'Ligar comparação entre bairros'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMutiraoDe(mutiraoDe === meta.id ? null : meta.id);
                          setNovoMutirao({});
                        }}
                        className="text-2xs font-semibold text-brand underline underline-offset-2"
                      >
                        {mutiraoDe === meta.id ? 'Fechar' : 'Organizar mutirão'}
                      </button>
                    </div>
                  </div>

                  {/* ── Mutirão: os sete requisitos como formulário ── */}
                  {mutiraoDe === meta.id && (
                    <div className="mt-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-3.5 py-3 space-y-2.5">
                      <p className="text-2xs text-content-tertiary leading-relaxed">
                        Um mutirão só é publicado com os sete requisitos abaixo. Não
                        é burocracia: o app está convocando gente para a rua.
                      </p>

                      <Campo label="Horário de início (entre 6h e 15h)">
                        <input
                          type="datetime-local"
                          value={novoMutirao.inicio_em || ''}
                          onChange={(e) =>
                            setNovoMutirao((m) => ({ ...m, inicio_em: e.target.value }))
                          }
                          className={entrada}
                        />
                      </Campo>

                      {REQUISITOS.filter((r) => r.campo !== 'organizador_id').map((r) => (
                        <Campo key={r.id} label={r.rotulo} ajuda={r.porque}>
                          <textarea
                            rows={2}
                            value={novoMutirao[r.campo] || ''}
                            onChange={(e) =>
                              setNovoMutirao((m) => ({ ...m, [r.campo]: e.target.value }))
                            }
                            className={`${entrada} resize-none`}
                            maxLength={400}
                          />
                        </Campo>
                      ))}

                      <button
                        type="button"
                        onClick={() => criarMutirao(meta)}
                        className="text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
                      >
                        Publicar mutirão
                      </button>
                    </div>
                  )}

                  {meus.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {meus.map((m) => (
                        <li
                          key={m.id}
                          className="text-2xs text-content-secondary flex items-start justify-between gap-3"
                        >
                          <span className="min-w-0 truncate">
                            {m.status === 'encerrado' && (
                              <CheckCircle2 className="w-3 h-3 inline mr-1 text-status-resolvedFg" />
                            )}
                            {m.titulo} ·{' '}
                            {m.inicio_em
                              ? new Date(m.inicio_em).toLocaleString('pt-BR')
                              : 'sem data'}
                          </span>
                          {m.status === 'publicado' && (
                            <button
                              type="button"
                              onClick={() => {
                                const relatorio = window.prompt(
                                  'Relatório público: o que foi produzido e o que será feito com isso.'
                                );
                                if (relatorio) encerrarMutirao(m, relatorio);
                              }}
                              className="flex-shrink-0 font-semibold text-brand underline underline-offset-2"
                            >
                              Encerrar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
};

export default ManageCommunityGoalsPage;
