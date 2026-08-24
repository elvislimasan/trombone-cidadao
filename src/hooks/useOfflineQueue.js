import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  listar,
  contar,
  remover,
  marcarFalha,
  enfileirar,
  MAX_TENTATIVAS,
} from '@/lib/offlineQueue';
import { enviarItem, NOME_DO_TIPO } from '@/lib/offlineSenders';

// O carteiro: esvazia a fila quando dá.
//
// QUANDO ELE TENTA
//
//   • ao montar — o app pode ter sido fechado com coisa pendente;
//   • no evento `online` do navegador;
//   • a cada 60 s, enquanto houver fila.
//
// O TEMPORIZADOR NÃO É REDUNDANTE
//
// `navigator.onLine` mente com frequência: ele diz "true" para wi-fi de hotel
// sem internet e para dados móveis com uma barra que não passa pacote. E em
// WebView Android o evento `online` às vezes simplesmente não dispara depois de
// voltar do modo avião. O relógio é o que garante que a fila sai sozinha, mesmo
// quando o sistema não avisa.
//
// UM DE CADA VEZ, NA ORDEM
//
// Em paralelo, uma bronca criada depois de uma confirmação poderia chegar
// antes. Além disso as fotos são o volume: três uploads simultâneos numa rede
// que acabou de voltar costumam falhar os três.

const INTERVALO_MS = 60000;

export function useOfflineQueue() {
  const { toast } = useToast();
  const [pendentes, setPendentes] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const emVooRef = useRef(false);

  const atualizarContagem = useCallback(async () => {
    setPendentes(await contar());
  }, []);

  const esvaziar = useCallback(async () => {
    if (emVooRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const fila = await listar();
    if (fila.length === 0) {
      setPendentes(0);
      return;
    }

    emVooRef.current = true;
    setEnviando(true);

    let enviados = 0;
    const descartados = [];

    try {
      for (const item of fila) {
        // Desistiu: cinco recusas do servidor que não são de rede significam
        // que o item está errado, não que a hora está ruim. Some com aviso, em
        // vez de ficar tentando para sempre.
        if (item.tentativas >= MAX_TENTATIVAS) {
          descartados.push({ tipo: item.tipo, motivo: item.ultimoErro || 'falhou várias vezes' });
          await remover(item.id);
          continue;
        }

        const r = await enviarItem(item);

        if (r.ok) {
          await remover(item.id);
          enviados += 1;
          continue;
        }

        if (r.descartar) {
          descartados.push({ tipo: item.tipo, motivo: r.motivo });
          await remover(item.id);
          continue;
        }

        await marcarFalha(item.id, r.motivo, { deRede: r.deRede });

        // Caiu de novo: parar aqui preserva a ordem e evita gastar bateria
        // tentando os outros contra a mesma rede morta.
        if (r.deRede) break;
      }
    } finally {
      emVooRef.current = false;
      setEnviando(false);
      await atualizarContagem();
    }

    if (enviados > 0) {
      toast({
        title: enviados === 1 ? 'Envio concluído' : `${enviados} envios concluídos`,
        description: 'O que ficou pendente sem conexão já subiu.',
      });
    }

    // O aviso do descarte, que é a política combinada. Uma linha por item
    // perdido, com o motivo — some em silêncio seria pior que não ter fila.
    for (const d of descartados) {
      toast({
        title: `Não foi possível enviar: ${NOME_DO_TIPO[d.tipo] || d.tipo}`,
        description: d.motivo,
        variant: 'destructive',
      });
    }
  }, [toast, atualizarContagem]);

  useEffect(() => {
    atualizarContagem();
    esvaziar();

    const aoVoltar = () => esvaziar();
    window.addEventListener('online', aoVoltar);
    const relogio = setInterval(esvaziar, INTERVALO_MS);

    return () => {
      window.removeEventListener('online', aoVoltar);
      clearInterval(relogio);
    };
  }, [esvaziar, atualizarContagem]);

  /** Guarda uma ação para depois e atualiza o contador da tela. */
  const guardar = useCallback(async (tipo, dados, fotos) => {
    const id = await enfileirar(tipo, dados, fotos);
    await atualizarContagem();
    return id;
  }, [atualizarContagem]);

  return { pendentes, enviando, esvaziar, guardar, atualizarContagem };
}
