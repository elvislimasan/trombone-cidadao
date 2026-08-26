// A listagem oficial de CEPs dos Correios (DNE), em texto.
//
// POR QUE ELA VALE MAIS QUE A CONSULTA À API
//
// O ViaCEP responde por busca de prefixo, uma rua por vez: é rede, é lento, tem
// limite implícito, e o casamento depende de a grafia bater. Rodando nas 320
// ruas do cadastro, ele encontrou 215.
//
// A listagem do DNE para o mesmo município tem 408 logradouros, com o bairro
// de cada um. É a mesma fonte que alimenta o ViaCEP, só que inteira, local e
// sem intermediário — e o que ela não tem, não existe.
//
// O FORMATO É UMA LINHA POR LOGRADOURO
//
//   Floresta Avenida Dom Augusto Silva 56404-003 Alto da Ermida
//   └ cidade  └ logradouro             └ CEP     └ bairro
//
// Não há delimitador entre as colunas: o que separa é o CEP, que tem forma
// própria e não aparece em nome de rua. Por isso ele é a âncora do parser, e
// não a posição ou o espaço.

import { nucleoDoLogradouro } from './cepLookup.js';

// O CEP no meio da linha é o único ponto fixo. Tudo antes dele é cidade mais
// logradouro; tudo depois é bairro.
const LINHA = /^(.+?)\s+(\d{5}-\d{3})\s+(.+)$/;

const limpar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

/**
 * As entradas da listagem.
 *
 * `cidade` vem grudada no logradouro na mesma coluna; separá-la exige saber
 * qual é. Ela é sempre a mesma no arquivo (é uma listagem municipal), então o
 * nome vem por parâmetro e é retirado do começo — em vez de adivinhar onde a
 * cidade acaba e a rua começa, que erraria em "Floresta Rua Floresta".
 */
export const lerListagemCorreios = (texto, { cidade = '' } = {}) => {
  const prefixo = limpar(cidade);
  const entradas = [];
  const ignoradas = [];

  for (const bruta of String(texto ?? '').split(/\r?\n/)) {
    const linha = limpar(bruta);
    if (!linha) continue;

    const casou = LINHA.exec(linha);
    if (!casou) {
      // Cabeçalho e título do relatório caem aqui. Guardá-las em vez de
      // descartar em silêncio é o que permite conferir que só isso ficou de
      // fora — uma linha de rua ignorada passaria despercebida.
      ignoradas.push(linha);
      continue;
    }

    let logradouro = limpar(casou[1]);
    if (prefixo && logradouro.toLowerCase().startsWith(`${prefixo.toLowerCase()} `)) {
      logradouro = logradouro.slice(prefixo.length + 1).trim();
    }

    entradas.push({
      logradouro,
      cep: casou[2],
      bairro: limpar(casou[3]),
    });
  }

  return { entradas, ignoradas };
};

/**
 * A listagem indexada pelo núcleo do nome, para consulta por rua.
 *
 * O núcleo é o que sobra depois de tirar o tipo da via e abrir as abreviações
 * (ver `cepLookup.js`) — é ele que faz "Rua Cel. Manoel Neto" do cadastro
 * encontrar "Rua Coronel Manoel Neto" da listagem.
 *
 * O valor é uma LISTA porque a rua comprida aparece várias vezes, uma por
 * bairro. É exatamente o caso que o cadastro precisa guardar inteiro.
 */
export const indexarListagem = (entradas) => {
  const indice = new Map();

  for (const entrada of entradas) {
    const chave = nucleoDoLogradouro(entrada.logradouro);
    if (!chave) continue;
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push(entrada);
  }

  return indice;
};

/** Os CEPs de uma rua na listagem, ou lista vazia. */
export const cepsDaListagem = (indice, nomeDaRua) => {
  const chave = nucleoDoLogradouro(nomeDaRua);
  if (!chave) return [];
  return indice.get(chave) || [];
};
