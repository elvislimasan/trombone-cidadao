import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SatelliteDish, ClipboardCheck, X, Square, Volume2, VolumeX } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useNavigationGps } from '@/hooks/useNavigationGps';
import { useNavStreet } from '@/hooks/useNavStreet';
import { usePatrolRecorder } from '@/hooks/usePatrolRecorder';
import { usePatrolSignals, RAIO_CARD_MISSAO_M, RAIO_REGISTRO_M } from '@/hooks/usePatrolSignals';
import { useMissionProgress } from '@/contexts/MissionProgressContext';
import { useNavVoice } from '@/hooks/useNavVoice';
import { PONTOS } from '@/lib/patrolGame';
import { haversine, frasear } from '@/lib/navGeo';
import { nomeDaCategoria } from '@/lib/reportCategories';
import { getPatrolShareUrl } from '@/lib/shareUtils';

import AuditCard from './AuditCard';
import AuditSummary from './AuditSummary';
import PatrolExitSheet from '@/components/patrol/PatrolExitSheet';
import PatrolMissionBar from '@/components/patrol/PatrolMissionBar';
import PatrolPointsBurst from '@/components/patrol/PatrolPointsBurst';

const PatrolReportModal = lazy(() => import('@/components/patrol/PatrolReportModal'));
const PatrolStoryModal = lazy(() => import('@/components/patrol/PatrolStoryModal'));

// Modo auditoria: conferir os pontos que alguém marcou de passagem.
//
// POR QUE É UMA TELA SEPARADA DA PATRULHA
//
// As duas usam GPS e mapa, e por isso viviam juntas — as missões apareciam no
// meio da patrulha, interrompendo. Mas são atividades diferentes:
//
//   • patrulhar é PERCORRER: o app avisa o que aparece pelo caminho, e o
//     trajeto em si é o produto (distância, tempo, rastro);
//   • auditar é IR ATÉ: os pontos são o destino, não uma surpresa, e não há
//     trajeto a medir — o produto é fechar cada caso.
//
// Misturadas, uma atrapalhava a outra: quem saiu para conferir três pontos
// levava alertas de bronca no caminho, e quem saiu para patrulhar era
// interrompido por missões de outra categoria.
//
// A SAÍDA É GRAVADA, COMO A DA PATRULHA
//
// Não era, e estava errado. O argumento tinha sido "as ações já pagam sozinhas,
// uma sessão só para ter o que resumir seria peso morto". Mas sem registro não
// há histórico, não há resumo no fim, não há card — e a tela de histórico
// mostrava metade do que a pessoa fez na rua.
//
// A linha vai para a mesma tabela `patrols`, com `kind = 'audit'` (migração
// 192). A coluna não é rótulo: `patrols_count` e a sequência de dias contam só
// `patrol`, porque a missão "Saia em patrulha" fala de percorrer — e conferir
// é ir até o que já existe.

const CHAVE_AVISO = 'audit_disclaimer_visto';

