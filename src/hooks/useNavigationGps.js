import { useCallback, useEffect, useRef, useState } from 'react';
import { estimarMovimento, NAV_ALERTA, NAV_TRAJETO } from '@/lib/navGeo';

// GPS contínuo do modo navegação.
//
// Diferente do watchPosition do MapView, que só quer saber onde o usuário está,
// aqui interessam rumo e velocidade — e nenhum dos dois pode sair direto do
// `coords`. A primeira versão confiava em `coords.speed` para decidir se havia
// movimento e só então calculava o rumo; num teste a pé o aparelho reportava
// velocidade abaixo do limite, o rumo nunca era recalculado e a seta ficava
// congelada. Andar e voltar pela mesma rua aparecia como marcha à ré.
//
// Agora rumo e velocidade vêm do trajeto recente (`estimarMovimento`), que não
// depende de campo opcional nenhum. `coords.speed` entra só como piso adicional
// quando o aparelho o informa.
//
// Mantém a tela acesa via Wake Lock API, que existe tanto no WebView do Android
// quanto no WKWebView do iOS 16.4+. Não há plugin nativo envolvido: nada de
// `cap sync` e nada que quebre na web.

// Guarda um pouco mais que a janela de estimativa: o descarte por idade
// acontece aqui, e cortar exatamente na janela deixaria a estimativa sem a
// amostra mais antiga de que precisa.
const BUFFER_MS = NAV_TRAJETO.janelaMaxMs + 4000;

export function useNavigationGps({ ativo = true } = {}) {
  const [posicao, setPosicao] = useState(null);
  const [erro, setErro] = useState(null);

  // Refs porque o callback do watchPosition é registrado uma vez e não deve
  // re-registrar a cada leitura — cada re-registro custa uma nova aquisição de
  // sinal e faz a tela piscar sem rumo.
  const trajetoRef = useRef([]);
  const rumoValidoRef = useRef(null);

  useEffect(() => {
    if (!ativo) return;
    if (!navigator.geolocation) {
      setErro('indisponivel');
      return;
    }

    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          setErro(null);
          const agora = Date.now();
          const ponto = { lat: coords.latitude, lng: coords.longitude };

          // Janela deslizante: a referência do rumo avança sozinha. Comparar
          // sempre contra o ponto de partida daria a direção da origem até
          // aqui, que ao voltar pela mesma rua aponta para trás.
          trajetoRef.current = [...trajetoRef.current, { ...ponto, t: agora }]
            .filter((a) => agora - a.t <= BUFFER_MS);

          const movimento = estimarMovimento(trajetoRef.current);

          // Rumo nulo significa deslocamento abaixo do piso — parado. Manter o
          // último válido evita a seta rodopiando com o tremor do GPS.
          if (Number.isFinite(movimento.rumo)) {
            rumoValidoRef.current = movimento.rumo;
          }

          // O maior entre o que o aparelho informa e o que o trajeto mostra.
          // `coords.speed` costuma vir nulo ou zerado no WebView do Android, e
          // foi o que mascarou o movimento no teste a pé; a derivada sozinha,
          // por ser média de 6 s, subestima arrancadas. Nenhuma das duas
          // suprime a outra.
          const doAparelho = Number.isFinite(coords.speed) && coords.speed >= 0
            ? coords.speed
            : 0;

          setPosicao({
            ...ponto,
            accuracy: coords.accuracy,
            speed: Math.max(doAparelho, movimento.velocidade),
            heading: rumoValidoRef.current,
            timestamp: agora,
          });
        },
        (err) => {
          setErro(err?.code === 1 ? 'negado' : 'falha');
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
    } catch {
      setErro('falha');
    }

    return () => {
      if (watchId != null) {
        try { navigator.geolocation.clearWatch(watchId); } catch {}
      }
    };
  }, [ativo]);

  // ── Tela acesa ──
  //
  // O lock cai sozinho quando o app vai para segundo plano; o listener de
  // visibilitychange o readquire ao voltar. Sem isso, sair do app e retornar
  // deixava a tela apagando no meio do trajeto.
  useEffect(() => {
    if (!ativo) return;
    const wakeLockApi = navigator.wakeLock;
    if (!wakeLockApi) return;

    let sentinel = null;
    let cancelado = false;

    const adquirir = async () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      try {
        sentinel = await wakeLockApi.request('screen');
      } catch {
        // Negado (bateria baixa, aba oculta): segue sem manter a tela acesa.
      }
    };

    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && !sentinel?.released) adquirir();
    };

    adquirir();
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoVoltar);
      try { sentinel?.release?.(); } catch {}
      sentinel = null;
    };
  }, [ativo]);

  const velocidadeKmh = posicao ? Math.round(posicao.speed * 3.6) : 0;
  const sinalFraco = Boolean(
    posicao && Number(posicao.accuracy) > NAV_ALERTA.precisaoMaximaM
  );

  const reiniciarRumo = useCallback(() => {
    rumoValidoRef.current = null;
    trajetoRef.current = [];
  }, []);

  return { posicao, erro, velocidadeKmh, sinalFraco, reiniciarRumo };
}
