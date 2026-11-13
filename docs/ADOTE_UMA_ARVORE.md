# Adote uma árvore

Página pública: `/adoteumaarvore`, também acessível no menu, no rodapé e no mapa de arborização. É necessário entrar na conta para preencher e enviar. A cidade selecionada determina o catálogo, os fornecedores e a equipe responsável.

## Ativação

O editor de pedidos separa **Espécies**, **Local de plantio** e **Contato** em abas, preservando o preenchimento ao alternar. O catálogo inicia em **Todos os viveiros** da cidade e permite filtrar por viveiro, selecionar espécies de fornecedores diferentes e trocar o fornecedor de uma espécie. Na edição, são elegíveis ofertas **Disponíveis** e **Sob consulta**, com a pendência de confirmação indicada junto ao fornecedor; ofertas indisponíveis e espécies sem oferta continuam excluídas. O viveiro original do pedido não limita as opções. Os cartões expandem descrição, plantio e retirada em blocos separados. Por preferência do cliente, este modal de tarefa tem largura máxima de 1120 px e altura natural, limitada à viewport; as páginas continuam fluidas. Cabeçalho, abas e ações permanecem visíveis, com rolagem apenas no conteúdo.

Para salvar a preferência **Sob consulta** em pedidos existentes, aplicar `supabase/migrations/424_tree_adoption_edit_consultation.sql` após a 421 e publicar o frontend atualizado. A 424 atualiza somente a RPC de edição; a aprovação e os novos pedidos continuam exigindo disponibilidade confirmada. A preferência editada volta para análise, sem confirmar estoque, espécie ou agendamento. Migração validada em PostgreSQL local descartável; não aplicada ao Supabase remoto.

Para o ponto de referência e a edição de pedidos, aplicar `supabase/migrations/421_tree_adoption_request_edit.sql` após a migração 420 e publicar o frontend atualizado. A 421 adiciona `reference_point` e a RPC `edit_tree_adoption`; não exige Edge Function. O cidadão e o gestor podem alterar pedidos ativos em **Minhas solicitações** ou no atendimento municipal. A edição volta para análise e limpa espécie/fornecedor confirmados e agendamento anterior; pedidos encerrados não são editáveis. A migração foi validada em banco local descartável, sem alteração no Supabase remoto.

Aplicar `supabase/migrations/392_tree_adoption.sql`, `393_tree_adoption_explicit_availability.sql` e `394_tree_adoption_pickup_and_alerts.sql`, nessa ordem, publicando o frontend atualizado. Nenhuma Edge Function adicional é necessária. A 393 exige disponibilidade explícita em novos pedidos e aprovações; preserva pedidos existentes e reenvios idempotentes. A 394 acrescenta os campos de retirada e os avisos de disponibilidade. Este trabalho não aplica alterações no banco remoto.

Não há estoque inicial presumido. Em **Disponibilidade de mudas**, a equipe escolhe uma espécie do catálogo completo e cadastra a situação no **Viveiro municipal** e no **Instituto Florestar**, além de endereço, horários e orientações de retirada. Somente espécies com ao menos um fornecedor marcado como **Disponível para solicitação** aparecem no catálogo de adoção. A escolha do fornecedor também se limita aos disponíveis cadastrados. Sem cadastro, **Sob consulta** ou **Indisponível** não são sugestões, nem podem ser enviados ou aprovados por chamada direta. Sem opções disponíveis na cidade, o formulário explica a pendência e permite atualizar o catálogo. A informação de disponibilidade não equivale a uma reserva ou controle quantitativo de estoque.

A aba **Disponibilidade de mudas** abre uma lista dos cadastros da cidade, incluindo disponíveis, indisponíveis e sob consulta. Há busca por espécie, fornecedor ou endereço, filtros de situação e fornecedor e paginação de oito registros. Cada registro mostra os dados de retirada, os horários, as orientações e um link para o ponto no mapa quando informado. **Editar** carrega os campos salvos, mantendo a espécie e o fornecedor do registro; **Nova disponibilidade** abre o cadastro. Salvar retorna à lista filtrada para a espécie e o fornecedor salvos, com confirmação e dados recarregados. **Limpar filtros** restaura a consulta geral. Falha ao salvar mantém o formulário preenchido.

