import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

// Voz e som do alerta.
//
// ── POR QUE NÃO DÁ PARA USAR SÓ A WEB SPEECH API ────────────────────────────
//
// Este hook usava `window.speechSynthesis` em todas as plataformas, e no app
// nativo do Android a patrulha era MUDA. O motivo é traiçoeiro: o Android
// System WebView EXPÕE `window.speechSynthesis` — o objeto existe, `speak()`
// aceita a chamada e não lança — mas o Chromium nunca ligou essa API ao motor
// de TTS do Android. Na prática `getVoices()` volta vazio e nada é falado.
//
// Como o gate era `!!window.speechSynthesis`, o app concluía "suporte tem",
// mostrava o botão de som ligado e não falava nunca. Sem erro no console, sem
// exceção — só silêncio, que é o pior modo de uma coisa quebrar.
//
// No iOS o WKWebView implementa a API de verdade (por cima do
// AVSpeechSynthesizer), então lá a voz sempre funcionou. Era exatamente o tipo
// de divergência de plataforma que o CLAUDE.md manda tratar.
//
// A saída é o plugin nativo, que fala pelo `android.speech.tts.TextToSpeech`
// no Android e pelo `AVSpeechSynthesizer` no iOS. Na web continua a Web Speech
// API, que ali funciona.
//
// ── O BIPE ──────────────────────────────────────────────────────────────────
//
// Sintetizado com WebAudio em vez de um arquivo: dois tons curtos não
// justificam um asset no bundle. WebAudio funciona no WebView das duas
// plataformas, então este caminho é o mesmo em tudo.
//
// ── POR QUE EXISTE UM `preparar()` ──────────────────────────────────────────
//
// Navegador nenhum deixa uma página fazer barulho sozinha. O AudioContext só
// fica liberado depois de um gesto do usuário — e "depois" aqui é literal: o
// desbloqueio tem que ACONTECER dentro da ativação, não minutos mais tarde.
//
// O código antigo criava o AudioContext na primeira vez que precisava bipar,
// que é quando a primeira bronca aparece no caminho — dez minutos depois do
// último toque na tela. Nesse instante o contexto nasce `suspended` e o
// `resume()` é ignorado. Resultado: alerta mudo, sem nenhum erro no console.
//
// `preparar()` faz o desbloqueio no toque que INICIA a patrulha. No caminho
// nativo o TTS não precisa de gesto, mas o bipe precisa — então `preparar()`
// continua valendo nas duas plataformas.

const CHAVE_MUDO = 'nav_voz_mudo';

// O plugin existe no Android e no iOS. Na web ele tem implementação própria
// sobre a Web Speech API, mas preferimos falar direto com a API ali: é um
// caminho a menos e evita depender do proxy do Capacitor no navegador.
const usaPluginNativo = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech');

/** A voz de português que o aparelho tiver. Só usada no caminho web. */
const escolherVoz = () => {
  try {
    const vozes = window.speechSynthesis?.getVoices?.() || [];
    if (vozes.length === 0) return null;
    // pt-BR primeiro; qualquer português depois. Sem isto, boa parte dos
    // aparelhos lê a frase com a voz do sistema — "buraco a 30 metros" saindo
    // com fonética inglesa é ruído, não aviso.
    return (
      vozes.find((v) => /^pt[-_]BR$/i.test(v.lang)) ||
      vozes.find((v) => /^pt/i.test(v.lang)) ||
      null
    );
  } catch {
    return null;
  }
};

