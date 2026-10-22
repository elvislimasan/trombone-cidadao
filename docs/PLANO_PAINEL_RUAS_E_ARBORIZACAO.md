# Estratégia — painel de ruas e arborização por responsabilidade

**Data:** 21/10/2026  
**Estado:** implementado localmente; implantação das migrações e configuração das contas reais pendentes. As seções 11 a 14 registram a entrega e os ajustes solicitados.

> **Evolução em validação local em 21/10/2026:** o [plano de painel municipal por responsabilidades](./PLANO_PAINEL_MUNICIPAL_POR_RESPONSABILIDADES.md) registra a unificação e a separação de cargos implementadas localmente, as verificações e as pendências de implantação. Ele substitui a proposta de painéis separados e de leitura obrigatória do atendimento para responsáveis exclusivos pelo inventário. Este documento preserva o histórico da entrega anterior.

**Referência visual:** painel de gestão de iluminação pública existente no projeto.

## 1. Resultado esperado

O funcionário da **Secretaria de Produção Rural e Meio Ambiente** terá um painel próprio de **Arborização**, limitado às cidades e às operações autorizadas. O responsável por ruas terá o painel de **Ruas**. Quando a mesma pessoa puder gerir os dois módulos na cidade selecionada, verá um único painel com as abas **Ruas** e **Arborização**.

Funcionários que também sejam **admin ou master continuam na visão geral**. Receber um cargo operacional não os redireciona para uma experiência reduzida. Eles poderão entrar nos módulos por atalhos a partir do painel geral.

O cadastro cidadão e a consulta pública dos mapas continuam disponíveis. O objetivo desta entrega é organizar a experiência de trabalho e separar as responsabilidades municipais.

## 2. Situação encontrada antes da implementação

| Área | Situação atual | Consequência para a proposta |
| --- | --- | --- |
| Permissão de gestão | `urban_planning`, exibida como “Planejamento urbano (ruas e arborização)” | Atualmente a autorização de ruas também permite gerir árvores. Precisamos separar no banco e na interface. |
| Cargo por cidade | `urban_planner_cities` e RPC `set_urban_planner_cities` | Já existe uma base para limitar a gestão de ruas por município. |
| Árvores | `useCanManagePavement` e função SQL `pode_gerenciar_mapa_ruas` também protegem o inventário | Alterar apenas o menu deixaria o funcionário com autorização cruzada. |
| Painel de iluminação | `MunicipalityLayout`, `MunicipalLightingPage` e `MunicipalLightingStatsPage` | Podemos reaproveitar o padrão visual de cabeçalho, navegação, mapa, filtros, pendências e detalhes. |
| Equipe institucional | `prefeitura_membros`, `orgao_canais` e `orgao_membros` | A secretaria pode ser identificada por seu cadastro e pela associação ativa do funcionário. |
| Entrada institucional | `municipalityAccess.js` encaminha equipes para `/prefeitura/visao-geral` e já exclui admin/master desse redirecionamento | A entrada precisa reconhecer o novo painel e preservar essa precedência. |
| Administrador municipal | `useMunicipalityWorkspace` usa `papel = administrador` | É um papel diferente de `profiles.is_admin`; não podemos confundir os dois. |
| Gestão administrativa | Há atalhos de ruas e árvores no painel `/admin` | Devem continuar acessíveis no contexto geral, conforme permissões. |

O plano antigo do eletricista é contexto histórico. A referência para esta proposta é a implementação atual do **painel de gestão da iluminação**, não o fluxo de aceitar ofertas do eletricista.

## 3. Como cada perfil verá o sistema

| Perfil efetivo na cidade ativa | Entrada padrão | Abas do painel especializado | Acesso de gestão |
| --- | --- | --- | --- |
| Funcionário com ruas | Painel de Ruas | Sem alternância de módulos | Apenas ruas e recursos associados autorizados |
| Funcionário com arborização | Painel de Arborização | Sem alternância de módulos | Apenas árvores e recursos associados autorizados |
| Funcionário com ruas e arborização | Painel de Gestão de Ruas e Arborização | **Ruas · Arborização** | Cada aba usa sua própria autorização |
| Admin da plataforma, mesmo com cargo de ruas/árvores | Visão geral administrativa atual | Módulos acessíveis por atalhos | Escrita conforme autorização vigente de cada módulo |
| Master, mesmo com cargo operacional | Visão geral atual | Módulos acessíveis por atalhos | Mantém seu alcance global atual |
| Administrador da prefeitura | Visão geral municipal | Módulos acessíveis por atalhos autorizados | O papel municipal sozinho não concede gestão de inventário |
| Pessoa sem concessões operacionais | Entrada atual do seu perfil | Nenhuma aba de gestão | Consulta pública conforme regras existentes |

