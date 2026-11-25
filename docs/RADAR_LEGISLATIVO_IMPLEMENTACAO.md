# Radar legislativo — implementação e operação

Estado verificado em **13/11/2026**. Piloto: **Floresta–PE, cidade 64**. Este documento registra a entrega executada e complementa o [plano do produto](PLANO_RADAR_LEGISLATIVO_FLORESTA.md).

[Registro sanitizado da carga e das verificações em dev](research/RADAR_LEGISLATIVO_FLORESTA_IMPLEMENTACAO_2026-11-13.json).

**Atualização pelo PDF:** [conferência passo a passo e ajustes implementados](RADAR_LEGISLATIVO_CONFORMIDADE_GUIA.md), incluindo as duas opções de criar perfil ou vincular um existente.

**Revisão visual posterior:** [layout simplificado, menus e personalização por dispositivo](RADAR_LEGISLATIVO_LAYOUT.md). Filtros deixaram de ocupar o conteúdo inicial; tipos oficiais e informações detalhadas passaram a ser opcionais. A revisão visual não modificou o banco ou a automação em dev.

## Entrega disponível

| Área | Implementado |
| --- | --- |
| Câmara | Radar com cinco grupos em linguagem simples, produção por tipo oficial, matérias recentes, busca, filtros de período/grupo/tipo/autor/tema/local e paginação no servidor |
| Matéria | Ementa, autoria/coautoria, documento oficial, tramitações, normas relacionadas, placares e votos individuais disponíveis |
| Sessões | Consulta paginada, pauta, expediente, ata/vídeo quando cadastrados e registros de presença |
| Vereadores | 32 fichas oficiais consultáveis por ID da Câmara; perfis existentes ampliados após conciliação. Administração com ações separadas para criar perfil e vincular existente |
| Demandas | Possíveis repetições de pelo menos duas matérias, por rua, bairro identificado e serviço; correspondência automática ou revisada identificada na tela |
| Evidências | Relação manual revisada com broncas públicas ou ruas da mesma cidade, vinculada à versão da matéria |
| Administração | Coleta manual, continuação, retomada após falha, nova coleta, conferência por recurso, publicação, conciliação de perfis, classificação e resposta a correções |
| Automação | Worker com fila, leases, retentativas e agendador diário às 03h de Fortaleza; instalação dos segredos do ambiente necessária para ativar |

Entradas no aplicativo: **Explorar → Câmara e vereadores** e **Admin → Radar legislativo**. Rotas:

- `/camara/64`: radar de Floresta; `/camara` usa a cidade selecionada.
- `/camara/64/materias` e `/camara/64/materias/7190`.
- `/camara/64/vereadores`.
- `/camara/64/vereadores/:parliamentarianId`: ficha oficial independente de perfil/conta vinculada.
- `/camara/64/sessoes` e `/camara/64/sessoes/:sessionId`.
- `/camara/64/demandas`.
- `/admin/legislativo?cidade=64`; acesso administrativo do módulo `legislative`.
- `/vereadores/64/:slug`: URL existente, preservada e ampliada.

Páginas ainda não integradas mostram um estado de indisponibilidade. Não recebem indicadores zerados como se houvesse cobertura daquela Câmara.

## Ambientes e carga executada

**DEV — `xxdletrjyjajtrmhwzev`:** migrações legislativas 439–448 (originalmente aplicadas como 428–437), função `collect-legislative-data` implantada e acervo inicial publicado no banco de desenvolvimento. A renumeração separa o histórico legislativo das correções 430–438 da `main`; veja [a reconciliação dos ambientes](RECONCILIACAO_DEV_LEGISLATIVO.md). Agendador diário, segredo dedicado e publicação automática das próximas cargas completas sem bloqueio de qualidade configurados. A interface está implementada no repositório; o build foi validado localmente. Não houve publicação do frontend em hospedagem por este trabalho.

**PROD — `mrejgpcxaevooofyenzq`:** nenhuma migração, implantação de função ou carga legislativa foi executada.

A execução `dec51387-adbb-4d36-959d-315ae1985649` concluiu **24 tarefas de recursos/períodos**, reconciliando **44.529 registros normalizados**, incluindo:

| Recurso | Registros importados |
| --- | ---: |
| Matérias de 2025–2026 | 1.118 — 609 de 2025 e 509 de 2026 |
| Parlamentares do cadastro, incluindo históricos | 32 |
| Tipos de matéria | 34 |
| Autores / relações de autoria | 51 / 8.498 |
| Tramitações | 5.330 |
| Sessões desde 2025 | 123 |
| Resultados de votação históricos / votos individuais históricos | 3.055 / 382 |
| Presenças históricas em sessão / ordem do dia | 7.117 / 6.897 |
| Normas históricas | 2.783 |

Os recursos relacionados são lidos integralmente porque esta instalação do SAPL ignora alguns filtros de relações. As consultas públicas restringem votos, presenças e tramitações pelos IDs das matérias e sessões do recorte. Os totais históricos da tabela não equivalem a votações ou presenças de um mandato específico.