No formulário de nova disponibilidade, **Nova espécie** abre o cadastro existente do inventário para quem possui autorização de edição técnica. A espécie é selecionada após o cadastro; só passa a ser oferecida depois que a equipe salvar a disponibilidade em um fornecedor. Atendentes sem edição de inventário continuam selecionando espécies já cadastradas.

O local de retirada tem endereço e ponto no mapa. O mapa abre no ponto salvo ou nas coordenadas de uma árvore da prefeitura, consultada pelo `city_id`; na ausência de árvore, busca um poste da mesma cidade, seguindo o mapa de iluminação. Nome e UF do catálogo de cidades são apenas a alternativa quando não há ponto cadastrado. Uma falha de geocodificação não impede abrir o mapa, e a cidade global de outra tela não é utilizada. Clicar preenche o endereço quando a consulta reversa estiver disponível; uma edição manual não é sobrescrita por respostas atrasadas. Dias da semana e horários usam controles próprios, com vários períodos para manhã, tarde ou dias diferentes. Intervalos incompletos, invertidos ou sobrepostos são recusados no cliente e no banco. `pickup_details` armazena os campos separados; `instructions` mantém uma apresentação legível para clientes anteriores. Textos antigos continuam preservados, sem inferência automática de horários.

No desktop municipal, seleção da espécie e fornecedor, mapa, períodos e orientações ocupam a altura disponível. O botão de salvar fica fixo e a página não ganha rolagem; listas extensas de períodos usam a própria coluna. No celular os campos seguem o fluxo vertical.

### Avisos de disponibilidade

Quando não há oferta na cidade, **Avise-me quando tiver disponibilidade** cadastra um aviso para a conta autenticada e a cidade escolhida. O cidadão pode cancelar e consultar a confirmação ao voltar à tela. Cada pessoa só consulta o próprio aviso; nenhuma conta ou prefeitura recebe a lista de interessados de outra pessoa.

Ao cadastrar ou alterar uma oferta para **Disponível**, o banco envia uma única notificação do tipo `system` aos avisos pendentes daquela cidade e registra o envio. Alterar instruções ou salvar novamente uma oferta disponível não repete a notificação. A notificação utiliza a infraestrutura existente da conta e abre `/adoteumaarvore?cidade=ID`, respeitando a cidade do aviso antes de carregar o catálogo. Se a oferta já estiver disponível no momento do clique, o cliente atualiza o catálogo em vez de deixar um aviso pendente. O cadastro do aviso e a liberação de ofertas são serializados por cidade.

## Solicitação do cidadão

1. **Seu pedido:** escolher receber mudas e a finalidade (sombra, ornamentação ou frutífera), com opções visíveis em cartões. O pedido de plantio pela equipe aparece somente quando ativado pela gestão na cidade.
2. **Local de plantio:** marcar o ponto no mapa, informar zona urbana/rural, tipo de espaço, endereço/localidade e presença de fiação aérea. No desktop, mapa e campos ficam lado a lado; no celular, o mapa aparece antes dos campos de endereço. As coordenadas ficam disponíveis em um detalhe expansível.
3. **Árvore e fornecedor:** buscar no catálogo por nome popular, regional ou científico, escolher uma espécie e consultar o fornecedor. A página mostra resumo, indicação para calçada e orientação de plantio.
4. **Revisão:** conferir pedido, endereço e espécie em uma coluna, com o mapa do ponto já aberto ao lado. Há ações para alterar cada seção ou ajustar o local, observações opcionais e compromisso de cuidado. Em área pública, o plantio depende da autorização da equipe. No desktop, a revisão ocupa a altura disponível e mantém o envio visível.

