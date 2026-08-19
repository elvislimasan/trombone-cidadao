import { useCallback, useEffect, useRef, useState } from 'react';
import { selecionarAlertas } from '@/lib/navGeo';

// Orquestra os alertas: escolhe qual bronca vira card, quanto tempo ele fica e
// para onde vai a que não foi respondida.
//
// A regra de negócio (distância, cone, status) mora em navGeo.js, testada sem
// GPS. Aqui fica só o que precisa de tempo e de estado de React.

/** Quanto o card fica na tela antes de sair sozinho. */
const AUTO_DISMISS_MS = 15000;

export function useProximityAlerts(posicao, broncas, { aoAlertar } = {}) {
  const [alertaAtual, setAlertaAtual] = useState(null);
  const [fila, setFila] = useState([]);

  const jaAlertadasRef = useRef(new Set());
  const timerRef = useRef(null);
  // O card é montado por efeito, mas dispensado por timer e por toque. Sem esta
  // ref o timer do card anterior derrubaria o card seguinte.
  const alertaAtualRef = useRef(null);
  const aoAlertarRef = useRef(aoAlertar);
  useEffect(() => { aoAlertarRef.current = aoAlertar; }, [aoAlertar]);

  const limparTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Fecha o card sem responder — a bronca vai para a fila do fim do trajeto. */
  const adiar = useCallback(() => {
    const atual = alertaAtualRef.current;
    limparTimer();
    alertaAtualRef.current = null;
    setAlertaAtual(null);
    if (!atual) return;
    setFila((f) => (f.some((x) => x.id === atual.bronca.id) ? f : [...f, atual.bronca]));
  }, []);

  /** Fecha o card porque o usuário respondeu — não entra na fila. */
  const resolver = useCallback((id) => {
    limparTimer();
    alertaAtualRef.current = null;
    setAlertaAtual(null);
    setFila((f) => f.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    if (!posicao || alertaAtualRef.current) return;

    const candidatos = selecionarAlertas(posicao, broncas, jaAlertadasRef.current);
    const escolhido = candidatos[0];
    if (!escolhido) return;

    jaAlertadasRef.current.add(escolhido.bronca.id);
    const alerta = {
      bronca: escolhido.bronca,
      distancia: Math.round(escolhido.distancia),
      em: Date.now(),
    };
    alertaAtualRef.current = alerta;
    setAlertaAtual(alerta);
    aoAlertarRef.current?.(alerta);

    timerRef.current = setTimeout(adiar, AUTO_DISMISS_MS);
  }, [posicao, broncas, adiar]);

  useEffect(() => limparTimer, []);

  const removerDaFila = useCallback((id) => {
    setFila((f) => f.filter((x) => x.id !== id));
  }, []);

  return { alertaAtual, fila, adiar, resolver, removerDaFila, AUTO_DISMISS_MS };
}