**Precedência da entrada:** master → admin da plataforma → administrador municipal → módulos operacionais autorizados → experiência atual dos demais perfis. A precedência define a experiência inicial; não substitui as verificações de escrita no servidor.

Um cargo de arborização não transforma o funcionário em administrador. Ser gestor de uma secretaria também não habilita automaticamente todos os inventários.

As abas dependem da **cidade ativa**. Se alguém gere ruas em Floresta e árvores em outro município, não receberá as duas abas para Floresta. Só poderá escolher cidades em que tenha alguma concessão válida; ao trocar de cidade, abas, consultas e ações serão recalculadas.

Se a pessoa acumular iluminação, eletricista ou outras funções operacionais, manter os acessos já existentes e oferecer um seletor explícito de área de trabalho. A nova regra não poderá aprisionar essa pessoa em apenas um de seus cargos. O seletor leva aos painéis existentes; as duas abas deste painel continuam sendo exclusivamente Ruas e Arborização.

## 4. Como ficará a interface

### Estrutura comum

- Cabeçalho institucional com identificação da prefeitura, cidade ativa, nome do funcionário, secretaria vinculada quando houver, tema e saída.
- Mesmo padrão visual de iluminação pública: ações claras, mapa amplo, filtros, resultados, detalhes e indicadores.
- Título **“Gestão de ruas e arborização”** para quem tem as duas responsabilidades; **“Ruas e pavimentações”** ou **“Arborização”** para quem tem apenas uma.
- Duas abas de módulo somente quando ambas estiverem autorizadas. Em **Ruas e pavimentações**, o submenu separa **Mapa** de **Estatísticas**; mapa/lista alterna apenas a apresentação dos cadastros no primeiro submenu.
- Filtros e posição de trabalho independentes por aba e cidade. A URL preserva a área ativa, inclusive ao atualizar a página ou abrir um link direto.
- Desktop com navegação lateral; mobile com menu recolhível e ações acessíveis. Não herdar a restrição de desktop de telas específicas do eletricista.

Exemplo para um funcionário com os dois acessos:

```text
Prefeitura · Floresta                         Funcionário · Secretaria
Gestão de ruas e arborização

[ Ruas ]  [ Arborização ]

Ruas e pavimentações
  Mapa                Filtros, mapa/lista, cadastro e edição
  Estatísticas        Indicadores, gráficos, bairros e relatórios CSV/PDF
Arborização           Inventário e cuidados das árvores
```

Para o funcionário de Meio Ambiente, a mesma estrutura abrirá diretamente em **Arborização**, sem a aba Ruas. A secretaria exibida virá do cadastro institucional, sem nome fixo no código.

### Área Ruas e pavimentações

- Submenus **Mapa** e **Estatísticas** com URLs próprias e preservação dos filtros.

- Mapa e lista do cadastro municipal de ruas.
- Busca por nome, nome informal, bairro e CEP, aproveitando as funções existentes.
- Em Estatísticas: indicadores de ruas cadastradas, sem nome, sem CEP e sem traçado. As definições devem ser explícitas; não apresentar cobertura física da cidade como se fosse cobertura de cadastro.
- Cadastro/edição de ruas, geometria, bairros e referências do mapa conforme as permissões atuais.
- Histórico e anexos das ruas reaproveitados, sem duplicar registros em outra tabela.
- Exportação disponível na primeira versão conforme o que o módulo já suportar; formatos novos entram em etapa própria.

### Aba Arborização

- Mapa e lista do inventário de árvores da cidade.
- Busca por **AR1, AR2, AR3**, espécie, endereço e bairro.
- Indicadores de árvores cadastradas, solicitações vinculadas e manejos registrados/pendentes, com definição clara da origem de cada contagem.
- Filtros existentes de situação, espécie/origem, bairro, plantio, idade e manejo.
- Cadastro, edição, foto, catálogo de espécies e histórico de cuidados.
- Registro de poda, vistoria, tratamento e outros serviços já suportados.
- Destaque para árvores com manejo pendente, sem transformar automaticamente uma solicitação pública em serviço realizado.
- Detalhe com código, localização, características, solicitações vinculadas e linha do tempo.
- Exportação CSV com cidade e código da árvore; árvores removidas preservam código e histórico.

