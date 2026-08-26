// Preenche os CEPs das ruas de pavimentação a partir da base dos Correios.
//
// POR QUE NÃO É SQL
//
// O CEP não está em lugar nenhum do banco: ele vem do ViaCEP, por HTTP. Fazer
// isso em SQL exigiria a extensão `http`/`pg_net` ligada no Supabase e a lógica
// de casamento de nome escrita em PL/pgSQL — onde ela não teria teste e onde
// ninguém a leria de novo. Aqui ela reaproveita `src/lib/cepLookup.js`, que já
// tem os casos difíceis cobertos.
//
// O RISCO DESTE SCRIPT NÃO É FALHAR, É ACERTAR PARECIDO
//
// A busca do ViaCEP é por prefixo: procurar "Rua Bela" devolve "Rua Bela
// Vista", "Rua Bela Aurora" e o que mais começar assim. Rodando em 320 ruas de
// uma vez, isso vira uma base inteira de CEPs plausíveis e errados — e CEP
// errado não se descobre olhando, só quando a correspondência volta.
//
// Por isso o casamento é ESTRITO: só entra quando o núcleo do nome da via bate
// exatamente. "Rua Projetada 04 (Caetano 1)" não vira "Rua Projetada"; ela fica
// sem CEP, que é a resposta certa para uma rua que ainda não tem denominação.
//
// E POR ISSO ELE NÃO ESCREVE SEM `--aplicar`
//
// O padrão é simulação: mostra o que faria, e não faz. Quem for aplicar já viu
// a lista.
//
// Uso:
//   node --import ./tools/test-alias.mjs scripts/preencher-ceps-pavimentacao.mjs
//   node --import ./tools/test-alias.mjs scripts/preencher-ceps-pavimentacao.mjs --aplicar
//
// Opções:
//   --aplicar        grava no banco (sem isto, só simula)
//   --cidade=<nome>  limita a uma cidade
//   --limite=<n>     processa no máximo n ruas
//   --refazer        inclui ruas que já têm CEP (por padrão elas são puladas)

import fs from 'node:fs';
import process from 'node:process';

import {
  buscarCepsPorLogradouro,
  normalizarCep,
  nucleoDoLogradouro,
} from '../src/lib/cepLookup.js';

/* --- Argumentos --- */

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const refazer = args.includes('--refazer');
const cidadeAlvo = (args.find((a) => a.startsWith('--cidade=')) || '').slice(9).trim();
const limite = Number((args.find((a) => a.startsWith('--limite=')) || '--limite=0').slice(9)) || 0;

// O ViaCEP é um serviço público e gratuito. Uma pausa entre chamadas é o mínimo
// para não transformar 320 consultas numa rajada.
const PAUSA_MS = 250;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- Credenciais --- */

const lerEnv = (chave) => {
  const arquivo = fs.readFileSync('.env', 'utf8');
  const linha = arquivo.split(/\r?\n/).find((l) => l.startsWith(`${chave}=`));
  return linha ? linha.slice(chave.length + 1).replace(/^"|"$/g, '').trim() : null;
};

const URL_BASE = lerEnv('VITE_SUPABASE_URL');
const CHAVE = lerEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!URL_BASE || !CHAVE) {
  console.error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const cabecalhos = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
};

/* --- O nome que vai para a consulta --- */
//
// O cadastro guarda "Rua Projetada 04 (Caetano 1)": o parêntese é a referência
// de bairro que quem cadastrou pôs para distinguir homônimas. Ele não existe no
// nome oficial, e mandá-lo ao ViaCEP garante zero resultados.