export function useNavVoice() {
  const audioCtxRef = useRef(null);
  const vozRef = useRef(null);
  const preparadoRef = useRef(false);

  const [mudo, setMudo] = useState(() => {
    try { return localStorage.getItem(CHAVE_MUDO) === '1'; } catch { return false; }
  });

  // No nativo o suporte é o plugin, ponto. Na web é a Web Speech API — e ali
  // `!!window.speechSynthesis` é um teste honesto, porque no navegador de
  // verdade a API implementada é a que o objeto anuncia.
  //
  // Começa otimista no nativo e é confirmado pelo efeito abaixo: uma voz de
  // português pode simplesmente não estar instalada no aparelho, e nesse caso
  // é melhor esconder o botão do que oferecer um som que não sai.
  const [suportada, setSuportada] = useState(() =>
    usaPluginNativo()
      ? true
      : typeof window !== 'undefined' && !!window.speechSynthesis
  );

  useEffect(() => {
    let cancelado = false;

    if (usaPluginNativo()) {
      // Confere se o motor do aparelho tem português. `isLanguageSupported`
      // devolve false em aparelho sem o pacote de voz pt-BR baixado — comum em
      // aparelho novo ou com o Google TTS desativado.
      (async () => {
        try {
          const { supported } = await TextToSpeech.isLanguageSupported({ lang: 'pt-BR' });
          if (!cancelado && !supported) {
            const { supported: ptGenerico } =
              await TextToSpeech.isLanguageSupported({ lang: 'pt' });
            if (!cancelado) setSuportada(!!ptGenerico);
          }
        } catch {
          // Plugin presente mas o motor não respondeu. Deixa ligado: falhar ao
          // falar é recuperável, esconder o botão à toa não.
        }
      })();
      return () => { cancelado = true; };
    }

    if (!suportada) return;

    // `getVoices()` pode vir vazio no primeiro acesso — o catálogo carrega
    // assíncrono e avisa por `voiceschanged`.
    const carregar = () => { vozRef.current = escolherVoz(); };
    carregar();
    window.speechSynthesis.addEventListener?.('voiceschanged', carregar);

    return () => {
      cancelado = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', carregar);
    };
  }, [suportada]);

  useEffect(() => () => {
    try {
      if (usaPluginNativo()) TextToSpeech.stop();
      else window.speechSynthesis?.cancel();
    } catch {}
    try { audioCtxRef.current?.close?.(); } catch {}
  }, []);

  /**
   * Libera áudio e voz. CHAME DENTRO DE UM GESTO DO USUÁRIO — ver o topo.
   *
   * Idempotente: chamar de novo a cada toque não custa nada e cobre o caso do
   * contexto ter sido suspenso pelo sistema enquanto o app ficou em segundo
   * plano, o que acontece no Android quando a tela apaga.
   */
  const preparar = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume?.();
        }
      }
    } catch {}

    // O motor nativo não tem trava de gesto: a fala vazia era um truque de
    // navegador, e mandá-la ao plugin só faria o TTS abrir a sessão de áudio
    // para não dizer nada.
    if (usaPluginNativo()) {
      preparadoRef.current = true;
      return;
    }

    try {
      const synth = window.speechSynthesis;
      if (synth && !preparadoRef.current) {
        // Fala em branco, volume zero: o único objetivo é gastar o gesto para
        // destravar o sintetizador. Sem ela, a primeira frase de verdade sai
        // engolida em parte dos navegadores — ou não sai.
        const vazia = new SpeechSynthesisUtterance(' ');
        vazia.volume = 0;
        synth.speak(vazia);
        preparadoRef.current = true;
      }
    } catch {}
  }, []);

  const bipe = useCallback(() => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume?.();

      const agora = ctx.currentTime;
      [0, 0.16].forEach((atraso, i) => {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1170;
        ganho.gain.setValueAtTime(0.0001, agora + atraso);
        ganho.gain.exponentialRampToValueAtTime(0.25, agora + atraso + 0.02);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.13);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(agora + atraso);
        osc.stop(agora + atraso + 0.15);
      });
    } catch {}
  }, []);

  const falar = useCallback((texto) => {
    if (!texto) return;

    if (usaPluginNativo()) {
      // `category: 'playback'` é do iOS e importa aqui: sem ela a sessão nasce
      // `ambient`, que fica em silêncio com o interruptor lateral no mudo e
      // some quando a tela apaga. Numa patrulha o telefone passa a maior parte
      // do tempo no bolso ou no suporte com a tela apagada — o alerta tem que
      // sair mesmo assim.
      //
      // `QueueStrategy.Flush` é o padrão do plugin e é o que queremos: dois
      // alertas seguidos empilhados fariam o segundo chegar depois que a pessoa
      // já passou pela bronca.
      TextToSpeech.speak({
        text: texto,
        lang: 'pt-BR',
        rate: 1.05,
        pitch: 1.0,
        volume: 1.0,
        category: 'playback',
      }).catch(() => {});
      return;
    }

    try {
      const synth = window.speechSynthesis;
      if (!synth) return;

      // Cancela a fala anterior — mesma razão do Flush acima.
      synth.cancel();

      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = 'pt-BR';
      fala.rate = 1.05;
      // A voz pode ter aparecido depois da montagem — o catálogo é assíncrono.
      if (!vozRef.current) vozRef.current = escolherVoz();
      if (vozRef.current) fala.voice = vozRef.current;
      synth.speak(fala);
    } catch {}
  }, []);

  /** Bipe seguido da frase — o som chama atenção antes das palavras. */
  const anunciar = useCallback((texto) => {
    if (mudo) return;
    bipe();
    setTimeout(() => falar(texto), 350);
  }, [mudo, bipe, falar]);

  /**
   * Liga e desliga o som.
   *
   * Ao LIGAR, prepara e fala uma confirmação. Duas razões: o toque é o gesto
   * que destrava o áudio, e é a única forma de a pessoa conferir que o som sai
   * neste aparelho sem ter que dirigir até uma bronca para descobrir.
   */
  const alternarMudo = useCallback(() => {
    setMudo((atual) => {
      const proximo = !atual;
      try { localStorage.setItem(CHAVE_MUDO, proximo ? '1' : '0'); } catch {}

      if (proximo) {
        try {
          if (usaPluginNativo()) TextToSpeech.stop();
          else window.speechSynthesis?.cancel();
        } catch {}
      } else {
        preparar();
        setTimeout(() => falar('Alertas por voz ligados'), 120);
      }
      return proximo;
    });
  }, [preparar, falar]);

  return { anunciar, bipe, falar, preparar, mudo, alternarMudo, suportada };
}