**Limite da primeira entrega:** não criar um novo fluxo de ordens de serviço, aceite, despacho ou conclusão de solicitações. Gerir o inventário e registrar um cuidado na árvore continuam distintos de operar uma demanda municipal. Links para demandas existentes respeitarão as permissões próprias dessas demandas.

## 5. Permissões e vínculo com a secretaria

### Separação recomendada, com menor impacto no legado

1. Manter a chave técnica **`urban_planning`** para ruas, mudando seu rótulo para **“Gestão de ruas”**. Isso preserva os pontos existentes de autorização de traçados, contornos, anexos e referências.
2. Criar o módulo **`arborization`**, rotulado **“Gestão de arborização”**, com acesso negado por padrão para contas sem concessão explícita.
3. Preservar `urban_planner_cities` como fonte de cidades autorizadas para ruas e acrescentar uma concessão própria de arborização, proposta como **`tree_manager_cities`**.
4. A nova concessão relaciona usuário, cidade e secretaria responsável por identificador (`canal_id`), com registro de quem concedeu e quando. Usuário/cidade não podem ter concessões duplicadas.
5. O aceite do convite institucional define automaticamente o tipo **Órgão Público** e a cidade padrão quando o perfil ainda não tem cidade. Para novos responsáveis de arborização, exigir conta de tipo **Órgão Público**, prefeitura ativa e vínculo ativo do funcionário com a prefeitura e com a secretaria daquela cidade, além da concessão de módulo. Nome da secretaria, categoria e associação institucional sozinhos não concedem escrita.
6. O administrador municipal escolhe responsabilidades no convite e pode ajustá-las em **Equipe**, sem intervenção do master. A liberação municipal vale somente para a cidade da prefeitura ativa e não muda regras globais. Bloqueios individuais explícitos da plataforma continuam prevalecendo. Uma RPC administrativa valida e grava o conjunto de concessões de forma transacional. A UI mostra claramente cidades, secretaria e módulos efetivamente autorizados. Revogar o vínculo institucional impede novas operações de arborização, inclusive chamadas diretas.

Na configuração de um funcionário, a proposta de apresentação é:

```text
Funcionário: [pessoa selecionada]
Cidade:     Floresta (automática pela prefeitura ativa)
Secretaria: [Produção Rural e Meio Ambiente]

Responsabilidades nesta cidade:
[ ] Gerenciar ruas
[x] Gerenciar arborização
```

Cada seleção será validada no servidor segundo seu módulo. Marcar ruas não deve depender do nome da secretaria de Meio Ambiente nem conceder associação fictícia a Planejamento Urbano. As concessões legadas de ruas continuam válidas durante a transição; vínculos institucionais ausentes serão listados para regularização, sem apagar acesso existente silenciosamente.

### Regras no servidor e no cliente

- Manter **`pode_gerenciar_mapa_ruas(city_id)`** para ruas.
- Criar **`pode_gerenciar_arborizacao(city_id)`** para árvores, espécies, registro de cuidados e alterações gerenciais de vínculo entre árvore e solicitação.
- Atualizar as policies de `city_trees`, `city_tree_species` e `city_tree_care` e a autorização para alterações gerenciais em `report_tree_registration`. Preservar as validações de catálogo, bairro e datas de `canonical_tree_registration`.
- Preservar o cadastro cidadão de árvore no envio de solicitação e suas validações de proximidade, cidade e autenticação. Essa exceção não concede edição geral do inventário.
- Revisar os buckets de fotos e anexos: o envio cidadão de foto de árvore tem contrato próprio e não pode ser bloqueado por uma troca genérica de helper de gestão. Anexos privados municipais conservam suas regras próprias.
- Bairros existentes podem ser lidos para selecionar o endereço da árvore. Criar/editar bairro e alterar seu contorno continua uma responsabilidade de ruas; o novo gestor de árvores não ganha esses poderes automaticamente.
- Regras individuais de bloqueio prevalecem sobre liberações de cargo para não masters, conforme o contrato existente. Ausência de concessão válida, municipal ou da plataforma, significa **sem escrita**, inclusive no `can_write` SQL e em `canWriteModule` JavaScript.
- Admin permanece com visão geral, mas não recebe edição irrestrita por causa desse novo painel. Master mantém a exceção global atual. Qualquer ampliação de escrita para admin será uma decisão separada.
- Esconder uma aba não é controle de acesso: cadastro, edição, exclusão, RPC e storage precisam rejeitar operações de quem não tem a concessão correspondente.

