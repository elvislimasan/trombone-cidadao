import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Moon, ChevronRight, ChevronDown, Loader2, Lock } from 'lucide-react';

import { usePosicaoAproximada } from '@/hooks/usePosicaoAproximada';
import MissionList from '@/components/missions/MissionList';
import MissionLevelCard from '@/components/missions/MissionLevelCard';
import ImpactCard from '@/components/missions/ImpactCard';
import DailyCard from '@/components/missions/DailyCard';
import CampanhaBanner from '@/components/missions/CampanhaBanner';
import MarcosCosmeticos from '@/components/missions/MarcosCosmeticos';
import MissionResume from '@/components/missions/MissionResume';
import MissionPatrolProgress from '@/components/missions/MissionPatrolProgress';
import { useMissions } from '@/hooks/useMissions';
import { useAlvosPorPerto } from '@/hooks/useAlvosPorPerto';
import { CATEGORIAS_SINAL } from '@/lib/reportCategories';
import { NAV_ALERTA, ehNoite } from '@/lib/navGeo';
import { calcularSequencia } from '@/lib/patrolGame';

// Hub das missões: onde a patrulha começa.
//
// POR QUE EXISTE
//
// A patrulha morava atrás de um botão dentro do mapa de consulta — a tela que
// as pessoas abrem para OLHAR, não para agir. Quem não soubesse que o modo
// existia não tinha como descobrir.
//
// Aqui ela ganha o lugar certo. A ESCOLHA da categoria mudou de casa outra vez
// (ago/2026): virou tela própria, em /patrulhar. Ela é o passo seguinte de uma
// decisão já tomada, e ocupava meia central para quem só queria ver progresso.
//
// O que ficou desta tela é o que responde "onde eu estou e o que continuar":
// nível, as missões mais perto de fechar, a trilha de patrulha em andamento, o
// catálogo, e o aviso do que abre mais tarde.

