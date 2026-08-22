# Missões diárias e Rota do dia

Design — 22/08/2026

## O problema

O modo patrulha tem gamificação madura: níveis, 14 medalhas, missões em escada
progressiva por trilha, sequência de dias, títulos de bairro, story para
Instagram e histórico com traçado. O que falta não é mais medalha.

Falta o que faz alguém abrir o app **hoje**. As missões de `src/lib/missions.js`
são permanentes e de longo prazo — "investigue 25 buracos" não é um motivo para
abrir o app numa terça à noite. E sair em patrulha exige uma decisão consciente
que a maioria nunca toma: ninguém acorda pensando "vou patrulhar 40 minutos".

Três missões diárias resolvem os dois: dão um objetivo que cabe num dia, e uma
delas — a Rota do dia — transforma "sair sem rumo" em um percurso com começo,
meio e fim.

## Decisões travadas

1. São **três** diárias, com cota fixa por tipo: campo, registro e comunidade.
2. A **Rota do dia é a diária de campo** — uma das três, não o produto inteiro.
3. A rota pergunta **a pé ou dirigindo**; o usuário escolhe, sem detecção
   automática.
4. As paradas são um **mix priorizado**: broncas ativas sem notícia há mais
   tempo, mais sinais pendentes de outras pessoas.
5. **Sem serviço de roteamento.** Ordem por vizinho mais próximo, calculada no
   cliente, com a reta tracejada que o app já desenha.
6. Diárias **expiram à meia-noite**. Progresso parcial nunca é perdido.
7. Sorteio **determinístico e derivado** — nenhuma tabela de diárias, nenhum job
   noturno.
8. Concluir uma diária é **fato gravado** (`daily_completions`), e é o que paga
   o bônus.
9. A sequência de patrulha passa de **diária para semanal**. As diárias têm
   contador próprio.

## 1. O catálogo — `src/lib/dailies.js`

Função pura, igual a `missions.js` e `patrolGame.js`. Nenhum estado, nenhuma
migração para mudar uma meta.

```js
export const DIARIAS = [
  { id, tipo, titulo, icone, meta, valor: (c) => …, acao, xp },
];
```

`tipo` é `'campo' | 'registro' | 'comunidade'`. São os **tipos das diárias**, não
as trilhas de `missions.js` (`investigacao`, `registro`, `comunidade`,
`patrulha`) — os nomes se sobrepõem em parte por acaso, e as duas listas não se
referenciam. A trilha organiza a vitrine permanente; o tipo só existe para
garantir a cota do sorteio diário.

`valor` lê os contadores **do dia**, não os de sempre. `meta` fica entre 2 e 5 — tem que caber num dia; uma
meta de 10 vira uma diária que ninguém fecha, e uma diária que ninguém fecha
deixa de ser lida no dia seguinte.

### O sorteio

```
semente(userId, chaveDoDia) → hash (xmur3) → PRNG (mulberry32)
```

Uma diária sorteada por tipo, na ordem campo → registro → comunidade. Mesma
entrada sempre produz a mesma saída, o que é o que torna a tabela desnecessária:
não há o que gravar quando a regra reproduz o resultado.

`chaveDoDia` é a função que já existe em `src/lib/patrolGame.js:30`. Reusá-la
não é economia — é a única forma de não repetir a armadilha de fuso que o
comentário dela documenta, e que já quebrou a sequência de todo mundo uma vez.

### A guarda contra diária impossível

Sortear "complete 3 missões de outros" numa cidade sem nenhum sinal pendente
queima o dia da pessoa por acidente. Antes de fixar a diária de campo e de
registro, o sorteio confirma que há alvos ao alcance — e cai para a alternativa
do mesmo tipo quando não há.

A de comunidade não precisa da guarda: apoiar, comentar e compartilhar sempre
têm alvo enquanto houver feed.

## 2. A migração — `190_mission_counters_desde.sql`

Uma diária vive de saber o que a pessoa fez **hoje**, e hoje isso é impossível:
`get_mission_counters` (migração 180) só devolve totais de vida inteira.

```sql
drop function if exists public.get_mission_counters(uuid);

create function public.get_mission_counters(
  target_user_id uuid,
  p_desde timestamptz default null
) returns table (…)
```

Cada subconsulta ganha `and (p_desde is null or <data> >= p_desde)`, usando:

| contador | coluna de data |
|---|---|
| `reports_count`, `signals_count`, `missions_count` | `reports.created_at` |
| `updates_count` | `report_updates.created_at` |
| `comments_count` | `comments.created_at` |
| `upvotes_given` | `signatures.created_at` |
| `patrols_count`, `total_*` | `patrols.ended_at` |
| `shares_count` | `share_events.created_at` |

