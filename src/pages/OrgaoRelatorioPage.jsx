import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  CheckCircle2, Loader2, MapPin, FileDown, Search, RotateCcw,
  Calendar, Building2, ChevronLeft, ChevronRight, ImageOff, ExternalLink,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '@/lib/customSupabaseClient';
import { periodoPorExtenso } from '@/lib/canalDoOrgao';

// O relatório como a secretaria o vê, sem login.
//
// A SUPERFÍCIE É MÍNIMA DE PROPÓSITO
//
// Ler a lista e confirmar o recebimento do lote. Só isso. A tentação óbvia é
// deixar o órgão marcar aqui mesmo "programada" e "executada" — seria um portal
// da prefeitura de graça. Mas a autorização desta página é um link, e link se
// repassa: quem recebesse o e-mail encaminhado poderia declarar obra feita numa
// tabela que não tem delete (207). Confirmar recebimento é a única afirmação
// barata o bastante para valer esse risco, porque é sobre o próprio ato de
// receber.
//
// Filtrar, ordenar, paginar e baixar não mexem em nada — são leitura da mesma
// lista que já veio. Por isso entram sem ampliar superfície nenhuma.
//
// AS ETAPAS SEGUINTES CONTINUAM ONDE ESTAVAM: no formulário dentro da bronca,
// registrado por quem responde pela cidade, com nome e protocolo.
//
// O PDF É GERADO AQUI, COM jsPDF — E NÃO PELA IMPRESSÃO DO NAVEGADOR
//
// A primeira versão deste botão chamava `window.print()` com um `@media print`.
// Saiu quebrado, e o motivo não estava nesta página: o shell do app envolve
// toda rota em `<main class="flex-grow flex flex-col min-h-0">` dentro de outro
// `flex-1 min-h-0`, com padding calculado a partir da altura do header fixo
// (App.jsx). `min-h-0` numa coluna flex deixa o item encolher abaixo do próprio
// conteúdo, e o header fixo entra por cima — na impressão isso vira página
// cortada. Consertar exigiria uma regra de impressão que alcança e desmonta o
// shell inteiro a partir de uma página, que é frágil por construção: qualquer
// mudança no layout do app quebra o PDF do órgão sem ninguém perceber.
//
// `jsPDF` + `jspdf-autotable` já são dependências do projeto (StatsPage gera o
// relatório geral com elas). O arquivo passa a não depender de CSS nenhum, sai
// igual em qualquer navegador, e o mesmo gerador serve para o dia em que o PDF
// for anexado ao e-mail.

const POR_PAGINA = [10, 25, 50];

const SITUACOES = [
  { valor: 'todas', rotulo: 'Todas as situações' },
  { valor: 'nova', rotulo: 'Novas neste relatório' },
  { valor: 'recorrente', rotulo: 'Recorrentes' },
  { valor: 'resolvida', rotulo: 'Já resolvidas' },
];

const dataBR = (v) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Recife' }) : '—';

// "0 dias aberta" é uma frase que ninguém diz, e numa demanda registrada hoje
// ela lê como erro de cálculo. O selo amarelo existe para dizer há quanto tempo
// o problema está de pé; quando a resposta é "desde hoje", o jeito de dizer isso
// é outro.
const rotuloTempo = (dias) => {
  if (!dias || dias <= 0) return 'Registrada hoje';
  return `${dias} ${dias === 1 ? 'dia' : 'dias'} aberta`;
};

