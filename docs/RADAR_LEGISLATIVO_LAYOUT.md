# Radar legislativo — layout público

## Revisão de 24/11/2026

A lista de vereadores abre em **Mandato atual**, cruzando cadastro ativo com mandato vinculado ao período legislativo vigente e suas datas de início/fim. A marca de cadastro ativo, sozinha, não inclui vereadores de mandatos anteriores. Suplentes ativos com mandato no período continuam elegíveis; cadastros inativos não representam exercício atual. O recorte é da data atual, independentemente do período das propostas. **Todos os cadastros** preserva os perfis e registros históricos.

A migration `455_legislative_current_mandates.sql` acrescenta a identificação de mandato atual à consulta pública do diretório. Usa apenas o acervo publicado, verifica a cobertura de mandatos e legislaturas e mantém as funções auxiliares privadas. Se não houver dados suficientes ou um único período vigente, a interface informa que os mandatos estão em conferência, sem usar a marca de cadastro ativo como alternativa. O acervo de desenvolvimento tinha Bia marcada como ativa, mas somente com mandatos encerrados em 2016 e 2020; a correção trata a regra geral, sem excluir nomes manualmente.

Aplicada ao ambiente de desenvolvimento em 24/11/2026: 13 vereadores na seleção atual, 32 cadastros preservados e Bia fora do mandato atual. Validação em PostgreSQL temporário com as 15 migrations legislativas, incluindo suplente ativo, duplicidades, mandato futuro/encerrado, cadastro ativo sem mandato, cobertura ausente e privacidade das funções auxiliares. Playwright em 390, 1440 e 1920 px nos dois temas, conferindo a seleção padrão, o histórico e os links dos perfis.

## Revisão de 23/11/2026

A terminologia pública do contador usa **Salário pago aos 13 vereadores desde a posse**, com a quantidade de cargos da cidade, conforme solicitado pelo cliente. Rótulos acessíveis, ajuda e links usam “salário”; a indicação de estimativa permanece junto ao valor.

**Alcance dos controles:** no radar, o contador do mandato vem primeiro. O seletor de datas fica em uma faixa identificada como “Período de propostas e presenças”. Busca, filtros de assunto/grupo/vereador e visualização aparecem sob “Propostas da Câmara”, junto dos gráficos e da lista de propostas, que permanecem contíguos. O botão usa “Filtrar propostas” e a busca explicita “Buscar proposta, rua ou bairro”. Presenças aparece depois desse conjunto, com busca própria por vereador; recebe apenas o período compartilhado, sem herdar filtros de propostas. Os controles continuam acessíveis mesmo quando a consulta retorna erro ou período inválido.

**Contador de subsídios no radar:** indicador com fundo do tema, faixa lateral e valor em vermelho, antes dos demais indicadores, com valor acumulado estimado desde 01/01/2025, atualização a cada segundo e controle de pausa. A referência é de 13 cargos × R$ 10.432 mensais, conforme a Resolução 8/2023 e a ata de posse de 2025. Meses completos somam a base integral; o mês atual é proporcional aos segundos decorridos no horário de Fortaleza, considerando a duração real do mês. O contador é independente dos filtros de propostas e fica visível mesmo ao ocultar o resumo. Os dados de referência estão centralizados em `legislativeRemuneration.js`, compartilhados com o salário-base dos perfis; não há extrapolação para outra cidade ou legislatura.

O card identifica a estimativa junto ao valor e informa que não é folha de pagamento. A ajuda opcional detalha a fórmula e as fontes, sem contabilizar 13º, férias, encargos, revisões ou ajustes individuais não confirmados. O relógio recalcula pelo horário atual ao retomar a aba, sem acumular incrementos fictícios e sem anunciar cada segundo ao leitor de tela. Esta inclusão não precisa de migration ou escrita em banco remoto.

Verificação do contador: nove testes de cálculo, perfil e gráficos; build completo; Playwright em 320, 390, 768, 1440 e 1920 px nos dois temas, incluindo crescimento, pausa, retomada, fontes, independência dos filtros e cidade sem referência. Sem erros de execução ou rolagem horizontal.

Refinamento do perfil: cabeçalho em vermelho suave da paleta da marca, com adaptação ao tema escuro. O percentual de presença usa símbolo menor e espaçamento próprio, para manter valores como 91% e 100% dentro do anel no celular.

