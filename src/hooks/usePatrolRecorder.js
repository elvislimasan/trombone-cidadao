import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { deveRegistrarPonto, distanciaTotal } from '@/lib/navGeo';

// Grava a sessão de patrulha: rastro na tela, distância, tempo e o que foi
// patrulhado.
//
// O rastro vive só aqui, em memória, e some ao encerrar. Ele serve para o
// usuário ver por onde já passou e não repetir rua — não é registro histórico.
// Gravar a rota levaria junto o ponto de partida, que costuma ser a casa da
// pessoa; a tabela `patrols` guarda apenas números e a cidade.

export function usePatrolRecorder(posicao, { cityId = null } = {}) {
  const { user } = useAuth();

  const [rastro, setRastro] = useState([]);
  const [contagens, setContagens] = useState({ passadas: 0, confirmadas: 0 });
  const [salvando, setSalvando] = useState(false);

  const inicioRef = useRef(null);
  // Sets em ref, não em estado: entram por callback durante o trajeto e só o
  // total precisa re-renderizar. Set também dá a idempotência de graça — passar
  // duas vezes pela mesma bronca conta uma.
  const passadasRef = useRef(new Set());
  const confirmadasRef = useRef(new Set());
  // Impede duas linhas para a mesma patrulha quando o usuário toca em concluir
  // e compartilhar, ou toca duas vezes.
  const salvaRef = useRef(null);

  const sincronizarContagens = useCallback(() => {
    setContagens({
      passadas: passadasRef.current.size,
      confirmadas: confirmadasRef.current.size,
    });
  }, []);

  useEffect(() => {
    if (!posicao) return;
    if (!inicioRef.current) inicioRef.current = Date.now();

    setRastro((atual) => {
      const ultimo = atual[atual.length - 1];
      if (!deveRegistrarPonto(ultimo, posicao)) return atual;
      return [...atual, { lat: posicao.lat, lng: posicao.lng }];
    });
  }, [posicao]);

  const distanciaM = useMemo(() => distanciaTotal(rastro), [rastro]);

  const registrarPassagem = useCallback((id) => {
    if (!id || passadasRef.current.has(id)) return;
    passadasRef.current.add(id);
    sincronizarContagens();
  }, [sincronizarContagens]);

  const registrarConfirmacao = useCallback((id) => {
    if (!id) return;
    // Confirmar implica ter passado. A restrição da tabela exige que as
    // confirmadas sejam subconjunto das passadas, e nem toda confirmação vem de
    // um alerta — as da fila do fim do trajeto chegam depois.
    passadasRef.current.add(id);
    confirmadasRef.current.add(id);
    sincronizarContagens();
  }, [sincronizarContagens]);

  /**
   * Grava a patrulha. Uma vez só: chamadas seguintes devolvem a mesma linha,
   * porque concluir e compartilhar são dois botões para a mesma sessão.
   *
   * @returns {Promise<{ok:boolean, patrulha?:object, error?:Error}>}
   */
  const finalizar = useCallback(async ({ publica = false } = {}) => {
    if (salvaRef.current) return { ok: true, patrulha: salvaRef.current };
    if (!user) return { ok: false, error: new Error('sem usuário') };

    const inicio = inicioRef.current ?? Date.now();
    const fim = Date.now();
    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from('patrols')
        .insert({
          user_id: user.id,
          city_id: cityId ?? null,
          started_at: new Date(inicio).toISOString(),
          ended_at: new Date(fim).toISOString(),
          duration_seconds: Math.max(0, Math.round((fim - inicio) / 1000)),
          distance_meters: Math.round(distanciaM),
          passed_count: passadasRef.current.size,
          confirmed_count: confirmadasRef.current.size,
          passed_report_ids: [...passadasRef.current],
          confirmed_report_ids: [...confirmadasRef.current],
          is_public: publica,
        })
        .select()
        .single();

      if (error) throw error;
      salvaRef.current = data;
      return { ok: true, patrulha: data };
    } catch (err) {
      console.error('[usePatrolRecorder] falha ao gravar patrulha:', err);
      return { ok: false, error: err };
    } finally {
      setSalvando(false);
    }
  }, [user, cityId, distanciaM]);

  /** Segundos desde a primeira leitura de GPS. Lido ao abrir o resumo. */
  const duracaoAgora = useCallback(
    () => (inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0),
    []
  );

  return {
    rastro,
    distanciaM,
    contagens,
    salvando,
    duracaoAgora,
    registrarPassagem,
    registrarConfirmacao,
    finalizar,
  };
}
