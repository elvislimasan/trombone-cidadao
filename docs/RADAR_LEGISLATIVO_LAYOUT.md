# Radar legislativo — layout público

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
