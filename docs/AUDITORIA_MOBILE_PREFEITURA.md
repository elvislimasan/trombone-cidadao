# Auditoria mobile da prefeitura

Atualização: 06/11/2026. Inventário baseado nas rotas de `src/App.jsx`. Os testes abaixo usam Chrome e serviços simulados. Uma rota inventariada não significa uma jornada homologada em aparelho ou com o servidor real.

## Cobertura por família

Todos os caminhos desta tabela começam com `/prefeitura/`. “Pendente” identifica uma verificação que ainda precisa ser feita, mesmo quando a tela já tem componentes mobile.

| Rotas / família | Verificação disponível | Resultado e trabalho restante |
| --- | --- | --- |
| `visao-geral` | Navegador: administrador, gestor, atendente, consulta e acesso a inventário; navegação e resumos | Entradas por responsabilidade e indicadores recolhidos no celular. Validar dados e permissões no ambiente integrado. |
| `broncas`, `mapa`, `broncas/:reportId` | Lista, filtros e navegação no recorte de jornadas; geração de ordem e exportação com diálogos reais no recorte de formulários | Topo simplificado. Detalhe completo da bronca e entrada direta pelo ID ainda precisam de auditoria própria; os validadores de jornadas substituem esse detalhe por um componente simulado. |
| `demandas`, `demandas/nova`, `demandas/:id` | Lista, criação/edição em modal, foco, Escape, ações fixas, fonte ampliada; mapa real da etapa Local | Modal no padrão de broncas. Busca fora do mapa; cidade institucional com UF; postes somente na área aproximada, a partir do zoom 17. Seleção por busca continua funcionando. Verificar envio, anexos e conflitos no backend. |
| `iluminacao`, `iluminacao/estatisticas` | Navegador: resumos, busca, controles do mapa, menus; cadastro de poste e alteração em massa em modal | Mapa acessível sem empilhar os indicadores na entrada. Cadastro/edição usam o mesmo componente; edição de um poste existente com todos os dados reais e execução de pendências ainda requerem teste integrado. |
| `equipe` | Criar acesso, vincular e editar conta com diálogos reais; busca e filtros | Ações persistentes no modal, com regras de cargo preservadas. Fluxo de acesso temporário tem recorte próprio. Conferir entrega de credenciais/convites no ambiente integrado. |
| `secretarias` | Cadastro/edição com diálogos reais, busca e filtros | Modal de tarefa e formulário com rolagem própria. Conferir vínculos e mudanças de acesso no servidor. |
| `configuracoes` | Leitura das regras e edição em modal real | Ajuda recolhida no celular; salvamento permanece no contrato atual. Validar alterações reais de regras e concorrência. |
| `adote-uma-arvore`, `adote-uma-arvore/solicitacoes` | Detalhes reais para cidadão, gestor e atendente, inclusive encerrados/retirada, histórico longo, toque, foco e falha/reenvio | Corrigido o bloqueio de rolagem causado por CSS compartilhado indevidamente com o cadastro. Atender solicitação aparece antes do resumo para a equipe. Confirmar atualização real e notificações no ambiente integrado. |
| `adote-uma-arvore/viveiros` | Cadastro/edição de viveiro, horários e oferta de espécies em modais reais | Cabeçalho e ações fixos, campos com rolagem. Validação inclui falha e nova tentativa com dados preservados. Conferir catálogo e gravações reais. |
| `adote-uma-arvore/comunidade` | Revisão real de cadastro e denúncia de cuidado em 390, 1440 e 1920 px; erro e nova tentativa | Moderação verificada isoladamente. Cadastro público, câmera, privacidade, compartilhamento e diário não foram revalidados pelo recorte `--review-only`. |
| `gestao-territorial/:module?/:section?` | Navegação e autorização visual da entrada; inventário de árvores com formulário real, lote, mapa, erros, descarte e colunas desktop | Formulário de árvores já é modal. Progresso e manejo ainda têm apresentação própria; a consolidação visual com o progresso comum permanece aberta. Módulo de ruas/pavimentação e suas seções precisam de recorte completo de navegador. |
| `executor`, `executor/:activity` | Navegação e entrada por atividade para arborização, ruas e serviços gerais | Busca, etapas e contexto revisados. A raiz escolhe as atividades permitidas; validar contas com múltiplas atribuições reais. |
| `executor/:activity/ordem/:id`, `executor/:activity/estatisticas`, `executor/:activity/perfil` | Rotas inventariadas; navegação operacional no recorte municipal | Falta auditoria completa de execução, anexos, confirmação, estatísticas e edição de perfil. Não considerar esses formulários migrados pela mudança dos modais administrativos. |
| `eletricista`, `eletricista/hoje` | Busca, paginação e mudança de etapa em 390, 1440 e 1920 px; `hoje` redireciona para a raiz | Entrada refinada. Preparação offline está em alteração independente no workspace; esta auditoria não certifica esse trabalho. |
| `eletricista/estatisticas`, `eletricista/estatisticas/geral`, `eletricista/ordem/:id`, `eletricista/perfil` | Rotas e composição consultadas; estatística geral reutiliza a página de iluminação | Registro de atendimento ainda usa folha inferior própria; edição do perfil permanece embutida. Auditar execução/câmera/retorno e aplicar o padrão de tarefa preservando dados de campo. |
| `eletricista/patrulha`, `eletricista/patrulha/ativa`, `eletricista/patrulhas` | Rotas e composição consultadas | Jornadas dedicadas de campo. Falta validar GPS, visita ao poste, saída, histórico e sincronização em aparelho; não envolver a patrulha inteira em um modal de cadastro. |
| `acesso`, `convite/:token`, `convite/:token/cadastro` | Rotas e formulários de autenticação inventariados | Jornadas dedicadas fora do shell municipal. Falta teste completo de convite válido/expirado, cadastro, teclado e retorno. Não foram convertidas em modais de CRUD. |

