# PR #8 — roteiro de implantação em produção

Referência: [PR #8](https://github.com/elvislimasan/trombone-cidadao/pull/8), head `dbcce3f`, conferido em 06/10/2026.
Projeto de produção configurado no `package.json`: **`mrejgpcxaevooofyenzq`**.
Projeto de desenvolvimento: `xxdletrjyjajtrmhwzev`.

Este documento explica o que executar; nenhum desses comandos foi aplicado a produção durante o review. Ler primeiro os [achados do review](review-pr-8.md). A correção local da colisão 272/273 está descrita abaixo e acrescenta a migração 351. A permissão removida pela 270 ainda exige o tratamento indicado. O backfill de broncas foi corrigido localmente para usar o resolvedor compartilhado e rejeitar bairros ambíguos; usar esse arquivo atualizado antes de `--apply`.

## Ordem de execução

1. Confirmar projeto, backup e histórico das migrações.
2. Ensaiar a atualização em clone de produção e resolver as colisões descritas abaixo.
3. Instalar o SQL pendente do painel, seguindo a ordem de dependências, com a correção da permissão após a 270.
4. Conferir/complementar o catálogo de bairros antes de 344/345, se necessário.
5. Publicar `reverse-geocode`, `create-anonymous-report` e `generate-street-history`.
6. Preencher dados legados: detalhes KMZ opcionais, endereços vazios, bairros de broncas, bairros de postes.
7. Executar o pós-check, publicar o frontend e validar os fluxos de produção.

As etapas de banco precedem o frontend: a nova UI depende das tabelas, policies e RPCs do PR, especialmente `listar_painel_eletricista` (350), patrulhas (349), busca/acesso municipal (348) e localização de postes (346).

## 1. Preparar e conferir o ambiente

Guardar um backup recuperável do banco e o histórico de migrações antes de atualizar. O PR altera dados existentes, permissões e regras de iluminação; os relatórios JSON dos scripts não substituem esse backup. Guardar também os arquivos de Storage se a estratégia de recuperação exigir os anexos.

Na raiz do repositório, com a CLI Supabase autenticada:

```powershell
git rev-parse HEAD
supabase --version
npm run link:prod
Get-Content supabase/.temp/project-ref
supabase migration list --linked
supabase db push --linked --include-all --dry-run
```

`link:prod` muda o projeto vinculado deste workspace. A saída precisa mostrar `mrejgpcxaevooofyenzq`. O `--dry-run` apenas lista SQL que seria aplicado: não valida o SQL nem os dados e pode parar por divergência no histórico. Não remover `--dry-run` enquanto a lista e as versões 270–273 não estiverem conferidas. Não usar `--include-seed`, `--include-roles` ou `db reset --linked` neste roteiro.

No SQL Editor do projeto de produção, executar [preflight-prod.sql](../scripts/pr8/preflight-prod.sql). Ele apenas consulta:

- Versões e nomes das migrações registradas.
- ID real de Floresta/PE e catálogo de bairros dessa cidade.
- Bairros e registros sem cidade, endereços vazios e status dos postes.
- Protocolos duplicados que podem impedir a criação do índice único da 301.
- Constraint de esgoto e presença das RPCs relevantes.
- Permissão do disparo manual de relatório e extensões instaladas.

Se `supabase_migrations.schema_migrations` não existir, o banco não possui esse histórico rastreado: conferir o schema real e definir uma base de migrações antes de usar a CLI para aplicar o diretório inteiro. Se houver outro projeto de produção definido pela equipe, substituir o ref e as URLs deste documento antes de seguir.

## 2. Resolver o histórico 270/271/272/273

O PR contém uma migração 270 nova, uma 272 nova de contatos e a antiga 272 de esgoto renomeada para 273. A 271 de restauração de permissão já estava na `main`. Por isso não há um comando único seguro para todos os estados possíveis de produção.

### Retomar após `reports_esgoto_issue_type_check already exists` (42710)

Esse erro ocorre quando a constraint da antiga 272 já existe e a 273 tenta
criá-la novamente. A versão corrigida de
[273_sewage_issue_types.sql](../supabase/migrations/273_sewage_issue_types.sql)
consulta `pg_constraint` na tabela `public.reports` e só cria a restrição se
ela estiver ausente. A existente mantém sua definição e seu estado de validação;
os dados antigos não são alterados. Conferir no preflight que a definição permite
os quatro tipos `sewer_clogged`, `sewer_box_broken`, `sewer_box_without_cover`
e `sewer_cover_broken`, além de tipo nulo e outras categorias.

Também foi acrescentada
[351_reaplicar_contatos_equipe_prefeitura.sql](../supabase/migrations/351_reaplicar_contatos_equipe_prefeitura.sql):
ela instala a RPC de contatos mesmo quando a CLI pula a 272 por já encontrar
a versão histórica de esgoto. Pode executar em ambientes que já receberam a
272 de contatos; mantém as mesmas permissões e o filtro por município.

Se o `db push` parou no primeiro comando da 273, usar os arquivos corrigidos
e conferir as pendências antes de retomar:

```powershell
supabase migration list --linked
supabase db push --linked --include-all --dry-run
# Executar após conferir o projeto e todas as pendências do plano:
supabase db push --linked --include-all
```

Se a execução foi manual pelo SQL Editor, executar o arquivo 273 corrigido
quando essa migração estiver pendente e a 351 depois dos pré-requisitos do painel.
Não reaplicar a 273 em um banco que já recebeu redefinições posteriores de
`complete_patrol_signal`: ela também contém a definição histórica dessa RPC.
Não é necessário apagar a constraint ou alterar a versão 272 no histórico
para resolver o erro. Não marcar a 273 como aplicada apenas porque a constraint
existe: o arquivo também instala a função de patrulha. O pós-check confere
a constraint e a RPC de contatos.

Ensaio local: `node tools/validate-pr8-migration-upgrade-db.mjs`, com o PostgreSQL
descartável em `.tmp/municipal-demand-pg` na porta 55439. O validador rejeita outro
diretório de banco e não usa conexão do Supabase.

### Retomar após `Definição inesperada: public.salvar_demanda_municipal(...)` na 348

A 348 atualiza trechos das RPCs instaladas e aceita uma substituição já
aplicada. O comparador original normalizava CRLF para LF somente na definição
da função. Isso tornava a aplicação/reaplicação dependente das quebras de linha
do arquivo SQL. A versão corrigida de
[348_eletricista_ofertas_municipio_e_busca.sql](../supabase/migrations/348_eletricista_ofertas_municipio_e_busca.sql)
normaliza também o trecho antigo e o substituto; mantém a rejeição de definições
desconhecidas. O teste local reproduziu a falha de reaplicação e verificou os
dois formatos depois da correção.

Usar o arquivo corrigido, conferir `migration list` e `db push --dry-run`, e
retomar o `db push` indicado acima. A 348 usa `BEGIN/COMMIT`: a falha aborta sua
transação, enquanto as migrações anteriores já confirmadas permanecem
instaladas. Não é necessário reaplicar 345–347 para retomar a 348. As mensagens
`trigger ... does not exist, skipping` de `DROP TRIGGER IF EXISTS` são avisos
esperados e não indicam falha na criação posterior do gatilho.

Se a comparação ainda falhar com os arquivos corrigidos, consultar a definição
real antes de modificar o SQL:

```sql
select pg_get_functiondef(
  'public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure
);
```

A definição enviada para análise neste caso continha as validações esperadas
de execução, responsável, vínculos, versão e anexos. Não remover a verificação
do comparador nem registrar a 348 como aplicada sem instalar seu SQL.

Ensaio local: `node tools/validate-atendimento-flows-db.mjs`, no mesmo cluster
descartável indicado acima. As 25 verificações passaram, incluindo aplicação
com CRLF, reaplicação com LF/CRLF, preservação das funções e isolamento municipal.

| Estado observado | Tratamento |
| --- | --- |
| Antiga 272 de esgoto já aplicada | Usar a 273 corrigida, que preserva a constraint existente, e instalar a 351 para garantir a RPC de contatos. Preservar o registro histórico da antiga 272. |
| 271 aplicada, 270 ainda não instalada | Aplicar a 270 e restaurar a permissão da 271 imediatamente depois, ou corrigir esse conflito na branch. |
| 270–273 nunca aplicadas | Em banco com pré-requisitos instalados, seguir 270 → 271 → 272 contatos → 273 esgoto e demais pendências até 351. A 351 reinstala a mesma RPC sem mudar sua assinatura. Ensaiar com os dados reais. |
| SQL executado manualmente, sem histórico correspondente | Conferir objetos e definições; só depois registrar as versões realmente executadas. |
| Migrações do PR já aplicadas parcialmente | Retomar da primeira ausente após identificar o conteúdo real instalado. Não reaplicar o pacote inteiro: há `CREATE TABLE`, constraints e patches de definições não reaplicáveis. |

**Caminho preferido:** usar a 273 corrigida e a nova 351 e testar o upgrade com uma cópia do schema, dados e histórico de produção. Conferir novamente o `db push --dry-run`. Depois de revisado o plano, aplicar com:

```powershell
supabase db push --linked --include-all
```

Esse comando aplica todas as pendências listadas, não somente as deste PR. Se aparecer SQL fora do plano, não executá-lo até conferir a dependência.

**Caminho manual com os arquivos corrigidos:** executar pelo SQL Editor somente arquivos ausentes, na ordem da seção seguinte. Depois de executar a 270, executar [271_restaurar_disparo_relatorio_orgao.sql](../supabase/migrations/271_restaurar_disparo_relatorio_orgao.sql), mesmo que já estivesse registrada. A 351 instala contatos mesmo quando a versão 272 registrada corresponde ao antigo esgoto. Antes da 273, conferir a constraint existente e a versão instalada de `complete_patrol_signal`, como indicado acima. Não basta verificar só a constraint.

O SQL Editor não registra automaticamente os arquivos executados na tabela de migrações. A ferramenta `migration repair` altera esse histórico, sem instalar os objetos. Um exemplo **apenas para uma versão inédita cujo SQL já foi instalado e conferido**:

```powershell
# Exemplo de formato; substituir VERSION pela versão correta do plano revisado.
# supabase migration repair VERSION --status applied --linked
```

Não marcar a nova 272 como instalada só porque a antiga 272 está no histórico, nem marcar todo o intervalo 270–351 sem conferir o conteúdo. A semântica de `--dry-run`, `--include-all` e `migration repair` está na [referência oficial da CLI](https://supabase.com/docs/reference/cli/supabase-db-push) e no [guia de migrações](https://supabase.com/docs/guides/deployment/database-migrations).

## 3. SQL necessário para o PR

A base do PR pressupõe o schema anterior da `main`, inclusive cidades/estados, `bairros.city_id`, vínculo de postes, canais do órgão, campos de esgoto e infraestrutura de patrulha. Se produção estiver atrás dessa base, levantar as pendências anteriores no `migration list` e ensaiá-las também. Não inferir o estado de produção pelo branch local.

Os arquivos do PR devem seguir esta ordem. Os intervalos abaixo contêm somente os números que existem no diretório; não há migrações 288–291 nem 293–300 neste pacote.

| Ordem / arquivos | O que instala ou altera |
| --- | --- |
| `270_painel_gestao_prefeituras.sql` | Identidade institucional, prefeituras/equipe/convites, casos, respostas, autorização e RLS. |
| `271_restaurar_disparo_relatorio_orgao.sql` | Pré-existente na base; restaurar a permissão depois da 270. |
| `272_contatos_equipe_prefeitura.sql` | RPC de e-mails da equipe. A CLI pode pular esta versão se a antiga 272 de esgoto já foi registrada; a 351 cobre esse caso. |
| `273_sewage_issue_types.sql` | Antiga 272 renomeada; versão corrigida preserva a constraint já existente e instala a RPC de patrulha. |
| `274` → `275` → `276` | Demandas, vínculos com broncas, fluxo operacional, anexos, regras e preservação de respostas. |
| `277` → `278` → `279` → `280` → `281` | Iluminação acesa por padrão, responsável opcional, bairro Bomba, tipos de anexos e conclusão rápida. |
| `282` → `283` → `284` → `285` → `286` → `287` | Clusters de iluminação, correções de endereços e sugestão por ruas mapeadas. |
| `292_municipal_pole_technical_details.sql` | Edição de dados técnicos do poste preservando a origem KMZ. |
| `301` → `302` → `303` → `304` → `305` → `306` | Protocolos, subtipos, atualização de broncas, cancelamento, papéis do eletricista e opções técnicas. |
| `307` → `308` → `309` → `310` → `311` → `312` → `313` → `314` → `315` → `316` | Solicitações internas/públicas, tipos de lâmpada, permissões, comprovantes, exclusão e referência/conclusão. |
| `317` → `318` → `319` → `320` → `321` → `322` → `323` → `324` → `325` → `326` | Categorias municipais, convite direto, ofertas, feed anônimo/WebP e execução pelo eletricista. |
| `327` → `328` → `329` → `330` → `331` → `332` → `333` → `334` → `335` → `336` → `337` → `338` → `339` | Lotes, estatísticas, solicitações internas, visitas, serviços por solicitação, histórico e coerência do atendimento. |
| `340` → `341` → `342` → `343` | Acesso anônimo ao mapa, cadastro de poste/cidade, prévia de ofertas e notificações. |
| `344_report_neighborhood_association.sql` | Canonização e associação dos bairros de broncas, com gatilho e preenchimento durante a migração. |
| `345_pole_neighborhood_association.sql` | Associação dos bairros de postes por endereço atual ou vínculo inequívoco, preservando metadados. |
| `346_municipal_pole_location_edit.sql` → `347_floresta_carmo_pole_addresses.sql` | Edição de coordenadas com histórico e correção específica dos dois postes. |
| `348_eletricista_ofertas_municipio_e_busca.sql` | Acesso/ofertas entre secretarias do mesmo município e busca por poste/protocolo. |
| `349_electrician_patrols.sql` → `350_electrician_panel_pagination.sql` | Campos/constraint da patrulha profissional e RPC de paginação. |
| `351_reaplicar_contatos_equipe_prefeitura.sql` | Garante a RPC de contatos em ambientes com a antiga 272 de esgoto ou a nova 272 de contatos. |

Pontos a conferir antes de aplicar:

- **277:** converte globalmente `nao_informado` para `aceso`; registrar os totais antes e depois. Não repetir o script de normalização como rotina adicional.
- **279:** cadastra Bomba em Floresta/PE pelo nome e UF; não popula o catálogo completo de uma cidade.
- **284, 287 e 347:** contêm `city_id=64`. Confirmar que 64 é Floresta/PE em produção ou preparar o SQL dessas correções com resolução dinâmica da cidade. Não atribuir city 64 às demais cidades para fazer a correção funcionar.
- **301:** depende da ausência de protocolos duplicados para o índice único.
- **344/345:** já modificam dados ao serem instaladas. Guardar o inventário antes delas; a simulação dos scripts posteriores mostra apenas o que sobrar.
- **339/348:** ajustam definições anteriores de RPC por trechos de SQL. Usar a 348 corrigida para LF/CRLF. Se o erro “Definição inesperada” persistir, conferir o schema instalado; não remover a validação para prosseguir.

As policies e buckets estão nos arquivos do pacote. Não executar um `GRANT ALL` geral nem desligar RLS para fazer o frontend funcionar.

## 4. Cadastrar os bairros que faltam no catálogo

Preencher o **catálogo** (`public.bairros`) e preencher o **bairro dos registros** são operações diferentes. Os scripts `reports:neighborhoods` e `poles:neighborhoods` não criam novos nomes nesse catálogo.

Conferir os bairros retornados pelo preflight. Bomba é adicionada pela 279. DNER é reconhecido como alias de **São Francisco de Assis (DNER)** quando o nome canônico existe no cadastro da cidade. Não cadastrar “DNER” como um segundo bairro nem transformar “Né Maniçoba - AABB” em um bairro novo.

Se houver outros nomes confirmados que não estão cadastrados, editar a lista `v_bairros` de [seed-bairros-floresta.sql](../scripts/pr8/seed-bairros-floresta.sql) e executá-lo no SQL Editor antes da 344/345. Por padrão ele apenas garante Bomba, já coberta pela 279. A cidade é resolvida por Floresta/PE, sem ID fixo; o script falha se não houver uma cidade única e não renomeia bairros existentes. Para outro município, adaptar o alvo e revisar a lista de nomes.

Se o catálogo for complementado depois da 344/345, os scripts podem recuperar associações ainda vazias. Bairros existentes, desconhecidos ou compostos são preservados para revisão; não esperar que o backfill substitua automaticamente um nome já preenchido.

## 5. Publicar as três Edge Functions

Depois do SQL, antes de geocodificar dados antigos e antes de publicar o frontend:

```powershell
supabase functions deploy reverse-geocode --project-ref mrejgpcxaevooofyenzq
supabase functions deploy create-anonymous-report --project-ref mrejgpcxaevooofyenzq
supabase functions deploy generate-street-history --project-ref mrejgpcxaevooofyenzq
```

Os módulos `_shared/reportNeighborhoods.js` e `_shared/streetHistoryResponse.js` são dependências empacotadas junto das funções, não deploys separados. `npm run deploy:functions:prod` não publica essas três funções nesta versão do projeto.

Preservar e conferir a configuração de autenticação de cada função já usada em produção. Não acrescentar `--no-verify-jwt` às três indiscriminadamente. `generate-street-history` valida sessão e permissões no código; o fluxo anônimo precisa funcionar sem login de usuário. Testar os dois caminhos depois do deploy e conferir a configuração existente no Dashboard.

Conferir os secrets usados pelo código, sem imprimir seus valores: `RECAPTCHA_ENTERPRISE_API_KEY`, `RECAPTCHA_ENTERPRISE_PROJECT_ID`, `RECAPTCHA_ENTERPRISE_SITE_KEY`, `GEMINI_API_KEY` e, quando configurados, `GEMINI_MODEL`/`APP_USER_AGENT`. Não há novos valores obrigatórios de secret introduzidos pelo diff dessas funções; o projeto precisa manter os já necessários para seus fluxos.

## 6. Preparar os scripts de dados no PowerShell

Usar uma sessão de terminal dedicada. As quatro rotinas de backfill leem o arquivo `.env`, sobrepondo os valores com variáveis de processo; `VITE_SUPABASE_URL` tem precedência sobre `SUPABASE_URL`. Por isso apenas executar `link:prod`, ou apenas definir `SUPABASE_URL`, não basta se `.env` ainda aponta para dev.

```powershell
# .env precisa existir; não é necessário reescrever o arquivo de desenvolvimento.
$env:VITE_SUPABASE_URL = 'https://mrejgpcxaevooofyenzq.supabase.co'
$env:SUPABASE_URL = $env:VITE_SUPABASE_URL
# Substituir localmente pelo segredo do projeto de produção.
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-de-producao>'
Get-Content supabase/.temp/project-ref

# Usar o city_id retornado pela consulta Floresta/PE do preflight.
# 0 é um placeholder e será recusado pelos scripts até ser substituído.
$cityIdProd = 0
```

A service role é credencial administrativa; não colocar em variável `VITE_*`, arquivo versionado ou frontend. Usar dependências locais compatíveis com o lockfile (`npm ci` em um checkout separado, se necessário). A chave pública do app não substitui a service role nos scripts.

### 6.1. Dados técnicos do KMZ — opcional

Usar apenas se os postes já foram importados e faltam dados de luminárias/potência/metadados do arquivo original:

```powershell
npm run poles:kmz-details -- --city-id $cityIdProd --kmz 'C:\dados\FLORESTA.kmz' --project-ref mrejgpcxaevooofyenzq --limit 20
```

Trocar o caminho pelo arquivo original. O script exige que o SHA-256 do KMZ corresponda ao `content_hash` de um dataset KMZ existente. Também confere identificador e coordenadas; não corrige postes movidos que deixaram de corresponder ao arquivo. Preserva os dados municipais e endereços, completa lâmpada/potência vazias e substitui a camada `raw_properties.kmz` correspondente ao arquivo.

Revisar `.tmp/pole-kmz-details-*.json`. **Esse relatório não contém os valores anteriores.** Exportar antes `id,dataset_id,city_id,raw_properties,lamp_type,lamp_power_w,updated_at` dos postes que serão alterados. Só depois da revisão e do backup:

```powershell
npm run poles:kmz-details -- --city-id $cityIdProd --kmz 'C:\dados\FLORESTA.kmz' --project-ref mrejgpcxaevooofyenzq --apply
```

Não reimportar o KMZ para apenas preencher dados técnicos; a importação normal tem outro alcance e não faz parte deste roteiro.

### 6.2. Endereços vazios de postes — opcional

Executar **depois das migrações**, como no roteiro, e antes dos backfills de
bairros. Não é necessário reaplicar migrações depois desse comando. Ele grava
um poste por vez; enquanto roda, parte do inventário ainda pode estar vazia.
O JSON contém o estado anterior em `entry.pole.address` (que pode continuar
`null`) e o endereço encontrado em `entry.address`, com `status='saved'`.

O frontend corrigido usa o endereço cadastrado na seleção e encerra o
indicador de busca imediatamente. Se a lista foi carregada antes do backfill
e veio sem endereço, consulta o registro atual antes da rua mapeada e da
geocodificação. A ausência de rua mapeada não encerra mais a busca sem tentar
outra fonte. Publicar essa correção do frontend; ela não requer nova migração.

```powershell
# Apenas inventário, sem consultar e gravar endereços propostos.
npm run poles:addresses -- --city-id $cityIdProd

# Lote pequeno que JÁ GRAVA. Escolher um poste conferido se usar --pole-id.
npm run poles:addresses -- --city-id $cityIdProd --limit 5 --apply
```

O script só preenche endereços nulos/vazios, exclui removidos, consulta o marcador e conserva um snapshot em `.tmp/pole-addresses-*.json`. `--pole-id` usa o ID numérico do banco, não a plaqueta. Confirmar visualmente os resultados do lote antes de ampliar:

```powershell
npm run poles:addresses -- --city-id $cityIdProd --apply
```

Se houver `history_failed`, o endereço foi salvo, mas o histórico não foi. O JSON contém a entrada de histórico proposta; conferir e corrigir esse histórico antes de retomar. Se houver falha de geocodificação, o script para após três consultas consecutivas sem endereço. Reexecutar processa os que continuam vazios. Endereços preenchidos incorretamente precisam de correção manual ou específica, não desse backfill.

### 6.3. Bairros de broncas

Primeiro simular sem consulta externa e depois uma pequena amostra com geocodificação:

```powershell
npm run reports:neighborhoods -- --city-id $cityIdProd
npm run reports:neighborhoods -- --city-id $cityIdProd --geocode --limit 10
```

Revisar `.tmp/report-neighborhoods-*.json`, especialmente `ready`, `unresolved`, `candidate` e o relatório original de cada entrada. **Usar o script atualizado:** a correção local do achado 3 importa o resolvedor compartilhado e não associa `Rua A, Bairro Centro, AABB` a Centro. Os testes cobrem esse caso, o alias DNER, a cidade retornada pelo geocoder e a proteção contra edição concorrente. Depois da revisão da prévia, usar:

```powershell
# Aplicar primeiro as associações pelo endereço, depois consultar o restante.
npm run reports:neighborhoods -- --city-id $cityIdProd --apply
npm run reports:neighborhoods -- --city-id $cityIdProd --geocode --limit 10 --apply
# Ampliar após conferir o lote gravado.
npm run reports:neighborhoods -- --city-id $cityIdProd --geocode --apply
```

O script cobre broncas `pending` e `in-progress` com moderação aprovada/nula, exclui abaixo-assinados e só preenche `neighborhood` nulo ou `''`. Não altera endereço, marcador nem um bairro já preenchido. A geocodificação precisa identificar um bairro do catálogo e a mesma cidade, confirmada por `match_city`.

`--apply` faz uma **nova consulta e resolução**, não aplica um JSON anterior. Não há argumento `--from-file` nem escolha de IDs aprovados na prévia. Se a associação mudou ou houver dúvida, não seguir com o lote; corrigir o dado de origem ou tratar os registros individualmente.

### 6.4. Bairros de postes

Executar depois dos endereços e das broncas, porque essas associações são fontes do bairro do poste:

```powershell
npm run poles:neighborhoods -- --city-id $cityIdProd
npm run poles:neighborhoods -- --city-id $cityIdProd --geocode --limit 10
```

Revisar `.tmp/pole-neighborhoods-*.json`. Depois:

```powershell
npm run poles:neighborhoods -- --city-id $cityIdProd --apply
npm run poles:neighborhoods -- --city-id $cityIdProd --geocode --apply
```

A rotina usa endereço atual, uma única associação das broncas vinculadas ou coordenadas na mesma cidade. Salva `raw_properties.neighborhood` e `neighborhood_source`, preservando outras propriedades. Não usa `source_address` do KMZ para deduzir bairro. Postes removidos e bairros explícitos já existentes não são substituídos. Mudanças concorrentes em posição/endereço/metadados são ignoradas para evitar sobrescrever uma edição.

**Atenção ao `--limit`:** nos postes ele limita a quantidade examinada, incluindo os que já têm bairro; não significa “10 bairros novos” nem “10 consultas geográficas”. Em todos os scripts o JSON da execução é o registro da revisão e das alterações; guardar fora de `.tmp` antes de uma limpeza local.

### 6.5. Registros sem cidade e normalização de status

Os comandos de bairros não incluem `city_id IS NULL`. Levantar esses registros no preflight e conferir a cidade pelo marcador antes de associá-los. Não executar `UPDATE reports SET city_id=64 WHERE city_id IS NULL` como atalho.

O legado `scripts/backfill_report_city.js` não foi alterado por este PR. Ele também preenche perfis, tem opções e credenciais diferentes, e aplica por padrão sem `--dry-run`. Se for necessário usá-lo, revisar seu escopo e passar explicitamente o usuário do pooler de produção; só definir a senha de produção deixa o usuário padrão apontando para dev. Não é pré-requisito obrigatório para implantar o painel quando os registros já têm cidade.

`scripts/normalize-lighting-status.mjs` também aplica por `--apply`, mas lê apenas `.env` e não as sobreposições de processo usadas acima. Depois da 277 ele é redundante; não incluí-lo na sequência de produção.

## 7. Relatórios do órgão — correção opcional da integração

Se o cron estiver com URL incorreta, conferir sem mostrar o secret:

```sql
select function_url from public.integracao_orgao where id = true;
```

O destino esperado deste projeto é `https://mrejgpcxaevooofyenzq.supabase.co/functions/v1/send-agency-report`. Se necessário, executar [corrigir_url_relatorio_orgao_prod.sql](../scripts/corrigir_url_relatorio_orgao_prod.sql) no SQL Editor de produção. Ele altera apenas a URL, conserva o secret e não dispara e-mails; os próximos crons passam a usar o endereço corrigido. Se a integração não existir, o script falha e é necessário configurá-la com o secret correspondente ao `ORGAO_FUNCTION_SECRET` do projeto.

Essa correção de URL é independente de restaurar o `EXECUTE` da RPC após a 270. O PR não altera o código da função `send-agency-report`.

## 8. Pós-check e publicação

Executar [postcheck-prod.sql](../scripts/pr8/postcheck-prod.sql) no SQL Editor após o SQL e os backfills. Conferir:

- RPCs listadas instaladas; disparo manual de relatório com permissão para `authenticated`.
- RLS ativa nas tabelas institucionais, broncas, mídias e percursos de patrulha.
- Gatilhos de bairros/protocolos e constraint de patrulha profissional presentes.
- Buckets `municipal-demand-files` e `municipal-report-receipts` privados, com os tipos/tamanhos do pacote; WebP aceito em `reports-media` quando há lista de MIME types.
- Distribuição de bairros, registros ainda sem associação e zero postes `nao_informado` após a 277.

SQL executado como administrador não comprova as permissões de um usuário do app. Fazer testes com sessões separadas: visitante vê só conteúdo público; cidadão comum não acessa solicitações internas; equipe acessa o município correto; eletricista não vê nem atende ordem de outro responsável; membro desativado perde acesso.

Publicar o frontend com configuração pública de produção, depois de build e validação. Conferir os redirects de autenticação usados pelos convites `/prefeitura/convite/...`. Validar convite/login, categorias habilitadas, cadastro público e interno, atendimento individual, correção de pin com histórico, pesquisa além da primeira página e exportação. Validar desktop em 1440 e 1920 px, com margem externa até 64 px e sem rolagem horizontal. Validar câmera em aparelho real e retorno ao formulário.

Ao terminar a sessão de backfill:

```powershell
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:VITE_SUPABASE_URL
Remove-Item Env:SUPABASE_URL
# Se voltar ao desenvolvimento neste workspace:
npm run link:dev
```

## 9. Interrupção, retomada e recuperação

Se uma migração falhar, parar antes de publicar o frontend. Conferir o que a transação confirmou e o que foi registrado no histórico. Alguns arquivos têm `BEGIN/COMMIT`, outros não: não presumir que uma falha em qualquer trecho desfaz todo o deploy. Não continuar com `migration repair` só para ocultar o erro.

Os backfills de bairros e endereços usam snapshots e só completam dados ainda elegíveis, mas fazem várias chamadas separadas. Interrupção pode deixar parte do lote gravada. Guardar o JSON, conferir `saved`, `changed_during_lookup`, `unresolved` e eventuais falhas de histórico; gerar nova prévia antes de retomar.

Para desfazer um dado, restaurar os valores anteriores **somente nos registros que ainda correspondem à alteração aplicada**, preservando edições posteriores. Não há comando automático de rollback desses scripts. Para KMZ usar o backup exportado, pois o JSON não guarda os campos antigos. Não excluir bairros recém-cadastrados que já estão em uso nem reaplicar migrações antigas para tentar desfazer regras de autorização.

Se houver incidente, suspender o rollout e escolher uma correção posterior ou recuperação do backup validado. Reverter apenas o frontend não desfaz a conversão de status, os bairros preenchidos ou as permissões do banco.
