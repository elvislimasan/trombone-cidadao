# Traçado próprio dos bairros

No **Mapa de Ruas e Pavimentação**, selecione uma cidade e use **Traçado dos bairros** (gestores de pavimentação). Escolha um bairro e sua cor. Um desenho novo começa em **Continuar traçado**; o terceiro ponto fecha a área. **Salvar contorno** grava a configuração para a cidade.

- **Editar pontos**: arraste um pino para ajustar sua posição. Clique no contorno ou no botão **+** entre dois pontos para inserir um vértice naquele trecho, inclusive no fechamento da área. Também é possível arrastar **+** diretamente para a posição desejada. Alças em trechos menores que 48 px ficam ocultas para evitar sobreposição; aproxime o mapa ou clique diretamente no trecho.
- **Continuar traçado**: clique em qualquer pino para escolher de onde continuar. O ponto selecionado fica azul; escolha inserir **Depois** ou **Antes** dele. O trecho de inserção fica tracejado em azul. Cliques no mapa acrescentam pontos em sequência a partir do novo ponto, preservando os demais vértices.
- **Curvar trecho**: arraste a alça roxa no meio do trecho. O contorno mostra a curva durante o arraste e aplica ao soltar. Cada curva acrescenta 15 pontos intermediários ao trecho escolhido; os extremos e os outros lados são preservados. Esses pontos mantêm a mesma curva aproximada no mapa, no banco e no PDF.
- Clicar em um pino apenas o seleciona. Use **Remover ponto** para excluir o selecionado. **Desfazer** e **Refazer** recuperam adições, arrastes, curvas, exclusões, limpeza e importação, inclusive a procedência anterior. Atalhos: **Ctrl+Z**, **Ctrl+Shift+Z** ou **Ctrl+Y** (Cmd no macOS).

Curvas que cruzam outros lados continuam impedindo o salvamento; ajuste ou desfaça antes de salvar.

Para remover um contorno salvo, use **Limpar desenho** e **Salvar remoção**. **Cancelar** descarta as alterações. O desenho é independente dos traçados e vínculos de bairro das ruas. Os contornos manuais ou importados não têm homologação cadastral oficial.

## Importação da fonte atual

Use **Buscar contorno atualizado**, **Pré-visualizar contorno** e **Salvar contorno**. Cada busca consulta a base atual do OpenStreetMap pela Overpass API, sem reutilizar uma resposta antiga. O editor mostra separadamente a data de atualização da base e a data da edição do objeto. Os candidatos válidos são ordenados pela data da edição, do mais recente ao mais antigo. A prévia mantém a cor escolhida; arrastar ou editar os pontos registra que houve ajustes locais.

A consulta identifica o município dentro da UF e aceita apenas bairros com nome correspondente, considerando acentos, o prefixo “Bairro” e nomes alternativos declarados na fonte. Nomes diferentes precisam de revisão do cadastro: o importador não aproxima nomes automaticamente. Para um contorno já importado, a busca usa o nome original registrado em `source_name`, permitindo atualizar AABB e DNER sem perder a associação revisada. Pontos sem área, linhas abertas, furos, áreas separadas e contornos inválidos são recusados, preservando o desenho atual. A importação pelo editor não cria bairros nem grava antes de **Salvar contorno**.

Na verificação em 08/10/2026, a instância consultada informou base de 08/10/2026 às 14:38:51 UTC e retornou 16 relações de bairros em Floresta/PE. Quatorze formavam polígonos válidos compatíveis com o editor. Bomba e Alto da Ermida continham linhas abertas e foram recusados. Por exemplo, Centro tinha 12 vértices e edição de 08/05/2026 às 14:57:22 UTC: a data recente da base não significa que cada limite tenha sido redesenhado naquela data.

A malha oficial de bairros do Censo 2022 para Pernambuco também foi conferida e não continha bairros do município de Floresta (`CD_MUN=2605707`). Por isso, a integração usa o OpenStreetMap consultado ao importar. A disponibilidade e cobertura dependem da fonte pública; falhas de consulta não substituem um contorno salvo.

