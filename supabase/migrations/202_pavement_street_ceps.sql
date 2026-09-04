-- CEPs por trecho de rua.
--
-- POR QUE UMA COLUNA SÓ NÃO BASTAVA
--
-- `pavement_streets.cep` é um texto único. Rua comprida atravessa bairro, e
-- cada trecho tem o seu CEP — no modelo antigo o segundo simplesmente não tinha
-- onde ser guardado, e quem cadastrava escolhia um e perdia o resto.
--
-- POR QUE JSONB NA PRÓPRIA LINHA, E NÃO UMA TABELA FILHA
--
-- Uma tabela filha seria a modelagem de manual, e custaria um conjunto novo de
-- policies de RLS. Neste projeto as policies vivem no painel do Supabase e não
-- no git (ver o histórico de `bairros` e `pavement_streets`): cada tabela nova
-- é mais uma regra invisível ao código, que ninguém revisa e que falha calada.
--
-- Em `jsonb` na própria linha, o CEP herda exatamente a permissão da rua a que
-- pertence — que é a regra correta, e é a que já está escrita e testada.
--
-- FORMATO
--
--   [{ "cep": "56400-000", "bairro_id": "uuid-ou-null" }, ...]
--
-- `bairro_id` é o trecho: é ele que responde "qual CEP nesta parte da rua".
-- Nulo significa "vale para a rua inteira", que é o caso da maioria.

alter table public.pavement_streets
  add column if not exists ceps jsonb not null default '[]'::jsonb;

comment on column public.pavement_streets.ceps is
  'CEPs da rua, um por trecho: [{cep, bairro_id}]. bairro_id nulo vale para a rua inteira. Substitui a coluna cep, mantida por compatibilidade.';

-- A COLUNA ANTIGA NÃO É APAGADA AQUI, E ISSO É DE PROPÓSITO
--
-- Entre esta migração e a versão do app que lê `ceps`, há um intervalo em que
-- as duas convivem. Apagar `cep` agora deixaria a versão publicada sem CEP
-- nenhum na tela até o deploy seguinte. Ela sai numa migração posterior, depois
-- que ninguém mais a ler — `lib/pavementReport.js` já prefere `ceps` e só cai
-- na antiga quando a nova está vazia.

update public.pavement_streets
   set ceps = jsonb_build_array(jsonb_build_object('cep', cep, 'bairro_id', bairro_id))
 where ceps = '[]'::jsonb
   and cep is not null
   and btrim(cep) <> '';

-- Busca por CEP: sem o índice, procurar uma rua pelo CEP passa a varrer a
-- tabela inteira agora que o valor está dentro de um documento.
create index if not exists pavement_streets_ceps_idx
  on public.pavement_streets using gin (ceps jsonb_path_ops);