O formulário público `/adoteumaarvore` também foi verificado: quatro etapas, rascunho, erros, nova tentativa, saída e retorno de foco. Ele usa a mesma geometria de tarefa, preservando as regras próprias do pedido.

## Evidências e repetição

| Recorte | Resultado local | Comando |
| --- | --- | --- |
| Formulários municipais | 78 combinações: 13 formulários × 390/1440/1920 px × claro/escuro | `node tools/validate-municipal-responsibilities-ui.mjs --form-audit` |
| Local da ordem | 20 combinações; ordem nova/edição, cidade/UF, abertura na cidade mesmo com coordenadas salvas, controles, busca e postes por área | `node tools/validate-municipal-responsibilities-ui.mjs --form-audit --location-map` |
| Detalhe de adoção | 60 combinações: papéis/estados, retrato/paisagem e dois temas | `node tools/validate-tree-adoption-ui.mjs --details-audit` |
| Pedido público em modal | 10 combinações, etapas, rascunho e recuperação | `node tools/validate-tree-adoption-ui.mjs --consistent-forms` |
| Viveiros | 32 combinações de cadastro/edição/horários/espécies | `node tools/validate-tree-adoption-ui.mjs --nursery-audit` |
| Moderação de árvores da comunidade | 3 larguras: 390/1440/1920 px | `node tools/validate-community-trees-ui.mjs --review-only` |
| Inventário de árvores | 320/390/430/767 px, desktop 1440/1920 px e consulta pública | `node tools/validate-tree-inventory-ui.mjs --mobile-flow` |

Capturas em `.tmp/municipal-responsibilities-ui`, `.tmp/tree-adoption-ui`, `.tmp/community-trees-ui` e `.tmp/tree-inventory-validation`. Os mapas desse ambiente têm tiles desativados; a base cartográfica externa não é certificada por capturas de fundo cinza. O teste da etapa Local usa Leaflet real e verifica posição, zoom, marcadores e controles.

Os validadores de inventário foram atualizados para os rótulos e o progresso atuais, preservando as verificações de comportamento. O modo padrão antigo de comunidade ainda contém seletores anteriores à evolução pública; usar `--review-only` para reproduzir a evidência municipal desta entrega.

## Fechamento da auditoria

Ainda são necessários testes integrados de autorização/envio e homologação Android/iOS: teclado, câmera, gestos, safe areas, retorno de segundo plano e recuperação após encerramento. As pendências específicas estão na tabela para evitar tratar um teste de navegação como comprovação de um formulário ou atendimento completo. Não houve migração, publicação ou mudança de permissões nesta revisão.