A entrada pública `/adoteumaarvore` apresenta o programa antes do formulário: benefícios, formas de participação, etapas do atendimento, cuidados e dúvidas frequentes. É uma página de leitura com rolagem normal e rodapé. A home pública também exibe uma seção do programa, disponível sem login, com links para a apresentação e para solicitar. Os links preservam a cidade escolhida.

**Quero participar** abre `/adoteumaarvore?aba=solicitar`; **Minhas solicitações** usa `aba=minhas`. No desktop, essas duas áreas usam a altura disponível abaixo do menu, mantendo as ações visíveis e a rolagem interna quando necessária. A seta do cabeçalho retorna à apresentação sem apagar o preenchimento. O catálogo tem páginas de seis espécies; no celular, o fluxo mantém rolagem normal e controles de toque maiores. O retorno do login preserva cidade e aba do formulário.

### Apresentação do fluxo

As quatro etapas compartilham títulos, superfícies, controles de seleção e destaques do tema. O início agrupa tipo de pedido e finalidade e explica avaliação e acompanhamento. O catálogo combina cartões de espécies com um painel de fornecedor; ausência de mudas oferece o aviso de disponibilidade. O envio concluído mostra o protocolo como recibo.

O atendimento e **Minhas solicitações** usam registros que ocupam a largura da lista, inclusive quando há um único pedido. Protocolo e espécie, endereço e fornecedor, situação e data e ação de consulta têm posições definidas. Bairro já presente no endereço não é repetido. O total apresentado vem da consulta do filtro, sem métricas municipais presumidas. A situação usa os tokens semânticos do sistema, com texto e cor.

O detalhe usa um modal de tarefa com largura máxima de 1120 px e altura natural limitada à viewport. A área de leitura tem abas **Resumo do pedido** e **Histórico**; o formulário de atendimento ocupa a coluna direita e preserva status e mensagem ao alternar as abas. O resumo separa espécies e quantidades, local, solicitante e confirmações do atendimento, sem repetir espécies ou bairros presentes no endereço. Observações longas e ajuda de atendimento ficam em expansões opcionais. O histórico mostra primeiro as atualizações mais recentes. No celular, os dados precedem o formulário; o rodapé mantém fechar, alterar e registrar acessíveis. Disponibilidades, editor e filas compartilham a moldura de tarefas. As regras de autorização, transições e gravação permanecem nos contratos existentes.

### Centralização do mapa

A UF é resolvida tanto em `city.state.uf` (catálogo público) quanto em `city.states.uf` (workspace municipal). A busca usa o nome completo do estado e confere município, UF e país nos resultados. O cache antigo `tc_citygeo_` não é reaproveitado; os novos resultados conferidos usam `tc_citygeo_v2_`.

Floresta–PE abre no centro já utilizado pelo projeto (`-8.597031, -38.574217`), inclusive sem conexão. Selecionar um ponto cuja consulta reversa identifica outra cidade ou UF mostra um aviso, limpa o ponto inválido e reenquadra a cidade correta. Quando a consulta não retorna informação suficiente, o ponto pode ser mantido e o endereço preenchido manualmente. Correções manuais não são sobrescritas por respostas atrasadas.

Após o envio, o cidadão recebe um protocolo `ARV-xxxxxxxx` e acompanha tudo em **Minhas solicitações**. Pode responder quando a equipe solicitar informações e cancelar um pedido ainda aberto, com justificativa. O pedido e o histórico são restritos ao solicitante e à equipe autorizada; não são publicados como bronca. Depois que a equipe confirma a execução de um plantio, a árvore e sua localização passam a integrar o inventário público, conforme informado na revisão do pedido. A entrega de muda não publica uma árvore.

O protocolo deriva do UUID do pedido; os oito caracteres são uma referência visual. A identificação interna e os vínculos usam sempre o UUID completo. O mesmo identificador de envio é reutilizado após erro de conexão, impedindo que uma tentativa repetida duplique o pedido.

### Sessão e recuperação do envio

