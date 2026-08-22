import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App as CapApp } from '@capacitor/app';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  enviarAtualizacaoDeBronca,
  computeDisabledUpdateTypes,
  getUpdateTypeInfo,
} from '@/hooks/useReportUpdate';

import { useNavigationGps } from '@/hooks/useNavigationGps';
import { useNavCorridor } from '@/hooks/useNavCorridor';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import { useNavVoice } from '@/hooks/useNavVoice';
import { useNavStreet } from '@/hooks/useNavStreet';
import { usePatrolRecorder } from '@/hooks/usePatrolRecorder';
import { usePatrolGame } from '@/hooks/usePatrolGame';
import { usePatrolSignals } from '@/hooks/usePatrolSignals';
import { frasear, haversine } from '@/lib/navGeo';
import { PONTOS } from '@/lib/patrolGame';
import { getPatrolShareUrl } from '@/lib/shareUtils';

import PatrolHud from './PatrolHud';
import PatrolAlertCard from './PatrolAlertCard';
import PatrolSummary from './PatrolSummary';
import PatrolExitSheet from './PatrolExitSheet';
import PatrolDisclaimer from './PatrolDisclaimer';
import PatrolPointsBurst from './PatrolPointsBurst';
import PatrolAchievementUnlocked from './PatrolAchievementUnlocked';
import PatrolSignalButton from './PatrolSignalButton';
import PatrolSignalSheet from './PatrolSignalSheet';
import PatrolMissionCard from './PatrolMissionCard';
import PatrolRouteBar from './PatrolRouteBar';
import PatrolReportModal from './PatrolReportModal';
import PatrolStoryModal from './PatrolStoryModal';

// Modo patrulha: junta GPS, corredor de broncas, alertas e envio.
//
// Renderiza SOBRE o mapa da MapPage — o MapView não desmonta ao entrar, então
// não há recarga de tiles nem tela branca na transição.
//
// Divisão de responsabilidade: as decisões (quando alertar, o que buscar,
// quando falar) moram nos hooks; aqui fica a ligação entre elas e o envio ao
// banco, que é a única parte que precisa saber de usuário e de toast.

const CHAVE_AVISO = 'nav_disclaimer_visto';

// Notificar a posição a cada leitura do GPS re-executaria os efeitos ~1x/s.
// Só quem precisa dessa cadência é o alerta; o mapa acompanha suave com menos.
const useAvisoAceito = () => {
  const [aceito, setAceito] = useState(() => {
    try { return localStorage.getItem(CHAVE_AVISO) === '1'; } catch { return false; }
  });
  const aceitar = useCallback(() => {
    try { localStorage.setItem(CHAVE_AVISO, '1'); } catch {}
    setAceito(true);
  }, []);
  return [aceito, aceitar];
};

/**
 * @param {object} props
 * @param {string|null} [props.categoria]  patrulha de uma categoria só; null = tudo.
 */
