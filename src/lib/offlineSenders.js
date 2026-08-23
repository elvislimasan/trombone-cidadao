import { supabase } from '@/lib/customSupabaseClient';
import { arquivosDe } from '@/lib/offlineQueue';
// A classificação da falha vive à parte, sem supabase nem IndexedDB, porque é
// a regra mais frágil da fila e precisa de teste. Ver offlineErros.js.
import { ehErroDeRede, ehRecusaDefinitiva, motivoDoDescarte } from '@/lib/offlineErros';

export { ehErroDeRede };

// Quem sabe enviar cada item da fila.
//
// Um remetente por tipo, e cada um devolve um de três veredictos:
//
//   { ok: true }                    subiu — a fila apaga o item
//   { ok: false, descartar: true }  não vai subir NUNCA — apaga com aviso
//   { ok: false }                   falhou agora — fica para a próxima
//
// O TERCEIRO VEREDICTO É O QUE FAZ ISTO NÃO VIRAR LIXO ETERNO
//
// Um item que o servidor recusa por regra — a missão que outra pessoa já
// cumpriu, o sinal duplicado a 30 m — falharia igual para sempre. Sem
// `descartar`, ele ficaria na fila tentando a cada reconexão, e o contador de
// pendentes nunca zeraria.
//
// A política foi decidida assim: DESCARTA COM AVISO. A alternativa era
// converter a missão perdida numa bronca nova, o que aproveitaria a foto — mas
// criaria uma bronca duplicada em cima de outra que acabou de nascer no mesmo
// ponto, e duplicata no mapa custa mais que a foto perdida.

/** Sobe as fotos e liga cada uma à bronca. */
const enviarMidia = async (reportId, userId, arquivos) => {
  if (!arquivos.length) return;
  // Sem dono não há caminho no storage — subiria em `undefined/` e a RLS do
  // bucket recusaria. Melhor perder a foto que gravar bronca com URL quebrada.
  if (!userId) throw new Error('sem usuário para o caminho da foto');

  const linhas = await Promise.all(
    arquivos.map(async (arquivo) => {
      const caminho = `${userId}/${reportId}/${Date.now()}-${arquivo.name}`;
      const { error } = await supabase.storage
        .from('reports-media')
        .upload(caminho, arquivo, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('reports-media').getPublicUrl(caminho);
      return { report_id: reportId, url: data.publicUrl, type: 'photo', name: arquivo.name };
    })
  );

  const { error } = await supabase.from('report_media').insert(linhas);
  if (error) throw new Error(error.message);
};

const REMETENTES = {
  /** Confirmação de bronca ("continua lá" / "foi resolvido"). */
  confirmacao: async (item) => {
    const { error } = await supabase.from('report_updates').insert(item.dados);
    if (error) throw error;
  },

  /** Sinalização rápida. */
  sinal: async (item) => {
    const { data, error } = await supabase.rpc('create_patrol_signal', item.dados);
    if (error) throw error;
    // Duplicado não é falha: outra pessoa marcou o mesmo ponto enquanto isto
    // esperava. O sinal existe, que é o que importava.
    if (data?.[0]?.duplicado) return { ok: true, nota: 'duplicado' };
    return { ok: true };
  },

  /** "Não há nada aqui". */
  vistoria: async (item) => {
    const { error } = await supabase.rpc('mark_patrol_signal_empty', item.dados);
    if (error) throw error;
  },

  /** Registro completo em cima de um ponto marcado. */
  missao: async (item) => {
    const { error } = await supabase.rpc('complete_patrol_signal', item.dados);
    if (error) throw error;
    await enviarMidia(item.dados.p_signal_id, item.meta?.usuarioId, arquivosDe(item));
  },

  /** Bronca nova, criada do zero na rua. */
  bronca: async (item) => {
    const { data, error } = await supabase
      .from('reports')
      .insert(item.dados)
      .select('id')
      .single();
    if (error) throw error;
    await enviarMidia(data.id, item.dados.author_id, arquivosDe(item));
  },

  /** A saída em si: patrulha ou conferência. */
  saida: async (item) => {
    const { data, error } = await supabase
      .from('patrols')
      .insert(item.dados.patrulha)
      .select('id')
      .single();
    if (error) throw error;

    // O percurso é enfeite: perdê-lo custa um mapa a menos, e propagar o erro
    // faria a saída inteira voltar para a fila por causa dele.
    const caminho = item.dados.percurso;
    if (caminho?.path?.length >= 2 || caminho?.actions?.length) {
      try {
        await supabase.from('patrol_paths').upsert(
          { ...caminho, patrol_id: data.id },
          { onConflict: 'patrol_id' }
        );
      } catch (err) {
        console.error('[offlineSenders] percurso não subiu:', err);
      }
    }
  },
};

/** Rótulo humano de cada tipo, para o aviso de descarte. */
export const NOME_DO_TIPO = {
  confirmacao: 'confirmação',
  sinal: 'sinalização',
  vistoria: 'verificação',
  missao: 'registro de um ponto marcado',
  bronca: 'bronca',
  saida: 'saída',
};

/**
 * Tenta enviar um item.
 *
 * @returns {Promise<{ok:boolean, descartar?:boolean, motivo?:string, deRede?:boolean}>}
 */
export const enviarItem = async (item) => {
  const remetente = REMETENTES[item.tipo];
  if (!remetente) {
    // Tipo que não existe mais — versão antiga do app deixou isto para trás.
    // Segurar para sempre não ajuda ninguém.
    return { ok: false, descartar: true, motivo: 'tipo desconhecido' };
  }

  try {
    const r = await remetente(item);
    return { ok: true, nota: r?.nota };
  } catch (err) {
    if (ehErroDeRede(err)) {
      return { ok: false, deRede: true, motivo: 'sem conexão' };
    }
    if (ehRecusaDefinitiva(err)) {
      return { ok: false, descartar: true, motivo: motivoDoDescarte(err) };
    }
    return { ok: false, motivo: err?.message || 'falha ao enviar' };
  }
};
