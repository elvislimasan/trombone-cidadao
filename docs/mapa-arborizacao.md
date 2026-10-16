# Mapa de arborização urbana

O inventário público fica em `/mapa-arborizacao`, acessível por Explorar e incluído na configuração padrão de menu e rodapé. Menus personalizados existentes mantêm suas escolhas; o acesso por Explorar está sempre disponível. O gerenciamento fica em `/arborizacao/gerenciar` e `/admin/arborizacao`; gestores também podem cadastrar e editar diretamente no mapa público.

O módulo usa o seletor local de cidades, sem alterar a cidade do perfil. Mapa, lista paginada, indicadores e CSV compartilham os mesmos filtros de espécie/endereço, situação, origem, bairro e manejo. Os indicadores refletem o inventário cadastrado, sem estimar cobertura vegetal da cidade. Árvores removidas permanecem no histórico e podem indicar reposição pendente.

Os detalhes completos e as ações da árvore aparecem em um modal central, seguindo o padrão de “Poste selecionado” do mapa de iluminação da prefeitura: identificação com ícone, selo de situação, endereço, informações com ícones e ações no rodapé. Funciona também sobre o mapa em tela cheia. “Ver detalhes” na lista abre o mapa com esse modal selecionado. A consulta pública mantém os detalhes visíveis e oculta ações de gerenciamento.

## Banco e acesso

Aplicar a migração `supabase/migrations/362_city_arborization.sql` depois das migrações 359–361. Ela cria `city_trees`, índices, atualização automática de data e policies RLS. Não há dados fictícios ou cadastro automático.

A consulta é pública. A escrita compartilha a permissão **Planejamento urbano (ruas e arborização)**: master tem acesso global; demais contas precisam ser Órgão Público, ter cargo de Planejamento Urbano na cidade e permissão explícita do módulo `urban_planning`. As policies verificam a cidade anterior e a nova durante atualizações, impedindo transferências indevidas. Um administrador sem essa concessão continua sem poder editar o inventário.

Campos: identificação popular, nome científico, origem, situação, endereço, bairro, coordenadas obrigatórias, altura, diâmetro da copa, data do plantio, manejo pendente, prazo e observações públicas. O formulário aceita ponto no mapa, arraste do marcador, coordenadas manuais e GPS. Exclusão exige confirmação; para árvores retiradas, prefira a situação “Removida”.

Endereço e bairro ficam abaixo do mapa e são sugeridos pela função compartilhada de geocodificação reversa ao mudar a localização. Consultas atrasadas são descartadas e correções manuais são preservadas. Abrir uma árvore existente não substitui seu endereço salvo. Se a consulta falhar ou não identificar um dos campos, o gestor pode completá-los manualmente.

O layout usa `.page-shell-fluid`, com colunas internas e mapa que cresce com a viewport, respeitando gutters máximos de 64 px. A consulta pagina o banco para evitar truncamento em mil registros. A exportação CSV funciona no navegador e usa o compartilhamento de documentos existente no aplicativo nativo.

## Verificação

`node --import ./tools/test-alias.mjs --test src/test/arborization.test.mjs` cobre validação, filtros combinados, indicadores, CSV e paginação do banco. `node tools/validate-arborization-ui.mjs` verifica os componentes reais com dados locais em 390, 1440 e 1920 px e exercita cadastro, edição, exclusão, filtros, tela cheia e permissões sem acessar dados reais.

No Windows com PostgreSQL 17 instalado, `./tools/validate-arborization-db.ps1` inicia um cluster local descartável, executa `supabase/tests/arborization.sql` e encerra o servidor. O teste valida CRUD, leitura anônima, restrições por cidade, bloqueio de administrador sem concessão, exceção master e revogação. Não usa credenciais ou dados do Supabase remoto.