export default function AuditOverlay({
  onPosicao,
  onSinais,
  // O ponto que a pessoa tocou no mapa. Mora na página, não aqui, porque é o
  // mapa que o produz — e o mapa é de lá.
  escolhidoDoMapa,
  onEscolherDoMapa,
  onSair,
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { celebrar } = useMissionProgress();

  const [avisoAceito, setAvisoAceito] = useState(() => {
    try { return localStorage.getItem(CHAVE_AVISO) === '1'; } catch { return false; }
  });
  const aceitarAviso = useCallback(() => {
    try { localStorage.setItem(CHAVE_AVISO, '1'); } catch {}
    setAvisoAceito(true);
  }, []);

  const { posicao, erro, sinalFraco } = useNavigationGps({ ativo: avisoAceito });
  const { rua, bairro, cidadeId } = useNavStreet(posicao);

  // ── Voz, igual à patrulha ──
  //
  // A auditoria nasceu muda, e o custo é maior aqui do que lá. Na patrulha o
  // alerta é uma surpresa no caminho; aqui o ponto é o DESTINO — a pessoa saiu
  // de casa para chegar nele e passa o trajeto inteiro olhando a tela para
  // saber se já chegou. É exatamente quem mais precisa ouvir em vez de olhar.
  //
  // Mesmo hook da patrulha: fala pelo TTS nativo no Android e no iOS, e pela
  // Web Speech API no navegador. Ver o cabeçalho de useNavVoice.
  const { anunciar, preparar, mudo, alternarMudo, suportada: somSuportado } = useNavVoice();

  // Destrava áudio no toque que aceita o aviso — tem que ser dentro do gesto,
  // e o primeiro ponto ao alcance chega minutos depois. Ver useNavVoice.
  //
  // E fala "Modo missão iniciado", pelo mesmo motivo do anúncio da patrulha:
  // é o único teste de som antes do primeiro ponto, e aqui o primeiro ponto
  // pode estar a quilômetros. Sem ele, o silêncio no caminho é ambíguo — app
  // mudo ou nada por perto? O bipe passa pelo WebAudio e a fala pelo TTS, que
  // são caminhos independentes; ouvir os dois confirma os dois.
  const anunciarRef = useRef(anunciar);
  useEffect(() => { anunciarRef.current = anunciar; }, [anunciar]);

  const anunciouInicioRef = useRef(false);
  useEffect(() => {
    if (!avisoAceito || anunciouInicioRef.current) return;
    anunciouInicioRef.current = true;

    preparar();

    // Ver PatrolOverlay: a folga cobre o resume assíncrono do AudioContext, e
    // o ref evita que um toque no mudo dentro desta janela cancele o timer.
    const t = setTimeout(() => anunciarRef.current('Modo missão iniciado'), 250);
    return () => clearTimeout(t);
  }, [avisoAceito, preparar]);

  // Sem categoria: a conferência é sobre TUDO que está em aberto. É a diferença
  // central em relação à patrulha, que é de uma categoria só.
  // `rua` entra porque o que nasce aqui é bronca de verdade: sem ela o
  // `address` fica nulo e a página de detalhe exibe o mapa sem o endereço.
  const sinais = usePatrolSignals(posicao, { cityId: cidadeId, bairro, rua });

  // Mede a saída: tempo, distância, rastro, e o que ela produziu.
  const recorder = usePatrolRecorder(posicao, { cityId: cidadeId, kind: 'audit' });
  const {
    distanciaM,
    contagens,
    salvando,
    finalizar,
    duracaoAgora,
    registrarBronca,
    registrarVistoria,
  } = recorder;

  const [adiados, setAdiados] = useState(() => new Set());
  // null | 'decidir' | 'resumo'. Mesma máquina de saída da patrulha, e pela
  // mesma razão: o X e o voltar do aparelho são fáceis de tocar sem querer.
  const [saida, setSaida] = useState(null);
  const [duracaoS, setDuracaoS] = useState(0);
  const [story, setStory] = useState(null);
  const escolhido = escolhidoDoMapa;
  const setEscolhido = onEscolherDoMapa;
  const [registro, setRegistro] = useState(null);
  const [pontosDoEvento, setPontosDoEvento] = useState(PONTOS.missao);
  const [comemoracao, setComemoracao] = useState(0);
  const [resolvidos, setResolvidos] = useState(0);

  // Lidos das contagens do gravador, não de estado próprio: é ele quem grava, e
  // dois números para a mesma coisa divergem no primeiro erro.
  const registrados = contagens.registradas;
  const vazios = contagens.vazias;

  // Espelha o feed de sinais para o mapa da página.
  useEffect(() => { onSinais?.(sinais.missoes); }, [sinais.missoes, onSinais]);
  useEffect(() => { if (posicao) onPosicao?.(posicao); }, [posicao, onPosicao]);

  const comemorar = useCallback((pontos) => {
    setPontosDoEvento(pontos);
    setComemoracao((n) => n + 1);
    celebrar?.();
  }, [celebrar]);

  /** O ponto ao alcance, descontados os adiados nesta sessão. */
  const aoAlcance = useMemo(() => {
    const m = sinais.missaoAoAlcance;
    return m && !adiados.has(m.id) ? m : null;
  }, [sinais.missaoAoAlcance, adiados]);

  // Chegar no que se escolheu dissolve a barra: o card assume, e os dois
  // falando do mesmo ponto seria a mesma pergunta feita duas vezes.
  useEffect(() => {
    if (aoAlcance && escolhido && aoAlcance.id === escolhido.id) setEscolhido(null);
  }, [aoAlcance, escolhido, setEscolhido]);

  /**
   * Anuncia o ponto que entrou no alcance.
   *
   * POR ID, NÃO POR PRESENÇA. `aoAlcance` é um `useMemo` que recalcula a cada
   * leitura de GPS — uma por segundo — e o objeto sai novo toda vez, porque o
   * `.map` refaz `{ ...m, distancia }`. Reagir à identidade do objeto faria a
   * voz repetir o mesmo ponto sem parar enquanto a pessoa caminha até ele.
   *
   * O ref guarda o ÚLTIMO id falado e só solta a voz quando ele muda. Voltar a
   * null (ponto resolvido ou adiado) limpa o ref, então reaproximar-se de um
   * ponto adiado volta a anunciar — que é o certo: a pessoa mudou de ideia e
   * está indo até lá de novo.
   */
  const ultimoAnunciadoRef = useRef(null);
  useEffect(() => {
    const id = aoAlcance?.id ?? null;
    if (id === ultimoAnunciadoRef.current) return;
    ultimoAnunciadoRef.current = id;
    if (!aoAlcance) return;

    // "Conferir buraco a 40 metros" — o verbo separa isto do alerta da
    // patrulha, que avisa de algo que se passa ao lado. Aqui a pessoa chegou no
    // que foi buscar, e o que vem a seguir é uma pergunta a responder.
    const frase = frasear(nomeDaCategoria(aoAlcance.category), aoAlcance.distancia);
    anunciar(`Conferir ${frase.toLowerCase()}`);
  }, [aoAlcance, anunciar]);

  const aoVazio = useCallback(async (sinal) => {
    const r = await sinais.descartar(sinal.id);
    if (!r.ok) {
      toast({
        title: 'Não foi possível encerrar',
        description: r.motivo,
        variant: 'destructive',
      });
      return;
    }
    registrarVistoria(sinal.id);
    // Três confirmações visuais já acontecem aqui: o +N sobe, o contador de
    // resolvidos anda e o sinal some do mapa. Um toast narrando isso seria a
    // quarta — e a única que tapa a via na frente de quem está verificando.
    comemorar(PONTOS.vistoria);
    setResolvidos((n) => n + 1);
  }, [sinais, toast, comemorar, registrarVistoria, setResolvidos]);

  const aoFecharRegistro = useCallback(({ concluida, id }) => {
    setRegistro(null);
    if (!concluida) return;
    registrarBronca(id, { deMissao: true });
    comemorar(PONTOS.missao);
    setResolvidos((n) => n + 1);
  }, [comemorar, registrarBronca]);

  // ── Uma camada por vez, como na patrulha ──
  const camada = useMemo(() => {
    if (story) return 'story';
    if (saida === 'resumo') return 'resumo';
    if (saida === 'decidir') return 'decidir';
    if (registro) return 'registro';
    if (aoAlcance) return 'card';
    if (escolhido) return 'escolhido';
    return 'livre';
  }, [story, saida, registro, aoAlcance, escolhido]);

  // Tocar no X não encerra: abre a pergunta. O relógio e o rastro seguem
  // correndo atrás dela.
  const pedirSaida = useCallback(() => {
    setDuracaoS(duracaoAgora());
    setSaida('decidir');
  }, [duracaoAgora]);

  /** Encerrar e salvar: grava e passa para o resumo. */
  const encerrarESalvar = useCallback(async () => {
    if (!user) { onSair(); return; }
    const r = await finalizar({ publica: false });
    if (!r.ok) {
      toast({
        title: 'Não foi possível salvar a saída',
        description: 'As respostas que você deu foram enviadas normalmente.',
        variant: 'destructive',
      });
      onSair();
      return;
    }
    setSaida('resumo');
  }, [user, finalizar, toast, onSair]);

  /**
   * Compartilhar: marca a saída como pública e abre o card do story.
   *
   * A saída JÁ está gravada quando o resumo aparece — este `finalizar` é o
   * update que liga `is_public`, e ele nunca volta atrás (ver usePatrolRecorder).
   * Sem o card, "Compartilhar" só marcava uma coluna e fechava a tela: nada
   * chegava ao dedo de quem queria publicar.
   */
  const compartilhar = useCallback(async () => {
    const r = await finalizar({ publica: true });
    if (!r.ok) {
      toast({
        title: 'Não foi possível compartilhar',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      });
      return;
    }
    setStory({
      patrulhaId: r.patrulha.id,
      shareUrl: getPatrolShareUrl(r.patrulha.id),
    });
  }, [finalizar, toast]);

  /**
   * Descartar não desfaz nada do que a saída produziu: cada bronca registrada e
   * cada ponto verificado já é linha própria em `reports`, com pontos pagos. O
   * que se joga fora é só a medida do trajeto.
   */
  /* Sem toast de confirmação: a folha de saída já diz, embaixo do botão, que
     as respostas continuam valendo. Repetir depois do toque não informa nada. */
  const descartarSaida = useCallback(() => {
    onSair();
  }, [onSair]);

  const voltarUmaCamada = useCallback(() => {
    // No resumo a decisão já foi tomada e a saída já está no banco: fechar de
    // verdade. Na folha de decisão, voltar é desistir de sair.
    if (story) { setStory(null); onSair(); return; }
    if (saida === 'resumo') { onSair(); return; }
    if (saida === 'decidir') { setSaida(null); return; }
    if (registro) { setRegistro(null); return; }
    if (escolhido) { setEscolhido(null); return; }
    pedirSaida();
  }, [story, saida, registro, escolhido, setEscolhido, onSair, pedirSaida]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle = null;
    CapApp.addListener('backButton', voltarUmaCamada).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [voltarUmaCamada]);

  if (!avisoAceito) {
    return (
      <div className="absolute inset-0 z-[1005] flex flex-col justify-end bg-black/60">
        <div
          className="bg-surface-base rounded-t-3xl px-5 pt-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
        >
          <span className="w-12 h-12 rounded-full bg-brand-subtleBg flex items-center justify-center mb-3">
            <ClipboardCheck size={24} className="text-brand" />
          </span>
          <h2 className="text-xl font-extrabold text-content-primary leading-tight">
            Conferir problemas marcados
          </h2>
          <p className="text-sm text-content-secondary mt-2 leading-snug">
            O mapa mostra só os problemas que alguém marcou de passagem e que
            ninguém foi conferir ainda. Chegue perto de um e responda se ele está
            mesmo lá.
          </p>
          <p className="text-sm text-content-secondary mt-2 leading-snug">
            Use o app parado. Se estiver dirigindo, peça a alguém para responder
            por você.
          </p>

          <div className="flex gap-2.5 mt-5">
            <button
              type="button"
              onClick={onSair}
              className="flex-1 h-12 rounded-2xl border border-edge-default text-content-primary text-sm font-semibold"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={aceitarAviso}
              className="flex-1 h-12 rounded-2xl bg-brand text-content-onBrand text-sm font-bold"
            >
              Começar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!posicao && !erro && (
        <div className="absolute inset-0 z-[1002] flex flex-col items-center justify-center gap-3 bg-surface-base/80 backdrop-blur-sm">
          <Loader2 size={36} className="animate-spin text-brand" />
          <p className="text-sm text-content-secondary">Procurando você no mapa…</p>
        </div>
      )}

      {/* Faixa superior: o que falta, e a saída. */}
      <div className="absolute inset-x-0 top-0 z-[1001] pointer-events-none pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-surface-overlay/95 backdrop-blur-sm border border-edge-subtle shadow-xl px-4 py-3 pointer-events-auto">
          <ClipboardCheck size={22} className="text-brand shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary leading-none mb-1">
              Conferindo problemas
            </p>
            <p className="text-lg font-bold text-content-primary truncate leading-tight">
              {sinais.missoes.length === 0
                ? 'Nenhum por perto'
                : `${sinais.missoes.length} ${sinais.missoes.length === 1 ? 'problema em aberto' : 'problemas em aberto'}`}
              {resolvidos > 0 && (
                <span className="text-brand"> · {resolvidos} resolvido{resolvidos > 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          {/* Silenciar fica ANTES do X e sempre visível: calar o app é o que se
              quer poder fazer no instante em que ele fala, e caçar o botão com
              o veículo andando é pior que o próprio som. Mesma regra do
              PatrolHud. */}
          {somSuportado && (
            <button
              type="button"
              onClick={alternarMudo}
              aria-label={mudo ? 'Ligar alertas por voz' : 'Silenciar alertas por voz'}
              aria-pressed={!mudo}
              className={`shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full border transition-colors ${
                mudo
                  ? 'bg-transparent border-edge-default text-content-tertiary'
                  : 'bg-brand border-brand text-content-onBrand'
              }`}
            >
              {mudo ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}

          <button
            type="button"
            onClick={pedirSaida}
            aria-label="Encerrar conferência"
            className="shrink-0 w-12 h-12 -mr-1 inline-flex items-center justify-center rounded-full text-content-secondary active:bg-surface-subtleHover"
          >
            <X size={24} />
          </button>
        </div>

        {sinalFraco && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3 py-2 pointer-events-auto w-fit">
            <SatelliteDish size={15} className="text-status-pendingFg shrink-0" />
            <span className="text-xs font-semibold text-status-pendingFg">
              Sinal fraco — a distância pode estar imprecisa
            </span>
          </div>
        )}
      </div>

      {camada === 'livre' && (
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1001] px-3 flex flex-col items-center gap-2.5">
          {/* Nada por perto não é falha: é o mapa limpo, que é o objetivo. */}
          {posicao && sinais.missoes.length === 0 && (
            <div className="w-full rounded-2xl bg-surface-overlay/95 backdrop-blur-sm border border-edge-subtle shadow-xl px-4 py-3.5 text-center">
              <p className="text-sm font-bold text-content-primary">
                Nenhum problema em aberto por aqui
              </p>
              <p className="text-xs text-content-secondary mt-1 leading-snug">
                Tudo já foi conferido nesta área. Ande um pouco ou volte depois —
                marcações novas aparecem sozinhas.
              </p>
            </div>
          )}

          {/* ENCERRAR, POR EXTENSO E AO ALCANCE DO POLEGAR.
              O X do alto continua funcionando, mas ele é pequeno, fica longe
              da mão e divide espaço com o nome da atividade. Numa tela que se
              usa em pé na rua, terminar não pode depender de acertar um ícone
              no canto superior. Mesma decisão do HUD da patrulha. */}
          <button
            type="button"
            onClick={pedirSaida}
            className="h-11 px-5 inline-flex items-center gap-2 rounded-full bg-surface-overlay/95 backdrop-blur-sm border border-edge-default shadow-xl text-sm font-bold text-content-secondary active:bg-surface-subtleHover transition-colors"
          >
            <Square size={13} className="fill-current" />
            Encerrar conferência
          </button>
        </div>
      )}

      {camada === 'decidir' && (
        <PatrolExitSheet
          contagens={contagens}
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          feitosNaSessao={{ broncas: registrados, sinais: vazios, missoes: 0 }}
          salvando={salvando}
          onContinuar={() => setSaida(null)}
          onEncerrar={encerrarESalvar}
          onDescartar={descartarSaida}
        />
      )}

      {camada === 'story' && (
        <Suspense fallback={null}>
          <PatrolStoryModal
            contagens={contagens}
            duracaoS={duracaoS}
            distanciaM={distanciaM}
            // Nível e título de bairro ficam de fora: esta tela não monta o
            // usePatrolGame, e inventar os números aqui faria o card contar uma
            // história que o perfil desmente.
            nivel={null}
            titulo={null}
            lugar={bairro}
            feitos={{ broncas: registrados, sinais: vazios, missoes: 0 }}
            shareUrl={story.shareUrl}
            patrulhaId={story.patrulhaId}
            onFechar={() => { setStory(null); onSair(); }}
          />
        </Suspense>
      )}

      {camada === 'resumo' && (
        <AuditSummary
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          registrados={registrados}
          vazios={vazios}
          salvando={salvando}
          onCompartilhar={compartilhar}
          onFechar={onSair}
        />
      )}

      {camada === 'escolhido' && (
        <PatrolMissionBar
          missao={escolhido}
          distancia={posicao ? haversine(posicao, escolhido) : null}
          onRegistrar={(m) => setRegistro({ modo: 'missao', missao: m })}
          onCancelar={() => setEscolhido(null)}
        />
      )}

      {camada === 'card' && (
        <AuditCard
          sinal={aoAlcance}
          distancia={posicao ? haversine(posicao, aoAlcance) : null}
          enviando={sinais.enviando}
          onRegistrar={(m) => setRegistro({ modo: 'missao', missao: m })}
          onVazio={aoVazio}
          onAdiar={(m) => setAdiados((atual) => new Set(atual).add(m.id))}
        />
      )}

      {camada === 'registro' && (
        <Suspense fallback={null}>
          <PatrolReportModal
            modo="missao"
            missao={registro.missao}
            posicao={posicao}
            distancia={sinais.distanciaAte(registro.missao)}
            enviando={sinais.enviando}
            onCumprir={sinais.cumprir}
            onCriar={sinais.criarBroncaCompleta}
            onFechar={aoFecharRegistro}
          />
        </Suspense>
      )}

      <PatrolPointsBurst chave={comemoracao} pontos={pontosDoEvento} />

      {!user && (
        <div className="absolute inset-x-0 bottom-24 z-[1003] px-4">
          <p className="rounded-xl bg-surface-overlay/95 border border-edge-subtle px-4 py-3 text-sm text-content-secondary text-center">
            Entre na sua conta para responder as marcações.
          </p>
        </div>
      )}

      {/* Os raios em uso, ditos uma vez para quem quiser entender o
          comportamento: o card sobe a 15 m, o botão da barra a 20 m. */}
      <span className="sr-only">
        O card aparece a {RAIO_CARD_MISSAO_M} metros da marcação; a partir de{' '}
        {RAIO_REGISTRO_M} metros é possível registrar pela barra.
      </span>
    </>
  );
}
