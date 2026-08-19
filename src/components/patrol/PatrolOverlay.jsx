import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

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
import { frasear } from '@/lib/navGeo';
import { PONTOS_POR_CONFIRMACAO } from '@/lib/patrolGame';
import { getPatrolShareUrl } from '@/lib/shareUtils';

import PatrolHud from './PatrolHud';
import PatrolAlertCard from './PatrolAlertCard';
import PatrolSummary from './PatrolSummary';
import PatrolDisclaimer from './PatrolDisclaimer';
import PatrolPointsBurst from './PatrolPointsBurst';
import PatrolAchievementUnlocked from './PatrolAchievementUnlocked';

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

export default function PatrolOverlay({ onPosicao, onBroncas, onRastro, cityId, onSair }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [avisoAceito, aceitarAviso] = useAvisoAceito();
  const [mostrarResumo, setMostrarResumo] = useState(false);
  // Atualizações que o usuário já enviou nos últimos 7 dias, buscadas uma vez.
  // Sem isso, cada alerta precisaria de uma consulta só para saber se os botões
  // estão liberados — uma requisição por bronca, em movimento.
  const [minhasAtualizacoes, setMinhasAtualizacoes] = useState([]);

  const ativo = avisoAceito;
  const { posicao, erro, velocidadeKmh, sinalFraco } = useNavigationGps({ ativo });
  const { broncas, erroRede, descartar } = useNavCorridor(posicao);
  const rua = useNavStreet(posicao);
  const { anunciar } = useNavVoice();

  const {
    rastro, distanciaM, contagens, salvando, duracaoAgora,
    registrarPassagem, registrarConfirmacao, finalizar,
  } = usePatrolRecorder(posicao, { cityId });

  const jogo = usePatrolGame({ cityId });
  // Contador, não booleano: duas confirmações seguidas precisam reiniciar a
  // animação, e um booleano que já está `true` não dispara nada.
  const [pontosEvento, setPontosEvento] = useState(0);
  // Medalhas desbloqueadas nesta patrulha, apuradas depois de gravar.
  const [novasConquistas, setNovasConquistas] = useState([]);

  // Toda bronca alertada conta como "passou por", tenha sido respondida ou não:
  // é o denominador honesto do placar. Quem só dirigiu perto não deve aparecer
  // como tendo patrulhado.
  const aoAlertar = useCallback((alerta) => {
    anunciar(frasear(alerta.bronca.categoryName, alerta.distancia));
    registrarPassagem(alerta.bronca.id);
  }, [anunciar, registrarPassagem]);

  const { alertaAtual, fila, adiar, resolver, removerDaFila, AUTO_DISMISS_MS } =
    useProximityAlerts(posicao, broncas, { aoAlertar });

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
    onSair();
  }, [erro, toast, onSair]);

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
    setPontosEvento((n) => n + 1);
    if (Capacitor.isPluginAvailable('Haptics')) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } else if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    toast({
      title: r.isAuthorOrAdmin ? 'Confirmado ✅' : 'Enviado 📢',
      description: r.isAuthorOrAdmin
        ? getUpdateTypeInfo(tipo).label
        : 'Sua atualização será revisada.',
    });
    return true;
  }, [user, navigate, toast, removerDaFila, descartar, registrarConfirmacao]);

  const responderAlerta = useCallback((tipo) => {
    const bronca = alertaAtual?.bronca;
    if (!bronca) return;
    resolver(bronca.id);   // fecha o card antes da rede
    enviar(bronca, tipo);
  }, [alertaAtual, resolver, enviar]);

  // O resumo agora aparece sempre, não só quando sobrou fila: ele carrega o
  // placar da patrulha, que é o fechamento da atividade.
  const sair = useCallback(() => {
    setDuracaoS(duracaoAgora());
    setMostrarResumo(true);
  }, [duracaoAgora]);

  /**
   * Grava a patrulha e sai. `publica` decide se a linha nasce compartilhável —
   * um insert só, em vez de gravar privada e atualizar depois.
   */
  const concluir = useCallback(async ({ publica = false } = {}) => {
    // Sem conta não há o que gravar: a patrulha pertence a alguém. Quem entrou
    // só para ver os alertas sai sem erro na cara.
    if (!user) { onSair(); return; }

    const r = await finalizar({ publica });

    if (!r.ok) {
      // Sem rede no fim do trajeto não pode prender o usuário na tela: os
      // números se perdem, a patrulha em si (as confirmações) já foi enviada.
      toast({
        title: 'Não foi possível salvar a patrulha',
        description: 'Suas confirmações foram enviadas normalmente.',
        variant: 'destructive',
      });
      onSair();
      return;
    }

    if (publica) {
      const url = getPatrolShareUrl(r.patrulha.id);
      const texto = `Patrulhei ${contagens.passadas} ${
        contagens.passadas === 1 ? 'bronca' : 'broncas'
      } na minha cidade e confirmei ${contagens.confirmadas}.`;
      try {
        if (Capacitor.isNativePlatform() || navigator.share) {
          await Share.share({ title: 'Minha patrulha', text: texto, url });
        } else {
          await navigator.clipboard?.writeText(`${texto} ${url}`);
          toast({ title: 'Link copiado' });
        }
      } catch {
        // Cancelar a folha de compartilhamento é ação normal, não erro.
      }
    }

    // Só agora dá para saber o que desbloqueou: as conquistas dependem dos
    // totais COM esta patrulha já gravada.
    const { novas } = await jogo.apurar();
    if (novas.length > 0) {
      setNovasConquistas(novas);
      if (Capacitor.isPluginAvailable('Haptics')) {
        Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      }
      return;   // a tela de medalha assume; sair é o botão dela
    }

    onSair();
  }, [user, finalizar, toast, onSair, contagens, jogo]);

  if (!avisoAceito) {
    return <PatrolDisclaimer onAceitar={aceitarAviso} onCancelar={onSair} />;
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
        alertaVisivel={Boolean(alertaAtual) && !mostrarResumo}
        onSair={sair}
      />

      {alertaAtual && !mostrarResumo && (
        <PatrolAlertCard
          alerta={alertaAtual}
          duracaoMs={AUTO_DISMISS_MS}
          bloqueados={bloqueadosDoAlerta}
          onResponder={responderAlerta}
          onAdiar={adiar}
        />
      )}

      <PatrolPointsBurst evento={pontosEvento} pontos={PONTOS_POR_CONFIRMACAO} />

      {mostrarResumo && (
        <PatrolSummary
          fila={fila}
          contagens={contagens}
          duracaoS={duracaoS}
          distanciaM={distanciaM}
          salvando={salvando}
          bloqueadosDe={bloqueadosDe}
          nivel={jogo.nivel}
          sequencia={jogo.sequencia}
          conquistas={jogo.conquistas}
          ranking={jogo.ranking}
          minhaPosicao={jogo.minhaPosicao}
          onResponder={enviar}
          onCompartilhar={() => concluir({ publica: true })}
          onFechar={() => concluir({ publica: false })}
        />
      )}

      {novasConquistas.length > 0 && (
        <PatrolAchievementUnlocked conquistas={novasConquistas} onFechar={onSair} />
      )}
    </>
  );
}