O perfil e o radar seguem a referência móvel fornecida pelo cliente: identidade em fundo claro, foto circular, presença em anel, valores compactos e propostas em lista com faixa colorida. No desktop, os mesmos blocos se distribuem em colunas fluidas. A referência já define a composição; não foi necessário gerar outro mockup. Mantidos os títulos neutros, o vermelho da marca, as fontes oficiais, os filtros e as abas de registros.

O perfil mostra presenças registradas, sessões do período e justificativas. O percentual é a razão entre presenças e sessões consultadas, sem inferir faltas ou corrigir automaticamente exercício, suplências e afastamentos. Contagens ausentes, cobertura incompleta de presenças, denominador zero e conflitos não geram percentual. A explicação do cálculo fica na ajuda opcional. O período padrão termina na data atual.

O salário aparece como **salário-base mensal · 2025**, R$ 10.432, com link para a [Resolução 8/2023](https://sapl.floresta.pe.leg.br/norma/2218), artigo 1º. É o subsídio previsto na norma para a legislatura iniciada em 2025, não o líquido recebido ou a confirmação da folha atual. Revisões anuais e pagamentos efetivos permanecem não confirmados. A referência fica restrita a Floresta e a recortes dentro de 2025–2028; outros casos mostram valor não informado.

A migration `454_legislative_profile_highlights.sql` fornece partido no fim do recorte e votos agregados de todo o período: sim, não, abstenções e outros registros. Usa somente o acervo publicado, verifica cobertura dos recursos e preserva os estados de cidade não configurada, parlamentar inexistente e vínculo ausente. Não usa os 50 itens da prévia como total. Precisa ser aplicada ao banco do ambiente para disponibilizar partido e resumo de votos; os demais indicadores reutilizam consultas existentes.

Validação local: 24 testes unitários, suíte de PostgreSQL temporário com todas as 14 migrations legislativas, incluindo contagem acima de 50 votos e cobertura ausente; build completo; cenários de navegador em 390, 1440 e 1920 px, nos temas claro e escuro, e conferência com Playwright. A prévia usa fixtures e não altera bancos remotos.

## Revisão de 21/11/2026

**Bairros e Sessões:** títulos neutros e destaques no vermelho da marca, sem vinho. Bairros ganhou indicadores dos locais e pedidos da lista, barras por serviço com filtro local, registros recentes e cartões com datas e ações de expansão. Os pedidos são deduplicados nos indicadores e dentro de cada serviço. Sessões ganhou totais do período inteiro, distribuição por tipo, gráfico dos seis meses finais com filtro ao clicar, datas destacadas e links disponíveis para ata, pauta e vídeo. A migration `452_legislative_session_metrics.sql` calcula os agregados fora da paginação do arquivo.

**Contexto dos votos:** cada registro identifica tipo, número, ano e ementa da matéria, com acesso ao documento e à sessão. A migration `453_legislative_vote_context.sql` enriquece os dois perfis públicos sem alterar a contagem ou a escolha do voto. Quando a matéria não está no acervo, a interface informa essa limitação e mantém o link oficial quando o identificador é conhecido. As funções auxiliares não são expostas ao público.

A seção **Presenças e faltas** aparece no radar e na aba de presenças dos perfis. Mostra sessões no período, presenças registradas e ausências justificadas, com busca por vereador, barras de contagens e links para os registros. A ordem é da maior quantidade de presenças para a menor, com desempate pelo nome e dados indisponíveis ao final; as barras não representam percentual de frequência. O período acompanha os filtros da página. A interface se adapta à largura do componente, inclusive quando inserida na coluna de um perfil. A prévia mostra três vereadores no celular e seis no desktop; a busca consulta todos e a ação “Ver todos” expande a lista.

A migration `451_legislative_attendance_summary.sql` cria uma consulta pública restrita ao acervo publicado. O coletor passa a importar `sessao/justificativaausencia`, preservando somente parlamentar, sessão e escopo; motivos e anexos não são importados. Somente justificativas da sessão inteira entram na contagem. Duplicidades são eliminadas e presença/ausência conflitantes são sinalizadas para conferência. Acervos antigos sem esse recurso mostram contagem desconhecida, em vez de zero.

O SAPL informa presenças e ausências justificadas, mas não confirma faltas sem justificativa nesse relatório. Essa coluna permanece indisponível; o sistema não subtrai presenças do total de sessões. A conferência deve considerar mandatos, suplências e afastamentos antes de publicar frequência ou faltas inferidas. Fonte: [relatório oficial](https://sapl.floresta.pe.leg.br/sistema/relatorios/presenca) e [registros de justificativas](https://sapl.floresta.pe.leg.br/api/sessao/justificativaausencia/).

Para comparar as contagens de desenvolvimento com o relatório oficial, executar `node scripts/audit-legislative-attendance.mjs`. Os testes de banco cobrem deduplicação, escopo de matéria/sessão, conflito de presença, recorte de datas, cidade e ausência de cobertura nos snapshots antigos.

As telas públicas e administrativas usam a mesma estrutura `LegislativeWorkspace`, com navegação horizontal e indicação vermelha do destino atual. O conteúdo continua fluido, com margens externas entre 16 e 40 px. A preferência do cliente é uma composição mais visual, com identidade do Trombone, indicadores e gráficos em destaque; somente as colunas de texto limitam a largura de leitura.

- Radar e perfis: seis indicadores com ícones, total no vermelho da marca e cores compartilhadas com os gráficos. Títulos neutros; não usar vinho. Barras dos tipos oficiais e rosca da distribuição por grupo aparecem antes das propostas. Barras e legendas abrem as propostas correspondentes, preservando período e escopo do perfil.
- Os gráficos usam os totais agregados da consulta, sem extrapolar as propostas da primeira página. Tipos oficiais mostram até cinco categorias e informam quando existem outras; o painel opcional conserva a lista completa. Ausência de contagem não vira zero. Classificações automáticas continuam identificadas como estimativas, sem apresentar revisão como aprovação ou execução de serviços.
- Propostas e matérias: modo Leitura e lista compacta preservam as preferências anteriores. Documento original em destaque, tramitação em linha do tempo e placar com valores separados. A barra de votação só aparece quando todos os totais do placar estão disponíveis.
- Vereadores: identidade, cadastro oficial, atuação na Câmara e perfil no Trombone com ações distintas; votos e presenças mantêm abas e avisos sobre os limites dos registros.
- Sessões e bairros: datas, matérias da pauta, presenças e pedidos recorrentes com a mesma escala de títulos e controles.
- Gestão: navegação entre coleta, vereadores e revisões; coleta e conferência lado a lado a partir de 1200 px, rosca dos estados reais dos recursos, configurações em linhas e tabelas adaptadas ao celular. Revisão da matéria e correções também ocupam colunas no desktop.

Foram usadas `design-taste-frontend`, `web-design-guidelines`, `awesome-design`, `image-to-code` e `playwright-cli`, preservando o vermelho e as fontes do Trombone. A composição foi confrontada com uma referência visual de painel analítico gerada antes da implementação. Regras promocionais de landing pages não se aplicam a estes painéis. A preferência para trabalhos futuros está registrada no `AGENTS.md` do projeto e nas instruções globais do Codex.

Validação desta revisão: testes de regressão das consultas e dos gráficos, incluindo contagens ausentes e eixos vazios; seis cenários completos em Chrome, combinando 390, 1440 e 1920 px com temas claro e escuro, sem erros de execução; 12 telas conferidas com Playwright nessas três larguras (36 capturas), sem rolagem horizontal. O build completo do aplicativo passou. A prévia usa fixtures locais e não publica nem altera dados da Câmara.

Para inspecionar os componentes reais com dados de teste em outro navegador, executar `node tools/validate-legislative-ui.mjs --serve-only` e abrir o endereço local informado. `--build-only` recompila os arquivos dessa prévia sem abrir um navegador.

## Revisão anterior

Revisão de 13/11/2026, após a solicitação de simplificar o conteúdo e oferecer componentes próprios para celular e desktop.

## Conteúdo inicial

- Cabeçalho curto com cidade selecionada e navegação entre Radar, Vereadores, Propostas, Sessões e Bairros.
- Uma busca visível. Período, filtros e personalização ficam em botões e menus.
- Resumo compacto e propostas recentes ocupam o espaço principal. A grade cresce com a largura disponível.
- Tipos oficiais são opcionais e começam ocultos. Regras, conferência e detalhes da fonte ficam em **Sobre os dados**.
- A classificação continua identificada como estimativa, com fonte acessível em cada indicador. Avisos de atualização pendente, erros e limites essenciais das contagens permanecem visíveis.

## Celular

- Navegação com cinco destinos visíveis, ícones e legendas curtas.
- Filtros, período e escolha de cidade abrem em folha inferior, com conteúdo rolável e ações fixas.
- Campos com fonte de 16 px e controles principais com pelo menos 44 px para toque.
- Resumo em três colunas, passando para duas em telas menores que 360 px.
- Cartões e lista compacta têm organização própria, sem repetir a tabela desktop.

## Desktop

- Página fluida, sem limitar o contêiner inteiro. Margens externas conferidas em 1440 e 1920 px, dentro do limite de 64 px.
- Filtros e período abrem em painéis ancorados, respeitando o espaço disponível na janela.
- Cartões distribuídos em até três colunas; lista compacta distribui referência, proposta e autoria horizontalmente.
- O painel opcional de tipos oficiais usa uma coluna lateral em telas largas e se reorganiza nas menores.

## Personalização

No menu **Visualização**, o morador pode escolher:

- Cartões ou lista compacta.
- Mostrar ou ocultar o resumo, nas páginas que o possuem.
- Mostrar ou ocultar os tipos oficiais, no radar.
- Restaurar o padrão.

As preferências ficam neste navegador, separadas entre celular e desktop pelo mesmo breakpoint de 768 px usado no projeto. Não são salvos filtros, dados pessoais ou escolhas de cidade. Alterar a visualização não muda os números nem dispara novas consultas. Se o armazenamento estiver indisponível, a visualização continua funcionando durante a sessão atual.

## Leitura e navegação

Filtros são preparados localmente e aplicados em conjunto. Os filtros ativos aparecem em etiquetas removíveis; há atalhos de período e validação das datas. O texto digitado na busca só consulta o servidor ao enviar.

O período aplicado fica salvo no `localStorage` (`trombone:legislative-period:v1`) e é restaurado ao voltar ao painel ou trocar de seção. Datas explícitas na URL têm prioridade. Cancelar o seletor mantém o valor anterior; “Restaurar” volta ao período padrão após aplicar. Dados salvos inválidos e armazenamento indisponível não impedem o uso dos filtros.

Nos pedidos longos, uma abertura formal reconhecida pode ser omitida da prévia, identificada com reticências. A prévia mantém um trecho exato da ementa, inclusive negações. O detalhe conserva o texto completo; não há resumo gerado nem mudança da informação oficial.

Nos perfis, propostas, votos e presenças usam abas com navegação por teclado. Fontes, correções e as ações administrativas de criar/vincular perfil continuam acessíveis. Repetições por local mostram os dados principais e permitem expandir os pedidos e autores.

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| `LegislativeToolbar` | Busca, filtros, período, etiquetas e opções de visualização |
| `LegislativeResponsivePanel` | Folha móvel ou painel desktop, com um único conjunto de campos montado |
| `LegislativeViewMenu` / `useLegislativeView` | Preferências visuais por tamanho de tela |
| `LegislativeSummary` | Resumo compacto, fontes e identificação da estimativa |
| `LegislativeMatterList` / `LegislativeMatterCard` | Cartões e lista compacta reutilizáveis |
| `LegislativeOverview` | Organização do radar e painel opcional |
| `LegislativeActivity` | Abas de atuação nos perfis oficiais e existentes |
| `LegislativePageInfo` | Fonte, método, conferência e correções sob demanda |

Os aliases existentes `LegislativeFilters` e `LegislativeProfileContent` foram mantidos para as importações atuais. Não houve nova migração, alteração de dados, implantação de função ou publicação em produção nesta revisão visual.

## Verificação

- 31 testes unitários/de regressão, incluindo preferências independentes, armazenamento indisponível e preservação de negações nas prévias.
- Chrome com componentes reais: 390, 1440 e 1920 px, nos temas claro e escuro; também conferência de 320 px.
- Testados aplicação e remoção de filtros, período inválido/restauração, persistência por dispositivo, tipos opcionais, foco/Escape nos diálogos, fontes, correções e fluxos administrativos existentes.
- Primeira proposta presente no enquadramento inicial de celular; sem rolagem horizontal da página. Filtros fechados não deixam campos avançados ocupando o layout.
- Build completo do aplicativo validado. Imagens de teste são geradas em `.tmp/legislative-ui/` e usam fixtures, não números reais da Câmara.

Comandos:

```powershell
node tools/validate-legislative-ui.mjs
node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/legislative.test.mjs src/test/councilorAdmin.test.mjs src/test/councilorClaim.test.mjs src/test/councilorIdentityLink.test.mjs src/test/councilorShareAndStatus.test.mjs
node node_modules/vite/bin/vite.js build --outDir .tmp/legislative-app-build --emptyOutDir
```