O primeiro levantamento encontrou 506 matérias de 2026; a carga posterior encontrou 509. Os totais são fotografias de momentos distintos da fonte. O coletor não exige um número fixado no código.

**Coleta diária e publicação automática estão ativadas em dev.** O segredo dedicado foi instalado na função e no Vault, e o job `legislative-worker` foi cadastrado com `pg_cron`/`pg_net`. O primeiro acervo de hoje já foi conferido; a configuração reconhece essa carga e evita repetir a importação no mesmo dia. A próxima coleta diária está prevista para **14/11/2026, a partir das 03h de Fortaleza**. O teste autenticado do worker passou, sem iniciar outra coleta. Ainda não foram observadas sete execuções diárias; os próximos ciclos continuam sendo uma condição de validação antes de produção.

## Revisão de identidade e conteúdo

1. Em **Vereadores**, selecionar o perfil existente e confirmar o vínculo oficial. O fluxo também permite criar um perfil ausente, sem conta vinculada. Nome aproximado não gera vínculo automático.
2. O perfil preserva sua conta responsável, apresentação, foto e canais. Registros oficiais não ficam editáveis pelo gabinete.
3. Em **Revisões**, consultar o ID da matéria. Classificar tema, local e serviço com justificativa baseada no documento.
4. Para relacionar uma bronca ou rua, colar seu link e registrar a justificativa pública. O servidor confere cidade, versão da matéria e visibilidade do registro.
5. Se o documento oficial mudar, classificações e relações antigas deixam de compor a leitura pública até nova revisão da versão.
6. Se uma bronca passar a privada, sair da moderação aprovada ou deixar de ter situação publicável, seu vínculo desaparece imediatamente da consulta pública.

Nenhum vínculo de identidade, tema ou relação territorial foi inventado para preencher a demonstração em dev. As fichas oficiais usam o ID parlamentar da fonte e podem ser consultadas sem vínculo. Nos perfis antigos, a correspondência ainda pendente continua identificada. Após o guia, grupos e possíveis repetições passaram a ser calculados automaticamente e explicitamente rotulados como estimativas; não são apresentados como revisões humanas ou recorrências comprovadas.

O estado “resolvida” é apresentado como registro do Trombone. Um vínculo com matéria não comprova execução, autoria do atendimento ou mérito do vereador.

## Coletor e publicação

O adaptador aceita somente o host oficial de Floresta, normaliza links para HTTPS e copia uma lista explícita de campos. IP, usuário técnico e metadados da resposta não são armazenados na camada normalizada. PDFs e vídeos são referenciados por link; não há download indiscriminado ou transcrição.

Cada coleta passa por staging privado. Versões são deduplicadas por hash; o acervo publicado muda por uma troca atômica de execução. Paginação incompleta, IDs repetidos, totais divergentes ou falha da fonte mantêm a última publicação válida.

Após o alinhamento com o PDF, fonte vazia falha, registros desaparecidos geram bloqueio e alterações em massa exigem conferência. Uma execução completa com alerta de qualidade fica pronta para revisão, sem publicação automática. O administrador registra a conferência antes de publicar manualmente; o servidor também verifica essa condição. Há intervalo entre consultas e tratamento de `Retry-After`, inclusive no formato de data HTTP.

Uma falha transitória respeita a retentativa. A interface pode continuar uma execução ou retomar a que falhou; se a fonte mudar o total durante a leitura, inicie nova coleta. Quando o acervo publicado passa de 36 horas, a tela informa atualização pendente.

Para uma carga local de **desenvolvimento**, configurar as credenciais já usadas pelo projeto em `.env`, sem incluí-las no controle de versão:

```powershell
node scripts/collect-legislative.mjs
node scripts/collect-legislative.mjs --apply
node scripts/collect-legislative.mjs --apply --resume
node scripts/collect-legislative.mjs --apply --publish
```

Sem `--apply`, o comando apenas verifica a fonte e o ambiente. Com `--publish`, publica a coleta mais recente pronta; se não houver, coleta antes de publicar. O script rejeita qualquer host de banco diferente do projeto DEV. Não reutilizar esse importador para produção.

### Configurar a rotina diária por ambiente

1. Aplicar as migrações e implantar a função no projeto correto. O link Supabase da raiz pode apontar para produção; conferir o projeto e os pendentes antes de qualquer `db push`. Não copiar credenciais nem o diretório temporário de vínculo entre ambientes.
2. Disponibilizar `pg_cron`, `pg_net` e Supabase Vault no banco do ambiente.
3. Criar um segredo aleatório dedicado de pelo menos 32 caracteres. Defini-lo na Edge Function como `LEGISLATIVE_WORKER_SECRET` e no Vault como `legislative_worker_secret`. Não usar a chave de serviço como segredo do agendador.
4. No Vault, criar `legislative_worker_url` com `https://<project-ref>.supabase.co/functions/v1/collect-legislative-data`.
5. Em **Coleta**, ativar a rotina diária. Sem os pré-requisitos, o servidor recusa a ativação. O cron executa um tick por minuto para drenar páginas, iniciando uma coleta por dia após 03h de Fortaleza.
6. Conferir e publicar a primeira coleta. A opção de publicar coletas seguintes automaticamente só fica disponível após a primeira publicação.
7. Acompanhar no mínimo sete ciclos de dev, os totais por recurso, falhas/retomadas e alterações da fonte antes do lançamento em produção, conforme o plano.

