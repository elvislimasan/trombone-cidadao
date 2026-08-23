import { createContext, useContext } from 'react';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

// O carteiro, montado UMA vez.
//
// POR QUE CONTEXTO E NÃO O HOOK DIRETO NAS TELAS
//
// `useOfflineQueue` liga um temporizador de 60 s e um listener de `online`.
// Montado em três telas, seriam três carteiros correndo a mesma fila ao mesmo
// tempo — e dois deles tentariam enviar itens que o primeiro já removeu, cada
// um mostrando o próprio toast de "envio concluído".
//
// Aqui ele nasce uma vez, na raiz, e as telas leem o contador.

const Ctx = createContext({
  pendentes: 0,
  enviando: false,
  esvaziar: async () => {},
  guardar: async () => null,
  atualizarContagem: async () => {},
});

export const OfflineQueueProvider = ({ children }) => {
  const valor = useOfflineQueue();
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
};

export const useOfflineQueueContext = () => useContext(Ctx);
