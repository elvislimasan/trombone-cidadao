import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App as CapApp } from '@capacitor/app';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useOfflineQueueContext } from '@/contexts/OfflineQueueContext';
import {
  enviarAtualizacaoDeBronca,
  computeDisabledUpdateTypes,
} from '@/hooks/useReportUpdate';

import { useNavigationGps } from '@/hooks/useNavigationGps';
import { useNavCorridor } from '@/hooks/useNavCorridor';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import { useNavVoice } from '@/hooks/useNavVoice';
import { useNavStreet } from '@/hooks/useNavStreet';
import { usePatrolRecorder } from '@/hooks/usePatrolRecorder';
import { usePatrolGame } from '@/hooks/usePatrolGame';
import { usePatrolSignals } from '@/hooks/usePatrolSignals';
import { usePatrolTilePrefetch } from '@/hooks/usePatrolTilePrefetch';
import { frasear } from '@/lib/navGeo';
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
  const filaOffline = useOfflineQueueContext();

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
  const { broncas, erroRede, deReserva, descartar } = useNavCorridor(posicao, { categoria });
  const { rua, bairro, cidadeId } = useNavStreet(posicao);
  const { anunciar, preparar, mudo, alternarMudo, suportada: somSuportado } = useNavVoice();

  /**
   * Destrava áudio e voz assim que a patrulha começa.
   *
   * Tem que ser aqui, e não na primeira vez que o app precisa falar: navegador
   * nenhum libera som fora de um gesto do usuário, e o primeiro alerta chega
   * minutos depois do último toque. Ver o cabeçalho de useNavVoice.
   *
   * O gesto existe mesmo sem toque nesta tela: chegar em `/patrulhar/:categoria`
   * exigiu tocar num botão da tela anterior, e a ativação vale para o documento
   * inteiro — a navegação do React Router não troca de documento.
   */
  useEffect(() => {
    if (ativo) preparar();
  }, [ativo, preparar]);

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

  // Baixa o mapa do caminho enquanto ainda há rede, para o modal de registro
  // ter o que desenhar quando o sinal cair — ver hooks/usePatrolTilePrefetch.
  usePatrolTilePrefetch(posicao, { ativo });

  const [mostrarSinalizar, setMostrarSinalizar] = useState(false);
  // O modal de registro atende dois caminhos — completar a missão de alguém ou
  // criar a bronca do zero. Um estado só, com o modo dentro, porque os dois
  // nunca acontecem juntos: abrir um fecha o outro por construção.
  const [registro, setRegistro] = useState(null);
  // Missões que o usuário dispensou com "agora não". Só nesta sessão: passar de
  // novo pelo ponto amanhã deve perguntar de novo.
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

  /**
   * O que esta patrulha marcou — e SÓ isso — vira pin no mapa.
   *
   * POR QUE NÃO TODAS AS MISSÕES ABERTAS
   *
   * O `usePatrolSignals` conhece cinquenta sinais num raio de 2 km, de todo
   * mundo. Desenhar os cinquenta cobre o mapa de bandeiras vermelhas: as ruas
   * somem atrás delas, e o pin que acabou de nascer — que é o único que importa
   * neste segundo — fica indistinguível de outros trinta que já estavam lá.
   *
   * O pin aqui tem uma função só: confirmar que a marcação pegou, agora que o
   * toast saiu. Isso é sobre o que EU acabei de fazer. As missões dos outros
   * continuam existindo e sendo alcançáveis pelo hub de missões, que é a tela
   * feita para escolher aonde ir.
   */
  const [sinaisDaSessao, setSinaisDaSessao] = useState([]);

  const missoesDaSessao = useMemo(
    () => sinais.missoes.filter((m) => sinaisDaSessao.includes(m.id)),
    [sinais.missoes, sinaisDaSessao]
  );

  // O `sinalizar` insere o ponto na lista local antes de qualquer resposta do
  // servidor, então o pin aparece no toque, não no round-trip.
  const onMissoesRef = useRef(onMissoes);
  useEffect(() => { onMissoesRef.current = onMissoes; }, [onMissoes]);
  useEffect(() => { onMissoesRef.current?.(missoesDaSessao); }, [missoesDaSessao]);

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
    // e o que deixa o número auditável. Sem rede não há id ainda, e `registrarSinal`
    // já ignora o vazio — o número entra quando a fila subir.
    registrarSinal(r.id);

    // E vira pin no mapa. `idLocal` cobre o caso offline, em que a linha ainda
    // não existe no banco mas o ponto já está desenhado.
    const idDoPin = r.id ?? r.idLocal;
    if (idDoPin) setSinaisDaSessao((atual) => [...atual, idDoPin]);

    /* SEM TOAST AQUI — O MAPA JÁ RESPONDE.
       ────────────────────────────────────────────────────────────────────────
       Havia um: "Sinalizado 🚩 / Virou missão. Outro cidadão completa o
       cadastro com foto." Ele nascia na base da tela, que é exatamente onde
       moram o velocímetro e o botão de encerrar — a confirmação tapava os
       controles da atividade que ela estava confirmando, por três segundos,
       toda vez.
       O texto também não era notícia: explicava a regra do jogo, e quem toca em
       Sinalizar já a conhece. O que a pessoa precisa saber é se PEGOU, e isso
       duas coisas dizem melhor que uma frase — o +3 subindo e o pin vermelho
       aparecendo no ponto, que continua lá depois da animação. */
    comemorar(PONTOS.sinal);
  }, [sinais, toast, comemorar, registrarSinal]);

  const aoCadastroCompleto = useCallback((categoryId) => {
    setMostrarSinalizar(false);
    setRegistro({ modo: 'nova', categoria: categoryId });
  }, []);


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
    return 'livre';
  }, [
    novasConquistas.length, story, saida, registro,
    mostrarSinalizar, alertaAtual,
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

    /* SEM TOAST DE "ENVIADO" — MESMA RAZÃO DO SINAL.
       ────────────────────────────────────────────────────────────────────────
       Ele existia para avisar que a atualização passaria por revisão. Mas caía
       na base da tela, sobre o velocímetro e o botão de encerrar, num momento
       em que a pessoa está dirigindo — e o aviso de moderação não é acionável
       ali: não há nada a fazer com ele até parar o carro.
       A informação não se perdeu: o card do trajeto já sai da fila ao ser
       respondido, e a revisão aparece onde ela é acionável, na página da
       bronca. Aqui fica só o +5. */
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
  /* Sem toast de confirmação: a folha de saída já diz, embaixo do botão, que
     broncas e sinais continuam valendo. Repetir isso depois do toque não
     informa nada novo — só tapa a tela para onde o usuário está voltando. */
  const descartarPatrulha = useCallback(async () => {
    await encerrar();
  }, [encerrar]);

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
    // Camada livre: abre a folha de saída, que é onde se decide.
    sair();
  }, [
    novasConquistas.length, story, saida, registro, mostrarSinalizar,
    alertaAtual, adiar, sair, sairDaTela,
    encerrar, concluir,
  ]);

  // A escada corrente, lida pelos listeners que são instalados UMA VEZ SÓ.
  // Declarada aqui em cima porque os dois caminhos — Android e web — precisam
  // dela; ver o efeito nativo logo abaixo e o de `popstate` mais adiante.
  const voltarRef = useRef(voltarUmaCamada);
  useEffect(() => { voltarRef.current = voltarUmaCamada; }, [voltarUmaCamada]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // ── POR QUE ESTE EFEITO NÃO DEPENDE DE `voltarUmaCamada` ──
    //
    // Dependia, e VAZAVA UM LISTENER POR MUDANÇA DE CAMADA.
    //
    // `CapApp.addListener` é assíncrono: devolve promessa, e o handle só existe
    // quando ela resolve. Com `[voltarUmaCamada]` na lista, todo alerta que
    // aparecia, toda folha que abria — qualquer coisa que recriasse a função —
    // reexecutava o efeito. A limpeza rodava ANTES da promessa anterior
    // resolver, então `handle` ainda era `null` e o `remove()` não removia
    // nada. O listener velho ficava vivo e um novo era somado.
    //
    // Depois de alguns alertas, um toque no voltar disparava vários handlers de
    // uma vez, cada um enxergando o estado congelado de quando foi registrado.
    // O da camada livre abria a folha de saída; um antigo, registrado quando
    // `saida` valia 'resumo', chamava `concluir()` no mesmo toque — que grava,
    // falha por ser chamada concorrente e cai no `sairDaTela()` do erro.
    //
    // Era exatamente o relato: a folha de confirmação não ficava, a tela
    // voltava para as missões e subia "Não foi possível salvar a patrulha".
    //
    // A correção é a mesma que o caminho da web já usava: UM listener, que lê a
    // escada por ref. O `cancelado` cobre o desmonte antes de a promessa
    // resolver — senão o handle chega depois do cleanup e nunca é removido.
    let handle = null;
    let cancelado = false;

    CapApp.addListener('backButton', () => voltarRef.current()).then((h) => {
      if (cancelado) { h.remove(); return; }
      handle = h;
    });

    return () => {
      cancelado = true;
      handle?.remove();
    };
  }, []);

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
  // `voltarRef` — a escada corrente — está declarada junto do efeito nativo,
  // lá em cima: os dois caminhos leem por ela pelo mesmo motivo. Sem o ref, o
  // listener chamaria para sempre a versão de `voltarUmaCamada` capturada na
  // montagem — a que enxerga a patrulha no primeiro segundo, sem alerta aberto,
  // sem fila, sem nada.

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
        deReserva={deReserva}
        totalNaFila={fila.length}
        cardVisivel={camada === 'alerta'}
        onSair={sair}
        pendentes={filaOffline.pendentes}
        enviandoFila={filaOffline.enviando}
        mudo={mudo}
        onAlternarSom={alternarMudo}
        somSuportado={somSuportado}
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

      {camada === 'sinalizar' && (
        <PatrolSignalSheet
          categoriaPreferida={categoria}
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
