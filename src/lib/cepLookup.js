// Descobrir o CEP de uma rua a partir do que já se sabe dela.
//
// POR QUE O PINO SOZINHO NÃO RESOLVE
//
// A geocodificação reversa do pino devolve um `postcode`, e é tentador usá-lo
// direto. Só que no interior do Brasil ele quase sempre volta como o CEP
// GENÉRICO do município — o terminado em `-000`, que vale para a cidade
// inteira e não identifica rua nenhuma. Preencher o cadastro com ele daria uma
// base cheia de campos preenchidos e nenhum CEP útil, que é pior do que campo
// vazio: vazio se vê, errado não.
//
// O QUE O PINO REALMENTE ENTREGA É O ENDEREÇO
//
// Dele saem UF, município e nome da rua — e com esses três o ViaCEP devolve os
// CEPs de verdade, cada um com o seu bairro. É por isso que a busca é em duas
// etapas: o mapa diz ONDE, e a base dos Correios diz QUAL.
//
// E É ASSIM QUE A RUA COM VÁRIOS CEPS APARECE
//
// "Avenida Inês Barros" em Floresta volta três vezes, com três CEPs e três
// bairros diferentes. Não é ambiguidade a resolver: é a resposta certa para uma
// avenida que atravessa três bairros, e é exatamente o que o cadastro precisa
// guardar.

/* --- Normalização --- */

export const normalizarCep = (valor) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length !== 8) return null;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
};

export const cepValido = (valor) => normalizarCep(valor) !== null;

/**
 * CEP genérico do município — o `-000`.
 *
 * Vale para a cidade inteira, então não descreve a rua. É sinalizado em vez de
 * descartado: quando não há nada melhor, ele ainda é a informação que existe, e
 * quem cadastra decide se serve.
 */
export const cepGenerico = (valor) => {
  const cep = normalizarCep(valor);
  return cep ? cep.endsWith('-000') : false;
};

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// "Rua", "Avenida", "Travessa" atrapalham a comparação: o ViaCEP às vezes
// abrevia, às vezes omite. O que identifica a via é o nome próprio.
const TIPOS_DE_VIA = /^(rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|al\.?|praca|praça|estrada|rodovia|beco|via|largo)\s+/i;

// AS ABREVIAÇÕES PRECISAM SER ABERTAS, E POR DOIS MOTIVOS
//
// O primeiro é grosseiro: o ViaCEP responde HTTP 400 quando o logradouro traz
// PONTO. "Rua Cel. Manoel Neto" nem chega a ser consultada.
//
// O segundo é silencioso, e pior: os Correios guardam a forma por extenso —
// "Rua Coronel Manoel Neto". Mesmo tirando o ponto, "cel manoel neto" não bate
// com "coronel manoel neto", e o resultado certo seria descartado pelo
// casamento estrito como se fosse de outra rua.
const ABREVIACOES = {
  cel: 'coronel', cap: 'capitao', gen: 'general', mal: 'marechal',
  dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora',
  pe: 'padre', mons: 'monsenhor', sta: 'santa', sto: 'santo',
  pres: 'presidente', eng: 'engenheiro', ver: 'vereador', dep: 'deputado',
  vv: 'vereador', pca: 'praca', jd: 'jardim',
};

const abrirAbreviacoes = (texto) =>
  texto
    .split(/\s+/)
    .map((palavra) => {
      const limpa = palavra.replace(/\.+$/, '');
      return ABREVIACOES[limpa] || limpa;
    })
    .join(' ')
    // Ponto que sobrou no meio (inicial de nome, como "C. Leitão") vira espaço:
    // ele quebraria a consulta e não acrescenta nada à comparação.
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const nucleoDoLogradouro = (nome) =>
  abrirAbreviacoes(semAcento(nome).replace(TIPOS_DE_VIA, '').trim());

/* --- Ordenação dos resultados --- */
//
// Quem cadastra já escolheu um bairro no formulário. Quando um dos CEPs é
// daquele bairro, ele é quase certamente o certo — e deixá-lo no meio de uma
// lista de doze faz a pessoa procurar uma informação que o app já tinha.

