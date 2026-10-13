# Eletricista, envio de arquivos e ruas sem nome

O relatório de ruas sem nome oficial substitui a coluna de pavimentação por
coordenadas (latitude, longitude) e pelo endereço público da rua. O PDF contém
links clicáveis; o CSV usa os mesmos dados. Ruas sem localização mostram
“Não informadas”. Os links usam a origem configurada pelo aplicativo,
incluindo o endereço público quando o relatório sai do aplicativo nativo.

O perfil do eletricista oferece “Sair em patrulha” e “Minhas patrulhas”.
A patrulha tem preparação própria, escolha de carro/caminhada e avatar,
aviso de início e tela cheia, sem o cabeçalho ou navegação do painel. O mapa
de consulta mantém busca e atendimento, com o botão de patrulha removido.
O GPS, o mapa de navegação, o rastro, a voz e a confirmação de encerramento
são compartilhados com o fluxo do cidadão. Ao chegar a até 15 metros de um poste apagado, com problema
ou em manutenção, a patrulha mostra um aviso e oferece “Atualizar poste” ou
“Depois”. Usa o mesmo raio e a precisão máxima de GPS (15 metros) da patrulha
do cidadão, com voz e vibração quando disponíveis e controle de som.

O alerta dura 15 segundos, desaparece ao se afastar mais de 45 metros e não
repete o mesmo poste durante aquela patrulha, inclusive depois de escolher
continuar na confirmação de saída. Os postes próximos são consultados no
município do vínculo profissional. Abrir a atualização usa o formulário
de atendimento existente, sem salvar automaticamente; os alertas e o
GPS pausam durante a edição. A precisão ruim e erros de GPS pausam os alertas;
há opção de tentar obter o GPS novamente. Sair da página libera o observador.
Esse acompanhamento funciona enquanto a página está aberta.

Encerrar oferece continuar, salvar ou descartar. Salvar registra tempo,
distância, modo de deslocamento, IDs dos postes encontrados e atualizados,
e percurso privado, antes de mostrar o resumo. O histórico reutiliza
“Suas patrulhas”, filtrado para iluminação profissional, com acesso ao percurso.
Os atendimentos são gravados no momento da atualização do poste; descartar a
saída não desfaz esses atendimentos. Uma falha de gravação permite tentar
novamente. Sem rede, a saída e o percurso vão para a fila offline existente;
só há confirmação de gravação local se o armazenamento tiver funcionado.

A busca aceita número, placa, endereço e protocolo da ordem ou da solicitação.
O resultado abre o poste no mapa e oferece o acesso à ordem quando houver.
Uma resposta antiga de pesquisa não substitui os resultados da busca atual.
Ordens sem poste cadastrado ainda podem ser encontradas pelo protocolo.

## Banco e publicação

Aplicar `348_eletricista_ofertas_municipio_e_busca.sql` e
`349_electrician_patrols.sql` antes de publicar o frontend. Essas migrações
não foram aplicadas a nenhum Supabase remoto nesta tarefa. A 348 mantém os
controles de concorrência e versão das funções existentes. A 349 acrescenta
campos profissionais na tabela `patrols`: IDs bigint de postes separados dos
IDs uuid das broncas, com restrição de subconjunto para os postes atualizados.
As policies de proprietário e de percurso privado continuam válidas.

A migração do eletricista usava o número `346`, também reservado por
`346_municipal_pole_location_edit.sql`. A numeração foi corrigida para `348`.
Se a tentativa anterior terminou com `schema_migrations_pkey` e versão `346`
duplicada, a `348` aceita as funções do eletricista já atualizadas. Confira
o ambiente vinculado e execute `supabase db push --dry-run`, seguido de
`supabase db push`. Não é necessário apagar o registro `346` do histórico
para resolver essa colisão.

Ordens de iluminação sem responsável ficam disponíveis a todos os eletricistas
ativos de iluminação do município. O primeiro aceite define o responsável e
inicia a execução. Os demais perdem a oferta e não têm acesso ao detalhe da
ordem. Ordens previamente atribuídas permanecem exclusivas do responsável.
As permissões administrativas da prefeitura e da secretaria continuam válidas.

A secretaria original é preservada, mesmo quando o eletricista pertence a
outra secretaria do município. Se a ordem não tinha secretaria, o aceite usa
um canal ativo de iluminação do profissional. A gestão também pode escolher
eletricistas de outras secretarias do mesmo município ao criar a ordem.

## Conexão, progresso e satélite

O indicador web mantém visível o percentual de envio, sem exigir a abertura
do gerenciador. Os valores vêm do progresso real da fila de arquivos.

A falha de rede mostrada na captura não foi reproduzida. O atendimento agora
mostra uma mensagem em português e preserva o rascunho. Se a conexão cai depois
de enviar a operação de gravação, os anexos não são apagados: o banco pode ter
confirmado a transação antes de perder a resposta. O aviso orienta atualizar a
ordem e conferir o resultado antes de reenviar. Não há repetição automática da
operação de atendimento. Nesse caso incerto, arquivos sem vínculo podem restar
no storage para limpeza posterior.

Os mapas municipais e de serviço ampliam as imagens Esri do nível 18 ao chegar
ao zoom 19, evitando os tiles “Map data not yet available” da escala de 20 m.
A ampliação mantém os postes e permite aproximar; a imagem fica menos nítida.
O [suporte Esri](https://support.esri.com/en-us/knowledge-base/does-arcgis-online-support-the-tile-resampling-capabili-000012009)
descreve a reamostragem como tratamento para níveis sem cobertura.

## Validação local

- `node tools/validate-atendimento-flows-db.mjs`: banco PostgreSQL descartável,
  com aceite entre secretarias, exclusividade, atribuição prévia, busca e
  bloqueio de outro município e de funcionário desativado.
- `node tools/validate-electrician-map-ui.mjs`: componentes reais em Chrome
  com dados locais, a 390, 1440 e 1920 px. Verifica remoção do acesso à patrulha,
  busca fora de ordem, abertura do atendimento, zoom de satélite e percentual.
- `node tools/validate-electrician-patrol-ui.mjs`: perfil, preparação, tela cheia,
  GPS simulado com deslocamento, áreas de toque, precisão, proximidade e voz,
  postergação sem repetição, atendimento sem gravação automática, pausa durante
  edição, voltar, falha e nova tentativa, resumo, histórico e payload offline.
  Usa componentes reais em 390, 1440 e 1920 px, liberando o desktop na fixture
  para validar largura; a restrição de plataforma do painel continua em vigor.
- `node tools/validate-electrician-patrol-db.mjs`: seis verificações em PostgreSQL
  descartável, com gravação profissional, percurso privado, RLS, subconjunto,
  exclusão em cascata e reaplicação da migração 349.
- 171 testes de geometria, seleção de postes próximos, deslocamento, avaliação
  de patrulha e classificação de falhas offline.
- Testes de eletricista, relatório, demanda e classificação de erro de rede.
- Build de produção com `npx vite build`.

O PDF foi conferido também com 80 ruas distribuídas em três páginas: todos os
80 endereços receberam anotações de link clicável e as coordenadas apareceram.
Os 69 testes dos fluxos alterados e as 21 verificações de banco passaram,
incluindo a reaplicação segura da migração 348.
A suíte completa teve 1.235 testes aprovados e três falhas preexistentes em
`councilorAdmin`, `councilorIdentityLink` e `directoryCategories`; os arquivos
referidos por essas falhas não foram alterados nesta tarefa.

O GPS precisa de conferência final em aparelho real. Os testes de interface
não atestam disponibilidade das imagens do provedor em todas as cidades.
