# Árvores da comunidade

O cidadão cadastra uma árvore com foto e localização, acompanha a análise e registra cuidados com fotos. A publicação exige aprovação da equipe municipal e a opção de perfil público do autor. A espécie é opcional. Cadastros devolvidos podem ser corrigidos e reenviados.

As árvores ficam na galeria da comunidade; não são inseridas automaticamente no inventário técnico municipal. O endereço e o ponto são privados por padrão. O autor pode autorizar sua exibição, tornar o perfil privado e escolher a visibilidade de cada cuidado. Registros públicos posteriores à aprovação não exigem outra aprovação, mas podem ser denunciados e ocultados pela equipe.

## Acessos

- `/arvores-da-comunidade`: galeria pública e aba Minhas árvores.
- `/arvores-da-comunidade/nova`: cadastro em três etapas, com login.
- `/arvores-da-comunidade/:id`: perfil e histórico; pendentes e privados exigem autoria ou acesso municipal.
- `/arvores-da-comunidade/:id/editar`: correção de cadastro devolvido ao autor.
- `/prefeitura/adote-uma-arvore/comunidade`: revisão de cadastros e denúncias, limitada à cidade e às permissões já usadas no atendimento de arborização.

## Ativação

Aplicar, seguindo o histórico do projeto, `400_tree_adoption_notifications.sql` e `401_community_trees.sql` no Supabase do ambiente escolhido e publicar a aplicação atualizada. A migration 401 cria as tabelas, funções, políticas e o bucket privado das fotos. Não é necessário criar o bucket manualmente.

As novas notificações usam a tabela `notifications` e o webhook de push já existente no projeto. Os tipos `tree_adoption_update` e `community_tree_update` respeitam as preferências do cidadão. A entrega em aparelhos depende da configuração de push e dos tokens desse ambiente.

Fotos são recodificadas antes do upload para remover EXIF, inclusive GPS. As URLs de leitura expiram em cinco minutos. Tornar um perfil privado ou ocultar um cuidado bloqueia novas leituras e novas URLs; uma URL já emitida pode continuar válida até expirar.

Cadastro e cuidados oferecem **Tirar foto** e **Galeria**. A captura reutiliza o fluxo nativo de Android/iOS e a câmera web das broncas. Cancelar mantém a foto anterior e os campos preenchidos. Caminhos nativos são exibidos como prévia e lidos para upload somente no envio.

O cartão PNG usa apenas fotos de cuidados públicos e não moderados, omite endereço e dados pessoais e inclui o QR Code do perfil. O link usa a origem pública também no aplicativo nativo. O compartilhamento ocorre quando o usuário aciona o botão do sistema ou baixa a imagem.

## Verificação local

Os testes SQL precisam de banco vazio e descartável. O comando abaixo cria e encerra um PostgreSQL local isolado; não aplica alterações no ambiente conectado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/community_trees.sql
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/tree_adoption_notifications.sql
node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/communityTrees.test.mjs src/test/communityTreesHooks.test.mjs
node tools/validate-community-trees-ui.mjs
npx vite build
```

A verificação visual usa componentes reais, Chrome com câmera simulada e APIs simuladas, sem consultar `.env`, produção ou a câmera física. Confere 1440 px, 1920 px e 390 px, incluindo captura, cancelamento e retorno ao formulário, cadastro, recuperação de erro, privacidade, cuidado, aprovação, denúncias e exportação PNG. Capturas ficam em `.tmp/community-trees-ui`. A execução física dos plugins em Android/iOS precisa ser conferida nos aparelhos.

Lembretes e marcos de acompanhamento ficam para uma próxima evolução.
