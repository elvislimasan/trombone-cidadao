// Import relativo, não pelo alias '@/': os testes rodam em `node --test`, que
// não conhece o alias do Vite.
import { haversine } from './navGeo.js';

// Quantos quilômetros de rua, e em que situação.
//
// POR QUE MEDIR EM VEZ DE CONTAR
//
// A tela contava RUAS: "320 ruas mapeadas, 180 pavimentadas". É o número
// errado para a pergunta que a prefeitura faz. Uma travessa de 80 m e uma
// avenida de 3 km contam igual, então "56% das ruas pavimentadas" pode
// significar que quase toda a extensão da cidade está no barro — basta que as
// pavimentadas sejam as curtas.
//
// Quilômetro é a unidade de quem faz orçamento de obra. Contagem de ruas não é
// unidade de nada.
//
// A MEDIDA SÓ EXISTE ONDE HÁ TRAÇADO
//
// Rua sem `path` não tem extensão — não é zero, é desconhecida. As duas coisas
// precisam ficar separadas no resultado, senão a soma vira uma subestimativa
// que ninguém percebe: o total diria "43 km da cidade" quando são 43 km DAS
// RUAS QUE ALGUÉM JÁ TRAÇOU.

/** As situações que a tela agrupa, na ordem em que aparecem. */
export const SITUACOES = [
  { id: 'paved', rotulo: 'Pavimentadas', token: 'paved' },
  { id: 'partially_paved', rotulo: 'Parcialmente', token: 'partial' },
  { id: 'unpaved', rotulo: 'Sem pavimentação', token: 'unpaved' },
];

const situacaoDe = (street) =>
  SITUACOES.some((s) => s.id === street?.status) ? street.status : 'unknown';

/**
 * A extensão de uma rua, em metros. Zero quando não há traçado.
 *
 * Soma segmento a segmento sobre o MultiLineString. Os pedaços NÃO são ligados
 * entre si: uma rua cortada por uma praça vira duas linhas separadas, e medir a
 * distância entre o fim de uma e o começo da outra somaria a travessia da praça
 * como se fosse rua.
 */
export const extensaoDaRua = (street) => {
  const linhas = Array.isArray(street?.path?.coordinates) ? street.path.coordinates : [];
  let total = 0;
  for (const linha of linhas) {
    if (!Array.isArray(linha)) continue;
    for (let i = 1; i < linha.length; i += 1) {
      const [lngA, latA] = linha[i - 1] || [];
      const [lngB, latB] = linha[i] || [];
      if (![latA, lngA, latB, lngB].every(Number.isFinite)) continue;
      total += haversine({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    }
  }
  return total;
};

const vazio = () => ({
  metros: 0,
  ruas: 0,
  porSituacao: { paved: 0, partially_paved: 0, unpaved: 0, unknown: 0 },
  ruasPorSituacao: { paved: 0, partially_paved: 0, unpaved: 0, unknown: 0 },
  ruasSemTracado: 0,
  temTracado: false,
});

/**
 * O panorama de um conjunto de ruas.
 *
 * `temTracado` é o que a tela usa para decidir entre mostrar quilômetros ou
 * contagem de ruas. Sem nenhum traçado importado, "0,0 km" seria uma afirmação
 * falsa sobre a cidade; a contagem, ainda que menos útil, é verdadeira.
 */
export const resumoDeExtensao = (streets) => {
  const resumo = vazio();
  for (const street of Array.isArray(streets) ? streets : []) {
    const metros = extensaoDaRua(street);
    const situacao = situacaoDe(street);

    resumo.ruas += 1;
    resumo.metros += metros;
    resumo.porSituacao[situacao] += metros;
    resumo.ruasPorSituacao[situacao] += 1;
    if (metros === 0) resumo.ruasSemTracado += 1;
    else resumo.temTracado = true;
  }
  return resumo;
};

/**
 * O mesmo panorama, um por bairro, do mais extenso para o menos.
 *
 * Rua sem bairro entra num grupo próprio em vez de sumir: ela existe, ocupa
 * quilômetro, e agora que o bairro é opcional ela vai ser comum.
 */
export const resumoPorBairro = (streets) => {
  const grupos = new Map();

  for (const street of Array.isArray(streets) ? streets : []) {
    const chave = street?.bairro_id ? String(street.bairro_id) : 'sem-bairro';
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        id: chave,
        nome: street?.bairro?.name || 'Sem bairro',
        ruas: [],
      });
    }
    grupos.get(chave).ruas.push(street);
  }

  return [...grupos.values()]
    .map((grupo) => ({ id: grupo.id, nome: grupo.nome, ...resumoDeExtensao(grupo.ruas) }))
    .sort((a, b) => b.metros - a.metros || a.nome.localeCompare(b.nome, 'pt-BR'));
};

/** Quilômetros com uma casa, como a prefeitura escreve. */
export const formatarKm = (metros) => {
  const valor = Number(metros);
  if (!Number.isFinite(valor) || valor < 0) return '0,0 km';
  return `${(valor / 1000).toFixed(1).replace('.', ',')} km`;
};

/**
 * A fatia que uma parte representa do todo, em inteiro.
 *
 * Total zero devolve zero em vez de NaN: cidade recém-cadastrada mostra "0%",
 * que é verdade, e não "NaN%", que é defeito.
 */
export const percentual = (parte, total) => {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.round((Number(parte) / t) * 100);
};