**`bairros_ativos`, `bairros_liderados`, `acoes_no_melhor` e `patrol_days`
ignoram `p_desde`.** Os três primeiros já são uma janela de 90 dias por
definição (migração 174) e não têm leitura diária; `patrol_days` é a lista que
alimenta a sequência, e recortá-la por dia a destruiria. Isso vai no comentário
da função — sem ele, quem ler a assinatura vai assumir que filtram.

**Precisa ser `drop` + `create`, não `create or replace`.** Criar a de dois
parâmetros sem remover a de um deixa duas sobrecargas, e o PostgREST não
consegue escolher entre elas. O `default null` é o que mantém toda chamada
existente funcionando sem alteração.

### O consumo

`useMissions` passa a fazer as duas chamadas em paralelo e a devolver
`contadores` (de sempre) e `contadoresHoje`. Duas idas ao servidor, não cinco —
o que a migração 180 evitou continua evitado.

`p_desde` é a meia-noite local do dia corrente, derivada da mesma `chaveDoDia`.

## 3. A Rota do dia

Gerada **ao abrir**, não de véspera: as paradas são o estado do mundo agora, e
uma rota montada às 6h manda a pessoa a broncas que outro patrulheiro já
confirmou às 10h.

O modal pergunta o modal de deslocamento:

| | raio | paradas | alvo aproximado |
|---|---|---|---|
| A pé | 800 m | 5–8 | ~1,5 km, ~30 min |
| Dirigindo | 4 km | 8–12 | ~8 km |

### Os alvos

Mix de duas fontes que já existem:

- `reports_map_clusters` (`zoom: 18`, `status_filter: 'active'`) — as broncas,
  como `useNavCorridor` já as busca;
- `patrol_missions_nearby` — os sinais pendentes, como `usePatrolSignals` já os
  busca.

A prioridade é **quão desatualizado está**: a bronca sem nenhuma atualização há
mais tempo primeiro, o sinal mais antigo primeiro. É o critério que faz a rota
produzir o dado mais valioso em vez do mais fácil.

### A ordem e o caminho

Vizinho mais próximo a partir da posição atual, calculado no cliente. Barato,
sem dependência, e suficiente para uma dúzia de pontos.

Não há rota desenhada por ruas. A barra reaproveita `PatrolRouteBar` e mostra
`Próxima: buraco na R. X — 240 m ↗` com a reta tracejada. O componente já traz o
aviso de que a reta não conhece rua nem mão única, e ele continua valendo.

### Concluir e pular

Uma parada só conta quando houve **ação** — confirmar, registrar ou completar.
Passar perto não conta; se contasse, bastaria dirigir pela avenida com o app
aberto para fechar a rota, e a rota deixaria de produzir qualquer coisa.

Daí a necessidade do **pular parada**, com limite de 2 por rota e um motivo
obrigatório. A bronca pode não existir mais, o portão pode estar fechado, o
ponto pode estar errado. Sem o pulo a rota trava e nunca fecha — e uma rota que
não fecha só precisa acontecer uma vez para a pessoa não gerar a segunda.

O pulo não é desistência: o motivo escolhido vira uma atualização da bronca, que
é informação que ninguém tinha.

## 4. Superfícies

**`/missoes`** — card no topo, acima das trilhas: as três diárias com barra de
progresso e o tempo restante do dia. É onde quem já quer agir vai, e é onde a
âncora `#patrulhas` das missões existentes aponta.

**Feed (`HomePage`)** — card compacto novo: `Missões de hoje · 1/3`, que navega
para `/missoes`. Só isso. O feed lembra; ele não executa. Hoje a HomePage não
tem nenhuma superfície de missões, então isto é componente novo.

**`/minhas-patrulhas`** — sem mudança. Continua sendo o histórico.

## 5. Pontos e a tabela `daily_completions`

Cada ação dentro de uma diária já paga o que sempre pagou (`PONTOS`, em
`patrolGame.js`). O que é novo é o bônus:

- **diária concluída**: 10 pontos;
- **dia perfeito (3/3)**: 25 pontos.

Somar isso exigiria saber quais diárias caíram em cada dia do passado. O sorteio
determinístico permite recalcular, mas exigiria os contadores diários de todo o
histórico — caro, e por uma resposta que não muda.

Então o fato é gravado:

```sql
create table public.daily_completions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dia        date not null,
  daily_id   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, dia, daily_id)
);
```

Só append, chave primária impedindo duplicata, RLS liberando apenas as próprias
linhas.

