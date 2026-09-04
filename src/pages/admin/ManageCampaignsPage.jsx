import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Globe2,
  Loader2,
  MapPin,
  Megaphone,
  Search,
} from 'lucide-react';
import AdminModuleHero from '@/components/admin/AdminModuleHero';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { cidadesParaEscolha } from '@/lib/cidadesParaEscolha';
import { CATEGORIAS_BRONCA } from '@/lib/reportCategories';
import {
  DURACAO_MAXIMA_DIAS,
  diasRestantes,
  podePublicarCampanha,
  vigente,
} from '@/lib/campanhas';
import { showAppError, showAppNotice } from '@/lib/appError';

// O editor de campanhas.
//
// POR QUE ELA PRECISA DE UMA TELA, E NÃO DE UM AGENDADOR
//
// Campanha sazonal é a mecânica que mais facilmente vira automação: bastaria uma
// tabela de temas por mês e um cron. E aí ela deixaria de ser editorial — que é
// a única coisa que a §36.14 pede dela.
//
// Escrever a chamada é o trabalho. "Bueiro entupido agora é rua alagada em
// janeiro" é uma frase que alguém que conhece a cidade escreve; nenhuma regra
// gera. Por isso a tela tem um campo de texto grande e nenhum botão de gerar.
//
// A ASSINATURA É OBRIGATÓRIA E É AUTOMÁTICA
//
// `editor_id` recebe quem está publicando, sem opção de escolher outro nome. Uma
// campanha assinada por alguém que não a escreveu é pior que uma sem assinatura.

const entrada =
  'w-full mt-1.5 min-h-10 text-sm rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 placeholder:text-content-tertiary';

const Campo = ({ label, ajuda, children }) => (
  <label className="block">
    <span className="text-xs font-bold text-content-secondary">{label}</span>
    {children}
    {ajuda && <span className="block text-2xs text-content-tertiary mt-1 leading-relaxed">{ajuda}</span>}
  </label>
);

const hoje = () => new Date().toISOString().slice(0, 10);

const normalizar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

const vazia = {
  titulo: '',
  chamada: '',
  corpo: '',
  categoria_id: '',
  inicio: hoje(),
  fim: '',
};