## 6. Rotas e organização técnica propostas

| Rota proposta | Uso |
| --- | --- |
| `/prefeitura/gestao-territorial` | Entrada que resolve os módulos e a cidade autorizados |
| `/prefeitura/gestao-territorial/ruas` | Aba de ruas |
| `/prefeitura/gestao-territorial/arborizacao` | Aba de arborização |

“Gestão territorial” é somente o nome técnico proposto para a rota. A interface usa os títulos descritos acima e o nome real da secretaria.

- Resolver as permissões antes de escolher a entrada, evitando piscar uma aba indevida ou carregar consultas de gestão sem autorização.
- Criar um layout operacional compartilhado com guard próprio. A moldura visual pode ser extraída da experiência municipal, sem exigir que o componente atual `MunicipalityLayout` trate todo gestor de ruas legado como membro municipal já cadastrado.
- Centralizar a resolução de acesso por usuário/cidade/módulo em um hook/serviço; o menu, as abas, os atalhos e os redirecionamentos usam a mesma decisão.
- Extrair os conteúdos reutilizáveis de `ManagePavementPage` e `ArborizationMapPage` para o painel, evitando renderizar duas molduras de página ou dois seletores conflitantes de cidade.
- Árvores deixam de usar `useCanManagePavement` e passam a um helper próprio. Ruas continuam usando sua autorização específica.
- Ajustar `App.jsx`, `municipalityAccess.js`, a navegação e os destinos pós-login juntos. O redirecionamento global da equipe não pode devolver o usuário à visão geral em um ciclo.
- Preservar destinos explícitos autorizados após login, links de notificações e acesso aos detalhes públicos de rua/árvore. Definir exceções de navegação precisas, sem liberar rotas administrativas genéricas.
- Manter URLs públicas e os links de árvores por UUID. Código AR é identificação pública, não exige mudar a chave das rotas nem os vínculos históricos.
- Rotas antigas de gestão serão compatibilizadas: funcionário operacional vai à aba correspondente; admin/master mantêm a navegação no contexto geral. A transição conserva identificadores e filtros compatíveis quando fornecidos.
- Em perda de permissão ou troca de conta, limpar dados de gestão e bloquear novas gravações. Carregamento, erro de permissões e ausência de concessão são estados diferentes; erro de consulta não deve parecer uma lista vazia.

**Arquivos principais a revisar:** `src/App.jsx`, `src/lib/municipalityAccess.js`, `src/lib/homeEntry.js`, `src/hooks/usePermissions.js`, `src/lib/modulePermissions.js`, `src/hooks/useCanManagePavement.js`, `src/components/Header.jsx`, `src/components/BottomNav.jsx`, `src/components/municipality/MunicipalityLayout.jsx`, `src/pages/admin/ManageUsersPage.jsx`, `src/pages/admin/ManagePermissionsPage.jsx`, `src/pages/admin/AdminPage.jsx`, `src/pages/admin/ManagePavementPage.jsx`, `src/pages/ArborizationMapPage.jsx`, `src/pages/TreePage.jsx` e componentes de arborização.

As migrações 359–364 documentam o contrato atual de autorização e inventário. A implementação usará **novas migrações**, sem alterar o histórico já aplicado.

## 7. Migração sem trocar responsabilidades por acidente

1. Levantar os atuais gestores de Planejamento Urbano, cidades e exceções individuais. Separar concessões de cadastro de vínculos de prefeitura/secretaria.
2. Manter seus acessos de ruas. **Não copiar automaticamente todos os gestores de ruas para arborização**, porque o objetivo é atribuir essa responsabilidade separadamente.
3. Preparar a nova estrutura e as concessões de arborização antes de ativar a troca das policies. Confirmar o funcionário real e o cadastro da Secretaria de Produção Rural e Meio Ambiente na cidade de implantação; não usar nome/email presumido nem associar pelo texto da secretaria.
4. Registrar explicitamente quem deve continuar com os dois módulos. Se houver uma secretaria ainda não cadastrada, criá-la pelo fluxo institucional existente e associar o funcionário com autorização administrativa.
5. Ativar helpers e policies separados, publicar o cliente compatível e conferir acesso com as contas correspondentes. A autorização no banco deve funcionar mesmo com cliente antigo.
6. Conferir que números AR, UUIDs, geometria das ruas, espécies, fotos e históricos não foram alterados pela migração de acesso.
7. Em reversão, desabilitar a nova navegação e manter os acessos por módulo já separados. Não recuperar o antigo acoplamento como atalho de rollback, pois devolveria gestão de árvores a contas de ruas.