**Isto não contradiz a filosofia do módulo.** O que `missions.js` e
`patrolGame.js` evitam gravar é *valor derivado de regra* — o nível, a medalha,
o progresso — porque o valor gravado diverge no dia em que a regra muda. Uma
linha dizendo que fulano concluiu a diária X no dia Y é *fato*, da mesma
natureza de `patrols` e `reports`, e ele não fica errado quando a meta de amanhã
for outra.

Para o bônus chegar ao placar, `get_mission_counters` ganha duas colunas na
mesma migração:

- `dailies_completed` — `count(*)` das linhas do usuário;
- `perfect_days` — dias com três linhas.

As duas **respeitam `p_desde`** (por `daily_completions.dia`), ao contrário dos
contadores de bairro: "quantas diárias fechei hoje" é uma pergunta com resposta
diária, e é ela que o card do feed mostra.

`pontosDeAcoes`, em `src/lib/scoring.js`, soma
`dailies_completed × 10 + perfect_days × 25`. As duas constantes moram ao lado
de `PONTOS` em `patrolGame.js`, pela mesma razão que `PONTOS_POR_ETAPA` mora lá:
`scoring.js` importa `patrolGame.js`, e o caminho de volta fecharia um ciclo.

## 6. A sequência vira semanal

`calcularSequencia` conta **dias consecutivos** de patrulha, e as medalhas
`sequencia_3` e `sequencia_7` pedem 3 e 7 dias seguidos. É irrealista: ninguém
sai à rua fiscalizando a cidade todo dia, e uma meta que quase ninguém alcança
não motiva — só decora a tela.

A sequência passa a contar **semanas consecutivas com ao menos uma patrulha**.
Semana de segunda a domingo, no fuso `America/Sao_Paulo`, o mesmo que a migração
172 já fixa. A tolerância acompanha a mudança: vale ter patrulhado nesta semana
**ou** na passada — pela mesma razão que hoje vale hoje ou ontem, cortar a
sequência à meia-noite de domingo puniria quem patrulhou no sábado.

Com isso "3 semanas seguidas" e "7 semanas seguidas" viram metas alcançáveis e
que significam algo: quem patrulha toda semana há dois meses é exatamente o
usuário que o app quer reconhecer.

### Duas consequências a aceitar de olhos abertos

**A medalha pode sumir de quem já a tinha.** `avaliarConquistas` é pura e
recalculada a cada leitura — não há nada gravado a preservar. Quem ganhou
`sequencia_3` com três dias seguidos e não tem três semanas verá a medalha
voltar a bloqueada. É a contrapartida documentada da escolha de não gravar
(`patrolGame.js:3-7`), e ela vale mais que o custo — mas quem executar deve
verificar quantas contas em produção estão nessa situação antes de subir.

**`patrol_days` só cobre 90 dias.** A migração 180 filtra
`ended_at >= now() - interval '90 days'`, o que dá teto de ~12 a 13 semanas na
sequência. Enquanto as medalhas pedirem 3 e 7 semanas isso não aparece; se
alguma vier a pedir mais, a janela precisa crescer junto.

## 7. Contador próprio das diárias

As diárias exibem sua própria sequência — "12 dias seguidos cumprindo as
diárias" — derivada de `daily_completions`, e **não** ganham medalha nova por
ora. Duas sequências disputando a mesma tela fazem com que nenhuma seja lida; a
segunda entra como número, e só vira medalha se o uso mostrar que vale.

## Riscos e limites

**Fuso fixo.** Todo o módulo assume `America/Sao_Paulo`. O plano de
nacionalização vai levar o app a estados em UTC-4 e UTC-5, onde a "meia-noite"
da diária cairá errado. Não é problema desta entrega, mas entra na lista da
nacionalização — e piora com as diárias, porque expirar é mais visível que
contar.

**Fraude de presença.** As diárias aumentam o incentivo a falsear GPS. A regra
dos 100 m validada no servidor (migração 173) continua sendo a defesa, e ela
cobre sinal e missão. Confirmação de bronca via alerta não passa por ela hoje —
é pré-existente, mas o volume novo o torna mais atraente.

**Segurança física.** A Rota do dia manda alguém a pé a pontos escolhidos por
algoritmo. Ela não deve ser sugerida em horário noturno sem aviso, e o
disclaimer existente (`PatrolDisclaimer`) precisa cobrir esse caso.

**Bateria e dados.** A rota a pé mantém o GPS ativo por ~30 minutos. É o mesmo
custo da patrulha atual, mas passa a acontecer com mais frequência por desenho.

## O que fica de fora

Território e cobertura de ruas, fechamento do ciclo (bronca resolvida),
mutirões, boletim de bairro e recompensa material. Todos foram levantados e
todos ficam para depois — esta entrega é o gancho diário, e ela precisa provar
que traz gente de volta antes de valer a pena construir o que se apoia nela.
