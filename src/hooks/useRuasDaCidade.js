import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// O traçado das ruas da cidade, para quem precisa desenhar caminho.
//
// DE ONDE VEM
//
// `pavement_streets.path` é o MULTILINESTRING alimentado pelo mapa de
// pavimentação. Ele já está no banco por outro motivo — classificar o asfalto —
// e é a mesma malha que a Rota do Dia usa para não desenhar reta por cima de
// quarteirão. Nada aqui é cadastro novo.
//
// POR QUE A CIDADE INTEIRA, E NÃO O ENTORNO
//
// Não existe RPC de "vias perto daqui", e criar uma por causa de um percurso de
// 1,5 km seria migração para economizar o que o filtro de caixa em
// `rotaTracada.js` já economiza — ele descarta a via distante antes de adensar,
// que é a parte cara. O que sobra é uma leitura por cidade, guardada em memória
// pelo resto da sessão.
//
// O CACHE É DE SESSÃO, DE PROPÓSITO
//
// Traçado de rua muda quando alguém corrige o cadastro — em dias, não em
// minutos. Guardar no módulo evita reler alguns milhares de coordenadas a cada
// vez que a pessoa abre o mapa da rota; recarregar o app pega a versão nova.
//
// SEM CADASTRO NÃO É ERRO
//
// Cidade que acabou de entrar no app não tem uma linha sequer, e isso é o
// estado normal dela. O hook devolve lista vazia e quem desenha cai na reta —
// ver `tracarRota`.

const cache = new Map();

/**
 * @param {string|number|null} cityId
 * @returns {{linhas: Array<Array<[number,number]>>, carregando: boolean, erro: any}}
 */
export function useRuasDaCidade(cityId) {
  const chave = cityId == null ? null : String(cityId);
  const [linhas, setLinhas] = useState(() => (chave && cache.get(chave)) || []);
  const [carregando, setCarregando] = useState(() => !!chave && !cache.has(chave));
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;

    if (!chave) {
      setLinhas([]);
      setCarregando(false);
      return () => {};
    }

    if (cache.has(chave)) {
      setLinhas(cache.get(chave));
      setCarregando(false);
      setErro(null);
      return () => {};
    }

    setCarregando(true);
    (async () => {
      const { data, error } = await supabase
        .from('pavement_streets')
        .select('id, path')
        .eq('city_id', chave)
        .not('path', 'is', null);

      if (!vivo) return;

      if (error) {
        // Falhar aqui não pode derrubar o mapa: sem malha o percurso vira reta,
        // que é exatamente o mesmo caminho da cidade sem cadastro.
        setErro(error);
        setLinhas([]);
        setCarregando(false);
        return;
      }

      // O PostGIS/PostgREST devolve [lng, lat]; o Leaflet e o traçado querem
      // [lat, lng]. A inversão acontece aqui, num lugar só.
      const convertidas = (data || []).flatMap((rua) =>
        Array.isArray(rua?.path?.coordinates)
          ? rua.path.coordinates
              .filter((linha) => Array.isArray(linha) && linha.length >= 2)
              .map((linha) => linha.map(([lng, lat]) => [Number(lat), Number(lng)]))
          : []
      );

      cache.set(chave, convertidas);
      setLinhas(convertidas);
      setErro(null);
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [chave]);

  return { linhas, carregando, erro };
}
