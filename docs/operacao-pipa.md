# Operação-pipa

Módulo privado por secretaria, integrado ao login existente e ao painel municipal.

## Instalação

1. Aplicar `supabase/migrations/414_tree_adoption_new_request_notifications.sql` e, em seguida, `415_operacao_pipa.sql`, `416_pipa_routes.sql`, `417_pipa_emptying_average.sql` e `418_pipa_driver_login_details.sql` no projeto Supabase escolhido. As migrações são transacionais. No banco de dev, as versões antigas 414–416 da Pipa foram remapeadas no histórico para 415–417, preservando os dados; não reaplicar esses três arquivos.
2. Publicar a Edge Function `create-pipa-account` nesse mesmo projeto: `supabase functions deploy create-pipa-account --project-ref <referencia-do-projeto>`. A função usa os segredos padrão do Supabase no servidor; nenhuma chave administrativa é enviada ao navegador.
3. Publicar o frontend pelo fluxo habitual do projeto.
4. Em **Prefeitura → Secretarias**, habilitar **Operação-pipa** nos inventários da secretaria. A área pode funcionar sem categorias de broncas.
5. Atribuir os cargos da equipe em **Equipe**. O administrador municipal também tem acesso às secretarias habilitadas.

Rotas:

- Gestão: `/prefeitura/operacao-pipa/mapa`, com abas de caixas, pipeiros, solicitações, abastecimentos e estatísticas.
- Pipeiro: `/operacao-pipa/pipeiro`, com telas `/entregas`, `/rotas`, `/mapa` e `/historico`. O mapa da rota contém somente caixas d’água e ocupa a tela inteira.
- Login do pipeiro: `/operacao-pipa/login`. Login municipal: `/prefeitura/login`. Os dois utilizam as contas existentes, sem cadastro ou login social de cidadão nessas telas. O retorno depende do tipo da conta, e cidadãos não entram no painel do pipeiro.
- Senha do pipeiro: `/operacao-pipa/pipeiro/senha`. Salvar ou cancelar retorna ao trabalho, sem abrir o perfil de cidadão.

## Acessos

| Perfil | Permissões |
| --- | --- |
| Administrador municipal | Gestão das secretarias habilitadas do próprio município |
| Gestor ou inventário | Caixas, responsáveis, pipeiros, cotas, criação de logins, solicitações, direcionamento e lançamentos manuais |
| Atendente | Consulta e cadastro de solicitações |
| Leitura | Consulta |
| Pipeiro ativo | Destinos da própria secretaria, solicitações direcionadas a ele, uma viagem por vez e registro de descarga |

As tabelas têm RLS e não aceitam escritas diretas do cliente. As operações passam por RPCs com verificação de secretaria e cargo. Pipeiros recebem uma projeção de destinos sem CPF, telefone ou endereço pessoal dos responsáveis e sem dados dos solicitantes. Desativar o pipeiro, a secretaria ou o módulo bloqueia novas operações de campo no servidor.

## Cadastros e entregas

- A caixa exige localização, capacidade, abastecimento habitual e nome, CPF, telefone e endereço do responsável. O CPF é validado no frontend e no banco.
- O pipeiro tem nome, placa, capacidade, vínculo do abastecimento e situação. As cotas são armazenadas por pipeiro e mês, preservando meses anteriores. A cota é uma referência de acompanhamento: não impede o registro de uma entrega acima dela.
- O gestor cria um login com e-mail e senha temporária, exibida uma única vez. O pipeiro completa o cadastro e aceita os termos no primeiro acesso. A troca de senha torna-se obrigatória após 24 horas, usando o gate municipal existente. Contas já existentes não têm sua senha substituída.
- Solicitações urgentes indicam caixa seca. Uma carrada avulsa pode usar uma caixa cadastrada — inclusive do Exército — ou uma localização independente. Cada solicitação corresponde a uma carrada.
- A gestão separa solicitações em Pendentes (aguardando, direcionadas e em rota), Atendidas e Canceladas. As abas têm contadores, preservam a busca e limpam o filtro de situação ao trocar de grupo.
- O gestor direciona uma solicitação. O pipeiro inicia a rota, acompanha o caminhão pelo GPS e pode abrir a navegação para o destino. Também pode iniciar uma entrega de rotina selecionando uma caixa da sua secretaria.
- A descarga exige localização atual, precisão de até 100 m e distância de até 250 m do destino. Volume e capacidade são conferidos no banco. Um identificador de entrega e a unicidade da solicitação evitam duplicações em tentativas repetidas.
- O lançamento manual aceita data passada, pipeiro, quantidade de carradas, volume e motivo. Pode atender uma solicitação ou registrar abastecimentos históricos de uma caixa, inclusive por pipeiro hoje desativado. Guarda usuário, data de lançamento e data efetiva da entrega.
- O painel consulta novamente os dados a cada 20 segundos enquanto está visível, ao recuperar o foco ou pelo botão Atualizar. O fluxo de campo precisa de conexão; falhas de GPS ou de rede podem ser resolvidas posteriormente pelo lançamento manual.