const nomeParaBusca = (nome) =>
  String(nome || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* --- Execução --- */

const buscarRuas = async () => {
  const campos = [
    'id', 'name', 'ceps', 'cep', 'bairro_id',
    'bairro:bairros!pavement_streets_bairro_id_fkey(name)',
    'city:cities(name,state:states(uf))',
  ].join(',');

  const resposta = await fetch(
    `${URL_BASE}/rest/v1/pavement_streets?select=${encodeURIComponent(campos)}&order=name.asc`,
    { headers: cabecalhos }
  );
  if (!resposta.ok) throw new Error(`Não consegui ler as ruas: HTTP ${resposta.status}`);
  return resposta.json();
};

const buscarBairros = async () => {
  const resposta = await fetch(`${URL_BASE}/rest/v1/bairros?select=id,name,city_id`, { headers: cabecalhos });
  if (!resposta.ok) throw new Error(`Não consegui ler os bairros: HTTP ${resposta.status}`);
  return resposta.json();
};

const gravar = async (id, ceps) => {
  const resposta = await fetch(`${URL_BASE}/rest/v1/pavement_streets?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...cabecalhos, Prefer: 'return=minimal' },
    // `cep` continua recebendo o primeiro enquanto houver leitor que só a
    // conheça — mesma regra do formulário.
    body: JSON.stringify({ ceps, cep: ceps[0]?.cep || null }),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao gravar ${id}`);
};

const semAcento = (t) =>
  String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const main = async () => {
  console.log(aplicar ? '>> MODO APLICAR: vai gravar no banco\n' : '>> Simulação (use --aplicar para gravar)\n');

  const [ruas, bairros] = await Promise.all([buscarRuas(), buscarBairros()]);

  const bairroPorNome = new Map();
  for (const b of bairros) bairroPorNome.set(`${b.city_id}|${semAcento(b.name)}`, b.id);

  const alvo = ruas.filter((r) => {
    if (cidadeAlvo && semAcento(r.city?.name) !== semAcento(cidadeAlvo)) return false;
    if (!refazer && Array.isArray(r.ceps) && r.ceps.length) return false;
    return true;
  });

  const fila = limite ? alvo.slice(0, limite) : alvo;
  console.log(`${ruas.length} ruas no total · ${alvo.length} sem CEP · processando ${fila.length}\n`);

  const relatorio = { preenchidas: 0, varios: 0, semResultado: 0, semNomeUtil: 0, erro: 0, motivos: {} };
  const exemplos = [];

  for (const rua of fila) {
    const uf = rua.city?.state?.uf;
    const cidade = rua.city?.name;
    const via = nomeParaBusca(rua.name);

    if (!uf || !cidade || nomeParaBusca(rua.name).length < 3) {
      relatorio.semNomeUtil += 1;
      continue;
    }

    // A CONSULTA VAI SEM O TIPO DA VIA, E ISSO NÃO É DETALHE
    //
    // O ViaCEP responde HTTP 400 quando o logradouro traz ponto — e metade do
    // cadastro está abreviado ("Av. 20 de Junho"). Sem o ponto tampouco
    // funciona: "Av 20 de Junho" volta lista vazia, porque ele não entende a
    // abreviação. Só o núcleo do nome acerta os dois casos.
    //
    // Buscar sem o tipo alarga o resultado, mas o casamento estrito logo abaixo
    // continua sendo o filtro — ele compara núcleo com núcleo.
    // "Rua 09" tem nucleo "09": dois caracteres, abaixo do minimo do ViaCEP.
    // Nesses o nome inteiro serve, porque numero nao vem abreviado com ponto.
    const nucleo = nucleoDoLogradouro(via);
    const consulta = nucleo.length >= 3 ? nucleo : via;
    const resultado = await buscarCepsPorLogradouro({ uf, cidade, logradouro: consulta });
    await esperar(PAUSA_MS);

    if (!resultado.ok) {
      // O motivo importa: "dados insuficientes" e problema do cadastro e se
      // resolve editando a rua; "servico indisponivel" e a rede e se resolve
      // rodando de novo. Contados juntos, os dois viram um numero que nao diz
      // o que fazer.
      relatorio.erro += 1;
      (relatorio.motivos[resultado.motivo] ??= []).push(`${rua.name} → "${consulta}"`);
      continue;
    }

    // O CASAMENTO ESTRITO É O CORAÇÃO DO SCRIPT
    //
    // Só entra quem tem o mesmo núcleo de nome. Sem isto, a busca por prefixo
    // do ViaCEP encheria a base de CEPs de ruas vizinhas.
    const nucleoAlvo = nucleoDoLogradouro(via);
    const combinam = resultado.candidatos.filter(
      (c) => nucleoDoLogradouro(c.logradouro) === nucleoAlvo && !c.generico
    );

    if (!combinam.length) {
      relatorio.semResultado += 1;
      continue;
    }

    const ceps = combinam.map((c) => ({
      cep: normalizarCep(c.cep),
      // O bairro dos Correios casado com o bairro cadastrado NAQUELA cidade —
      // sem o recorte por cidade, "Centro" de uma casaria com "Centro" de outra.
      bairro_id: bairroPorNome.get(`${rua.city_id}|${semAcento(c.bairro)}`) || rua.bairro_id || null,
    }));

    if (ceps.length > 1) relatorio.varios += 1;
    relatorio.preenchidas += 1;
    if (exemplos.length < 12) {
      exemplos.push(`  ${rua.name} → ${ceps.map((c) => c.cep).join(' · ')}`);
    }

    if (aplicar) {
      try {
        await gravar(rua.id, ceps);
      } catch (erro) {
        relatorio.erro += 1;
        relatorio.preenchidas -= 1;
        console.error(`  erro em ${rua.name}: ${erro.message}`);
      }
    }
  }

  console.log(exemplos.length ? `Exemplos:\n${exemplos.join('\n')}\n` : '');
  console.log(`preenchidas:      ${relatorio.preenchidas}`);
  console.log(`  com mais de um: ${relatorio.varios}`);
  console.log(`sem CEP proprio:  ${relatorio.semResultado}   (rua sem denominacao ou fora da base dos Correios)`);
  console.log(`nome inutilizavel:${relatorio.semNomeUtil}`);
  console.log(`erros:            ${relatorio.erro}`);
  for (const [motivo, ruas] of Object.entries(relatorio.motivos)) {
    console.log(`  ${motivo}: ${ruas.length}`);
    for (const r of ruas.slice(0, 5)) console.log(`     ${r}`);
  }
  if (!aplicar) console.log('\nNada foi gravado. Repita com --aplicar quando a lista estiver boa.');
};

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
