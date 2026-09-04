import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { supabase } from '@/lib/customSupabaseClient';

// O recorte "só o que é desta rua", lido da URL.
//
// POR QUE ISTO EXISTE
//
// A faixa de Minha Rua diz "7 broncas" e o toque abria o mapa da CIDADE. O
// número era da rua, o destino era outro conjunto — e o link não dava erro
// nenhum: a pessoa procurava, não achava, e concluía que o app tinha perdido o
// filtro. Depois da segunda vez, ninguém mais toca no número.
//
// POR QUE NA URL, E NÃO EM ESTADO DE NAVEGAÇÃO
//
// Porque o recorte precisa sobreviver ao "voltar", ao recarregar e ao link
// colado no grupo do bairro — "as broncas da Rua Rosalvo Martins" é exatamente
// o tipo de coisa que alguém manda para o vizinho. `state` do router não
// sobrevive a nenhum dos três.
//
// POR QUE OS IDS, E NÃO UM `where` NO SERVIDOR
//
// "Perto desta rua" é geometria (40 m do traçado, 150 m do ponto — migração
// 208), e essa conta já existe no banco. Repeti-la como filtro de consulta em
// duas telas seria uma terceira definição de "perto", e a primeira a divergir
// faria o número da faixa deixar de bater com a lista que ele abre.
//
// @param {'report_ids'|'work_ids'} campo qual metade do foco esta tela usa.
export function useFocoDeRua(campo) {
  const [parametros, setParametros] = useSearchParams();
  const ruaId = parametros.get('rua');
  const [foco, setFoco] = useState(null);

  useEffect(() => {
    if (!ruaId) { setFoco(null); return undefined; }

    let cancelado = false;
    supabase.rpc('get_street_focus', { p_street_id: ruaId }).then(({ data, error }) => {
      if (cancelado) return;
      // Silencioso: sem o foco a tela volta a ser o mapa da cidade, que é uma
      // degradação aceitável. Um erro vermelho aqui só atrapalharia quem já
      // está olhando para o mapa que queria.
      if (error || !data) { setFoco(null); return; }

      setFoco({
        ruaId,
        nome: data.name,
        centro: Number.isFinite(data.lat) && Number.isFinite(data.lng)
          ? { lat: data.lat, lng: data.lng }
          : null,
        preciso: data.preciso !== false,
        // Sempre texto dos dois lados da comparação: `report_ids` são uuid
        // (texto no JSON) e `work_ids` são bigint (número). Comparar sem
        // normalizar acertaria uma tela e erraria a outra em silêncio.
        ids: new Set((data[campo] || []).map(String)),
      });
    });

    return () => { cancelado = true; };
  }, [ruaId, campo]);

  const limpar = useCallback(() => {
    const proximos = new URLSearchParams(parametros);
    proximos.delete('rua');
    // `replace`: o recorte não é um passo de navegação, e voltar depois de
    // limpá-lo devolveria a pessoa ao mapa filtrado que ela acabou de largar.
    setParametros(proximos, { replace: true });
  }, [parametros, setParametros]);

  return { foco, limpar };
}

/** Está nesta rua? Sem foco, tudo está — a tela volta a ser a de sempre. */
export const dentroDoFoco = (foco, id) => !foco || foco.ids.has(String(id));