const OrgaoRelatorioPage = () => {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [situacao, setSituacao] = useState('todas');
  const [ordem, setOrdem] = useState('recentes');
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);

  const carregar = async () => {
    const { data, error } = await supabase.rpc('relatorio_publico_do_orgao', { p_token: token });
    if (error) { setErro('Não foi possível abrir o relatório.'); return; }
    if (!data?.encontrado) { setErro('Este link não corresponde a nenhum relatório.'); return; }
    setDados(data);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const broncas = useMemo(() => dados?.broncas || [], [dados]);

  const categorias = useMemo(
    () => [...new Set(broncas.map((b) => b.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [broncas],
  );

  // O filtro é sobre a lista que já veio inteira no JSON. Não há nova consulta:
  // o relatório é um lote congelado, e recarregá-lo do banco a cada digitação
  // daria resultado diferente do que a secretaria recebeu por e-mail.
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = broncas.filter((b) => {
      if (categoria !== 'todas' && b.categoria !== categoria) return false;
      if (situacao === 'nova' && !b.primeira_vez) return false;
      if (situacao === 'recorrente' && !b.recorrente) return false;
      if (situacao === 'resolvida' && !b.resolvida) return false;
      if (!termo) return true;
      return [b.titulo, b.endereco, b.bairro, b.protocolo]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo));
    });
    return lista.sort((a, b) =>
      ordem === 'recentes'
        ? new Date(b.criada_em) - new Date(a.criada_em)
        : new Date(a.criada_em) - new Date(b.criada_em),
    );
  }, [broncas, busca, categoria, situacao, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const limparFiltros = () => {
    setBusca(''); setCategoria('todas'); setSituacao('todas'); setOrdem('recentes'); setPagina(1);
  };
  const filtroAtivo = busca !== '' || categoria !== 'todas' || situacao !== 'todas';

  const novas = broncas.filter((b) => b.primeira_vez).length;
  const recorrentes = broncas.length - novas;

  // O PDF acompanha o filtro da tela: o que está à vista é o que sai no arquivo.
  // Agrupado por categoria, como o relatório geral do StatsPage — uma secretaria
  // que responde por quatro categorias precisa saber onde uma acaba e a outra
  // começa.
  // BAIXAR O RELATÓRIO É CONFIRMAR O RECEBIMENTO
  //
  // Havia um botão separado "Confirmar recebimento". Dois botões para uma
  // pessoa que veio fazer uma coisa só — e o resultado prático era o download
  // acontecer e a confirmação não, deixando a linha do tempo da bronca dizendo
  // que ninguém recebeu um relatório que foi baixado.
  //
  // A exigência da 222 continua satisfeita: ela pedia um ato humano deliberado,
  // e não a mera abertura da mensagem, porque cliente de e-mail corporativo
  // pré-carrega imagem e antivírus segue link para varredura. Nada disso executa
  // JavaScript nem dispara um `onClick` — baixar um arquivo é uma decisão de
  // alguém que abriu a página e clicou.
  //
  // A ordem importa: o PDF é gerado e salvo ANTES de registrar. Se o registro
  // falhar, a secretaria pelo menos ficou com o arquivo; o contrário deixaria
  // uma etapa pública gravada sobre um download que não aconteceu.
  const baixarPdf = async () => {
    setBaixando(true);
    const doc = new jsPDF();
    const cidadeUf = `${dados.cidade || ''}${dados.uf ? `/${dados.uf}` : ''}`;

    doc.setFontSize(16);
    doc.text('Relatório para órgão público - Trombone Cidadão', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${dados.orgao}${cidadeUf ? ` · ${cidadeUf}` : ''}`, 14, 27);
    doc.text(
      `Relatório ${dados.periodo === 'semanal' ? 'semanal' : 'mensal'} · ${periodoPorExtenso(dados.periodo, dados.referencia)}`,
      14, 33,
    );
    doc.text(
      `${filtradas.length} de ${broncas.length} demanda(s)${filtroAtivo ? ' (filtro aplicado)' : ''} · gerado em ${dataBR(new Date().toISOString())}`,
      14, 39,
    );

    let y = 49;
    const agrupadas = filtradas.reduce((acc, b) => {
      const chave = b.categoria || 'Sem categoria';
      (acc[chave] = acc[chave] || []).push(b);
      return acc;
    }, {});

    Object.entries(agrupadas).forEach(([nomeCategoria, itens]) => {
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text(`${nomeCategoria} (${itens.length})`, 14, y);
      y += 4;

      doc.autoTable({
        head: [['#', 'Protocolo', 'Título', 'Endereço', 'Aberta há', 'Data']],
        body: itens.map((b, i) => [
          i + 1,
          b.protocolo || '—',
          doc.splitTextToSize(b.titulo || '', 45),
          doc.splitTextToSize([b.endereco, b.bairro].filter(Boolean).join(' · '), 50),
          // Na tabela a coluna já se chama "Aberta há", então aqui cabe a forma
          // curta: "hoje" em vez de repetir "Registrada hoje" no cabeçalho.
          b.dias_aberta > 0 ? `${b.dias_aberta} ${b.dias_aberta === 1 ? 'dia' : 'dias'}` : 'hoje',
          dataBR(b.criada_em),
        ]),
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [230, 57, 70] },
      });

      y = doc.previousAutoTable.finalY + 10;
    });

    if (filtradas.length === 0) {
      doc.setFontSize(11);
      doc.text('Nenhuma demanda corresponde ao filtro aplicado.', 14, y);
    }

    doc.save(`relatorio-${(dados.orgao || 'orgao').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dados.referencia}.pdf`);

    // Idempotente no banco: baixar de novo não grava etapa nem data nova.
    if (!dados.confirmado_em) {
      const { data, error } = await supabase.rpc('confirmar_recebimento_do_orgao', {
        p_token: token,
        p_protocolo: null,
      });
      if (!error && data?.ok) await carregar();
    }

    setBaixando(false);
  };

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-content-secondary text-center max-w-sm">{erro}</p>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  const confirmado = !!dados.confirmado_em;
  const cidadeUf = `${dados.cidade || ''}${dados.uf ? `/${dados.uf}` : ''}`;

  return (
    <>
      <Helmet>
        <title>{`Relatório para ${dados.orgao} - Trombone Cidadão`}</title>
        {/* Um relatório com endereço de morador não pertence a buscador. */}
        <meta name="robots" content="noindex, nofollow" />
        {/* O token de autorização está no caminho da URL. Hoje esta página não
            tem link externo nem recurso de terceiro, então ele não vaza pelo
            header `Referer` — mas isso é acidente, e a próxima edição pode
            desfazê-lo sem ninguém perceber. Aqui a garantia é explícita. */}
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-r from-[#7F1220] to-[#B3182B] text-white px-6 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/70">
                Relatório para órgão público
              </p>
              <h1 className="text-2xl font-extrabold mt-1 flex flex-wrap items-center gap-2">
                {dados.orgao}
                <span className="text-2xs font-bold uppercase tracking-wider bg-white/15 border border-white/25 rounded-full px-2 py-0.5">
                  Órgão responsável
                </span>
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-white/80">
                {cidadeUf && (
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {cidadeUf}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> {periodoPorExtenso(dados.periodo, dados.referencia)}
                </span>
              </div>
            </div>

            <div className="bg-white/10 border border-white/20 rounded-xl px-5 py-4 lg:min-w-[240px]">
              <p className="text-3xl font-extrabold leading-none">{broncas.length}</p>
              <p className="text-xs text-white/80 mt-1">
                {broncas.length === 1 ? 'demanda aberta' : 'demandas abertas'}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-2xs text-white/75">
                <span>{novas} {novas === 1 ? 'nova' : 'novas'}</span>
                <span>{recorrentes} {recorrentes === 1 ? 'recorrente' : 'recorrentes'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Aviso + download ───────────────────────────────────────────
            O download é a ação que a secretaria mais precisa: é o arquivo que
            vai anexado ao processo interno. Por isso ele é o botão sólido da
            página — o de confirmar recebimento, que grava estado, fica com o
            peso visual menor de propósito. */}
        <div className="rounded-2xl border-2 border-brand/25 bg-brand/5 px-5 py-5 flex flex-col lg:flex-row lg:items-center gap-5 justify-between">
          <div className="text-xs text-content-secondary leading-relaxed">
            <p className="font-bold text-content-primary text-sm">
              Este relatório é enviado {dados.periodo === 'semanal' ? 'toda segunda-feira' : 'no primeiro dia útil de cada mês'}.
            </p>
            <p className="mt-0.5">
              As demandas abaixo foram registradas por moradores{cidadeUf ? ` de ${cidadeUf}` : ''}, com foto e
              localização, passaram por moderação e continuam sem solução.
            </p>
          </div>
          <div className="shrink-0 lg:text-right">
            <button
              type="button"
              onClick={baixarPdf}
              disabled={baixando}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2.5 text-base font-bold text-content-onBrand bg-brand px-7 py-4 rounded-xl shadow-lg shadow-brand/25 hover:brightness-110 transition disabled:opacity-60"
            >
              {baixando
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando…</>
                : <><FileDown className="w-5 h-5" /> Baixar relatório em PDF</>}
            </button>
            <p className="text-2xs text-content-tertiary mt-2 lg:max-w-[16rem]">
              {filtradas.length} {filtradas.length === 1 ? 'demanda' : 'demandas'}
              {filtroAtivo ? ' (com o filtro atual)' : ''} · pronto para anexar ao processo.
              {/* O download grava estado público. Dizer isso antes do clique é o
                  mínimo: sem o aviso, a pessoa registraria "o órgão recebeu" em
                  219 broncas, com notificação para os participantes, achando que
                  só pegou um arquivo. */}
              {!confirmado && ' Baixar registra o recebimento deste relatório.'}
            </p>
          </div>
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge-subtle bg-surface-raised px-5 py-5">
          <p className="text-sm font-bold text-content-primary">Filtros</p>
          <p className="text-xs text-content-secondary mt-0.5">Refine a busca para encontrar o que precisa.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-content-tertiary">Categoria</span>
              <select
                value={categoria}
                onChange={(e) => { setCategoria(e.target.value); setPagina(1); }}
                className="mt-1 w-full text-sm rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary"
              >
                <option value="todas">Todas as categorias</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-content-tertiary">Situação</span>
              <select
                value={situacao}
                onChange={(e) => { setSituacao(e.target.value); setPagina(1); }}
                className="mt-1 w-full text-sm rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary"
              >
                {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-content-tertiary">Ordenar por</span>
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                className="mt-1 w-full text-sm rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary"
              >
                <option value="recentes">Mais recentes</option>
                <option value="antigas">Abertas há mais tempo</option>
              </select>
            </label>

            <label className="block">
              <span className="text-2xs font-bold uppercase tracking-wider text-content-tertiary">Busca</span>
              <div className="mt-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary" />
                <input
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                  placeholder="Título, endereço ou protocolo"
                  className="w-full text-sm rounded-xl border border-edge-subtle bg-surface-subtle pl-9 pr-3 py-2 text-content-primary placeholder:text-content-tertiary"
                />
              </div>
            </label>
          </div>

          {filtroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-content-secondary hover:text-content-primary"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        {/* ── Recebimento confirmado ─────────────────────────────────────
            Só o estado. Não há mais formulário: quem confirma é o download. */}
        {confirmado && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Recebimento confirmado
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Registrado em{' '}
              {new Date(dados.confirmado_em).toLocaleString('pt-BR', { timeZone: 'America/Recife' })}
              {dados.protocolo ? ` · protocolo ${dados.protocolo}` : ''}. Cada demanda abaixo
              passou a mostrar, na sua página pública, que este órgão recebeu a lista.
            </p>
          </div>
        )}

        {/* ── Lista ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge-subtle bg-surface-raised overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-edge-subtle">
            <div>
              <p className="text-sm font-bold text-content-primary">Demandas registradas</p>
              <p className="text-xs text-content-secondary mt-0.5">
                {filtradas.length === broncas.length
                  ? `Lista completa · ${broncas.length} ${broncas.length === 1 ? 'demanda' : 'demandas'}`
                  : `${filtradas.length} de ${broncas.length} demandas com o filtro aplicado`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-content-secondary flex items-center gap-2">
                Mostrar
                <select
                  value={porPagina}
                  onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
                  className="text-sm rounded-lg border border-edge-subtle bg-surface-subtle px-2 py-1.5 text-content-primary"
                >
                  {POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                por página
              </label>
              {/* Segunda via do download: com 219 linhas e paginação, quem chega
                  aqui rolando não volta ao topo para achar o botão. */}
              <button
                type="button"
                onClick={baixarPdf}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand border border-brand/40 rounded-lg px-3 py-2 hover:bg-brand/5"
              >
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="px-5 py-10 text-sm text-content-secondary text-center">
              Nenhuma demanda corresponde ao filtro aplicado.
            </p>
          ) : (
            <ul>
              {visiveis.map((b) => (
                <li key={b.report_id} className="border-b border-edge-subtle last:border-b-0 px-5 py-4">
                  {/* flex-wrap: em tela estreita o "Ver detalhes" cai para a
                      linha de baixo em vez de espremer o título. */}
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="w-20 h-16 rounded-lg overflow-hidden bg-surface-subtle flex items-center justify-center shrink-0">
                      {b.foto ? (
                        <img src={b.foto} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-5 h-5 text-content-tertiary" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-2xs font-mono text-content-tertiary">{b.protocolo || '—'}</span>
                        {b.resolvida ? (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">JÁ RESOLVIDA</span>
                        ) : b.primeira_vez ? (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">NOVA</span>
                        ) : (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            {rotuloTempo(b.dias_aberta).toUpperCase()}
                          </span>
                        )}
                        {b.recorrente && (
                          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-surface-subtle text-content-secondary">RECORRENTE</span>
                        )}
                        <span className="text-2xs text-content-tertiary">{b.categoria}</span>
                      </div>

                      <Link
                        to={`/bronca/${b.report_id}`}
                        className="text-[15px] font-bold text-content-primary hover:text-brand break-words"
                      >
                        {b.titulo}
                      </Link>

                      <p className="text-xs text-content-secondary mt-1 flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="break-words">
                          {b.endereco}{b.bairro ? ` · ${b.bairro}` : ''}
                        </span>
                      </p>
                      <p className="text-2xs text-content-tertiary mt-0.5">
                        Registrada em {dataBR(b.criada_em)}
                        {b.dias_aberta > 0 && ` · aberta há ${b.dias_aberta} ${b.dias_aberta === 1 ? 'dia' : 'dias'}`}
                      </p>
                    </div>

                    {/* Em nova aba de propósito: quem está aqui veio conferir uma
                        lista de 200 e poucas linhas, com filtro e página. Navegar
                        para fora perderia tudo isso e obrigaria a refazer.
                        `noreferrer` porque o token de autorização está no caminho
                        desta URL e não precisa viajar em header nenhum. */}
                    <Link
                      to={`/bronca/${b.report_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-brand border border-brand/40 rounded-lg px-3 py-2 hover:bg-brand/5"
                    >
                      Ver detalhes <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalPaginas > 1 && (
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-edge-subtle">
              <p className="text-xs text-content-secondary">
                Mostrando {(paginaAtual - 1) * porPagina + 1} a {Math.min(paginaAtual * porPagina, filtradas.length)} de {filtradas.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="p-2 rounded-lg border border-edge-subtle disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-content-secondary px-3">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="p-2 rounded-lg border border-edge-subtle disabled:opacity-40"
                  aria-label="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-[#171D26] text-white px-6 py-6">
          <p className="text-lg font-extrabold flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Trombone Cidadão
          </p>
          <p className="text-xs text-white/70 mt-1 leading-relaxed max-w-2xl">
            O Trombone Cidadão conecta moradores e órgãos públicos. Cada demanda desta lista foi
            registrada com foto e localização e passou por moderação antes de chegar aqui.
          </p>
          <p className="text-2xs text-white/50 mt-4 leading-relaxed">
            Para corrigir o destinatário, indicar outro órgão responsável ou deixar de receber,
            responda o e-mail que trouxe este link — a resposta vai para o representante do
            Trombone Cidadão{cidadeUf ? ` em ${cidadeUf}` : ''}.
          </p>
        </div>
      </div>
    </>
  );
};

export default OrgaoRelatorioPage;
