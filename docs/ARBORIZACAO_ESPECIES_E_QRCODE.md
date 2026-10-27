# Espécies, filtros e identificação das árvores

Aplicar a migração `supabase/migrations/390_tree_species_details.sql` após a 389. Ela libera os campos de espécies para quem já tem permissão de Arborização na cidade, sincroniza nomes nas árvores vinculadas e cria a cota de IA.

Publicar a Edge Function:

```sh
npx supabase functions deploy generate-tree-species-summary
```

Configurar `GEMINI_API_KEY` nos segredos do Supabase. A função reutiliza `GEMINI_MODEL`, quando presente, ou `gemini-2.5-flash-lite`. É possível definir `TREE_SPECIES_GEMINI_MODEL` para escolher um modelo somente para espécies. As chaves permanecem no servidor. Cada usuário autorizado pode solicitar até 30 gerações por dia (America/Fortaleza); tentativas que chegam ao provedor também consomem a cota.

Em **Editar espécie**, alterar o nome principal, nomes regionais (separados por ponto e vírgula ou linha), resumo e orientação de plantio. A sugestão de IA substitui apenas os textos de resumo, orientação e indicação de calçada e precisa ser revisada antes de salvar. Nomes regionais participam da busca do catálogo e do inventário.

Combinar **Situação → Árvores vivas** e **Bairro → Sem bairro identificado** para localizar cadastros a completar. Em **Editar → Endereço e bairro**, usar **Buscar bairro pelo ponto** para consultar a localização já marcada, sem mover a árvore. A busca seleciona um bairro do catálogo da cidade e preserva a referência existente; complete ou ajuste manualmente quando não houver correspondência. A alteração só é gravada ao salvar a árvore.

O cadastro em sequência mostra árvores existentes como círculos azuis de 24 px, com ✓ e contornos branco e escuro para manter a visibilidade sobre imagens de satélite. Novos pontos permanecem verdes, com +. O sistema avisa ao marcar um ponto a até 3 metros de uma árvore viva. O aviso permite continuar, pois árvores próximas podem ser distintas; não é um bloqueio de duplicidade.

Os indicadores seguem os filtros aplicados. A espécie mais plantada considera árvores vivas identificadas; o bairro menos arborizado usa a menor quantidade cadastrada de árvores vivas, incluindo bairros com zero registros (não é uma medida de cobertura vegetal ou densidade). O plantio no ano usa `planted_at`, sem inferir pela data de cadastro.

Em detalhes da árvore, o bloco **QR Code da árvore**, logo abaixo das ações de edição e serviço, oferece **Baixar PDF** tanto no celular quanto no desktop. O arquivo é uma placa A5 com cabeçalho verde, código da árvore em destaque, nome popular e científico (quando informado), cidade, bairro e QR Code grande para a URL pública estável pelo ID. O texto ajusta o tamanho para caber nos espaços definidos. O QR Code é preto sobre branco, com margem de leitura preservada. A geração funciona localmente, sem enviar dados a um serviço externo de QR Code. No aplicativo móvel, o PDF abre no visualizador com opções de salvar e compartilhar; na web, o download começa sem mensagem de confirmação. O endereço público segue `VITE_APP_URL` e a configuração existente de compartilhamento.

Validação local: `npm test`, `node tools/validate-tree-inventory-ui.mjs --improvements` e `powershell -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/tree_species_details.sql`.

## Fluxo no celular

Em telas com menos de 768 px, o cadastro e a edição usam três etapas:

1. **Localização:** marcar a árvore com toque ou GPS. Endereço e bairro ficam em um painel expansível para conferência manual. No cadastro em sequência, marcar todos os pontos antes de continuar.
2. **Identificação:** escolher espécie e situação, incluir foto opcional e preencher os dados complementares, se conhecidos.
3. **Revisão:** conferir localização, quantidade de árvores e identificação antes de salvar. Os botões “Alterar” retornam à etapa correspondente sem perder os dados.

As ações permanecem no rodapé, com espaço para a área segura do aparelho. Voltar preserva os pontos, a área e o zoom do mapa. Se ocorrer erro ao salvar, o rascunho continua disponível. Após salvar um lote, o fluxo retorna ao mapa para cadastrar o próximo.

Ao tocar em uma árvore no mapa, abre-se um painel inferior com identificação, acesso à edição e à página da árvore. “Ver mais informações” expande os dados de manejo e cadastro. No desktop, o cadastro mantém mapa e formulário lado a lado.

Validação desse fluxo: `node tools/validate-tree-inventory-ui.mjs --mobile-flow`, com telas de 320, 390, 430, 767, 1440 e 1920 px. Os dados das verificações visuais são simulados, sem gravações em produção.

Na página da árvore, o celular usa uma sequência contínua de **Resumo**, **Localização** e **Histórico**, sem abas. As ações são discretas, sem preenchimento vermelho; o verde destaca a arborização. O resumo destaca bairro, medidas e manejo com divisórias leves; os demais campos ficam em **Todos os dados do cadastro**, aberto por padrão também no celular, com opção de recolher. A ausência de foto ocupa um bloco compacto, com atalho para adicioná-la na etapa de identificação. O QR Code tem um bloco próprio com botão **Baixar PDF**, visível no início da página. **Histórico e cuidados** é expansível e abre ao registrar um serviço. O mapa mantém o enquadramento ao expandir informações. O conteúdo inclui espaço inferior para a navegação fixa do aplicativo. Validação: `node tools/validate-tree-inventory-ui.mjs --mobile-profile`.