O cliente confere a sessão e a identidade da conta antes de chamar `submit_tree_adoption`. Ao receber `permission denied for function submit_tree_adoption` ou rejeição do token, renova a sessão uma única vez e repete a mesma operação com o mesmo UUID. Ausência de sessão ou troca de conta impede o envio; a interface oferece entrar novamente. Uma recusa persistente informa a indisponibilidade do envio sem exibir a mensagem SQL bruta. Validações de negócio, como a disponibilidade retirada pela equipe, continuam sendo mostradas e não são repetidas automaticamente.

O formulário, a etapa e o UUID ficam em `sessionStorage`, separados por conta e cidade, para recuperar o preenchimento nesta aba após recarregar a página ou renovar o acesso. O sucesso remove o rascunho. Outra conta ou cidade não carrega esse preenchimento. O recurso é opcional: com armazenamento bloqueado, o formulário continua funcionando em memória.

Diagnóstico do banco vinculado em 27/10/2026, em transação somente de leitura: `submit_tree_adoption(jsonb)` existe, usa `security definer`, permite execução por `authenticated` e não permite por `anon`; os helpers e a atualização de pedidos também têm a concessão autenticada. A sessão do navegador da imagem não foi reproduzida. Portanto, não foi aplicada uma concessão adicional nem uma migração de permissões; sessão ausente ou desatualizada permanece uma hipótese tratada pelo cliente, não uma causa confirmada remotamente.

## Atendimento nos painéis existentes

- **Painel do admin → Solicitações de árvores**: acesso direto em `/admin/arborizacao/solicitacoes`, com a mesma fila e histórico do atendimento municipal. O seletor de cidade mostra apenas cidades autorizadas; o master pode selecionar qualquer cidade. O cartão do painel indica pedidos com status **Solicitação enviada**, respeitando a RLS.
- **Prefeitura → Adote uma árvore**: tela exclusiva de atendimento em `/prefeitura/adote-uma-arvore?cidade=ID`, com fila, histórico, avaliação e disponibilidade dos fornecedores. O menu aparece para administradores municipais, gestores do inventário e gestores/atendentes responsáveis pela categoria `poda` (Arborização), conforme a cidade e a secretaria ativas. A autorização final continua no servidor.
- **Gestão de Arborização → Atender solicitações**: abre a mesma tela exclusiva, mantendo a cidade e a secretaria. O inventário não incorpora a fila nem exibe o convite para solicitar uma muda ou plantio.
- O convite e o formulário de solicitação pertencem ao fluxo público do cidadão. Links antigos com `/prefeitura/demandas?programa=adote-uma-arvore` redirecionam para a tela exclusiva.

Os pedidos têm um fluxo específico de adoção, compartilhado pelos dois painéis. Não são duplicados como broncas ou ordens de serviço genéricas. As tabelas são `tree_adoption_requests`, `tree_adoption_events` e `tree_species_availability`; os catálogos e o inventário continuam sendo `city_tree_species` e `city_trees`.

Atendentes podem receber, analisar, enviar orientações e registrar pendências de informação ou disponibilidade. Gestores de Arborização, administradores municipais e gestores da secretaria com permissão de distribuição podem aprovar, recusar, cancelar administrativamente, agendar e concluir. O servidor verifica as permissões vigentes por cidade em cada consulta e atualização; a interface não concede permissões por conta própria.

### Configurações de solicitações

Aplicar `425_tree_adoption_planting_settings.sql` e `427_tree_adoption_seedlings_settings.sql` após as migrações anteriores e publicar a aplicação atualizada. As configurações são independentes por cidade: `tree_adoption_settings.planting_enabled` começa **desativada** e `seedlings_enabled` começa **ativada**, inclusive quando ainda não existe registro de configuração. A nova migração preserva o estado de plantio e mantém mudas disponíveis nas cidades existentes. A solicitação de mudas continua seguindo as regras de disponibilidade e CPF existentes.

