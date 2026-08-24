// Máscara de baixo calão em comentários (pt-BR + inglês).
//
// Roda na ESCRITA: o texto entra no banco já mascarado, então as telas que
// leem comentário não precisam saber que este arquivo existe, e quem escreve
// vê publicado exatamente o que os outros veem.
//
// Isto não é uma tranca. Roda no cliente e é contornável por quem chamar a API
// direto — e nenhuma lista de palavras cobre o que uma pessoa determinada
// consegue ofender sem usar palavrão nenhum. A tranca é a denúncia: três
// denúncias tiram o comentário do ar e mandam para a moderação. Aqui a
// intenção é outra e menor: não deixar o palavrão casual chegar ao feed.

// Leetspeak. Sem isto, `c4ralho` e `p0rra` passam inteiros.
const LEET = {
  '4': 'a', '@': 'a',
  '3': 'e',
  '1': 'i', '!': 'i',
  '0': 'o',
  '5': 's', $: 's',
  '7': 't',
};

/**
 * Reduz uma palavra à forma que a lista usa: sem acento, sem caixa, sem
 * leetspeak e sem letra repetida.
 *
 * O colapso de repetição é o que faz `caraaaalho` e `fodaaa` caírem na lista.
 * Ele roda dos dois lados — na palavra do texto e na entrada da lista — porque
 * senão `porra` (que vira `pora`) nunca casaria consigo mesma.
 */
export function normalizar(palavra) {
  return (palavra || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[4@31!05$7]/g, (c) => LEET[c] || c)
    .replace(/(.)\1+/g, '$1');
}

// A lista, em forma crua — `normalizar` cuida do resto.
//
// Duas regras guiaram o que está aqui e, principalmente, o que NÃO está:
//
// 1. Só palavra inequívoca. Fora ficaram termos que existem no português de
//    todo dia e só ofendem no contexto: "pau" (de vassoura), "rola" (o verbo),
//    "pica" (pica-pau, picar), "saco", "macaco", "veado" (o animal), "cacete"
//    (o pão). Marcar essas transforma o filtro em piada — que é o destino
//    normal desse tipo de lista.
//
// 2. Só forma explícita, nunca prefixo. `cu` como prefixo pegaria "curso",
//    "cuidado" e "escuro"; por isso a comparação é de palavra inteira e cada
//    flexão que importa está escrita.
const PALAVRAS_PT = [
  'caralho', 'caralhos', 'krl',
  'porra', 'porras',
  'merda', 'merdas',
  'bosta', 'bostas',
  'foda', 'fodas', 'foder', 'fodido', 'fodida', 'fudido', 'fudida', 'fodase',
  'puta', 'putas', 'puto', 'putos', 'putaria', 'putinha',
  'buceta', 'bucetas',
  'xoxota', 'piroca', 'pinto', 'punheta', 'punheteiro', 'boquete',
  'cu', 'cuzao', 'cuzinho', 'cusao',
  'arrombado', 'arrombada',
  'corno', 'cornos', 'corna',
  'viado', 'viados', 'bicha', 'bichas', 'boiola', 'baitola',
  'prostituta', 'vagabunda', 'vagabundo',
  'otario', 'otaria', 'babaca', 'escroto', 'escrota',
  'filhadaputa', 'filhodaputa', 'fdp', 'pqp', 'vtnc',
  'desgracado', 'desgracada',
];

const PALAVRAS_EN = [
  'fuck', 'fucks', 'fucking', 'fucked', 'fucker', 'motherfucker',
  'shit', 'shits', 'shitty', 'bullshit',
  'bitch', 'bitches',
  'asshole', 'assholes',
  'cunt', 'whore', 'slut', 'bastard', 'pussy', 'piss',
  'nigga', 'nigger', 'faggot', 'retard', 'retarded',
];

// Set de formas normalizadas: a checagem por palavra é O(1).
const PROIBIDAS = new Set(
  [...PALAVRAS_PT, ...PALAVRAS_EN].map(normalizar)
);

// Letras e dígitos: os dígitos entram porque o leetspeak vive dentro deles
// (`c4ralho` é uma palavra só).
const PALAVRA_RE = /[\p{L}\p{N}]+/gu;

/** A palavra, sozinha, é baixo calão? */
export function ehPalavrao(palavra) {
  return PROIBIDAS.has(normalizar(palavra));
}

/**
 * Mascara mantendo a primeira letra: `caralho` -> `c******`.
 *
 * A primeira letra fica porque a frase precisa continuar legível — quem lê
 * entende que houve um palavrão ali sem que a linha vire uma fileira de
 * asteriscos. O tamanho é o da palavra original, então o texto não encolhe.
 */
function mascararPalavra(original) {
  if (original.length <= 1) return '*';
  return original[0] + '*'.repeat(original.length - 1);
}

/**
 * Devolve o texto com o baixo calão mascarado.
 *
 * Gap conhecido: `p*rra` e `f-o-d-a` escapam, porque o separador quebra a
 * palavra em pedaços que não estão na lista. Fechar isso exigiria comparar o
 * texto sem separador nenhum — e aí "meu curso" viraria "meucurso", com o `cu`
 * no meio. Entre deixar passar um palavrão disfarçado e mascarar a palavra de
 * quem não xingou ninguém, o filtro erra para o lado de não atrapalhar.
 *
 * @returns {{ texto: string, mascarou: boolean }}
 */
export function mascarar(texto) {
  const entrada = texto || '';
  let mascarou = false;

  const saida = entrada.replace(PALAVRA_RE, (palavra) => {
    if (!ehPalavrao(palavra)) return palavra;
    mascarou = true;
    return mascararPalavra(palavra);
  });

  return { texto: saida, mascarou };
}