const formatarData = (data) => {
  if (!data) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${data}T00:00:00`))
    .replace('.', '');
};

const situacaoDaCampanha = (campanha) => {
  if (campanha.status === 'rascunho') {
    return { rotulo: 'Rascunho', classe: 'bg-surface-subtle text-content-tertiary' };
  }
  if (campanha.status === 'encerrada') {
    return { rotulo: 'Encerrada', classe: 'bg-surface-subtle text-content-tertiary' };
  }

  const agora = new Date();
  const inicio = new Date(`${campanha.inicio}T00:00:00`);
  const fim = new Date(`${campanha.fim}T23:59:59`);

  if (agora < inicio) {
    return { rotulo: 'Agendada', classe: 'bg-status-progressBg text-status-progressFg' };
  }
  if (agora > fim) {
    return { rotulo: 'Finalizada', classe: 'bg-surface-subtle text-content-tertiary' };
  }
  return { rotulo: 'No ar', classe: 'bg-success-bg text-success-fg' };
};

const ManageCampaignsPage = () => {
  const { user } = useAuth();
  const { cities } = useCity();

  const [campanhas, setCampanhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cidadeId, setCidadeId] = useState('');
  const [nova, setNova] = useState(vazia);
  const [salvando, setSalvando] = useState(false);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from('campaigns')
      .select('*, editor:profiles!campaigns_editor_id_fkey(name)')
      .order('inicio', { ascending: false });
    setCampanhas(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const publicar = async () => {
    const candidata = { ...nova, editor_id: user?.id || null };
    const check = podePublicarCampanha(candidata);

    if (!check.ok) {
      showAppError({
        title: 'Ainda não dá para publicar',
        description: `Falta: ${check.faltas.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from('campaigns').insert({
      // Sem cidade = campanha nacional. A da cidade sempre vence a nacional na
      // hora de exibir (ver `campanhaVigente`).
      city_id: cidadeId ? Number(cidadeId) : null,
      titulo: nova.titulo.trim(),
      chamada: nova.chamada.trim(),
      corpo: nova.corpo.trim() || null,
      categoria_id: nova.categoria_id || null,
      inicio: nova.inicio,
      fim: nova.fim,
      status: 'publicada',
      editor_id: user?.id || null,
    });
    setSalvando(false);

    if (error) {
      showAppError({ title: 'Erro ao publicar', description: error.message, variant: 'destructive' });
      return;
    }
    setNova(vazia);
    setFormularioAberto(false);
    showAppNotice({
      title: 'Campanha no ar',
      description: 'Ela some sozinha quando o período acabar.',
    });
    carregar();
  };

  const encerrar = async (c) => {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'encerrada' })
      .eq('id', c.id);
    if (error) {
      showAppError({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    carregar();
  };

  const cidadesDisponiveis = cidadesParaEscolha(cities);
  const cidadesPorId = new Map(cidadesDisponiveis.map((cidade) => [String(cidade.id), cidade.rotulo]));
  const campanhasNoAr = campanhas.filter((campanha) => vigente(campanha)).length;
  const campanhasAgendadas = campanhas.filter((campanha) => situacaoDaCampanha(campanha).rotulo === 'Agendada').length;
  const campanhasEncerradas = campanhas.filter((campanha) => ['Encerrada', 'Finalizada'].includes(situacaoDaCampanha(campanha).rotulo)).length;
  const campanhasFiltradas = campanhas.filter((campanha) => {
    const situacao = situacaoDaCampanha(campanha).rotulo;
    const combinaFiltro = filtro === 'todas'
      || (filtro === 'ativas' && situacao === 'No ar')
      || (filtro === 'agendadas' && situacao === 'Agendada')
      || (filtro === 'encerradas' && ['Encerrada', 'Finalizada'].includes(situacao));
    const termo = normalizar(busca.trim());
    const combinaBusca = !termo || normalizar(`${campanha.titulo} ${campanha.chamada} ${campanha.corpo}`).includes(termo);
    return combinaFiltro && combinaBusca;
  });

  return (
    <>
      <Helmet>
        <title>Campanhas — Trombone Cidadão</title>
      </Helmet>

      <div className="mx-auto w-full max-w-[112rem] px-3 pb-24 pt-4 sm:px-5 lg:px-8">
        <AdminModuleHero
          eyebrow="Comunicação editorial"
          title="Campanhas"
          description="Destaque por tempo limitado o que merece atenção agora, com autoria, período e alcance nacional ou municipal."
          icon={Megaphone}
          stats={[
            { label: 'no ar', value: carregando ? '—' : campanhasNoAr, tone: 'text-amber-300' },
            { label: 'agendadas', value: carregando ? '—' : campanhasAgendadas },
            { label: 'encerradas', value: carregando ? '—' : campanhasEncerradas },
          ]}
        />

        <button
          type="button"
          onClick={() => setFormularioAberto((aberto) => !aberto)}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-left xl:hidden"
          aria-expanded={formularioAberto}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-content-primary">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-content-onBrand">
              <Megaphone className="h-4 w-4" />
            </span>
            Criar nova campanha
          </span>
          {formularioAberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.68fr)]">
          <section
            className={`${formularioAberto ? 'block' : 'hidden'} overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm xl:sticky xl:top-4 xl:block`}
          >
            <div className="border-b border-edge-subtle bg-brand/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-content-onBrand">
                  <Megaphone className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-content-primary">Nova campanha</h2>
                  <p className="text-2xs text-content-tertiary">Defina a mensagem, o público e o período.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <Campo label="Onde será exibida?" ajuda="A campanha local tem prioridade sobre uma campanha nacional.">
                <select value={cidadeId} onChange={(e) => setCidadeId(e.target.value)} className={entrada}>
                  <option value="">Nacional</option>
                  {cidadesDisponiveis.map((c) => (
                    <option key={c.id} value={c.id}>{c.rotulo}</option>
                  ))}
                </select>
              </Campo>

              <Campo label="Título">
                <input
                  value={nova.titulo}
                  onChange={(e) => setNova((n) => ({ ...n, titulo: e.target.value }))}
                  className={entrada}
                  maxLength={80}
                  placeholder="Antes da chuva"
                />
              </Campo>

              <Campo label="Chamada" ajuda="Explique em uma frase por que isso importa agora.">
                <textarea
                  rows={2}
                  value={nova.chamada}
                  onChange={(e) => setNova((n) => ({ ...n, chamada: e.target.value }))}
                  className={`${entrada} resize-none`}
                  maxLength={200}
                  placeholder="Bueiro entupido agora é rua alagada em janeiro."
                />
              </Campo>

              <Campo label="Texto (opcional)">
                <textarea
                  rows={3}
                  value={nova.corpo}
                  onChange={(e) => setNova((n) => ({ ...n, corpo: e.target.value }))}
                  className={`${entrada} resize-none`}
                  maxLength={600}
                />
              </Campo>

              <Campo label="Categoria (opcional)" ajuda="Quando escolhida, a Rota do Dia mostra somente broncas desta categoria.">
                <select
                  value={nova.categoria_id}
                  onChange={(e) => setNova((n) => ({ ...n, categoria_id: e.target.value }))}
                  className={entrada}
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIAS_BRONCA.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Início">
                  <input
                    type="date"
                    value={nova.inicio}
                    onChange={(e) => setNova((n) => ({ ...n, inicio: e.target.value }))}
                    className={entrada}
                  />
                </Campo>
                <Campo label="Fim" ajuda={`Até ${DURACAO_MAXIMA_DIAS} dias.`}>
                  <input
                    type="date"
                    value={nova.fim}
                    onChange={(e) => setNova((n) => ({ ...n, fim: e.target.value }))}
                    className={entrada}
                  />
                </Campo>
              </div>

              <div className="rounded-xl bg-surface-subtle px-3 py-2.5 text-2xs leading-relaxed text-content-tertiary">
                Campanhas dão destaque ao que é útil agora, sem criar recompensa adicional.
              </div>

              <button
                type="button"
                disabled={salvando}
                onClick={publicar}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-content-onBrand transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {salvando ? 'Publicando…' : 'Publicar campanha'}
              </button>
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-bold text-content-primary">Campanhas publicadas</h2>
                <p className="mt-0.5 text-xs text-content-tertiary">
                  {carregando ? 'Atualizando listagem…' : `${campanhas.length} no histórico · ${campanhasNoAr} no ar agora`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 sm:w-64">
                  <span className="sr-only">Buscar campanha</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campanha" className={`${entrada} mt-0 h-10 pl-9`} />
                </label>
                <label>
                  <span className="sr-only">Filtrar campanhas</span>
                  <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${entrada} mt-0 h-10 sm:w-36`}>
                    <option value="todas">Todas</option>
                    <option value="ativas">No ar</option>
                    <option value="agendadas">Agendadas</option>
                    <option value="encerradas">Encerradas</option>
                  </select>
                </label>
              </div>
            </div>

            {carregando ? (
              <div className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-edge-subtle bg-surface-raised text-xs text-content-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas…
              </div>
            ) : campanhas.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-edge-subtle bg-surface-raised px-6 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-subtle text-content-tertiary">
                  <Megaphone className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold text-content-primary">Nenhuma campanha publicada</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-content-tertiary">
                  Use o formulário para publicar a primeira campanha editorial.
                </p>
              </div>
            ) : campanhasFiltradas.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-edge-subtle bg-surface-raised px-6 text-center">
                <Search className="h-6 w-6 text-content-tertiary" />
                <p className="mt-2 text-sm font-bold text-content-primary">Nenhuma campanha encontrada</p>
                <button type="button" onClick={() => { setBusca(''); setFiltro('todas'); }} className="mt-1 text-xs font-bold text-brand hover:underline">Limpar busca e filtro</button>
              </div>
            ) : (
              <ul className="grid gap-3 2xl:grid-cols-2">
                {campanhasFiltradas.map((c) => {
                  const noAr = vigente(c);
                  const dias = diasRestantes(c);
                  const situacao = situacaoDaCampanha(c);
                  const cidade = c.city_id == null
                    ? 'Nacional'
                    : cidadesPorId.get(String(c.city_id)) || 'Campanha local';
                  const categoria = CATEGORIAS_BRONCA.find((item) => item.id === c.categoria_id);

                  return (
                    <li
                      key={c.id}
                      className={`rounded-2xl border bg-surface-raised px-4 py-4 transition ${noAr ? 'border-brand/30 shadow-sm' : 'border-edge-subtle'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${situacao.classe}`}>
                              {situacao.rotulo}
                            </span>
                            <span className="flex items-center gap-1 text-2xs text-content-tertiary">
                              {c.city_id == null ? <Globe2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                              {cidade}
                            </span>
                            {categoria && (
                              <span className="rounded-full bg-brand-subtleBg px-2 py-0.5 text-2xs font-bold text-brand-subtleFg">
                                {categoria.icon} {categoria.name}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-bold leading-snug text-content-primary">{c.titulo}</p>
                          {c.chamada && (
                            <p className="mt-1.5 text-xs leading-relaxed text-content-secondary">{c.chamada}</p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-content-tertiary">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatarData(c.inicio)} — {formatarData(c.fim)}
                            </span>
                            {noAr && (
                              <span className="flex items-center gap-1">
                                <Clock3 className="h-3 w-3" />
                                {dias === 0 ? 'Último dia' : `${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}`}
                              </span>
                            )}
                            {c.editor?.name && <span>por {c.editor.name}</span>}
                          </div>
                        </div>

                        {c.status === 'publicada' && (
                          <button
                            type="button"
                            onClick={() => encerrar(c)}
                            className="shrink-0 rounded-lg border border-edge-subtle px-2.5 py-1.5 text-2xs font-semibold text-content-secondary transition hover:bg-surface-subtle"
                          >
                            Encerrar
                          </button>
                        )}
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

export default ManageCampaignsPage;
