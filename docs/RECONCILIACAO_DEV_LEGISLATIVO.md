# Reconciliação do banco de desenvolvimento

Executada em **21/11/2026** na branch `main.painel_legislativo`.

- Desenvolvimento: `xxdletrjyjajtrmhwzev`.
- Produção: `mrejgpcxaevooofyenzq`, consultado somente para comparação.
- A `main` permanece sem as rotas, componentes, função e migrações legislativas.
- A branch legislativa incorpora a `main` até `f5663e8`, além do painel recuperado do stash. O stash original foi preservado.

## Origem da divergência

Dev já havia aplicado as migrações legislativas 428–437. Posteriormente, a `main` recebeu correções comuns usando 430–438. Os mesmos números passaram a identificar SQL diferente nos dois ambientes; marcar todo o intervalo como aplicado ocultaria correções ausentes.

O histórico legislativo foi movido para novas versões por nome e checksum, preservando integralmente seus comandos registrados. Não houve reexecução das cargas, recriação de tabelas legislativas ou cópia de dados de produção.

| Versão original em dev | Versão atual | Migração legislativa |
| --- | --- | --- |
| 428 | 439 | radar |
| 429 | 440 | administration |
| 430 | 441 | profile_activity |
| 431 | 442 | catalogue_zero_ids |
| 432 | 443 | related_records |
| 433 | 444 | summary_query |
| 434 | 445 | worker_configuration |
| 435 | 446 | plain_groups_and_places |
| 436 | 447 | official_profiles |
| 437 | 448 | publication_quality |

## Correções aplicadas em dev

As migrações **430–438 da `main`** foram executadas e registradas com seus próprios nomes. Isso inclui cadastro de postes, transferência de funcionários, atendimento dos pedidos de mudas, acesso ao catálogo, visitas do eletricista, filtros, histórico de numeração e intervalo entre pedidos.

A **449**, `reconcile_shared_schema`, registra diferenças antigas verificadas diretamente entre os schemas: funções comuns, permissões de vereadores e arquivos municipais, políticas de mídia e a restrição de visibilidade dos relatos municipais. Retira políticas genéricas de armazenamento existentes somente em dev e um gatilho antigo de funcionários fora do fluxo atual. A consulta filtrada do eletricista é recalculada após reconciliar sua função base.

A **450**, `reconcile_electrician_visit_resolution`, registra as versões atuais de produção dos dois handlers de visita, incluindo a atualização do estado do poste quando não há solicitação vinculada. Essas definições já estavam corretas em produção.

Os nomes de migrações anteriores a 428 mantêm seu histórico original; não foram substituídos para simular uma aplicação que não ocorreu. A reconciliação usa o schema efetivo, além das versões registradas.

## Diferenças intencionais

- Dev mantém o schema, os dados e o agendador legislativos; produção não recebe o módulo.
- A restrição de módulos de permissão em dev também aceita `legislative`.
- O webhook de notificações mantém a configuração própria de cada ambiente.
- A tabela legada de dev `prefeitura_atendimento_config` e sua política de leitura foram preservadas.
- Credenciais e arquivos `.env` não são copiados entre os ambientes. O vínculo local da CLI foi corrigido para dev.

## Procedimento e verificação

[scripts/reconcile-legislative-dev.mjs](../scripts/reconcile-legislative-dev.mjs) aceita somente o projeto de desenvolvimento e oferece `--plan`, `--dry-run` e `--apply`. A credencial da Management API entra por stdin ou `SUPABASE_ACCESS_TOKEN`; nunca por argumento nem em arquivo versionado.

`--dry-run` executa o plano completo em uma transação com **ROLLBACK**. `--apply` exige o mesmo conjunto de arquivos e o mesmo plano já ensaiado. As mudanças de histórico e o SQL pendente são confirmados na mesma transação, com verificações de identidade das migrações e bloqueio contra outra reconciliação simultânea. O script pode ser consultado novamente com `--plan`; no estado final não há renumerações nem migrações pendentes.

Foram preservados **44.739 registros versionados**, **392.144 vínculos de registros por execução**, **9 execuções**, **216 tarefas** e a mesma execução publicada, com coleta diária e publicação automática ainda habilitadas.

Validações realizadas:

- `supabase migration list --linked`: versões locais e remotas coincidentes até 450.
- `supabase db push --linked --dry-run`: `Remote database is up to date.`
- Comparação de funções comuns, colunas, políticas, restrições e gatilhos com produção, separando as diferenças intencionais acima.
- 32 testes de integração do frontend, permissões e bibliotecas.
- Suíte legislativa em PostgreSQL local descartável, executando todas as dez migrações renumeradas.
- Consultas públicas reais em dev, incluindo os 32 perfis oficiais, isolamento de cidade, snapshots privados e autenticação do coletor.
- Interface com dados simulados em 390, 1440 e 1920 px, nos temas claro e escuro: seis cenários sem erros de execução.
- Build de produção da branch.

Os snapshots de comparação, o plano ensaiado e os recibos foram preservados em `.tmp/reconcile-*` e `.tmp/legislative-dev-reconciliation-*`, fora do versionamento. Produção não recebeu migrações, dados ou deploy por esta reconciliação.