## Rotas e mapa

O mapa da gestão ocupa toda a largura disponível, sem lista lateral. Clicar em uma caixa abre um modal central no padrão da iluminação, com nível estimado, dados do cadastro, responsável e ações conforme as permissões. Abrir uma ação fecha os detalhes antes de mostrar o formulário.

O planejador usa três etapas: **Dados → Adicionar caixas → Revisar rota**. Tocar em um ponto ou abrir detalhes apenas exibe a prévia. A caixa entra no planejamento pela ação explícita **Adicionar à rota** (ou **Adicionar** na lista), com contador e indicação **Na rota**. A última etapa permite ordenar e remover paradas antes de salvar.

No mapa da rota, o painel inferior pode ser recolhido. Os botões de navegação e registro continuam disponíveis, e tocar em outra caixa reabre os detalhes. A tela de entregas começa pelo cartão do caminhão, sem o título “Minhas entregas”. O histórico utiliza cartões no celular e tabela no desktop.

Rotas canceladas saem da listagem e do seletor do mapa. O cancelamento preserva os abastecimentos já registrados no histórico.

A rota anuncia por voz o início e a aproximação da caixa em 1 km, 500 m e 100 m, em linha reta. Os marcos não se repetem com a oscilação do GPS; ao trocar o destino, a contagem recomeça para a nova caixa. Os avisos usam GPS recente com precisão de até 100 m e o mesmo motor de voz nativo do app, com opção de silenciar no mapa ou no cartão da entrega ativa.

Em **Gestão → Operação-pipa → Rotas**, a prefeitura escolhe um pipeiro, uma data e até 100 caixas ativas da secretaria. A ordem é editável antes de salvar. Cada parada gera uma solicitação de rotina direcionada ao pipeiro. O pipeiro também pode planejar uma rota própria na tela **Rotas**; a origem do planejamento fica visível.

O mapa abre com a rota municipal pendente disponível na data atual, ou com a rota própria quando não há uma municipal. Rotas futuras podem ser consultadas explicitamente. O filtro **Todas as caixas** permite atender qualquer caixa ativa da mesma secretaria, inclusive do Exército. Trocar de destino devolve a parada atual para direcionada; ela não é marcada como atendida. A conclusão é confirmada pela descarga com GPS, e a próxima parada fica disponível. O gestor também pode concluir uma parada por lançamento manual.

As ligações pontilhadas mostram a ordem em linha reta. **Navegar** abre a navegação viária externa. A posição do caminhão é acompanhada por GPS. Cancelar uma rota cancela somente as paradas pendentes e preserva entregas concluídas; o pipeiro cancela apenas as rotas próprias. Rotas municipais são controladas pela gestão.

## Nível estimado e prioridades

A migração `417_pipa_emptying_average.sql` adiciona a média de esvaziamento da caixa (opcional, de 1 a 365 dias) e o nível observado após cada entrega (opcional, de 0 a 100%). No registro pelo pipeiro ou no lançamento manual, **Ficou cheia (100%)** informa que o pipa completou a caixa, mesmo que já houvesse água. Também é possível informar outro percentual.

Um nível observado substitui o saldo estimado naquela data. Depois, o consumo é linear: capacidade da caixa dividida pela média em dias. Sem observação, o saldo inicial desconhecido é zero e os volumes registrados são somados, limitados à capacidade. Solicitações de caixa seca zeram o saldo na data do relato; uma nova entrega passa a compor a estimativa novamente. Registros futuros e entregas avulsas sem caixa são ignorados no cálculo.

As faixas são **provavelmente cheia** (60% a 100%), **moderada** (21% a 59%) e **provavelmente vazia** (até 20%). Sem média ou histórico, a caixa fica **sem estimativa**, salvo um relato explícito de caixa seca. São projeções operacionais, sem sensor. Urgências em aberto continuam destacadas até serem resolvidas, mesmo após outro abastecimento na mesma caixa. Caixas desativadas não entram na contagem de atendimento.

