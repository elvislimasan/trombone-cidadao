# Code review do PR #8

Review de [Main.painel prefeitura](https://github.com/elvislimasan/trombone-cidadao/pull/8), feito em 06/10/2026.
Base: `1ea707c2e2aa5ca344ed915c5edda3c8e7ad4a66` (`main`).
Head: `dbcce3fed2e5a30645f52830513797b9887d85f3` (`main.painel_prefeitura`).
Metadados conferidos no GitHub; o HEAD local corresponde ao PR. Alterações locais já existentes, fora desse commit, não fazem parte do review.

**Recomendação: corrigir os três achados abaixo antes de implantar o PR e executar o preenchimento em massa.** As verificações locais passaram para bairros, isolamento de dados municipais, atendimento e paginação, mas não eliminam os problemas de atualização de um banco que já recebeu as migrações da `main`.

## 1. [P1] A versão 272 foi reutilizada e a antiga migração não pode ser reaplicada como 273

Local: [272_contatos_equipe_prefeitura.sql](../supabase/migrations/272_contatos_equipe_prefeitura.sql) e [273_sewage_issue_types.sql, linha 4](../supabase/migrations/273_sewage_issue_types.sql).

Na base do PR, `272_sewage_issue_types.sql` já existe. No PR ela foi renomeada para `273_sewage_issue_types.sql`, sem mudar o conteúdo, e uma migração diferente de contatos da equipe passou a usar `272`.

Se produção já executou a antiga 272, a CLI considera a versão 272 aplicada e não instala `listar_emails_equipe_prefeitura()`. Quando tenta instalar a 273, o `ADD CONSTRAINT reports_esgoto_issue_type_check` encontra a constraint que a antiga 272 criou e falha com `42710` (objeto duplicado). O deploy não chega às demais migrações.

**Reprodução:** em PostgreSQL local descartável, aplicar o bloco da constraint da 272 presente na `main` e depois o mesmo bloco da atual 273 produz `42710`.

**Correção proposta:** manter a identidade e o conteúdo da migração de esgoto já publicada e dar uma versão inédita à migração de contatos. Se algum ambiente já recebeu a numeração deste PR, comparar SQL e objetos existentes antes de reconciliar o histórico; número sozinho não comprova o conteúdo executado. Não marcar todas as pendências como aplicadas para contornar o erro.

**Correção local posterior ao review:** a 273 passou a criar a constraint
somente quando ausente, preservando a já instalada. A nova
`351_reaplicar_contatos_equipe_prefeitura.sql` garante a RPC de contatos em
ambos os históricos da versão 272, sem reescrever registros de migrações.
O achado acima descreve o commit revisado; os arquivos locais corrigidos e
o roteiro atualizado permitem retomar o erro 42710. O ensaio de upgrade está
em `tools/validate-pr8-migration-upgrade-db.mjs`.

## 2. [P1] Aplicar a nova 270 em um banco que já recebeu a 271 remove uma permissão restaurada

Local: [270_painel_gestao_prefeituras.sql, linha 1529](../supabase/migrations/270_painel_gestao_prefeituras.sql).

A 270 nova executa `REVOKE EXECUTE ... enviar_relatorios_do_orgao(text) FROM authenticated`. A migração 271, que já está na base do PR, restaura justamente essa permissão para o botão administrativo “Gerar mensal agora”; a RPC valida o papel do usuário internamente.

Em instalação limpa, 270 → 271 conserva a permissão. Em atualização com 271 já registrada, aplicar a 270 pendente não reaplica automaticamente a 271. O botão passa a falhar com falta de permissão. Isso também ocorre se a 270 for executada manualmente sem a correção posterior.

**Reprodução:** aplicar a 271 em uma RPC de teste concede `EXECUTE` a `authenticated`; executar o revoke da 270 em seguida faz `has_function_privilege(...)` retornar `false`.

**Correção proposta:** retirar a revogação conflitante da nova 270 ou instalar uma migração inédita posterior que preserve o comportamento da 271. No roteiro manual, executar a 271 imediatamente após a 270 e verificar a permissão ao terminar. Essa correção restaura acesso à RPC; não dispara relatórios.

## 3. [P2] O backfill de broncas aceita endereço com dois bairros cadastrados

Local: [backfill-report-neighborhoods.mjs, linha 51](../scripts/backfill-report-neighborhoods.mjs).

`neighborhoodFromAddress()` retorna assim que encontra um único bairro após a palavra “Bairro”, antes de examinar os demais segmentos do endereço. Com o catálogo `Centro` e `AABB`, o endereço `Rua A, Bairro Centro, AABB` retorna `Centro`. A implementação compartilhada do app e a resolução SQL consideram os dois nomes e deixam o caso sem associação.

Executar o script com `--apply` grava uma associação que deveria ficar para revisão. O gatilho não corrige isso: recebe `neighborhood='Centro'`, que é um nome válido, e o preserva.

**Reprodução:** importar as duas funções e consultar o exemplo acima resulta em `{script:'Centro', shared:null}`.

**Correção proposta:** usar a função compartilhada também no script ou reunir todas as correspondências antes de decidir. Cobrir o caso de um bairro explícito mais outro bairro em segmento completo. Até a correção, revisar a prévia e evitar `--apply` em massa para broncas; não existe opção de aplicar somente as entradas aprovadas de um JSON anterior.

**Correção local posterior ao review:** `backfill-report-neighborhoods.mjs`
agora importa o resolvedor compartilhado de `_shared/reportNeighborhoods.js`.
O teste de regressão cobre bairro explícito mais outro bairro em um segmento,
incluindo DNER. Usar o script atualizado, gerar a prévia e revisar antes de
executar `--apply`.

## Observações operacionais

- As migrações 284, 287 e 347 usam `city_id=64` para corrigir endereços de Floresta. A 279 resolve a cidade por nome e UF. Confirmar o ID real de produção: se for diferente, as correções específicas podem não alcançar os postes desejados. Ajustar o SQL dessas correções para resolver Floresta/PE no ambiente de destino.
- A 277 transforma **todos** os postes `nao_informado` em `aceso`, grava histórico e normaliza futuras escritas. É uma regra global, não uma vistoria realizada. `normalize-lighting-status.mjs --apply` é redundante depois dessa migração e não deve entrar no roteiro habitual.
- O backfill KMZ guarda um relatório com IDs e nomes dos campos, mas não os valores anteriores de `raw_properties`, `lamp_type` e `lamp_power_w`; a gravação acontece antes do checkpoint da entrada. Esse JSON não serve como backup para desfazer as mudanças. Exportar os valores anteriores antes de `--apply`.
- `poles:addresses` sem `--apply` mostra o inventário; não gera uma lista de endereços sugeridos. Com `--apply`, pode salvar o endereço e falhar no histórico em uma chamada posterior. O roteiro precisa tratar `history_failed` antes de retomar.
- Os scripts de bairros só associam ao catálogo existente; não cadastram automaticamente bairros ausentes nem preenchem `city_id`. O script de broncas cobre `pending` e `in-progress`, com moderação aprovada/nula, excluindo abaixo-assinados. As migrações 344/345 têm abrangência diferente e já executam preenchimento durante a instalação.
- Os três deploys de Edge Functions alterados não estão juntos em `npm run deploy:functions:prod`. Usar os comandos explícitos do [roteiro de produção](implantacao-pr-8-producao.md).

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm test` | 1.259 testes: 1.256 passaram, 3 falharam |
| Reprodução das três falhas na base `origin/main` | Mesmas três falhas em 19 testes dos arquivos envolvidos, com CRLF igual ao workspace |
| `npx vite build` | Passou; aviso de bundle grande |
| `validate-report-neighborhoods-db.mjs` | Passou: associação, preservação, ambiguidades, gatilhos e reaplicação de 344/345 |
| `validate-pole-location-db.mjs` | Passou: coordenadas, histórico, permissões e correção específica |
| `validate-anon-map-db.mjs` | 10 verificações passaram |
| `validate-electrician-patrol-db.mjs` | 6 verificações passaram |
| `validate-atendimento-flows-db.mjs` | 25 verificações passaram, incluindo paginação no banco e isolamento entre usuários/cidades |
| `validate-electrician-pagination-ui.mjs` | Passou em 390, 1440 e 1920 px, sem overflow horizontal |
| `validate-municipal-work-orders.mjs` | Bloqueado no bundle de teste: mocks não exportam `showAppInfo` |

As três falhas da suíte geral são `councilorAdmin.test.mjs:35`, `councilorIdentityLink.test.mjs:47` e `directoryCategories.test.mjs:19`. Duas buscas textuais dependem de LF e falham com CRLF; o teste de navegação legislativa espera um trecho ausente também na base. Não foram classificadas como regressões deste PR.

Os validadores de banco usam fixtures e funções espaciais simuladas em PostgreSQL local; não substituem um ensaio completo do upgrade em clone com PostGIS, dados e histórico reais de produção. O resultado de layout aprovado é do painel de paginação; o validador de ordens municipais não chegou a executar os cenários de navegador. A câmera ainda precisa de teste em Android/iPhone reais, inclusive retorno após abrir a câmera do sistema.

Nenhuma migração, seed, backfill ou publicação foi executada em produção. O review foi salvo no repositório; não foi publicado como comentário no GitHub.
