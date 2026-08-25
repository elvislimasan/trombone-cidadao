// Faz o `node --test` resolver imports como o Vite resolve.
//
// São duas diferenças, e as duas existem porque o código é escrito para o
// empacotador, não para o Node:
//
//   1. O alias `@/` aponta para `src/` (está em `vite.config.js`) e é a
//      convenção do projeto inteiro.
//   2. A extensão é opcional. `import './paleta'` é válido no Vite e não é no
//      Node, que exige o caminho completo.
//
// Sem este gancho, um módulo só seria testável se antes fosse reescrito para
// caber no executor — ou seja, o código pioraria por causa do teste. Aqui a
// conta é o contrário: trinta linhas destravam o teste de qualquer arquivo de
// `src/`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(fileURLToPath(import.meta.url), '../../src');
const TERMINACOES = ['', '.js', '.mjs', '.jsx', '/index.js', '/index.jsx'];

const arquivoQueExiste = (base) => TERMINACOES
  .map((fim) => `${base}${fim}`)
  .find((caminho) => fs.existsSync(caminho) && fs.statSync(caminho).isFile());

export async function resolve(especificador, contexto, proximo) {
  const ehAlias = especificador.startsWith('@/');
  const ehRelativo = especificador.startsWith('./') || especificador.startsWith('../');

  // Pacote de node_modules ou módulo interno: o Node já sabe.
  if (!ehAlias && !ehRelativo) return proximo(especificador, contexto);

  let base;
  if (ehAlias) {
    base = path.join(RAIZ, especificador.slice(2));
  } else if (contexto.parentURL) {
    base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
  } else {
    return proximo(especificador, contexto);
  }

  const achado = arquivoQueExiste(base);
  if (achado) return proximo(pathToFileURL(achado).href, contexto);

  if (ehAlias) {
    throw new Error(`Alias '@/' nao resolveu: ${especificador} (procurado em ${base})`);
  }

  // Relativo que não bateu: deixa o Node falhar com a mensagem dele, que é
  // melhor do que qualquer coisa que este arquivo saberia dizer.
  return proximo(especificador, contexto);
}