Não haverá atribuição de cargo ou alteração de usuário real nesta fase de documentação.

## 8. Sequência de implementação após revisão

| Etapa | Entrega verificável |
| --- | --- |
| 1. Acesso | Contrato dos dois módulos, nova concessão de árvores, RPC administrativa e testes SQL de autorização |
| 2. Configuração de funcionários | Interface para responsabilidades por cidade/secretaria, bloqueios individuais e revogação |
| 3. Entrada e navegação | Resolvedor com prioridade de admin/master, rotas e tratamento de cargos acumulados |
| 4. Painel | Moldura visual baseada na iluminação; aba única ou duas abas conforme concessões |
| 5. Conteúdos | Gestão de ruas e arborização reutilizada no novo painel, com cidade e autorização próprias |
| 6. Compatibilidade | Rotas antigas, links públicos, retorno pós-login, app e notificações sem ciclos |
| 7. Homologação | Matriz de perfis, testes no banco, navegador e aplicativo, seguida de implantação controlada |

Primeira entrega: painel, permissões independentes, configuração do funcionário e recursos atuais dos inventários. PDF novo, sincronização offline, despacho de equipes e novos fluxos de ordens ficam para evolução posterior.

## 9. Critérios de aceite

- Conta somente de arborização entra no seu painel e não recebe edição de ruas, traçados, contornos ou referências, nem por chamada direta.
- Conta somente de ruas não altera árvores, espécies ou cuidados, mesmo usando uma versão antiga do cliente.
- Conta com os dois módulos na mesma cidade vê exatamente as abas **Ruas** e **Arborização**.
- Cargo em cidades diferentes não cria uma aba de gestão indevida na cidade ativa.
- Funcionário de Meio Ambiente vê a secretaria correta e opera sem receber admin ou cargo de Planejamento Urbano artificialmente.
- Admin/master com cargos operacionais continuam abrindo a visão geral. Acesso direto a um módulo autorizado não os prende em redirecionamentos.
- Administrador municipal permanece na visão geral municipal; esse papel não é confundido com admin da plataforma.
- Uma pessoa com outro cargo operacional conserva o caminho para seus demais painéis, inclusive iluminação/eletricista.
- Perder concessão de módulo ou vínculo institucional exigido remove o acesso efetivo, inclusive em nova chamada ao servidor com aba antiga aberta.
- Cadastro cidadão de árvore, proximidade, vínculo de solicitações e upload permitido de fotos continuam funcionando.
- Permissões de leitura pública permanecem distintas de acesso a informações internas de demandas e secretarias.
- Busca por AR, código permanente, foto, localização e linha do tempo da árvore funcionam no novo painel.
- Interface sem rolagem horizontal em 390, 1440 e 1920 px. O contêiner externo ocupa a largura disponível, com margens de até 64 px a partir de 1200 px; limites de leitura/formulário aplicados apenas nas colunas internas.
- Sem consultas duplicadas por montar o mesmo workspace várias vezes, contagens truncadas em mil registros ou indicadores que ignorem os filtros apresentados.
- Testes cobrem URL direta, chamadas SQL/RPC, troca de cidade/conta, bloqueio individual, conta desativada, erro de carregamento e preservação dos dados existentes.

## 10. Relação com os códigos AR

A identificação automática das árvores é a entrega anterior e independente: foi preparada localmente na migração `368_city_tree_public_code.sql`. Ela numera as árvores existentes por cidade e ordem de cadastro, preserva o UUID e mantém contador municipal para não reutilizar códigos excluídos.

Os 19 testes de unidade, os testes locais de numeração e concorrência, o build de produção e a validação de interface em 390, 800, 1280, 1366, 1440 e 1920 px passaram. Isso não significa que a migração tenha sido aplicada ao Supabase remoto.

O painel implementado reaproveita esses códigos. A estratégia acima documenta as decisões que orientaram a entrega; não houve alteração de cargos ou secretarias reais nem publicação no ambiente remoto.

## 11. Implementação e implantação

### Entrega local

