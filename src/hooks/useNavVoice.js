import { useCallback, useEffect, useRef } from 'react';

// Voz e som do alerta.
//
// Usa a Web Speech API, presente no WebView do Android e no WKWebView do iOS —
// sem plugin nativo, sem `cap sync`. Quando ela não existe ou falha, sobra o
// bipe: o alerta nunca fica só visual, porque quem está dirigindo pode não
// estar olhando para a tela no instante em que o card sobe.
//
// O bipe é sintetizado com WebAudio em vez de um arquivo: dois tons curtos não
// justificam um asset no bundle, e assim não há requisição para tocar.

export function useNavVoice({ habilitado = true } = {}) {
  const audioCtxRef = useRef(null);

  useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch {}
    try { audioCtxRef.current?.close?.(); } catch {}
  }, []);

  const bipe = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      // O contexto começa suspenso quando criado sem gesto do usuário; o modo
      // navegação sempre entra por um toque, então isto resolve.
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
      synth.speak(fala);
    } catch {}
  }, []);

  /** Bipe seguido da frase — o som chama atenção antes das palavras. */
  const anunciar = useCallback((texto) => {
    if (!habilitado) return;
    bipe();
    setTimeout(() => falar(texto), 350);
  }, [habilitado, bipe, falar]);

  return { anunciar, bipe, falar };
}