A gestão mostra filtros por nível, lista ordenada por prioridade e previsão de esvaziamento. Mapa, listas, relatórios e tabela compartilhada ficam em subcomponentes. As estatísticas dividem visão geral, pipeiros e localidades em abas e deixam os filtros adicionais recolhidos.

## Estatísticas

O histórico de abastecimentos utiliza busca por destino, pipeiro ou placa, filtros recolhidos por padrão e indicação dos filtros ativos. O resumo distingue quantidade de registros de quantidade de carradas, volume e última entrega, incluindo a divisão de carradas entre prefeitura e Exército. No desktop, a tabela mostra apenas informações operacionais; clicar em uma entrega abre destino, nível após descarga e auditoria em um painel. Ações secundárias ficam no menu do registro. Caixas, pipeiros, solicitações e estatísticas reutilizam a mesma barra de filtros; os contadores de nível das caixas são chips compactos.

O abastecimento habitual da caixa e o prestador efetivo da entrega são campos separados. Uma entrega municipal em uma caixa do Exército conta como entrega da prefeitura e preserva o cadastro habitual. Placa, nome do pipeiro, capacidade, localidade e prestador são copiados para a entrega, preservando o histórico após mudanças no cadastro.

Os indicadores fixos mostram caixas ativas por prestador habitual, caixas distintas atendidas pela prefeitura no mês anterior e carradas nos últimos 12 meses. As estatísticas e o histórico permitem filtrar período, prestador efetivo, pipeiro e localidade. Apresentam carradas, litros, caixas distintas e agrupamentos por mês, pipeiro e localidade, com relatório em PDF. Datas e limites dos dias usam `America/Fortaleza`. Consultas paginam o banco para evitar o truncamento padrão de 1.000 linhas.

## Dados de demonstração

O seed insere **8 caixas**, **4 pipeiros**, **48 cotas mensais**, **10 solicitações** e **74 registros de abastecimento**, com 86 carradas distribuídas por 12 meses. Inclui caixas da prefeitura e do Exército, área urbana e rural, urgências, apoio municipal ao Exército, pedidos avulsos, cancelamento, deslocamento, cadastros desativados e um pipeiro acima da cota do mês.

Os nomes e as localidades não possuem tags de teste; as observações identificam a demonstração. Responsáveis, contatos e locais são fictícios. Nenhum login é criado e nenhuma notificação é enviada. O seed está restrito ao ambiente de desenvolvimento de Floresta–PE, confere o projeto vinculado e preserva os cadastros existentes. IDs estáveis permitem repetir o comando sem duplicar ou sobrescrever dados.

```text
npm run pipa:seed -- --city-id 64
npm run pipa:seed -- --city-id 64 --apply
```

O primeiro comando mostra o que falta inserir. Quando houver mais de uma secretaria habilitada, informe `--channel-id UUID` para escolher o destino. Os pipeiros de demonstração podem receber login posteriormente pela tela de gestão.

## Dados de login e recuperação de senha

Na lista de pipeiros, **Dados do login** mostra nome, e-mail e telefone da conta
vinculada, quando houver. A consulta exige gestão da secretaria do pipeiro e
usa o e-mail de autenticação, não um contato digitado no cadastro operacional.
Campos ainda não preenchidos aparecem como **Não informado**.

**Redefinir senha** envia a recuperação para esse e-mail pelo fluxo existente
do Supabase Auth. A senha atual só muda quando o pipeiro confirma a nova senha.
A interface revalida a permissão e o vínculo antes de solicitar o envio, mostra
erros de rede ou limite de envio e evita cliques duplicados. Contas sem e-mail
não oferecem o envio. Nenhuma senha existente é consultada ou exibida.

Publicação: aplicar `418_pipa_driver_login_details.sql` e publicar o frontend
desta branch. O e-mail usa o SMTP e o redirecionamento `/alterar-senha` já
configurados no projeto; não há nova Edge Function.

## Validação local

Não utiliza credenciais nem dados do Supabase remoto:

```text
node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/pipa.test.mjs src/test/municipalAccess.test.mjs src/test/municipalityAccess.test.mjs src/test/profileOnboarding.test.mjs
node tools/validate-pipa-db.mjs
node tools/validate-pipa-ui.mjs
node node_modules/vite/bin/vite.js build
```

O teste de banco cria um PostgreSQL descartável local. `POSTGRES_BIN` pode apontar para os binários instalados. O teste visual usa o Chrome instalado no caminho padrão do Windows, dados fictícios e tiles locais, e verifica 1440, 1920 e 390 px. As capturas ficam em `.tmp/pipa-ui/`.
