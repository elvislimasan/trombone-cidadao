// Categorias de bronca.
//
// Estavam declaradas dentro do ReportModal, o que bastava enquanto só ele
// oferecia a escolha. A sinalização rápida precisa exatamente da mesma lista —
// e duas cópias divergiriam no dia em que uma categoria fosse acrescentada,
// deixando o modo patrulha capaz de criar sinais de um tipo que o cadastro
// completo não conhece.
//
// Os `id` são os mesmos de `public.categories` no banco: `reports.category_id`
// aponta para lá, e o nome exibido nas telas do servidor vem daquela tabela.

export const CATEGORIAS_BRONCA = [
  { id: 'iluminacao', name: 'Iluminação', icon: '💡' },
  { id: 'buracos', name: 'Buracos na Via', icon: '🕳️' },
  { id: 'esgoto', name: 'Esgoto Entupido', icon: '🚰' },
  { id: 'limpeza', name: 'Limpeza Urbana', icon: '🧹' },
  { id: 'poda', name: 'Poda de Árvore', icon: '🌳' },
  { id: 'vazamento-de-agua', name: 'Vazamento de Água', icon: '💧' },
  { id: 'outros', name: 'Outros', icon: '📍' },
];

/**
 * Categorias da sinalização rápida.
 *
 * Seis, não sete: a grade precisa caber na tela sem rolagem e ser acertada com
 * o polegar por quem está de pé na calçada. "Outros" fica de fora de propósito
 * — sinal sem foto e sem descrição já é vago; sem categoria também, a missão
 * não diz a ninguém o que ir procurar.
 */
export const CATEGORIAS_SINAL = CATEGORIAS_BRONCA.filter((c) => c.id !== 'outros');

export const categoriaPorId = (id) =>
  CATEGORIAS_BRONCA.find((c) => c.id === id) || null;

export const nomeDaCategoria = (id) => categoriaPorId(id)?.name || 'Problema';