export default function PatrolOverlay({
  missaoTracada,
  onTracarRota,
  onPosicao,
  onBroncas,
  onRastro,
  onMissoes,
  categoria = null,
  cityId: cidadeDoMapa,
  onSair,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [avisoAceito, aceitarAviso] = useAvisoAceito();
  /**
   * A saída, em dois passos: `null` → 'decidir' → 'resumo'.
   *
   * POR QUE DOIS
   *
   * Era um só, e ele acumulava as duas funções: o resumo trazia nível,
   * sequência, títulos e medalhas — e, no fim de tudo, quatro botões, três
   * deles terminais. Quem tocou no X sem querer tinha que atravessar a
   * comemoração inteira para achar como voltar.
   *
   * Agora 'decidir' só pergunta (continuar, encerrar, descartar) e 'resumo' só
   * mostra — a patrulha já está gravada quando ele abre, e o que resta ali é
   * ver o placar e compartilhar. Nenhuma escolha compete com a festa.
   */
  const [saida, setSaida] = useState(null);
  // Atualizações que o usuário já enviou nos últimos 7 dias, buscadas uma vez.
  // Sem isso, cada alerta precisaria de uma consulta só para saber se os botões
  // estão liberados — uma requisição por bronca, em movimento.
  const [minhasAtualizacoes, setMinhasAtualizacoes] = useState([]);

  /**
   * A única saída da tela.
   *
   * NA WEB ELA TEM QUE DESFAZER A ARMADILHA
   *
   * O efeito mais abaixo empilha uma entrada extra no histórico para segurar o
   * botão voltar do navegador. Sair com `navigate(replace)` por cima dela
   * trocaria só o topo, e a entrada de `/patrulhar/:categoria` ficaria embaixo:
   * um toque no voltar, depois de encerrada, abriria uma patrulha NOVA.
   *
   * Então a saída consome a sentinela primeiro (`history.back()`) e só navega
   * quando o `popstate` confirma que ela se foi — que é o que `saindoRef` marca
   * para o listener não rearmar a armadilha nesse caminho.
   *
   * No Android nada disso existe: lá o voltar é evento do sistema e não mexe no
   * histórico.
   */
  const saindoRef = useRef(false);
  const onSairRef = useRef(onSair);
  useEffect(() => { onSairRef.current = onSair; }, [onSair]);

  const sairDaTela = useCallback(() => {
    if (Capacitor.isNativePlatform()) { onSairRef.current(); return; }
    if (saindoRef.current) return;
    saindoRef.current = true;
    window.history.back();
  }, []);

  const ativo = avisoAceito;
  const { posicao, erro, velocidadeKmh, sinalFraco } = useNavigationGps({ ativo });
  // A categoria filtra na FONTE, não na exibição: o corredor traz só o que
  // interessa, e o mapa desenha menos pinos. Numa patrulha de buracos, os
  // postes nem chegam ao aparelho.
  const { broncas, erroRede, descartar } = useNavCorridor(posicao, { categoria });
  const { rua, bairro, cidadeId } = useNavStreet(posicao);
  const { anunciar } = useNavVoice();

  // A cidade de tudo que a patrulha grava e a do CHAO, nao a do seletor.
  //
  // `cidadeDoMapa` e o filtro de visualizacao da tela de mapa: nasce nulo,
  // depende de o usuario ter escolhido cidade, e em patrulha nem e reavaliado
  // (o mapa ignora mudanca de area nesse modo). Usa-lo era o que gravava sinal
  // e bronca com `city_id` nulo — e uma linha sem cidade some do placar e do
  // painel do embaixador, cuja RLS e `is_ambassador_of(uid, city_id)`.
  //
  // O GPS resolve a cidade certa inclusive ao cruzar a divisa no meio do
  // trajeto. O filtro fica de reserva para os primeiros segundos, antes de o
  // primeiro reverse-geocode responder.
  const cityId = cidadeId ?? cidadeDoMapa ?? null;

  const {
    rastro, distanciaM, contagens, salvando, duracaoAgora,
    registrarPassagem, registrarConfirmacao, registrarBronca, registrarSinal,
    finalizar,
  } = usePatrolRecorder(posicao, { cityId });

  const jogo = usePatrolGame({ cityId });
  // Contador, não booleano: duas confirmações seguidas precisam reiniciar a
  // animação, e um booleano que já está `true` não dispara nada.
  const [pontosEvento, setPontosEvento] = useState(0);
  // Quanto vale o evento atual: 5 numa confirmacao, 3 num sinal, 12 numa missao.
  // Antes era constante — havia um so tipo de acao pontuavel.
  const [pontosDoEvento, setPontosDoEvento] = useState(PONTOS.atualizacao);
  // Medalhas desbloqueadas nesta patrulha, apuradas depois de gravar.
  const [novasConquistas, setNovasConquistas] = useState([]);

  // Toda bronca alertada conta como "passou por", tenha sido respondida ou não:
  // é o denominador honesto do placar. Quem só dirigiu perto não deve aparecer
  // como tendo patrulhado.
  const aoAlertar = useCallback((alerta) => {
    const grupo = alerta.broncas?.length ? alerta.broncas : [alerta.bronca];

    // A voz diz o número quando há mais de uma: "3 buracos a 10 metros". Sem
    // isso, quem está dirigindo ouviria o mesmo aviso de sempre e responderia
    // as três achando que respondeu uma.
    const frase = frasear(alerta.bronca.categoryName, alerta.distancia);
    anunciar(grupo.length > 1 ? `${grupo.length} ${frase.toLowerCase()}` : frase);

    // Passou pelas três, não por uma. `passed_count` é o denominador honesto do
    // placar, e contar só a líder o encolheria.
    grupo.forEach((b) => registrarPassagem(b.id));
  }, [anunciar, registrarPassagem]);

  const { alertaAtual, fila, adiar, resolver, removerDaFila, AUTO_DISMISS_MS } =
    useProximityAlerts(posicao, broncas, { aoAlertar });

  // ── Sinalização e missões ──
  //
  // Vive ao lado do gravador, não dentro dele: sinalizar não é um evento da
  // patrulha, é uma bronca nascendo. A patrulha continua medindo o que sempre
  // mediu — distância, tempo, broncas confirmadas — e os sinais aparecem no
  // nível do usuário, que é onde valem pontos.
  const sinais = usePatrolSignals(posicao, { cityId, bairro, rua, categoria });

  const [mostrarSinalizar, setMostrarSinalizar] = useState(false);
  // O modal de registro atende dois caminhos — completar a missão de alguém ou
  // criar a bronca do zero. Um estado só, com o modo dentro, porque os dois
  // nunca acontecem juntos: abrir um fecha o outro por construção.
  const [registro, setRegistro] = useState(null);
  // Missões que o usuário dispensou com "agora não". Só nesta sessão: passar de
  // novo pelo ponto amanhã deve perguntar de novo.
  const [missoesAdiadas, setMissoesAdiadas] = useState(() => new Set());
  // Contadores da sessão, para o resumo. Locais porque a tabela `patrols` não
  // guarda sinais — e não deveria: seus contadores estão amarrados por check a
  // ids de broncas confirmadas.
  const [feitosNaSessao, setFeitosNaSessao] = useState({
    sinais: 0,
    missoes: 0,
    broncas: 0,
  });
  // Card da patrulha, aberto depois de gravar. Guarda a linha salva porque o
  // link do story sai do id dela.
  const [story, setStory] = useState(null);

  // As missões sobem para a MapPage desenhar os pins tracejados.
  const onMissoesRef = useRef(onMissoes);
  useEffect(() => { onMissoesRef.current = onMissoes; }, [onMissoes]);
  useEffect(() => { onMissoesRef.current?.(sinais.missoes); }, [sinais.missoes]);

  /** Vibração + "+N" subindo. Chega antes da rede: o toque já aconteceu. */
  const comemorar = useCallback((pontos) => {
    setPontosDoEvento(pontos);
    setPontosEvento((n) => n + 1);
    if (Capacitor.isPluginAvailable('Haptics')) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } else if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }, []);

  const aoSoAlertar = useCallback(async (categoryId) => {
    const r = await sinais.sinalizar(categoryId);
    setMostrarSinalizar(false);

    if (r.duplicado) {
      toast({
        title: 'Já tem um sinal aqui',
        description: 'Alguém marcou este mesmo problema a poucos metros.',
      });
      return;
    }
    if (!r.ok) {
      toast({
        title: 'Não foi possível sinalizar',
        // O motivo real, não um "tente de novo" que não ajuda ninguém a
        // entender por que não deu — nem quem usa, nem quem conserta.
        description: r.motivo || 'Tente de novo em instantes.',
        variant: 'destructive',
      });
      return;
    }

    setFeitosNaSessao((f) => ({ ...f, sinais: f.sinais + 1 }));
    // O id vai para a linha da patrulha: é o que permite refazer o card depois,
    // e o que deixa o número auditável.
    registrarSinal(r.id);
    comemorar(PONTOS.sinal);
    toast({
      title: 'Sinalizado 🚩',
      description: 'Virou missão. Outro cidadão completa o cadastro com foto.',
    });
  }, [sinais, toast, comemorar, registrarSinal]);

  const aoCadastroCompleto = useCallback((categoryId) => {
    setMostrarSinalizar(false);
    setRegistro({ modo: 'nova', categoria: categoryId });
  }, []);

  const aoDescartarMissao = useCallback(async (missao) => {
    const r = await sinais.descartar(missao.id);
    if (!r.ok) {
      toast({
        title: 'Não foi possível encerrar',
        description: r.motivo,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Missão encerrada',
      description: 'Obrigado por conferir — o sinal deixa de valer pontos.',
    });
  }, [sinais, toast]);

  const aoFecharRegistro = useCallback(({ concluida, modo, id }) => {
    setRegistro(null);
    if (!concluida) return;

    // Missão cumprida e bronca criada produzem, as duas, uma bronca com foto —
    // e é assim que a patrulha as declara.
    registrarBronca(id, { deMissao: modo === 'missao' });

    if (modo === 'missao') {
      setFeitosNaSessao((f) => ({ ...f, missoes: f.missoes + 1 }));
      comemorar(PONTOS.missao);
    } else {
      // Contador próprio, não somado aos sinais: o card do story separa
      // "broncas registradas" de "sinalizações feitas", e são coisas
      // diferentes — uma tem foto e descrição, a outra é um toque.
      setFeitosNaSessao((f) => ({ ...f, broncas: f.broncas + 1 }));
      comemorar(PONTOS.bronca);
    }
  }, [comemorar, registrarBronca]);

  /**
   * A missão ao alcance, descontadas as adiadas nesta sessão.
   *
   * FILTRA POR CATEGORIA, COMO TUDO O MAIS
   *
   * A regra da patrulha por categoria é uma só: numa patrulha de buracos, só
   * buraco aparece. O corredor já obedecia (useNavCorridor recebe `categoria`),
   * mas a missão não — `patrol_missions_nearby` devolve todo sinal aberto num
   * raio de 2 km, sem categoria, e nada filtrava isso depois.
   *
   * O resultado era o card de um poste sinalizado interrompendo uma patrulha de
   * buracos, com o formulário de iluminação junto: uma categoria que a pessoa
   * não escolheu, pedindo a plaqueta de um poste que ela não veio ver.
   *
   * O filtro mora no hook, junto da escolha do mais próximo — e não aqui,
   * depois dela. Peneirar por último faria um poste a 40 m ganhar a disputa de
   * proximidade e ser descartado em seguida, levando junto o buraco a 80 m que
   * era a missão desta patrulha.
   *
   * Também não está na RPC: `patrol_missions_nearby` serve o mapa igualmente,
   * onde ver todos os sinais é o certo.
   */
  const missaoAoAlcance = useMemo(() => {
    const m = sinais.missaoAoAlcance;
    return m && !missoesAdiadas.has(m.id) ? m : null;
  }, [sinais.missaoAoAlcance, missoesAdiadas]);

  // Chegou: a rota cumpriu o papel e sai de cena.
  //
  // Sem isto, a barra continuaria montada sob o card de missão — invisível pela
  // ordem das camadas, mas viva —, e cancelar o card devolveria uma rota para
  // um lugar onde a pessoa já está.
  useEffect(() => {
    if (missaoAoAlcance && missaoTracada && missaoAoAlcance.id === missaoTracada.id) {
      onTracarRota?.(null);
    }
  }, [missaoAoAlcance, missaoTracada, onTracarRota]);

  // ── Fila de camadas ──
  //
  // Uma tela, uma coisa por vez.
  //
  // Antes cada elemento carregava a própria condição — "apareço se não houver
  // alerta, e não houver resumo, e não houver folha aberta…". O número dessas
  // negativas cresce com o quadrado dos elementos, e cada novo card obrigava a
  // revisar todos os anteriores. Foi assim que o botão de sinalizar passou a
  // poder ficar sob um card.
  //
  // Aqui existe uma ordem de precedência só, e cada elemento pergunta se a vez
  // é dele. A ordem é a da urgência: uma medalha interrompe o resumo, o resumo
  // interrompe o registro, e o alerta — que some sozinho em 15 s — passa na
  // frente da missão, que espera parada.
  //
  // Acrescentar uma camada passa a ser acrescentar uma linha nesta lista.
  const camada = useMemo(() => {
    if (novasConquistas.length > 0) return 'medalha';
    if (story) return 'story';
    if (saida === 'resumo') return 'resumo';
    if (saida === 'decidir') return 'decidir';
    if (registro) return 'registro';
    if (mostrarSinalizar) return 'sinalizar';
    if (alertaAtual) return 'alerta';
    if (missaoAoAlcance) return 'missao';
    // Chegar vence o caminho: a 15 m o card completo toma o lugar da barra.
    if (missaoTracada) return 'rota';
    return 'livre';
  }, [
    novasConquistas.length, story, saida, registro,
    mostrarSinalizar, alertaAtual, missaoAoAlcance, missaoTracada,
  ]);


  // O rastro sobe para a MapPage desenhar. Fica só em memória: gravá-lo levaria
  // junto o ponto de partida, que costuma ser a casa de quem patrulha.
  const onRastroRef = useRef(onRastro);
  useEffect(() => { onRastroRef.current = onRastro; }, [onRastro]);
  useEffect(() => { onRastroRef.current?.(rastro); }, [rastro]);

  // Congelada ao abrir o resumo: o placar mostra a patrulha que terminou, e um
  // cronômetro correndo atrás dos números daria a impressão de que ela continua.
  const [duracaoS, setDuracaoS] = useState(0);

  // Repassa a posição para a MapPage seguir o usuário com o mapa.
  const onPosicaoRef = useRef(onPosicao);
  useEffect(() => { onPosicaoRef.current = onPosicao; }, [onPosicao]);
  useEffect(() => { if (posicao) onPosicaoRef.current?.(posicao); }, [posicao]);

  // E o corredor, para o mapa desenhar os pins.
  //
  // Não é só conveniência: em patrulha a posição muda a cada segundo, e com
  // ela o mapa re-renderiza. Fossem os pins do enquadramento anterior — algumas
  // centenas — seriam centenas de setLatLng por segundo no Leaflet. O corredor
  // tem poucas dezenas e só muda quando o fetch repete, uma vez por quilômetro.
  const onBroncasRef = useRef(onBroncas);
  useEffect(() => { onBroncasRef.current = onBroncas; }, [onBroncas]);
  useEffect(() => { onBroncasRef.current?.(broncas); }, [broncas]);

  // GPS negado é impeditivo: sem posição não existe modo patrulha.
  useEffect(() => {
    if (!erro) return;
    toast({
      title: erro === 'negado' ? 'Localização negada' : 'GPS indisponível',
      description:
        erro === 'negado'
          ? 'Autorize o acesso à localização para usar o modo patrulha.'
          : 'Não foi possível obter sua posição.',
      variant: 'destructive',
    });
    sairDaTela();
  }, [erro, toast, sairDaTela]);

  useEffect(() => {
    if (!user) return;
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('report_updates')
      .select('id, report_id, author_id, update_type, created_at')
      .eq('author_id', user.id)
      .gte('created_at', desde)
      .then(({ data }) => setMinhasAtualizacoes(data || []));
  }, [user]);

  /** Tipos bloqueados pelo limite semanal, para uma bronca específica. */
  const bloqueadosDe = useCallback((reportId) => {
    const daBronca = minhasAtualizacoes.filter((u) => u.report_id === reportId);
    return computeDisabledUpdateTypes(daBronca, user);
  }, [minhasAtualizacoes, user]);

  const bloqueadosDoAlerta = useMemo(
    () => (alertaAtual ? bloqueadosDe(alertaAtual.bronca.id) : {}),
    [alertaAtual, bloqueadosDe]
  );

  /**
   * Envia a confirmação. Devolve boolean para a fila saber se pode remover o
   * item — no card do trajeto o retorno é ignorado de propósito: ele fecha na
   * hora e o envio segue em segundo plano, porque esperar a rede com o carro
   * andando é tempo de olho na tela.
   */
  const enviar = useCallback(async (bronca, tipo) => {
    if (!user) {
      navigate('/login', { state: { from: '/mapa' } });
      return false;
    }
    const r = await enviarAtualizacaoDeBronca({ report: bronca, updateType: tipo, user });

    if (!r.ok) {
      toast({
        title: r.isRateLimit ? 'Limite semanal atingido' : 'Não foi possível enviar',
        description: r.isRateLimit
          ? 'Você já enviou este tipo de atualização para esta bronca esta semana.'
          : r.error?.message,
        variant: 'destructive',
      });
      return false;
    }

    // Registra localmente para os botões refletirem o limite sem nova consulta.
    setMinhasAtualizacoes((atual) => [
      ...atual,
      {
        id: r.update.id,
        report_id: bronca.id,
        author_id: user.id,
        update_type: tipo,
        created_at: new Date().toISOString(),
      },
    ]);
    removerDaFila(bronca.id);
    descartar(bronca.id);
    registrarConfirmacao(bronca.id);

    // Recompensa imediata: vibração curta e os pontos subindo. Chega antes de
    // qualquer confirmação do servidor de propósito — a ação do usuário já
    // aconteceu, e esperar a rede tornaria o retorno indiferente ao toque.
    comemorar(PONTOS.atualizacao);

    toast({
      title: r.isAuthorOrAdmin ? 'Confirmado ✅' : 'Enviado 📢',
      description: r.isAuthorOrAdmin
        ? getUpdateTypeInfo(tipo).label
        : 'Sua atualização será revisada.',
    });
    return true;
  }, [user, navigate, toast, removerDaFila, descartar, registrarConfirmacao, comemorar]);

  /**
   * Responde o card — e o card pode falar por várias broncas.
   *
   * Um envio por bronca do grupo, em paralelo. Não há endpoint em lote, e
   * inventar um exigiria repetir no servidor a regra de limite semanal que o
   * `enviarAtualizacaoDeBronca` já aplica por linha.
   *
   * O card avisa quantas serão respondidas antes do toque: confirmar três
   * broncas de uma vez sem dizer seria colocar na conta da pessoa uma afirmação
   * que ela não fez.
   */
  const responderAlerta = useCallback((tipo) => {
    const grupo = alertaAtual?.broncas?.length ? alertaAtual.broncas : [alertaAtual?.bronca];
    const validas = grupo.filter(Boolean);
    if (validas.length === 0) return;

    // Fecha o card antes da rede: esperar a resposta com o veículo andando é
    // tempo de olho na tela.
    resolver(validas.map((b) => b.id));
    validas.forEach((bronca) => enviar(bronca, tipo));
  }, [alertaAtual, resolver, enviar]);

  // Tocar no X não encerra nada: abre a pergunta. O cronômetro e o rastro
  // seguem correndo atrás dela — só a folha está na frente.
  const sair = useCallback(() => {
    setDuracaoS(duracaoAgora());
    setSaida('decidir');
  }, [duracaoAgora]);

  /**
   * Fecha a patrulha: apura o que desbloqueou e sai.
   *
   * Separado do `concluir` porque agora há dois caminhos até aqui — sair direto
   * e sair depois de fechar o card do story. As conquistas só podem ser
   * apuradas COM a patrulha já gravada, e uma vez só: apurar duas vezes
   * reapresentaria as medalhas como se fossem novas.
   */
  const encerrar = useCallback(async () => {
    const { novas } = await jogo.apurar();
    if (novas.length > 0) {
      setNovasConquistas(novas);
      if (Capacitor.isPluginAvailable('Haptics')) {
        Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      }
      return;   // a tela de medalha assume; sair é o botão dela
    }
    sairDaTela();
  }, [jogo, sairDaTela]);

  /**
   * Encerra SEM gravar.
   *
   * O app gravava toda patrulha, inclusive a de trinta segundos aberta por
   * engano: o histórico enchia de linhas vazias e cada uma contava como
   * patrulha nas conquistas.
   *
   * Descartar não desfaz nada do que a saída produziu — bronca registrada,
   * sinal e confirmação já foram enviados, cada um na sua própria linha, e
   * continuam valendo pontos. O que se joga fora é só a medida do percurso.
   */
  const descartarPatrulha = useCallback(async () => {
    toast({
      title: 'Saída descartada',
      description: 'O que você registrou pelo caminho continua valendo.',
    });
    await encerrar();
  }, [toast, encerrar]);

  /**
   * "Encerrar e salvar": grava e passa para o resumo.
   *
   * Salvar aqui, e não no último toque, é o que permite o resumo ser só
   * comemoração. Ele ainda tem a fila de broncas por responder, e cada resposta
   * dada ali muda os números — por isso `finalizar` virou insert-or-update: as
   * confirmações feitas depois deste ponto atualizam a mesma linha.
   */
  const encerrarESalvar = useCallback(async () => {
    if (!user) { sairDaTela(); return; }

    const r = await finalizar({ publica: false });

    if (!r.ok) {
      // Sem rede no fim do trajeto não pode prender ninguém na tela: perde-se a
      // medida do percurso, não o que foi registrado nele.
      toast({
        title: 'Não foi possível salvar a patrulha',
        description: 'Suas confirmações foram enviadas normalmente.',
        variant: 'destructive',
      });
      sairDaTela();
      return;
    }

    setSaida('resumo');
  }, [user, finalizar, toast, sairDaTela]);

  /**
   * Os dois botões do resumo. A patrulha já está gravada quando eles aparecem;
   * o que esta função faz é atualizá-la com o que a fila rendeu — e, no caso do
   * compartilhar, marcá-la como pública antes de abrir o card.
   */
  const concluir = useCallback(async ({ publica = false } = {}) => {
    // Sem conta não há o que gravar: a patrulha pertence a alguém. Quem entrou
    // só para ver os alertas sai sem erro na cara.
    if (!user) { sairDaTela(); return; }

    const r = await finalizar({ publica });

    if (!r.ok) {
      // Sem rede no fim do trajeto não pode prender o usuário na tela: os
      // números se perdem, a patrulha em si (as confirmações) já foi enviada.
      toast({
        title: 'Não foi possível salvar a patrulha',
        description: 'Suas confirmações foram enviadas normalmente.',
        variant: 'destructive',
      });
      sairDaTela();
      return;
    }

    if (publica) {
      // Compartilhar deixou de ser "mandar um link": vira o card da patrulha,
      // que é o que alguém realmente publica. O link continua existindo e vai
      // junto, anexado ao story pelo sticker.
      setStory({
        patrulhaId: r.patrulha.id,
        shareUrl: getPatrolShareUrl(r.patrulha.id),
      });
      return;   // o card assume; encerrar é o botão dele
    }

    await encerrar();
  }, [user, finalizar, toast, sairDaTela, encerrar]);

  // ── Botão voltar do aparelho ──
  //
  // A patrulha virou rota própria, e com isso o voltar do Android passou a
  // simplesmente sair dela: a saída era descartada sem perguntar nada, e o
  // trajeto ia junto.
  //
  // O botão agora fecha a CAMADA DE CIMA, uma por vez — a mesma ordem que a
  // tela desenha. É o que um voltar deve fazer: desfazer o último passo, não
  // abandonar a atividade inteira.
  //
  // Na folha de saída ele volta PARA a patrulha: a pergunta é "continuar,
  // encerrar ou descartar?", e voltar dela é desistir de sair — não escolher
  // uma das respostas por omissão. Descartar, em especial, nunca acontece sem
  // alguém ter tocado nela.
  //
  // No resumo é o contrário: a decisão já foi tomada e a patrulha já está no
  // banco. Ali o voltar fecha mesmo, como o botão "Fechar" ao lado.
  const voltarUmaCamada = useCallback(() => {
    if (novasConquistas.length > 0) { sairDaTela(); return; }
    if (story) { setStory(null); encerrar(); return; }
    if (saida === 'resumo') { concluir({ publica: false }); return; }
    if (saida === 'decidir') { setSaida(null); return; }
    if (registro) { setRegistro(null); return; }
    if (mostrarSinalizar) { setMostrarSinalizar(false); return; }
    if (alertaAtual) { adiar(); return; }
    if (missaoTracada) { onTracarRota?.(null); return; }
    // Camada livre: abre a folha de saída, que é onde se decide.
    sair();
  }, [
    novasConquistas.length, story, saida, registro, mostrarSinalizar,
    alertaAtual, missaoTracada, onTracarRota, adiar, sair, sairDaTela,
    encerrar, concluir,
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle = null;
    CapApp.addListener('backButton', voltarUmaCamada).then((h) => { handle = h; });

    return () => { handle?.remove(); };
  }, [voltarUmaCamada]);

  /**
   * O mesmo voltar, no navegador.
   *
   * O QUE ACONTECIA
   *
   * Este bloco não existia: a escada de camadas era privilégio do Android. Na
   * web, o botão voltar do navegador desmontava a patrulha inteira na hora —
   * sem folha de saída, sem gravação, sem aviso. O tempo, a distância e as
   * confirmações da fila iam junto. Foi o relato: "ao voltar na web perdi minha
   * patrulha, não foi salva".
   *
   * COMO SE SEGURA UM `POPSTATE`
   *
   * Não dá para cancelá-lo — quando o evento chega, a navegação já aconteceu.
   * O que dá é empilhar uma entrada extra ao entrar na patrulha: o primeiro
   * "voltar" consome ESSA entrada em vez da rota, e aí `pushState` recoloca a
   * sentinela para o próximo. A pessoa continua na tela, e o toque vira o que
   * já virava no Android — fechar uma camada.
   *
   * `beforeunload` cobre o resto: recarregar, fechar a aba, digitar outro
   * endereço. Aí o navegador mostra o aviso genérico dele; o texto é ignorado
   * por todos eles desde 2019, e é por isso que não tentamos escrever um.
   */
  // A escada corrente, lida pelo listener que é instalado uma vez só. Sem este
  // ref, ele chamaria para sempre a versão de `voltarUmaCamada` capturada na
  // montagem — a que enxerga a patrulha no primeiro segundo, sem alerta aberto,
  // sem fila, sem nada.
  const voltarRef = useRef(voltarUmaCamada);
  useEffect(() => { voltarRef.current = voltarUmaCamada; }, [voltarUmaCamada]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    window.history.pushState({ patrulha: true }, '');

    const aoVoltar = () => {
      // Este `popstate` é o nosso: veio do history.back() de `sairDaTela`, que
      // acabou de consumir a sentinela. Navegar agora deixa o histórico limpo.
      if (saindoRef.current) {
        saindoRef.current = false;
        onSairRef.current();
        return;
      }
      window.history.pushState({ patrulha: true }, '');
      voltarRef.current();
    };

    const aoSairDaPagina = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', aoVoltar);
    window.addEventListener('beforeunload', aoSairDaPagina);

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      window.removeEventListener('beforeunload', aoSairDaPagina);
    };
    // Só na montagem: reinstalar a sentinela a cada mudança de camada
    // empilharia uma entrada por alerta respondido, e sair da patrulha passaria
    // a exigir vinte toques no voltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  if (!avisoAceito) {
    return <PatrolDisclaimer onAceitar={aceitarAviso} onCancelar={sairDaTela} />;
  }

  return (
    <>
      {!posicao && !erro && (
        <div className="absolute inset-0 z-[1002] flex flex-col items-center justify-center gap-3 bg-surface-base/80 backdrop-blur-sm">
          <Loader2 size={36} className="animate-spin text-brand" />
          <p className="text-sm font-medium text-content-secondary">
            Procurando sinal de GPS…
          </p>
        </div>
      )}

      <PatrolHud
        velocidadeKmh={velocidadeKmh}
        rua={rua}
        sinalFraco={sinalFraco}
        semRede={erroRede}
        totalNaFila={fila.length}
        cardVisivel={camada === 'alerta' || camada === 'missao'}
        onSair={sair}
        // O botão entra COMO CONTEÚDO da faixa inferior, não sobre ela: é o
        // flex do HUD que garante que ele nunca alcance o velocímetro.
        acao={
          camada === 'livre' ? (
            <PatrolSignalButton
              onClick={() => setMostrarSinalizar(true)}
              desabilitado={!posicao || sinais.enviando}
            />
          ) : null
        }
      />

      {camada === 'alerta' && (
        <PatrolAlertCard
          alerta={alertaAtual}
          duracaoMs={AUTO_DISMISS_MS}
          bloqueados={bloqueadosDoAlerta}
          onResponder={responderAlerta}
          onAdiar={adiar}
        />
      )}

      {camada === 'rota' && (
        <PatrolRouteBar
          missao={missaoTracada}
          distancia={posicao ? haversine(posicao, missaoTracada) : null}
          onRegistrar={(m) => setRegistro({ modo: 'missao', missao: m })}
          onCancelar={() => onTracarRota?.(null)}
        />
      )}

      {camada === 'missao' && (
        <PatrolMissionCard
          missao={missaoAoAlcance}
          enviando={sinais.enviando}
          onCumprir={(m) => setRegistro({ modo: 'missao', missao: m })}
          onDescartar={aoDescartarMissao}
          onAdiar={(m) => setMissoesAdiadas((atual) => new Set(atual).add(m.id))}
        />
      )}

      {camada === 'sinalizar' && (
        <PatrolSignalSheet
          categoriaFixa={categoria}
          bairro={bairro}
          enviando={sinais.enviando}
          onSoAlertar={aoSoAlertar}
          onCadastroCompleto={aoCadastroCompleto}
          onFechar={() => setMostrarSinalizar(false)}
        />
      )}

      {camada === 'registro' && (
        <PatrolReportModal
          modo={registro.modo}
          missao={registro.missao}
          categoria={registro.categoria}
          posicao={posicao}
          distancia={registro.missao ? sinais.distanciaAte(registro.missao) : null}
          enviando={sinais.enviando}
          onCumprir={sinais.cumprir}
          onCriar={sinais.criarBroncaCompleta}
          onFechar={aoFecharRegistro}
        />
      )}

      <PatrolPointsBurst evento={pontosEvento} pontos={pontosDoEvento} />

      {/* O resumo continua montado sob a medalha: a comemoração é uma caixa
          centrada, e o placar atrás dela é o contexto do que foi conquistado. */}
      {(camada === 'resumo' || camada === 'medalha') && (
        <PatrolSummary
          fila={fila}
          contagens={contagens}
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          feitosNaSessao={feitosNaSessao}
          salvando={salvando}
          bloqueadosDe={bloqueadosDe}
          nivel={jogo.nivel}
          sequencia={jogo.sequencia}
          conquistas={jogo.conquistas}
          ranking={jogo.ranking}
          minhaPosicao={jogo.minhaPosicao}
          titulos={jogo.titulos}
          onResponder={enviar}
          onCompartilhar={() => concluir({ publica: true })}
          onFechar={() => concluir({ publica: false })}
        />
      )}

      {camada === 'decidir' && (
        <PatrolExitSheet
          contagens={contagens}
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          feitosNaSessao={feitosNaSessao}
          salvando={salvando}
          // Continuar não grava nem descarta nada — é a única das três que
          // deixa a patrulha exatamente como estava.
          onContinuar={() => setSaida(null)}
          onEncerrar={encerrarESalvar}
          onDescartar={descartarPatrulha}
        />
      )}

      {camada === 'story' && (
        <PatrolStoryModal
          contagens={contagens}
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          nivel={jogo.nivel}
          titulo={jogo.titulos[0]}
          lugar={bairro}
          feitos={feitosNaSessao}
          shareUrl={story.shareUrl}
          patrulhaId={story.patrulhaId}
          onFechar={() => { setStory(null); encerrar(); }}
        />
      )}

      {camada === 'medalha' && (
        <PatrolAchievementUnlocked conquistas={novasConquistas} onFechar={sairDaTela} />
      )}
    </>
  );
}
