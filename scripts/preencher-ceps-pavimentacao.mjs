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
//   --paralelo=<n>   consultas simultâneas (padrão 6)
//   --listagem=<arq> usa a listagem dos Correios (DNE) em vez de consultar a
//                    API rua a rua. Muito mais completa e sem rede.
//                    Ex: --listagem=scripts/dados/correios-floresta-pe.txt
//   --faltantes=<arq> grava a lista das ruas que ficaram sem CEP

import fs from 'node:fs';
import process from 'node:process';

import {
  buscarCepsPorLogradouro,
  cepGenerico,
  nomeParaBusca,
  normalizarCep,
  nucleoDoLogradouro,
} from '../src/lib/cepLookup.js';
import {
  cepsDaListagem,
  indexarListagem,
  lerListagemCorreios,
} from '../src/lib/correiosListagem.js';

/* --- Argumentos --- */

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const refazer = args.includes('--refazer');
const cidadeAlvo = (args.find((a) => a.startsWith('--cidade=')) || '').slice(9).trim();
const limite = Number((args.find((a) => a.startsWith('--limite=')) || '--limite=0').slice(9)) || 0;

// Quantas consultas correm ao mesmo tempo.
//
// Em serie, 319 ruas viravam 319 idas a rede uma depois da outra: minutos de
// tela parada, sem sinal de que estava andando. Parecia travado — e o instinto
// certo diante de um script travado e mata-lo, que e o que nao se deve fazer no
// meio de uma gravacao.
//
// O trabalho nao e pesado, e ESPERA: quase todo o tempo e latencia de rede. Seis
// trabalhadores cobrem a espera uns dos outros. Poucos de proposito — o ViaCEP e
// servico publico e gratuito, e paralelismo alto aqui seria abuso.
const PARALELO = Math.max(
  1,
  Number((args.find((a) => a.startsWith('--paralelo=')) || '--paralelo=6').slice(11)) || 6
);

// A mesma consulta feita por duas ruas homonimas nao precisa ir duas vezes.
const cache = new Map();

