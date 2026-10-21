# Estratégia — painel de ruas e arborização por responsabilidade

**Data:** 21/10/2026  
**Estado:** proposta para revisão, antes da implementação dos painéis e da separação de permissões.  
**Referência visual:** painel de gestão de iluminação pública existente no projeto.

## 1. Resultado esperado

O funcionário da **Secretaria de Produção Rural e Meio Ambiente** terá um painel próprio de **Arborização**, limitado às cidades e às operações autorizadas. O responsável por ruas terá o painel de **Ruas**. Quando a mesma pessoa puder gerir os dois módulos na cidade selecionada, verá um único painel com as abas **Ruas** e **Arborização**.

Funcionários que também sejam **admin ou master continuam na visão geral**. Receber um cargo operacional não os redireciona para uma experiência reduzida. Eles poderão entrar nos módulos por atalhos a partir do painel geral.

O cadastro cidadão e a consulta pública dos mapas continuam disponíveis. O objetivo desta entrega é organizar a experiência de trabalho e separar as responsabilidades municipais.

## 2. O que foi confirmado no código

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
- Título **“Gestão de ruas e arborização”** para quem tem as duas responsabilidades; **“Ruas”** ou **“Arborização”** para quem tem apenas uma.
- Duas abas de módulo somente quando ambas estiverem autorizadas. Dentro de cada uma, **Mapa/Lista** alterna a apresentação dos mesmos dados.
- Filtros e posição de trabalho independentes por aba e cidade. A URL preserva a área ativa, inclusive ao atualizar a página ou abrir um link direto.
- Desktop com navegação lateral; mobile com menu recolhível e ações acessíveis. Não herdar a restrição de desktop de telas específicas do eletricista.

Exemplo para um funcionário com os dois acessos:

```text
Prefeitura · Floresta                         Funcionário · Secretaria
Gestão de ruas e arborização

[ Ruas ]  [ Arborização ]

Indicadores da área selecionada              [Cadastrar] [Exportar]

Filtros / busca       Mapa ou lista que ocupa a largura disponível
                      Detalhes e ações ao selecionar um cadastro
```

Para o funcionário de Meio Ambiente, a mesma estrutura abrirá diretamente em **Arborização**, sem a aba Ruas. A secretaria exibida virá do cadastro institucional, sem nome fixo no código.

### Aba Ruas

- Mapa e lista do cadastro municipal de ruas.
- Busca por nome, nome informal, bairro e CEP, aproveitando as funções existentes.
- Indicadores úteis para o cadastro: ruas cadastradas, sem nome, sem CEP e sem traçado. As definições devem ser explícitas; não apresentar cobertura física da cidade como se fosse cobertura de cadastro.
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
5. Para novos responsáveis de arborização, exigir conta de tipo **Órgão Público**, prefeitura ativa e vínculo ativo do funcionário com a prefeitura e com a secretaria daquela cidade, além da concessão de módulo. Nome da secretaria, categoria e associação institucional sozinhos não concedem escrita.
6. Uma RPC administrativa valida e grava o conjunto de concessões de forma transacional. A UI mostra claramente cidades, secretaria e módulos efetivamente autorizados. Revogar o vínculo institucional impede novas operações de arborização, inclusive chamadas diretas.

Na configuração de um funcionário, a proposta de apresentação é:

```text
Funcionário: [pessoa selecionada]
Cidade:     [Floresta]
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
- Regras individuais de bloqueio prevalecem sobre liberações de cargo para não masters, conforme o contrato existente. Ausência de regra para o novo módulo significa **sem escrita**, inclusive no `can_write` SQL e em `canWriteModule` JavaScript.
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

O painel proposto reaproveitará esses códigos. **Este documento não implementa nem publica o novo painel, não separa ainda as permissões e não altera cargos ou secretarias reais.**