export default function MissionsPage() {
  const posicao = usePosicaoAproximada();

  // Disponibilidade real dos alvos (fase 2). A guarda de `sortearDiarias`
  // existia desde a 200 e nunca recebeu um valor — nenhum chamador informava
  // `temAlvos`, então a proteção contra diária impossível estava desligada.
  const { temBroncas, temSinais } = useAlvosPorPerto(posicao);

  const {
    trilhas, pontuacao, impacto, concluidas, conquistas, contadores, carregando,
    diarias, resumoDiarias, tempoRestante,
  } = useMissions({ temBroncas, temSinais });

  // null = não sabemos ainda (ou o GPS recusou). Diferente de "é dia".
  const noite = useMemo(
    () => (posicao ? ehNoite(Date.now(), posicao.lat, posicao.lng) : null),
    [posicao]
  );


  // ── O que a tela nova precisa saber ──

  const sequencia = useMemo(
    () => calcularSequencia(contadores?.patrol_days || []),
    [contadores]
  );

  /** A medalha mais difícil já conquistada. Vale mais dizer uma que listar oito. */
  const melhorMedalha = useMemo(() => {
    const ganhas = (conquistas || []).filter((c) => c.desbloqueada);
    return ganhas.length > 0 ? ganhas[ganhas.length - 1] : null;
  }, [conquistas]);

  const [trilhaAtiva, setTrilhaAtiva] = useState('todas');
  const [verTodas, setVerTodas] = useState(false);
  const [verRequisitos, setVerRequisitos] = useState(false);

  const abas = useMemo(
    () => [{ id: 'todas', nome: 'Todos' }, ...trilhas.map((t) => ({ id: t.id, nome: t.nome }))],
    [trilhas]
  );

  /**
   * As mais perto de fechar, para o "Continue daqui".
   *
   * Ordena por QUANTO FALTA, não por porcentagem: 90% de uma etapa de 50 ainda
   * são cinco ações, e uma missão a um passo do fim tem que vir antes.
   */
  const quaseLa = useMemo(() => {
    const abertas = trilhas
      .flatMap((t) => t.missoes)
      .filter((m) => !m.bloqueada && !m.completa && m.atual > 0);
    return [...abertas].sort((a, b) => a.faltam - b.faltam).slice(0, 4);
  }, [trilhas]);

  const dePatrulha = useMemo(
    () => trilhas.find((t) => t.id === 'patrulha')?.missoes ?? [],
    [trilhas]
  );

  const adiadasParaANoite = useMemo(
    () => CATEGORIAS_SINAL.filter((c) => NAV_ALERTA.categoriasNoturnas.includes(c.id)),
    []
  );

  const bloqueadas = useMemo(
    () => trilhas.flatMap((t) => t.missoes).filter((m) => m.bloqueada),
    [trilhas]
  );

  /**
   * A lista, filtrada e recortada.
   *
   * As bloqueadas saem daqui: elas viram uma linha só no fim. Sem isso a
   * central termina em cartões cinzas, que é o oposto do que ela deve provocar.
   */
  const { visiveis, ocultas, totalVisiveis } = useMemo(() => {
    const base = trilhaAtiva === 'todas'
      ? trilhas
      : trilhas.filter((t) => t.id === trilhaAtiva);

    const semBloqueio = base
      .map((t) => ({ ...t, missoes: t.missoes.filter((m) => !m.bloqueada) }))
      .filter((t) => t.missoes.length > 0);

    const total = semBloqueio.reduce((n, t) => n + t.missoes.length, 0);
    if (verTodas || total <= 4) {
      return { visiveis: semBloqueio, ocultas: 0, totalVisiveis: total };
    }

    // Corta em quatro, atravessando as trilhas na ordem em que aparecem.
    let restam = 4;
    const cortado = [];
    for (const t of semBloqueio) {
      if (restam <= 0) break;
      cortado.push({ ...t, missoes: t.missoes.slice(0, restam) });
      restam -= Math.min(restam, t.missoes.length);
    }
    return { visiveis: cortado, ocultas: total - 4, totalVisiveis: total };
  }, [trilhas, trilhaAtiva, verTodas]);

  return (
    /* O ESPAÇAMENTO É DO PAI, NÃO DE CADA BLOCO
       Metade dos cartões trazia a própria margem (`mt-6`) e a outra metade
       nenhuma — então nível, diárias e impacto encostavam uns nos outros e
       liam como um cartão só com emendas estranhas, enquanto os de baixo
       respiravam. Com `gap`, a distância entre irmãos é uma decisão só, no
       lugar onde ela pode ser vista inteira, e um bloco novo entra no ritmo
       sem precisar saber quem está acima dele. */
    <div className="container max-w-2xl mx-auto w-full px-4 py-6 pb-24 flex flex-col gap-5">
      <Helmet>
        <title>Missões | Trombone Cidadão</title>
        <meta
          name="description"
          content="Saia em patrulha pela sua cidade e registre o que encontrar pelo caminho."
        />
      </Helmet>

      {/* SEM CABEÇALHO DE PÁGINA
          O título repetia o que a aba de baixo já diz, e o subtítulo era slogan
          — duas linhas de altura antes de qualquer conteúdo, numa tela cuja
          queixa era estar cheia demais. O nome fica para os leitores de tela,
          que precisam dele para anunciar a página. */}
      <h1 className="sr-only">Missões</h1>

      {/* Estado pessoal antes das ações: quem abre a central quer saber onde
          está antes de escolher o que fazer. */}
      {!carregando && (
        <MissionLevelCard
          nivel={pontuacao}
          sequencia={sequencia}
          concluidas={concluidas}
          melhorMedalha={melhorMedalha}
        />
      )}

      {/* RETOMAR VEM ANTES DE ESCOLHER
          A missão mais perto de fechar subiu para logo abaixo do nível, e como
          cartão de marca. Enterrada depois das categorias ela competia com o
          catálogo inteiro — e quem volta ao app pela terceira vez não quer
          escolher entre doze, quer terminar o que começou. */}
      {!carregando && <MissionResume missoes={quaseLa} />}

      {/* O que dá para fazer HOJE, antes do catálogo de vida inteira.
          Quem abre a central numa terça à noite não quer escolher entre doze
          missões permanentes — quer um objetivo que cabe na noite. */}
      {/* A campanha vem antes das diárias quando existe: ela diz o que é útil
          AGORA, e as diárias dizem quanto. Some sozinha quando o período acaba
          (fase 4, §36.14). */}
      <CampanhaBanner />

      {!carregando && (
        <DailyCard
          diarias={diarias}
          resumo={resumoDiarias}
          tempoRestante={tempoRestante}
        />
      )}

      {/* A segunda moeda, logo abaixo do nível e nunca dentro dele.
          É a distância entre os dois números que conta a história: muito XP com
          impacto zero é alguém reclamando no vazio, e essa é a informação mais
          útil que a central tem para dar. */}
      {!carregando && <ImpactCard impacto={impacto} />}

      {/* ── As missões ──
          UM CATÁLOGO, E SÓ UM.
          Havia aqui em cima uma grade "Explore por categoria" com as mesmas
          missões de investigação desta lista, os mesmos contadores e nenhuma
          ação a mais — as pílulas abaixo já filtram por trilha. Duas
          representações da mesma coisa a duzentos pixels de distância não são
          duas entradas: são a mesma tela contada duas vezes.

          Vêm primeiro: a tela se chama Missões, e o que ela promete é dizer o
          que há para fazer. As patrulhas ficam logo abaixo, com âncora, porque
          são o DESTINO de metade das missões. */}
      <section id="lista" className="scroll-mt-4">
        {/* O "Ver todas" daqui saiu junto com os outros dois: a pílula no fim
            da lista faz a mesma coisa, e no lugar certo — depois de a pessoa
            ver o que já cabe. */}
        <h2 className="text-lg font-extrabold text-content-primary tracking-tight mb-3">
          Suas missões
        </h2>

        {carregando ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
        ) : trilhas.length === 0 ? (
          <p className="text-sm text-content-secondary">
            Entre na sua conta para acompanhar suas missões.
          </p>
        ) : (
          <>
            {/* FILTRO POR TRILHA.
                Doze missões em quatro grupos cabem numa rolagem longa, e é
                assim que a lista estava. O filtro serve a quem já sabe o que
                quer fazer hoje — "só quero patrulhar" — sem obrigar quem não
                sabe a escolher: "Todas" é o padrão. */}
            <div className="flex gap-2 overflow-x-auto pb-1 pr-1 mb-3 scrollbar-none">
              {abas.map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  onClick={() => setTrilhaAtiva(aba.id)}
                  className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-bold transition-colors ${
                    trilhaAtiva === aba.id
                      ? 'bg-brand text-content-onBrand'
                      : 'bg-surface-subtle text-content-secondary border border-edge-subtle'
                  }`}
                >
                  {aba.nome}
                </button>
              ))}
            </div>

            <MissionList trilhas={visiveis} />

            {/* O RESTO FICA DOBRADO.
                Mostrar as doze de uma vez faz a tela terminar em lista de
                pendências — e as últimas, que são as mais distantes, são
                justamente as que menos convidam. */}
            {ocultas > 0 && !verTodas && (
              <button
                type="button"
                onClick={() => setVerTodas(true)}
                className="w-full mt-3 h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-edge-default bg-surface-subtle text-sm font-bold text-brand active:scale-[0.99] transition-transform"
              >
                Ver todas as {totalVisiveis} missões
                <ChevronDown size={16} />
              </button>
            )}

            {/* As bloqueadas viram UMA linha, não N cartões cinzas: elas não
                são tarefa, são consequência de subir de nível. */}
            {bloqueadas.length > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-3.5">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-surface-raised flex items-center justify-center">
                  <Lock size={17} className="text-content-tertiary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-content-primary leading-tight">
                    {bloqueadas.length}{' '}
                    {bloqueadas.length === 1 ? 'missão bloqueada' : 'missões bloqueadas'}
                  </p>
                  <p className="text-xs text-content-secondary mt-0.5 leading-snug">
                    Suba de nível para desbloquear
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVerRequisitos((v) => !v)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold text-brand"
                >
                  {verRequisitos ? 'Ocultar' : 'Ver requisitos'}
                  <ChevronRight size={13} />
                </button>
              </div>
            )}

            {/* O requisito de cada uma, sob demanda. Ele é a resposta de "o que
                eu preciso fazer" — mas listado sempre, viraria mais uma parede
                de cinza no fim da tela. */}
            {verRequisitos && bloqueadas.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {bloqueadas.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2.5 rounded-xl border border-edge-subtle bg-surface-subtle px-3.5 py-2.5"
                  >
                    <span className="text-base leading-none opacity-50" aria-hidden="true">
                      {m.icone}
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-semibold text-content-secondary truncate">
                      {m.titulo}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-content-tertiary">
                      Nível {m.nivelMinimo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>


      {!carregando && (
        <MissionPatrolProgress missoes={dePatrulha} para="/patrulhar" />
      )}

      {/* PRÓXIMA OPORTUNIDADE.

          A patrulha de iluminação fica desabilitada de dia — poste apagado ao
          sol é invisível, e o alerta pediria um julgamento impossível. Mas a
          tela só mostrava o botão apagado, o que lê como "quebrado".

          Dito como espera, vira convite para voltar: o app deixa de negar e
          passa a marcar hora. */}
      {noite === false && adiadasParaANoite.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-content-tertiary mb-2.5">
            Próxima oportunidade
          </h2>
          <div className="flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-3.5">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-surface-raised ring-1 ring-edge-subtle flex items-center justify-center">
              <Moon size={17} className="text-content-tertiary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-content-primary leading-tight">
                {adiadasParaANoite.map((c) => `Patrulha de ${c.name.toLowerCase()}`).join(' · ')}
              </p>
              <p className="text-xs text-content-secondary mt-0.5 leading-snug">
                Abre quando escurecer — de dia não dá para saber se o poste está
                aceso.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── O QUE NÃO PRODUZ DADO FICA NO FIM ──

          Marcos cosméticos e coleção são reconhecimento e passeio. Estavam
          logo abaixo das diárias e competiam com o que a central existe para
          oferecer: o que fazer hoje, e o que já mudou na cidade.

          A ordem da tela é uma afirmação sobre prioridade. Roupa de avatar
          acima de "3 broncas para confirmar" diz que o app é sobre a roupa. */}
      {!carregando && <MarcosCosmeticos conquistas={conquistas} />}

      {/* A coleção fica como link, não como cartão, pelo mesmo motivo. */}
      <Link
        to="/colecao"
        className="text-2xs font-semibold text-content-tertiary hover:text-content-primary underline underline-offset-2 self-start"
      >
        Ver a coleção da cidade
      </Link>

      {/* SAÍRAM DAQUI (ago/2026): o cartão "Conferir problemas marcados" e a
          lista de categorias de patrulha.

          Os dois eram porta de entrada, e nenhum dos dois sumiu do app — só
          deixou de ocupar espaço numa tela que agora tem um fluxo: nível, o que
          continuar, patrulha em andamento, as missões.

          Conferir continua alcançável pelo botão da própria missão que pede
          isso ("Confira problemas marcados" → /conferir). Patrulhar ganhou tela
          própria em /patrulhar, e é para lá que apontam tanto as missões da
          trilha quanto o "Continuar patrulha" do bloco acima. */}
    </div>
  );
}
