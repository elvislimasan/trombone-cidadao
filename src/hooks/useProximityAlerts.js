import { useCallback, useEffect, useRef, useState } from 'react';
import { selecionarAlertas, agruparAlertas, haversine, NAV_ALERTA } from '@/lib/navGeo';

// Orquestra os alertas: escolhe qual bronca vira card, quanto tempo ele fica e
// para onde vai a que não foi respondida.
//
// A regra de negócio (distância, cone, status) mora em navGeo.js, testada sem
// GPS. Aqui fica só o que precisa de tempo e de estado de React.

/** Quanto o card fica na tela antes de sair sozinho. */
const AUTO_DISMISS_MS = 15000;

// O card sai por TEMPO ou por DISTÂNCIA, o que vier primeiro.
//
// Só o tempo não bastava: andando, 15 s podem ser 200 m, e a pessoa ficava
// olhando uma pergunta sobre um poste que já não enxerga. Perguntar sobre o que
// não está mais à vista convida ao palpite — o contrário do que a confirmação
// serve para produzir.
//
// Nos dois casos a bronca vai para a fila do fim do trajeto. Passar por ela sem
// responder não é o mesmo que não ter passado.

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

  /**
   * Fecha o card sem responder — as broncas vão para a fila do fim do trajeto.
   *
   * O grupo inteiro entra: a pessoa passou pelos três buracos, não por um.
   */
  const adiar = useCallback(() => {
    const atual = alertaAtualRef.current;
    limparTimer();
    alertaAtualRef.current = null;
    setAlertaAtual(null);
    if (!atual) return;

    setFila((f) => {
      const novas = atual.broncas.filter((b) => !f.some((x) => x.id === b.id));
      return novas.length ? [...f, ...novas] : f;
    });
  }, []);

  /**
   * Fecha o card porque o usuário respondeu — não entra na fila.
   *
   * Aceita um id ou vários: respondendo um card agrupado, as três saem juntas.
   */
  const resolver = useCallback((ids) => {
    const lista = Array.isArray(ids) ? ids : [ids];
    limparTimer();
    alertaAtualRef.current = null;
    setAlertaAtual(null);
    setFila((f) => f.filter((x) => !lista.includes(x.id)));
  }, []);

  useEffect(() => {
    if (!posicao || alertaAtualRef.current) return;

    const candidatos = selecionarAlertas(posicao, broncas, jaAlertadasRef.current);
    const escolhido = candidatos[0];
    if (!escolhido) return;

    // Tudo que está praticamente no mesmo ponto vira um card só — senão seriam
    // três perguntas idênticas em sequência, e a terceira ninguém responde.
    const grupo = agruparAlertas(candidatos);
    grupo.forEach((b) => jaAlertadasRef.current.add(b.id));

    const alerta = {
      // `bronca` continua sendo a mais próxima: é dela que o card fala e é a
      // partir dela que a distância de abandono é medida.
      bronca: escolhido.bronca,
      broncas: grupo,
      distancia: Math.round(escolhido.distancia),
      em: Date.now(),
    };
    alertaAtualRef.current = alerta;
    setAlertaAtual(alerta);
    aoAlertarRef.current?.(alerta);

    timerRef.current = setTimeout(adiar, AUTO_DISMISS_MS);
  }, [posicao, broncas, adiar]);

  // Abandono por distância. Roda a cada leitura de GPS, que é ~1 Hz.
  useEffect(() => {
    const atual = alertaAtualRef.current;
    if (!atual || !posicao) return;
    if (haversine(posicao, atual.bronca) > NAV_ALERTA.raioAbandonoM) adiar();
  }, [posicao, adiar]);

  useEffect(() => limparTimer, []);

  const removerDaFila = useCallback((id) => {
    setFila((f) => f.filter((x) => x.id !== id));
  }, []);

  return { alertaAtual, fila, adiar, resolver, removerDaFila, AUTO_DISMISS_MS };
}