No desenvolvimento, esse provisionamento já foi executado. Para repetir ou rotacionar a configuração **somente DEV**, há um script que gera um segredo dedicado em arquivo ignorado pelo Git e usa a credencial de serviço do próprio ambiente:

```powershell
node scripts/configure-legislative-dev.mjs --prepare
supabase secrets set --env-file .tmp/legislative-dev-worker.env --project-ref xxdletrjyjajtrmhwzev
node scripts/configure-legislative-dev.mjs --apply
node scripts/configure-legislative-dev.mjs --verify
```

`--apply` configura o Vault, disponibiliza as extensões do agendador e habilita a coleta/publicação automática de dev após a primeira publicação. O segredo não é impresso nem registrado na auditoria. `--verify` só roda com uma carga de hoje já registrada, para testar a autenticação sem iniciar outra carga. O RPC de provisionamento é restrito a `service_role`; não representa uma conta administrativa do aplicativo. O tick não chama a Edge Function quando não há coleta em andamento ou coleta diária a iniciar.

O endpoint exige conta administrativa autorizada ou autenticação do worker. `verify_jwt=false` é necessário para a chamada do agendador com segredo dedicado; a função faz sua própria autenticação e não aceita coleta anônima.

## Validação executada

- **29 testes automatizados passaram:** adaptador, filtros, links oficiais com escopo, privacidade, paginação, zero legítimo no catálogo de resultados e regressões de perfis/vínculos existentes.
- **PostgreSQL descartável:** dez migrações aplicadas; ingestão de ponta a ponta, staging, deduplicação, publicação e bloqueios de qualidade, isolamento, criação/vínculo de perfil, revisão, busca territorial, grupos e vínculos públicos/privados conferidos.
- **Chrome com componentes reais:** 390, 1440 e 1920 px, temas claro/escuro; seis cenários sem exceções de execução e sem rolagem horizontal. Filtros, paginação, perfis, administração, relações e recuperação de falha exercitados com fixtures locais.
- **DEV real:** consultas públicas e acesso às 32 fichas oficiais verificados; outro município sem integração, snapshots privados e rejeição de coleta anônima/corpo acima do limite conferidos. Amostra de três parlamentares confrontada com a Câmara, com fontes acessíveis na interface.
- **Worker DEV:** configuração efetiva de cron/Vault e teste de autenticação por segredo dedicado com tick sem trabalho adicional.
- **Build Vite completo passou.** Não foram executadas mudanças nos submódulos `project` e `scripts/project`.

Comandos reproduzíveis, executados a partir da raiz:

```powershell
node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/legislative.test.mjs src/test/councilorAdmin.test.mjs src/test/councilorClaim.test.mjs src/test/councilorIdentityLink.test.mjs src/test/councilorShareAndStatus.test.mjs
node tools/validate-legislative-db.mjs
node tools/validate-legislative-ui.mjs
node tools/validate-legislative-dev.mjs
node tools/validate-legislative-dev.mjs --all-profiles
node scripts/audit-legislative.mjs
node node_modules/vite/bin/vite.js build --outDir .tmp/legislative-app-build --emptyOutDir
```

Os validadores de banco e interface precisam, respectivamente, de PostgreSQL e Chrome locais. Seus caminhos podem ser ajustados nos scripts; o banco aceita `POSTGRES_BIN`. O validador dev é somente leitura e exige as chaves públicas do ambiente em `.env`.

## Limites e próximas etapas

- Conciliação dos perfis e conferência da legislatura cadastrada como 2025–2026 ainda são tarefas de revisão. Não foram inferidos mandatos ou faltas a partir desse cadastro.
- Percentuais de frequência, unanimidade, proporção de homenagens e rankings não foram liberados. Contagens documentais e registros publicados não substituem auditoria dos denominadores.
- Possíveis repetições automáticas são identificadas como estimativas. Correspondências definitivas e vínculos territoriais exigem revisão; não há geocodificação automática, mapa de calor ou confirmação automática de execução.
- A Central Editorial e os stories existentes ainda não consomem fontes legislativas. Geração de pautas, notícias e cards analíticos fazem parte da expansão; não há publicação editorial automática.
- A primeira carga não comprova estabilidade de sete dias. A rotina está ativa em dev; sua observação e a publicação em produção permanecem etapas operacionais explícitas.
- Somente o adaptador de Floresta foi validado. Cada nova Câmara exige contrato e auditoria próprios.