- Painel em `/prefeitura/gestao-territorial`, com rotas `/ruas` e `/arborizacao` e cidade na URL (`?cidade=64`, por exemplo).
- Seleção limitada às cidades autorizadas; uma área ou duas abas conforme as concessões da cidade ativa. Filtros e seleção são mantidos entre abas e descartados na troca de cidade/conta.
- Cabeçalho institucional, secretaria real da concessão, navegação lateral no desktop e menu recolhível no celular, com tema e saída.
- Conteúdo de ruas reutilizado de `PavementMapPage`, que já possui mapa/lista, edição, relatórios, referências e contornos. A reutilização desse conteúdo evita duplicar o mapa ou reproduzir seu contrato na página administrativa. Indicadores específicos de cadastro mostram total filtrado, sem nome, sem CEP e sem traçado.
- Conteúdo de arborização reutilizado de `ArborizationMapPage`, com código AR, mapa/lista, cadastro, espécies, fotos e cuidados. Detalhes públicos mantêm suas rotas por UUID.
- Permissões carregadas por um provider compartilhado, com atualização ao voltar à janela, trocar de conta ou receber aviso de alteração. Cada operação continua validada no servidor.
- Admin/master mantêm sua experiência geral. Administradores municipais mantêm a visão geral municipal. Links de atendimento e do painel do eletricista permitem alternar áreas quando há cargos acumulados.
- “Gerenciar usuários” configura separadamente cidades de ruas e cidades/secretarias de arborização; “Permissões” permite liberação de cargo e exceção individual para cada módulo.
- A gravação das concessões de ruas e arborização usa uma RPC transacional. O salvamento dos demais campos do perfil mantém o fluxo anterior e informa explicitamente se somente o perfil foi salvo e as responsabilidades falharam.

### Ordem para implantar

1. Aplicar `369_territorial_responsibilities.sql` após as migrações até 368. A migração cria a concessão de árvores e a validação institucional, sem atribuir cargos reais nem copiar gestores de ruas.
2. Aplicar `370_arborization_independent_access.sql` e `371_municipal_team_territorial_onboarding.sql` antes de disponibilizar este cliente. A 370 separa as policies; a 371 habilita o convite completo pela Equipe e a liberação municipal por cidade.
3. O administrador municipal seleciona sua prefeitura, confirma a secretaria ativa e prepara os responsáveis em **Equipe**. Novos funcionários recebem tipo e cidade ao aceitar o convite; funcionários existentes recebem a configuração ao salvar suas responsabilidades.
4. Conferir as contas reais em homologação antes da publicação. O vínculo institucional ativo é obrigatório; um bloqueio individual explícito precisa ser tratado pela plataforma quando existir. O fluxo comum de convite não depende do master.

**Transição:** a 370 retira gestão de árvores de quem só possui ruas. Coordenar sua aplicação com a 371 e a configuração dos responsáveis; não presumir que as novas concessões serão copiadas das antigas. As concessões legadas da plataforma continuam disponíveis em Gerenciar usuários/Permissões. Master mantém sua exceção global.

### Verificação realizada

- Testes de navegação e permissões: módulos independentes, cidade, precedência de admin/master, rotas antigas, links públicos e acesso aos demais trabalhos.
- Testes de componentes: seleção e remoção de cidade/secretaria, erro recuperável sem apagar concessões e compartilhamento de consultas entre consumidores.
- PostgreSQL local descartável: concessão administrativa, transação sem alterações parciais, RLS independente, cidade/secretaria, revogação institucional e individual, tipo de usuário, master e cadastro cidadão preservado.
- Chrome headless com componentes reais e dados simulados em 390, 1440 e 1920 px: uma área, duas abas, troca de cidade, ausência/revogação de acesso e ausência de overflow horizontal.
- ESLint dos arquivos de aplicação alterados e build de produção.
- A execução da suíte geral encontrou duas falhas em testes não alterados: `councilorAdmin.test.mjs` e `directoryCategories.test.mjs`, que procuram sequências `\n` literais em migrações antigas com finais de linha CRLF neste checkout. Os arquivos correspondentes não foram modificados nesta entrega.

Comandos de reprodução:

```powershell
node --import ./tools/test-alias.mjs --test src/test/territorialAccess.test.mjs src/test/modulePermissions.test.mjs src/test/municipalityAccess.test.mjs src/test/permissionsRefresh.test.mjs src/test/treeResponsibilitiesFields.test.mjs
./tools/validate-arborization-db.ps1 -TestFile supabase/tests/territorial_access.sql
./tools/validate-arborization-db.ps1 -TestFile supabase/tests/municipal_team_territorial.sql
node tools/validate-tree-inventory-ui.mjs --territorial
node tools/validate-tree-inventory-ui.mjs --team
npm test
node node_modules/vite/bin/vite.js build
```

A validação visual usa dados locais, não perfis reais. A homologação em dispositivo Android/iOS e a aplicação das migrações no Supabase remoto ainda não foram realizadas.