export const ordenarCandidatos = (candidatos, { logradouro = '', bairro = '' } = {}) => {
  const alvoVia = nucleoDoLogradouro(logradouro);
  const alvoBairro = semAcento(bairro);

  const peso = (c) => {
    let pontos = 0;
    if (alvoBairro && semAcento(c.bairro) === alvoBairro) pontos += 4;
    if (alvoVia && nucleoDoLogradouro(c.logradouro) === alvoVia) pontos += 2;
    if (alvoBairro && semAcento(c.bairro).includes(alvoBairro)) pontos += 1;
    if (cepGenerico(c.cep)) pontos -= 3;
    return pontos;
  };

  return [...candidatos].sort(
    (a, b) => peso(b) - peso(a) || String(a.cep).localeCompare(String(b.cep))
  );
};

/**
 * A resposta bruta do ViaCEP virando a lista que a tela usa.
 *
 * Fica separada da chamada de rede para poder ser testada: o formato do
 * ViaCEP é a parte que muda sem avisar, e é a parte que quebra calada.
 */
export const candidatosDaResposta = (payload) => {
  if (!Array.isArray(payload)) return [];

  const vistos = new Set();
  const lista = [];

  for (const item of payload) {
    const cep = normalizarCep(item?.cep);
    // O mesmo CEP pode voltar repetido quando a busca casa com mais de uma
    // grafia da mesma via. Repetido na tela, parece opção diferente.
    if (!cep || vistos.has(cep)) continue;
    vistos.add(cep);
    lista.push({
      cep,
      logradouro: String(item?.logradouro ?? '').trim(),
      bairro: String(item?.bairro ?? '').trim(),
      cidade: String(item?.localidade ?? '').trim(),
      uf: String(item?.uf ?? '').trim().toUpperCase(),
      generico: cepGenerico(cep),
    });
  }

  return lista;
};

/* --- Rede --- */

const VIACEP = 'https://viacep.com.br/ws';

/**
 * Os CEPs de um logradouro.
 *
 * O ViaCEP exige UF, município e pelo menos três letras da via. Abaixo disso
 * ele responde 400, e tratar isso como "nenhum resultado" esconderia de quem
 * cadastra que a busca sequer aconteceu.
 */
export const buscarCepsPorLogradouro = async ({ uf, cidade, logradouro }, { fetchImpl = fetch } = {}) => {
  const estado = String(uf ?? '').trim().toUpperCase();
  const municipio = String(cidade ?? '').trim();
  const via = String(logradouro ?? '').trim();

  if (estado.length !== 2 || municipio.length < 2 || via.length < 3) {
    return { ok: false, motivo: 'dados-insuficientes', candidatos: [] };
  }

  try {
    const url = `${VIACEP}/${encodeURIComponent(estado)}/${encodeURIComponent(municipio)}/${encodeURIComponent(via)}/json/`;
    const resposta = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!resposta.ok) return { ok: false, motivo: 'servico-indisponivel', candidatos: [] };

    const dados = await resposta.json();
    // O ViaCEP responde `{ erro: true }` quando não encontra — não é uma falha,
    // é uma resposta.
    if (dados?.erro) return { ok: true, motivo: 'sem-resultado', candidatos: [] };

    const candidatos = candidatosDaResposta(dados);
    return {
      ok: true,
      motivo: candidatos.length ? 'ok' : 'sem-resultado',
      candidatos,
    };
  } catch {
    // Sem internet, CORS, timeout: o cadastro continua possível à mão, e é isso
    // que a tela precisa saber para não travar num spinner.
    return { ok: false, motivo: 'servico-indisponivel', candidatos: [] };
  }
};

export const MOTIVOS = Object.freeze({
  'dados-insuficientes': 'Preencha o nome da rua e marque o ponto no mapa para buscar o CEP.',
  'sem-resultado': 'Os Correios não têm CEP próprio para esta rua. Digite manualmente.',
  'servico-indisponivel': 'Não foi possível consultar os CEPs agora. Digite manualmente.',
  ok: null,
});
