import { supabase } from '@/lib/customSupabaseClient';

// Registro de compartilhamento.
//
// O QUE ISTO MEDE
//
// Que a pessoa TOCOU em compartilhar. Não que o conteúdo foi publicado — nenhum
// app consegue saber isso: a folha nativa do sistema e o Instagram não devolvem
// confirmação, por design. A missão correspondente diz "compartilhe", que é
// exatamente o ato registrado aqui.
//
// UMA VEZ POR CONTEÚDO
//
// A chave única da tabela (usuário, tipo, conteúdo) faz o décimo toque na mesma
// bronca gravar nada. Sem isso, a missão de compartilhar seria a mais fácil do
// app: bastaria abrir a mesma bronca e tocar no botão até a meta cair.
//
// Falhar aqui é silencioso de propósito. Compartilhar é a ação; contabilizar é
// consequência. Um erro de rede no registro não pode virar um alerta na cara de
// quem acabou de publicar o card.

/**
 * @param {'report'|'patrol'} tipo
 * @param {string} id       id do conteúdo
 * @param {string} [canal]  'story' | 'download' | 'link'
 */
export const registrarCompartilhamento = async (tipo, id, canal) => {
  if (!tipo || !id) return;
  try {
    const { data: sessao } = await supabase.auth.getUser();
    const userId = sessao?.user?.id;
    if (!userId) return;

    await supabase
      .from('share_events')
      .insert({ user_id: userId, content_type: tipo, content_id: id, channel: canal || null })
      // Repetir o compartilhamento do mesmo conteúdo não é erro nem novidade:
      // a linha já existe e a contagem já a considera.
      .select()
      .maybeSingle();
  } catch {
    // Ver o comentário do topo.
  }
};