## 12. Cadastro de um responsável de arborização e primeiro acesso

1. O administrador municipal seleciona sua prefeitura no painel. **A cidade já vem dessa prefeitura** e não é digitada no convite. Se administrar mais de uma cidade, vale a prefeitura ativa.
2. Em **Equipe → Convidar funcionário**, seleciona a **Secretaria de Produção Rural e Meio Ambiente**, informa o e-mail e marca **Gerenciar arborização**. Para quem só vai cuidar do inventário, o acesso ao atendimento começa como **Somente leitura**; as responsabilidades são escolhidas separadamente.
3. Gera e encaminha o link. O funcionário cria a conta ou entra com o e-mail convidado. Ao aceitar, recebe o tipo **Órgão Público**, os vínculos institucionais e a gestão de arborização naquela cidade, em uma transação. Uma cidade já cadastrada no perfil pessoal é preservada; a cidade de trabalho vem sempre da prefeitura do convite.
4. O primeiro acesso abre Arborização. Quem recebeu ruas e árvores tem duas abas; ruas inclui **Mapa** e **Estatísticas**. O administrador municipal pode adicionar/remover responsabilidades ou suspender o acesso pelo detalhe do funcionário em **Equipe**.
5. Não é necessário passar por Gerenciar usuários nem pedir uma liberação ao master no fluxo comum. Admin/master e administrador municipal continuam com sua visão geral; o cabeçalho oferece **Visão geral** para os perfis correspondentes.

Essas regras valem após a migração **371**, além de 369/370 e do cliente compatível. Não há promoção global de cidadãos: somente contas com convite institucional válido aceito, ou funcionários já vinculados cuja configuração é salva pela Equipe.

O nível do convite institucional controla o atendimento municipal, separadamente da concessão de árvores. **Somente leitura** permite consultar o atendimento; **Atendente / técnico** e **Gestor** também concedem operações de atendimento. Para quem vai trabalhar somente no inventário, não atribuir esses papéis de operação apenas para habilitar as árvores: a concessão de arborização tem controle próprio.

**Limite atual:** entrada automática no painel de arborização não equivale a isolamento completo dessa conta. A moldura ainda exibe **Atendimento municipal** para quem tem vínculo com a prefeitura, e as rotas/dados dessa área seguem as permissões institucionais existentes. Mesmo o papel Somente leitura conserva consultas permitidas. Restringir literalmente a conta a um único painel exigiria uma regra específica de acesso institucional, aplicada aos guards de rotas e às permissões de dados; apenas ocultar o link não produziria essa garantia.

### Ajuste do layout após revisão

O topo do painel foi compactado: título, abas e cidade compartilham uma faixa; o conteúdo incorporado de ruas não repete título e descrição; indicadores e ações ocupam uma segunda faixa curta. Na arborização, foram removidos o espaçamento reservado ao cabeçalho público e a decoração de fundo. As mudanças são limitadas ao painel; os mapas públicos conservam seu layout.

Na validação em 1440 e 1920 px, o mapa de ruas começa a aproximadamente **174 px** do topo da janela e o de arborização a **192 px**. O mapa também aproveita a altura liberada. Em 390 px, os controles se reorganizam sem rolagem horizontal.


## 13. Responsabilidades municipais sem etapa do master

A migração `371_municipal_team_territorial_onboarding.sql` registra a liberação municipal na concessão da própria cidade (`municipal_enabled`). Para ruas, guarda também a secretaria responsável por esse vínculo. Não cria uma permissão individual global nem habilita cargos em todas as cidades.

- Uma liberação em Floresta não ativa atribuições antigas bloqueadas em outro município.
- Regras individuais explícitas da plataforma prevalecem; o padrão global bloqueado do cargo não impede uma liberação municipal legítima.
- Suspender o funcionário, a secretaria, a prefeitura ou o vínculo municipal remove o acesso efetivo. Ao reativar, as responsabilidades mantidas voltam a valer.
- Editar um funcionário salva papel de atendimento, situação, tipo Órgão Público e responsabilidades em uma transação. Remover um módulo nessa tela afeta apenas a cidade ativa.
- Reabrir um convite já aceito não restaura permissões removidas posteriormente.
- Erro ao carregar concessões impede editar com dados incompletos. Trocar a prefeitura fecha os formulários e descarta o link/rascunho da prefeitura anterior.

