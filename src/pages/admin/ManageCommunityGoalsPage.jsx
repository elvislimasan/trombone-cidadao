import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronDown, ChevronUp, ExternalLink, Loader2, MapPin, Plus, Repeat2, Search, Target } from 'lucide-react';
import AdminModuleHero from '@/components/admin/AdminModuleHero';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { ABERTA, ENCERRADA, RASCUNHO } from '@/lib/metaComunitaria';
import { cidadesParaEscolha } from '@/lib/cidadesParaEscolha';
import { showAppError, showAppNotice } from '@/lib/appError';

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

const normalizar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

const formatarData = (data) => data
  ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${data}T00:00:00`)).replace('.', '')
  : 'Sem prazo';

const ManageCommunityGoalsPage = () => {
  const { user } = useAuth();
  const { cities } = useCity();

  const [metas, setMetas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cidadeId, setCidadeId] = useState('');
  const [nova, setNova] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [usoPorMeta, setUsoPorMeta] = useState({});
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from('community_goals')
      .select('*')
      .order('inicio', { ascending: false });
    setMetas(data || []);
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

  const cidadesDisponiveis = cidadesParaEscolha(cities);
  const cidadesPorId = new Map(cidadesDisponiveis.map((cidade) => [String(cidade.id), cidade.rotulo]));
  const metasAbertas = metas.filter((meta) => meta.status === ABERTA).length;
  const metasEncerradas = metas.filter((meta) => meta.status === ENCERRADA).length;
  const metasRecorrentes = metas.filter((meta) => Boolean(meta.recorrencia)).length;
  const metasFiltradas = metas.filter((meta) => {
    const termo = normalizar(busca.trim());
    const combinaBusca = !termo || normalizar(`${meta.titulo} ${meta.descricao} ${cidadesPorId.get(String(meta.city_id)) || ''}`).includes(termo);
    const combinaFiltro = filtro === 'todas' || meta.status === filtro;
    return combinaBusca && combinaFiltro;
  });

  return (
    <>
      <Helmet>
        <title>Metas comunitárias — Trombone Cidadão</title>
      </Helmet>

      <div className="mx-auto w-full max-w-[112rem] px-3 pb-24 pt-4 sm:px-5 lg:px-8">
        <AdminModuleHero
          eyebrow="Progresso coletivo"
          title="Metas comunitárias"
          description="Defina uma área, um alvo verificável e acompanhe quanto da malha de ruas já possui informação confirmada pela comunidade."
          icon={Target}
          stats={[
            { label: 'abertas', value: carregando ? '—' : metasAbertas, tone: 'text-amber-300' },
            { label: 'recorrentes', value: carregando ? '—' : metasRecorrentes },
            { label: 'encerradas', value: carregando ? '—' : metasEncerradas },
          ]}
        />

        <button
          type="button"
          onClick={() => setFormularioAberto((aberto) => !aberto)}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-left xl:hidden"
          aria-expanded={formularioAberto}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-content-primary">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-content-onBrand"><Plus className="h-4 w-4" /></span>
            Criar nova meta
          </span>
          {formularioAberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.68fr)]">

        {/* ── Nova meta ── */}
        <section className={`${formularioAberto ? 'block' : 'hidden'} space-y-4 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm xl:sticky xl:top-4 xl:block`}>
          <div className="border-b border-edge-subtle bg-brand/5 px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-bold text-content-primary"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-content-onBrand"><Plus className="h-4 w-4" /></span> Nova meta</p>
            <p className="ml-11 text-2xs text-content-tertiary">Escolha onde medir e qual cobertura alcançar.</p>
          </div>
          <div className="space-y-4 px-5 pb-5">

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
              {cidadesDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
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

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <Campo label="Alvo (%)">
              <input
                type="number"
                min={10}
                max={100}
                value={nova.alvo_percentual}
                onChange={(e) => setNova((n) => ({ ...n, alvo_percentual: e.target.value }))}
                className={entrada}
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
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-content-onBrand disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}{salvando ? 'Criando…' : 'Criar meta'}
          </button>
          </div>
        </section>

        {/* ── As metas ── */}
        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div><h2 className="text-base font-bold text-content-primary">Metas cadastradas</h2><p className="mt-0.5 text-xs text-content-tertiary">{carregando ? 'Atualizando listagem…' : `${metas.length} no histórico · ${metasAbertas} abertas agora`}</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 sm:w-64"><span className="sr-only">Buscar meta</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar meta ou cidade" className={`${entrada} mt-0 h-10 pl-9`} /></label>
              <label><span className="sr-only">Filtrar metas</span><select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${entrada} mt-0 h-10 sm:w-36`}><option value="todas">Todas</option><option value={ABERTA}>Abertas</option><option value={ENCERRADA}>Encerradas</option><option value={RASCUNHO}>Rascunhos</option></select></label>
            </div>
          </div>
          {carregando ? (
            <div className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-edge-subtle bg-surface-raised text-xs text-content-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Carregando metas…</div>
          ) : metas.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-edge-subtle bg-surface-raised px-6 text-center"><Target className="h-7 w-7 text-content-tertiary" /><p className="mt-3 text-sm font-bold text-content-primary">Nenhuma meta cadastrada</p><p className="mt-1 text-xs text-content-tertiary">Crie uma meta para começar a medir a cobertura das ruas.</p></div>
          ) : metasFiltradas.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-edge-subtle bg-surface-raised px-6 text-center"><Search className="h-6 w-6 text-content-tertiary" /><p className="mt-2 text-sm font-bold text-content-primary">Nenhuma meta encontrada</p><button type="button" onClick={() => { setBusca(''); setFiltro('todas'); }} className="mt-1 text-xs font-bold text-brand hover:underline">Limpar busca e filtro</button></div>
          ) : (
            <ul className="space-y-3">
              {metasFiltradas.map((meta) => {
                const aberta = meta.status === ABERTA;
                const cidade = cidadesPorId.get(String(meta.city_id)) || 'Cidade não identificada';
                return (
                  <li key={meta.id} className={`overflow-hidden rounded-2xl border bg-surface-raised shadow-sm ${aberta ? 'border-brand/25' : 'border-edge-subtle'}`}>
                    <div className="p-4 md:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-2xs font-bold ${aberta ? 'bg-success-bg text-success-fg' : meta.status === ENCERRADA ? 'bg-surface-subtle text-content-tertiary' : 'bg-status-pendingBg text-status-pendingFg'}`}>{aberta ? 'Aberta' : meta.status === ENCERRADA ? 'Encerrada' : 'Rascunho'}</span>
                            {meta.recorrencia && <span className="inline-flex items-center gap-1 text-2xs font-semibold text-content-tertiary"><Repeat2 className="h-3 w-3" /> {meta.recorrencia}</span>}
                          </div>
                          <h3 className="mt-2 text-base font-extrabold text-content-primary">{meta.titulo}</h3>
                          {meta.descricao && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-content-secondary">{meta.descricao}</p>}
                        </div>
                        <Link to={`/meta/${meta.id}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-edge-subtle px-3 text-xs font-bold text-brand transition hover:bg-brand-subtleBg">Ver página pública <ExternalLink className="h-3.5 w-3.5" /></Link>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl bg-surface-subtle px-3 py-2"><p className="text-2xs text-content-tertiary">Alvo</p><p className="text-sm font-extrabold text-content-primary">{meta.alvo_percentual}%</p></div>
                        <div className="rounded-xl bg-surface-subtle px-3 py-2"><p className="text-2xs text-content-tertiary">Bairros</p><p className="text-sm font-extrabold text-content-primary">{meta.bairro_ids?.length || 0}</p></div>
                        <div className="rounded-xl bg-surface-subtle px-3 py-2"><p className="flex items-center gap-1 text-2xs text-content-tertiary"><MapPin className="h-3 w-3" /> Cidade</p><p className="truncate text-xs font-bold text-content-primary">{cidade}</p></div>
                        <div className="rounded-xl bg-surface-subtle px-3 py-2"><p className="flex items-center gap-1 text-2xs text-content-tertiary"><CalendarDays className="h-3 w-3" /> Prazo</p><p className="text-xs font-bold text-content-primary">{formatarData(meta.fim)}</p></div>
                      </div>

                      <div className="mt-4 rounded-xl border border-edge-subtle bg-surface-subtle p-3">
                        <Campo label="O que foi feito com este dado" ajuda="Este texto aparece no relatório público da meta.">
                          <textarea rows={2} value={usoPorMeta[meta.id] ?? meta.uso_texto ?? ''} onChange={(e) => setUsoPorMeta((u) => ({ ...u, [meta.id]: e.target.value }))} className={`${entrada} resize-none bg-surface-raised`} maxLength={600} placeholder="Ex: A lista das ruas foi entregue à Secretaria de Obras." />
                        </Campo>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => salvarUso(meta)} className="rounded-lg bg-brand px-3 py-2 text-2xs font-bold text-content-onBrand">Registrar uso</button>
                          {meta.status !== ENCERRADA && meta.status !== RASCUNHO && <button type="button" onClick={() => encerrarMeta(meta)} className="rounded-lg border border-edge-subtle px-3 py-2 text-2xs font-bold text-content-secondary hover:bg-surface-raised">Encerrar meta</button>}
                          {meta.recorrencia && <button type="button" onClick={() => repetirMeta(meta)} className="rounded-lg border border-edge-subtle px-3 py-2 text-2xs font-bold text-content-secondary hover:bg-surface-raised">Abrir próximo ciclo</button>}
                          <button type="button" onClick={() => alternarComparacao(meta)} className="rounded-lg border border-edge-subtle px-3 py-2 text-2xs font-bold text-content-secondary hover:bg-surface-raised">{meta.comparacao_entre_bairros ? 'Desligar comparação' : 'Comparar bairros'}</button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>
      </div>
    </>
  );
};

export default ManageCommunityGoalsPage;
