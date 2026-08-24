import { useEffect, useState } from 'react';

/**
 * Posição grosseira, só para saber se já escureceu aqui.
 *
 * PARA QUE SERVE
 *
 * Poste apagado só pode ser julgado no escuro — é a regra dos alertas. Sem
 * saber onde a pessoa está, a tela ofereceria a patrulha de iluminação às duas
 * da tarde, ela andaria um quilômetro e não receberia alerta nenhum. Pareceria
 * defeito.
 *
 * A hora vem depois, do `ehNoite`, que calcula a posição do sol para AQUELE
 * lugar: em junho, às 17h50 de Brasília, Floresta já está escura e Porto Alegre
 * não. Um corte por horário fixo erraria dos dois lados do país.
 *
 * FALHAR AQUI NÃO É PROBLEMA
 *
 * Sem posição, a patrulha da iluminação continua disponível com o aviso de que
 * só alerta à noite. Bloquear por falta de informação seria pior que deixar
 * entrar — e é por isso que o callback de erro é vazio de propósito.
 *
 * Precisão baixa e cache de cinco minutos: a pergunta é "que parte do país", e
 * pedir GPS fino para isso gastaria bateria e tempo por nada.
 */
export function usePosicaoAproximada() {
  const [posicao, setPosicao] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let vivo = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (vivo) setPosicao({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
    );
    return () => { vivo = false; };
  }, []);

  return posicao;
}