const arquivoListagem = (args.find((a) => a.startsWith('--listagem=')) || '').slice(11).trim();
const arquivoFaltantes = (args.find((a) => a.startsWith('--faltantes=')) || '').slice(12).trim();

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

  // A LISTAGEM, QUANDO HA, MANDA
  //
  // Ela e a mesma fonte que alimenta o ViaCEP, so que inteira e local: 408
  // logradouros para Floresta, contra os 215 que a consulta rua a rua achou.
  // Sem rede, sem limite, e deterministica — duas execucoes dao o mesmo.
  let listagem = null;
  let entradasListagem = [];
  if (arquivoListagem) {
    const texto = fs.readFileSync(arquivoListagem, 'utf8');
    const { entradas, ignoradas } = lerListagemCorreios(texto, { cidade: cidadeAlvo });
    listagem = indexarListagem(entradas);
    entradasListagem = entradas;
    console.log(`listagem: ${entradas.length} logradouros` + (ignoradas.length ? ` (${ignoradas.length} linhas fora do padrao)` : ''));
  }

  const bairroPorNome = new Map();
  for (const b of bairros) bairroPorNome.set(`${b.city_id}|${semAcento(b.name)}`, b.id);

  const alvo = ruas.filter((r) => {
    if (cidadeAlvo && semAcento(r.city?.name) !== semAcento(cidadeAlvo)) return false;
    if (!refazer && Array.isArray(r.ceps) && r.ceps.length) return false;
    return true;
  });

  const fila = limite ? alvo.slice(0, limite) : alvo;
  console.log(`${ruas.length} ruas no total · ${alvo.length} sem CEP · processando ${fila.length}\n`);

  // GUARDAR QUEM FICOU DE FORA, E NAO SO QUANTOS
  //
  // Um contador diz que 93 ruas nao acharam CEP; ele nao diz QUAIS, e sem isso
  // a lista de trabalho tem de ser reconstruida a mao a cada execucao.
  const relatorio = { preenchidas: 0, varios: 0, semNomeUtil: 0, erro: 0, motivos: {}, faltantes: [] };
  const semCep = (rua, porque) => { relatorio.faltantes.push({ rua, porque }); };
  const exemplos = [];

  // UMA FILA COM VÁRIOS ATENDENTES, E NÃO UMA LONGA ESPERA
  //
  // Em série, 319 ruas viravam 319 idas à rede uma depois da outra, com pausa
  // entre elas: minutos de tela parada, sem nenhum sinal de que estava andando.
  // Parecia travado — e o instinto certo diante de um script travado é matá-lo,
  // que é justamente o que não se deve fazer no meio de uma gravação.
  //
  // O trabalho não é pesado, é ESPERA: quase todo o tempo é latência de rede.
  // Um punhado de trabalhadores puxando da mesma fila cobre a espera de uns com
  // o trabalho de outros. Poucos de propósito — o ViaCEP é serviço público e
  // gratuito, e paralelismo alto aqui seria abuso, não otimização.
  const processarRua = async (rua) => {
    const uf = rua.city?.state?.uf;
    const cidade = rua.city?.name;
    const via = nomeParaBusca(rua.name);

    if (!uf || !cidade || via.length < 3) {
      semCep(rua, 'nome curto demais para consultar');
      relatorio.semNomeUtil += 1;
      return;
    }

    // "Rua 09" tem nucleo "09": dois caracteres, abaixo do minimo do ViaCEP.
    // Nesses o nome inteiro serve, porque numero nao vem abreviado com ponto.
    const nucleo = nucleoDoLogradouro(via);
    const consulta = nucleo.length >= 3 ? nucleo : via;

    // Ruas homonimas em cidades diferentes fazem a mesma consulta. Guardar a
    // resposta evita repetir a ida — e o recorte por cidade e UF ja esta na
    // chave, entao nao ha risco de servir a resposta de outro municipio.
    // A listagem responde sem rede e cobre mais; a API fica para o que ela
    // nao tiver, ou para quando nenhuma listagem foi passada.
    if (listagem) {
      const daListagem = cepsDaListagem(listagem, via);
      if (daListagem.length) {
        return concluir(rua, daListagem.map((e) => ({ cep: e.cep, bairro: e.bairro })));
      }
      semCep(rua, 'nao esta na listagem dos Correios');
      return;
    }

    const chave = `${uf}|${cidade}|${consulta}`;
    if (!cache.has(chave)) {
      cache.set(chave, buscarCepsPorLogradouro({ uf, cidade, logradouro: consulta }));
    }
    const resultado = await cache.get(chave);

    if (!resultado.ok) {
      // O motivo importa: "dados insuficientes" e problema do cadastro e se
      // resolve editando a rua; "servico indisponivel" e a rede e se resolve
      // rodando de novo. Contados juntos, os dois viram um numero que nao diz
      // o que fazer.
      relatorio.erro += 1;
      (relatorio.motivos[resultado.motivo] ??= []).push(`${rua.name} → "${consulta}"`);
      return;
    }

    // O CASAMENTO ESTRITO É O CORAÇÃO DO SCRIPT
    //
    // Só entra quem tem o mesmo núcleo de nome. Sem isto, a busca por prefixo
    // do ViaCEP encheria a base de CEPs de ruas vizinhas.
    const combinam = resultado.candidatos.filter(
      (c) => nucleoDoLogradouro(c.logradouro) === nucleo && !c.generico
    );

    if (!combinam.length) {
      semCep(rua, 'nao esta na listagem dos Correios');
      return;
    }

    return concluir(rua, combinam.map((c) => ({ cep: c.cep, bairro: c.bairro })));
  };

  // O QUE ACONTECE DEPOIS DE ACHAR, VENHA DE ONDE VIER
  //
  // Listagem e API entregam a mesma coisa — faixas de {cep, bairro} — e daqui
  // para a frente o tratamento e identico: casar o bairro com o cadastro,
  // gravar (ou nao) e contar. Duplicar isso nos dois caminhos garantiria que um
  // dia so um deles ganhasse uma correcao.
  const concluir = async (rua, faixas) => {
    const ceps = faixas.map((f) => ({
      cep: normalizarCep(f.cep),
      // O bairro dos Correios casado com o cadastrado NAQUELA cidade — sem o
      // recorte por cidade, "Centro" de uma casaria com "Centro" de outra.
      bairro_id: bairroPorNome.get(`${rua.city_id}|${semAcento(f.bairro)}`) || rua.bairro_id || null,
    })).filter((c) => c.cep);

    // O `-000` e o CEP geral da localidade: vale para o bairro inteiro e nao
    // identifica a rua. Ao lado de um especifico, ele so polui — mas quando e
    // o unico que existe, ainda e a informacao que ha.
    const especificos = ceps.filter((c) => !cepGenerico(c.cep));
    const finais = especificos.length ? especificos : ceps;

    if (!finais.length) {
      semCep(rua, 'nao esta na listagem dos Correios');
      return;
    }

    if (aplicar) {
      try {
        await gravar(rua.id, finais);
      } catch (erro) {
        relatorio.erro += 1;
        (relatorio.motivos['falha-ao-gravar'] ??= []).push(`${rua.name}: ${erro.message}`);
        return;
      }
    }

    if (finais.length > 1) relatorio.varios += 1;
    relatorio.preenchidas += 1;
    exemplos.push(`  ${rua.name} → ${finais.map((c) => c.cep).join(' · ')}`);
  };

  let proxima = 0;
  let concluidas = 0;

  const trabalhador = async () => {
    for (;;) {
      const indice = proxima;
      proxima += 1;
      if (indice >= fila.length) return;

      await processarRua(fila[indice]);

      concluidas += 1;
      // PROGRESSO EM LINHAS, E NAO SOBRESCREVENDO A MESMA
      //
      // Reescrever a linha com carriage return fica bonito no terminal e some
      // quando a saida e redirecionada para arquivo ou pipe — que e justamente
      // quando alguem quer guardar o que aconteceu. Uma linha a cada 25 ruas
      // diz o mesmo e sobrevive aos dois casos.
      if (concluidas % 25 === 0 || concluidas === fila.length) {
        console.log(`  ${concluidas}/${fila.length} ruas - ${relatorio.preenchidas} com CEP`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, trabalhador));

  // A ordem de chegada depende de quem terminou primeiro; ordenar devolve uma
  // lista estavel, que e o que permite comparar duas execucoes.
  exemplos.sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const amostra = exemplos.slice(0, 12);
  if (amostra.length) {
    console.log('Exemplos:');
    for (const linha of amostra) console.log(linha);
    console.log('');
  }
  console.log(`preenchidas:      ${relatorio.preenchidas}`);
  console.log(`  com mais de um: ${relatorio.varios}`);
  console.log(`sem CEP:           ${relatorio.faltantes.length}   (rua sem denominacao ou fora da base dos Correios)`);
  console.log(`nome inutilizavel:${relatorio.semNomeUtil}`);
  console.log(`erros:            ${relatorio.erro}`);
  for (const [motivo, ruas] of Object.entries(relatorio.motivos)) {
    console.log(`  ${motivo}: ${ruas.length}`);
    for (const r of ruas.slice(0, 5)) console.log(`     ${r}`);
  }
  // A LISTA DE TRABALHO
  //
  // As que ficaram sem CEP nao sao erro: a maioria e "Rua Projetada N", que
  // ainda nao tem denominacao e por isso nao esta na base dos Correios. Mas sao
  // elas que alguem vai ter de resolver a mao, e para isso a lista precisa sair
  // do terminal e virar arquivo.
  if (arquivoFaltantes) {
    const linhas = [
      `Ruas sem CEP — ${new Date().toLocaleString("pt-BR")}`,
      `${relatorio.faltantes.length} de ${fila.length} processadas`,
      "",
    ];
    const porMotivo = new Map();
    for (const f of relatorio.faltantes) {
      if (!porMotivo.has(f.porque)) porMotivo.set(f.porque, []);
      porMotivo.get(f.porque).push(f.rua);
    }
    for (const [motivo, ruas] of porMotivo) {
      linhas.push(`${motivo.toUpperCase()} (${ruas.length})`);
      const ordenadas = [...ruas].sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
      for (const r of ordenadas) {
        linhas.push(`  ${r.name}${r.bairro?.name ? ` — ${r.bairro.name}` : ""}`);
        // QUASE-ACERTOS DA LISTAGEM
        //
        // "Praca Jose Araujo Ferraz" do cadastro esta na listagem como
        // "...Ferraz - Zito": o apelido no fim muda o nucleo e o casamento
        // estrito recusa, com razao. Mas quem le a lista reconhece na hora —
        // entao o arquivo mostra o parecido em vez de deixar a rua orfa.
        const nucleoRua = nucleoDoLogradouro(nomeParaBusca(r.name));
        if (nucleoRua.length >= 6) {
          const parecidas = entradasListagem
            .filter((e) => {
              const n = nucleoDoLogradouro(e.logradouro);
              return n !== nucleoRua && (n.includes(nucleoRua) || nucleoRua.includes(n));
            })
            .slice(0, 3);
          for (const e of parecidas) {
            linhas.push(`      ? ${e.logradouro} — ${e.cep} — ${e.bairro}`);
          }
        }
      }
      linhas.push("");
    }
    const NL = String.fromCharCode(10);
    fs.writeFileSync(arquivoFaltantes, linhas.join(NL), "utf8");
    console.log(NL + `lista das sem CEP: ${arquivoFaltantes}`);
  }

  if (!aplicar) console.log('\nNada foi gravado. Repita com --aplicar quando a lista estiver boa.');
};

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