Validação em PostgreSQL local descartável: convite com e-mail correto, cidade padrão, tipos de conta, concessão sem master, isolamento entre municípios, edição, suspensão, bloqueio individual e repetição do aceite. Interface conferida em 390, 1440 e 1920 px, incluindo criação de convite, edição, falha de salvamento e troca de prefeitura.

## 14. Ruas e pavimentações: Mapa e Estatísticas

| Submenu | Conteúdo |
| --- | --- |
| **Mapa** | Mapa amplo, busca/filtros, alternância mapa/lista, cadastro/edição, traçado dos bairros, impressão do mapa e legenda de cores sem indicadores agregados. |
| **Estatísticas** | Total de ruas, extensão medida, pavimentadas/sem pavimentação, distribuição por situação, pendências e documentação, comparação por bairro, ranking existente de autores e relatórios CSV/PDF. |

Rotas: `/prefeitura/gestao-territorial/ruas/mapa?cidade=64` e `/prefeitura/gestao-territorial/ruas/estatisticas?cidade=64`. O endereço antigo `/ruas` encaminha para Mapa. Atualizar a página ou abrir diretamente Estatísticas mantém a área e a cidade na URL. No celular há atalhos Mapa/Estatísticas visíveis, além do menu recolhível.

Os dois submenus compartilham a mesma carga de ruas e os mesmos filtros. Trocar de submenu não repete a consulta de ruas. Os gráficos, tabelas e exportações seguem o recorte atual. Ruas sem traçado permanecem contadas, mas não são apresentadas como extensão conhecida; o agrupamento Sem bairro preserva cadastros incompletos. Não há cópia de inventário ou alteração no cadastro para produzir os indicadores.

Validação em Chrome com dados simulados: 390, 1440 e 1920 px sem overflow horizontal; mapa sem coluna de relatórios/cartões; Estatísticas sem montar mapa; alternância preservando filtros; CSV e PDF gerados, incluindo CSV filtrado por CEP. O build de produção e os testes de permissões passaram. Migrações e aplicação ainda não foram publicadas no ambiente remoto.


## 15. Layout aplicado à referência e adaptação para notebooks

A tela de Estatísticas foi redesenhada conforme a referência enviada: cabeçalho institucional compacto com cidade, navegação lateral, título com ação de exportar, filtros, quatro cartões com ícones, barra de distribuição, qualidade do cadastro e tabela de bairros na largura disponível. O atalho Visão geral permanece no cabeçalho para os administradores correspondentes.

- Busca principal e quatro filtros frequentes ficam visíveis. Lei, projeto, autor e nome oficial ficam em **Mais filtros**; filtros ativos aparecem como chips removíveis. Os atalhos Sem nome oficial e Sem CEP aplicam o filtro correspondente.
- A tabela permite pesquisar bairros, ordenar nome/quantidade/extensão e paginar em 10, 25 ou 50 linhas. Mostra a participação de ruas pavimentadas por bairro. CSV/PDF da tabela incluem todos os bairros da busca atual, além da página visível, com totais calculados sobre o mesmo recorte. A exportação em PDF usa orientação paisagem.
- **Exportar relatório** abre a seleção dos relatórios existentes e referências municipais. O ranking mostra três autores inicialmente no modo compacto, com expansão; na ausência de autoria vinculada, informa a ausência de dados.
- Os cartões não inventam variações de período: a base atual não oferece uma série histórica para calcular os percentuais de crescimento mostrados na imagem de referência. Contagens, proporções e extensões usam os registros reais.
- Em desktops, margens internas de 16 a 24 px, sem limite de largura da página. A navegação lateral usa 200 px. Em notebooks com até 850 px de altura, filtros, cartões, resumo e linhas da tabela ficam mais compactos. O conteúdo mantém rolagem vertical normal.
- Em tablets/celulares, os cartões passam a duas colunas, o menu é recolhível e a tabela tem rolagem horizontal dentro do próprio cartão. Busca, exportações e paginação continuam acessíveis. O cabeçalho reorganiza cidade e ações sem ultrapassar a tela.

Validação com componentes reais e dados simulados em **390×844, 768×1024, 1024×768, 1280×800, 1366×768, 1440×900 e 1920×1080**, além do tema escuro. Conferidos: ausência de overflow da página, cartões responsivos, busca/ordenação/paginação de bairros, exportações filtradas, filtros de qualidade, modal de exportação, navegação entre áreas e atalho Visão geral.

```powershell
node tools/validate-tree-inventory-ui.mjs --dashboard
node tools/validate-tree-inventory-ui.mjs --territorial
```