A seção **Configurações** aparece na fila de atendimento, tanto no admin quanto na prefeitura, com dois controles: **Plantio pela equipe** e **Solicitação de mudas**. Podem ser ativados ou desativados separadamente, inclusive pausando ambos. Somente quem tem `can_dispatch_tree_adoption` na cidade pode alterar a configuração; atendentes têm leitura. Desativar impede novos pedidos da modalidade no banco, inclusive por clientes antigos ou chamadas diretas. Pedidos existentes continuam disponíveis para acompanhamento, edição e atendimento, e reenvios idempotentes continuam retornando o pedido já gravado.

O formulário mostra apenas as modalidades ativadas. Quando ambas estão desativadas, informa a pausa e mantém o acesso a **Meus pedidos**. Falhas na consulta bloqueiam novos envios e oferecem tentar novamente. Rascunhos de uma modalidade desativada voltam à primeira etapa sem converter a solicitação automaticamente: o cidadão precisa escolher uma opção disponível e, para mudas, informar o CPF. A configuração é consultada novamente ao retornar à janela, ao alterar o controle e após uma rejeição de regra no envio.

### Etapas

`Solicitação enviada → Em análise técnica → Aprovada`

Durante a análise ou preparação, a equipe pode solicitar informações ao cidadão ou aguardar disponibilidade. Para aprovar, o gestor confirma a espécie adequada e o fornecedor; a preferência do cidadão pode ser alterada com justificativa na mensagem do atendimento. A equipe deve avaliar a fiação, o espaço e a autorização de uso da área.

- **Muda:** `Aprovada → Muda pronta para retirada → Concluída`. A mensagem da liberação deve informar endereço, horários e orientações. A conclusão exige a data real da entrega. Não cria uma árvore no inventário, pois entregar uma muda não comprova plantio.
- **Plantio:** `Aprovada → Plantio agendado → Concluída`. O agendamento exige data e hora futuras. A conclusão exige a data real do plantio e cria a árvore no inventário no ponto solicitado, com a espécie aprovada e a origem do plantio **Prefeitura**. O cidadão recebe acesso à página da árvore. O gestor deve confirmar a conclusão somente após a execução naquele ponto.

Recusas e cancelamentos exigem mensagem. Pedidos encerrados não podem ser reabertos ou concluídos novamente. Atualizações concorrentes são rejeitadas com orientação para atualizar a lista. A gravação da conclusão, árvore e histórico ocorre na mesma transação.

## Validação local

```sh
node --import ./tools/test-alias.mjs --test src/test/treeAdoption.test.mjs
node --import ./tools/test-alias.mjs --test src/test/geocodeCity.test.mjs
powershell -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/tree_adoption.sql
powershell -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/tree_adoption_pickup_alerts.sql
node --import ./tools/test-alias.mjs --test src/test/treePickup.test.mjs
node tools/validate-tree-adoption-ui.mjs
node tools/validate-tree-adoption-ui.mjs --edit-catalog-audit
node --test --test-isolation=none src/test/treeAdoptionSettings.test.mjs
node tools/validate-tree-adoption-settings-db.mjs
node tools/validate-tree-adoption-ui.mjs --planting-settings-audit
powershell -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/tree_adoption_edit_consultation.sql
npx vite build
```

O teste de navegador usa Chrome headless, componentes reais e dados simulados, sem ler o `.env` ou gravar em produção. Inclui a geometria do menu superior e verifica 320×844, 390×844, 1366×768, 1440×768, 1440×900, 1920×921 e 1920×1080. Confere margens externas, ausência de rolagem da página e botões visíveis nas quatro etapas desktop, cores herdadas do tema, catálogo paginado com 25 espécies e o fluxo completo de localização e atendimento. As capturas ficam em `.tmp/tree-adoption-ui/`.

O endereço público usa `/adoteumaarvore`. O endereço anterior `/adote-uma-arvore` redireciona preservando os parâmetros e o fragmento. A migração `404_tree_adoption_public_url.sql` atualiza os links de novas notificações e reserva o novo nome de usuário; notificações já enviadas continuam funcionando pelo redirecionamento.