Fontes: [Overpass API e instâncias públicas](https://wiki.openstreetmap.org/wiki/Overpass_API), [objeto Centro no OpenStreetMap](https://www.openstreetmap.org/relation/20660512), [malha de bairros do IBGE — PE, Censo 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/gpkg/UF/PE/). A instância usada é `https://maps.mail.ru/osm/tools/overpass/api/interpreter`.

A procedência acompanha o contorno salvo e pode ser consultada no editor. Editor e PDF exibem a atribuição dos contornos ao OpenStreetMap, inclusive quando o fundo do editor é satélite. O mapa público do site não desenha contornos de bairros; mantém as ruas e suas cores de pavimentação, com a atribuição própria da camada de fundo.

**Baixar mapa detalhado (PDF)** consulta os contornos e todas as ruas da cidade, incluindo páginas adicionais de dados quando necessário. A busca e os filtros da tela não retiram ruas da planta. O download contém somente uma planta A1; não acrescenta relatórios nem índice de ruas. Só desenha bairros com ruas representadas; bairros sem contorno mantêm a representação estimada anterior.

## Contornos cadastrados por padrão

A migração `355_floresta_neighborhood_default_boundaries.sql` contém os 14 polígonos válidos de Floresta/PE, com procedência, data da consulta e uma cor diferente para cada bairro. A consulta do seed foi feita em 08/10/2026 às 13:10:00 (America/Fortaleza), com base OSM de 13:06:58. “Né Maniçoba - AABB” foi associado somente ao cadastro **AABB**, conforme confirmação do usuário. “São Francisco de Assis - DNER” corresponde a **São Francisco de Assis (DNER)**. Né Maniçoba não recebe uma cópia dessa área; Bomba e Alto da Ermida permanecem sem contorno importado.

O seed encontra a cidade pela combinação Floresta/PE, reutiliza bairros por nome normalizado e cria os ausentes. Nomes ambíguos são ignorados. Não substitui geometria ou procedência existente. Atualiza para a paleta pastel somente cores OSM no antigo padrão `#bfe1ee` ou na paleta intensa anterior desse bairro, com o mesmo objeto de origem e sem ajustes locais. Outras cores personalizadas são preservadas. A migração pode ser reaplicada sem duplicar registros.

No Supabase de desenvolvimento configurado no `.env` (`xxdletrjyjajtrmhwzev`), os 14 contornos foram gravados: 12 acrescentados e dois anteriores preservados. As cores foram escolhidas para os 14 bairros por solicitação do usuário, com alteração somente de `color`, preservando geometria e procedência. A migração 355 permite repetir a instalação nos demais ambientes; não foi registrada no histórico remoto de migrações pela gravação via REST.

| Bairro | Cor |
| --- | --- |
| AABB | `#b8a7dc` |
| Alto da Ermida (referência aproximada) | `#b3cfdb` |
| Bela Floresta | `#e5a78f` |
| Bela Vista | `#ebc882` |
| Caetano 1 | `#e9a7bf` |
| Caetano 2 | `#ceb4e3` |
| Caraibeiras | `#92c9bc` |
| Centro | `#a5bfe8` |
| Cohab | `#a9cd92` |
| Matadouro | `#bac7d0` |
| Morada Nobre | `#86b9d4` |
| Parque das Acácias | `#c4cc9c` |
| Pedras de Josina (referência aproximada) | `#d4c3b7` |
| Santa Rosa | `#e6b4a1` |
| São Francisco de Assis (DNER) | `#d9c19d` |
| Três Marias | `#9db0d9` |

## Complementos do mapa de referência

A migração `356_floresta_reference_map_geometry.sql` acrescenta envoltórias manuais aproximadas para **Alto da Ermida** e **Pedras de Josina**, a partir das quadras identificadas no PDF fornecido. O documento não tem coordenadas geográficas nem uma camada de limites oficiais. Foi alinhado aos traçados existentes; essa correspondência não comprova precisão cadastral de toda a planta. A origem guarda identificação e hash do documento, método e `approximate: true`. O editor informa que o contorno é aproximado. As duas áreas têm cores próprias e podem ser ajustadas pelo gestor.

O complemento não fecha a linha aberta de Alto da Ermida no OSM e não substitui nenhum dos 14 contornos anteriores. Completa também o trecho identificado de **Rua Dr. Márcio Falcão Ferraz**, em Santa Rosa, que não tinha ponto nem traçado. A geometria é manual e aproximada; só é preenchida quando ambos estão ausentes e a correspondência de nome, bairro e município é única. Status, nome e demais informações da rua permanecem iguais.

No desenvolvimento, foram relidos **16 contornos** após a gravação, com os 14 anteriores preservados, e **320 ruas posicionadas: 233 com traçado e 87 somente com ponto**. A planta representa os pontos sem inventar ruas. Matadouro está salvo, mas não amplia o PDF enquanto não houver rua cadastrada nele. A migração 356 permite repetir esses complementos nos demais ambientes, sem substituir geometrias existentes.

## Organização do PDF

A planta usa bairros em tons pastéis, fundo externo `#F5F7F9`, ruas brancas com bordas finas `#B8C2CC`, nomes das ruas em `#263445` e bairros em negrito `#243247`. A largura destinada ao mapa é 92% da largura útil, com proporção geográfica preservada. A legenda fica junto ao desenho em duas linhas, com nomes completos e amostras maiores; adapta-se para mais linhas quando a cidade exigir. O cabeçalho mostra a data mais recente de atualização das ruas e dos contornos.

Os nomes das ruas usam 4 pontos como padrão, com redução até 1,5 ponto apenas nos segmentos que exigem ajuste. Podem ocupar mais de uma linha dentro do corredor branco de 2,5 mm, acompanhando o eixo da via, sem caixas brancas nem chamadas fora do traçado. O nome não ultrapassa o trecho disponível nem sobrepõe outros nomes. O sufixo com o bairro é removido apenas do rótulo quando repete o bairro cadastrado; apelidos e o nome original são preservados. Nomes inteiramente em maiúsculas recebem capitalização de leitura apenas na planta. Ruas apenas por ponto continuam representadas geometricamente, sem inventar um traçado. Um índice A4 permanece disponível somente para chamadas explícitas da biblioteca com `incluirIndice: true`; o botão de baixar mapa não o solicita.

Os nomes dos bairros usam 10 pontos em negrito. A posição é pesquisada em toda a área de cada contorno, permitindo quebra entre palavras para evitar sobreposição com nomes de ruas. Áreas menores podem exigir redução excepcional para 8 ou 6 pontos. Sem contorno salvo, a busca usa as quadras associadas às ruas do bairro. As associações pelo nome original da fonte e por complemento explícito de loteamento permitem reutilizar os contornos de AABB e Bela Floresta na produção, sem modificar os cadastros no banco ou aceitar correspondências ambíguas.

Na conferência com os dados de produção de 08/10/2026, a planta única representa 377 ruas: 362 com traçado e nome no desenho, além de 15 somente com ponto. Os 16 bairros aparecem identificados sobre suas áreas, todos com fonte de 10 pontos nessa base. Bianôr Alves de Barros e as ruas projetadas de Pedras de Josina foram incluídas na conferência.

## Banco de dados

Aplicar `supabase/migrations/353_pavement_neighborhood_boundaries.sql` antes de usar o editor. A migração cria armazenamento próprio, valida polígonos WGS84 sem cruzamentos ou furos e restringe escrita a admin/master ou embaixador ativo do município, respeitando `can_write('pavement')`. A leitura é pública. Não modifica cadastros de ruas nem as policies existentes dos bairros.

Aplicar também `supabase/migrations/354_neighborhood_boundary_source.sql` para salvar importações com sua procedência e datas. Essa migração adiciona `source` em JSON e mantém as permissões existentes. Contornos anteriores passam a ter origem manual; importar sem a coluna disponível informa que a migração está pendente, sem tentar salvar sem a procedência.

A atualização e a remoção comparam `updated_at` para detectar edições concorrentes. Quando houver conflito, feche e reabra o editor antes de tentar novamente. Enquanto o banco ainda não recebeu a migração 353, a exportação anterior do PDF permanece disponível.

O modal de edição preserva sua largura anterior, limitada a 1152 px em desktop, conforme solicitado pelo usuário. O limite é intencional neste modal; a página do mapa mantém seu layout próprio. Em telas menores, o modal usa a largura disponível com margens de 16 px.

## Verificação

Os testes de geometria, leitura por cidade, conflitos de edição, importação, procedência e geração do PDF passam junto com as regressões de quadras, rótulos e leitura completa das ruas (38 testes). Verificam download com uma única planta, nomes no eixo, consulta com mais de mil ruas, isolamento da cidade e interrupção em vez de exportação incompleta quando a leitura falha. A importação verifica inversão de trechos, papéis vazios em relações antigas, rejeição de geometrias incompatíveis, erros da API e consultas novas. A identificação dos bairros é conferida em áreas com ruas densas e nas associações aos nomes da fonte. ESLint dos arquivos alterados e compilação Vite também foram verificados.

O editor foi exercitado em Chromium com tiles externos bloqueados, em 1440, 1920 e 390 px. Foram conferidos ausência de rolagem horizontal, arraste sem perda de vértices, criação de área, escolha de cor, recuperação de erro, remoção, cancelamento e prévia de importação sem gravação automática. O retorno real foi reproduzido no editor: Centro com 12 vértices, Bomba recusado por linha aberta. Separadamente, a consulta real feita diretamente em Chromium respondeu HTTP 200, confirmando o acesso por CORS. As migrações foram preparadas, mas não executadas em banco remoto.

`node tools/validate-neighborhood-defaults-db.mjs` ensaia as migrações 355 e 356 em PostgreSQL local descartável. Verifica geometrias válidas, cores distintas, associação exclusiva a AABB, criação de bairros ausentes, isolamento da cidade, preservação dos desenhos e cores personalizados, atualização das paletas anteriores, repetição, rejeição de correspondências ambíguas e complementos aproximados sem sobrescrever correções manuais. As operações espaciais são representadas por um stub de texto neste ensaio; a validade geométrica é conferida pelo validador da aplicação e pelas constraints reais durante a gravação no Supabase. As gravações remotas de dados foram feitas por REST; isso não registra as migrações no histórico remoto.
