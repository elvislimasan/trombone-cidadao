import { useCallback, useEffect, useRef, useState } from 'react';

// Voz e som do alerta.
//
// Usa a Web Speech API, presente no WebView do Android e no WKWebView do iOS —
// sem plugin nativo, sem `cap sync`. Quando ela não existe ou falha, sobra o
// bipe: o alerta nunca fica só visual, porque quem está dirigindo pode não
// estar olhando para a tela no instante em que o card sobe.
//
// O bipe é sintetizado com WebAudio em vez de um arquivo: dois tons curtos não
// justificam um asset no bundle, e assim não há requisição para tocar.
//
// ── POR QUE EXISTE UM `preparar()` ──────────────────────────────────────────
//
// Este é o motivo de a voz falhar sem dar erro, e vale ler antes de mexer.
//
// Navegador nenhum deixa uma página fazer barulho sozinha. Tanto o AudioContext
// quanto o speechSynthesis só ficam liberados depois de um gesto do usuário —
// e "depois" aqui é literal: o desbloqueio tem que ACONTECER dentro do gesto,
// não minutos mais tarde.
//
// O código antigo criava o AudioContext na primeira vez que precisava bipar,
// que é quando a primeira bronca aparece no caminho — dez minutos depois do
// último toque na tela. Nesse instante o contexto nasce `suspended` e o
// `resume()` é ignorado, porque já não há gesto ativo. Resultado: alerta mudo,
// sem nenhum erro no console.
//
// `preparar()` faz o desbloqueio no toque que INICIA a patrulha: liga o
// contexto e emite uma fala vazia. A partir daí os dois respondem.

const CHAVE_MUDO = 'nav_voz_mudo';

/** A voz de português que o aparelho tiver. */
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

  // `speechSynthesis` existe no navegador; `getVoices()` pode vir vazio no
  // primeiro acesso — o catálogo carrega assíncrono e avisa por `voiceschanged`.
  const suportada = typeof window !== 'undefined' && !!window.speechSynthesis;

  useEffect(() => {
    if (!suportada) return;

    const carregar = () => { vozRef.current = escolherVoz(); };
    carregar();
    window.speechSynthesis.addEventListener?.('voiceschanged', carregar);

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', carregar);
    };
  }, [suportada]);

  useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch {}
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
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;

      // Cancela a fala anterior: dois alertas seguidos empilhados fazem o
      // segundo chegar depois que o usuário já passou pela bronca.
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
        try { window.speechSynthesis?.cancel(); } catch {}
      } else {
        preparar();
        setTimeout(() => falar('Alertas por voz ligados'), 120);
      }
      return proximo;
    });
  }, [preparar, falar]);

  return { anunciar, bipe, falar, preparar, mudo, alternarMudo, suportada };
}
