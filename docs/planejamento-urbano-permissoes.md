# Cargo Planejamento urbano

A migração `359_urban_planning_map_role.sql` cria o cargo por cidade e o módulo
de permissão `urban_planning` (Mapa de ruas). A permissão inicia bloqueada.
A migração `360_urban_planning_public_official.sql` acrescenta a exigência
do tipo de usuário **Órgão Público**.
A migração `361_master_street_map_access.sql` concede a exceção de **master**:
acesso a ruas, pavimentação, traçados, contornos, anexos e referências de todas
as cidades, sem exigir tipo Órgão Público, cargo ou permissão explícita.

Para conceder acesso:

1. Em **Admin → Gerenciar usuários → Editar**, selecione o tipo **Órgão Público**,
   marque **Atribuir cargo de gestão
   do mapa**, adicione as cidades autorizadas e salve.
2. Com uma conta master, abra **Admin → Permissões**. Libere **Mapa de ruas**
   para o cargo **Planejamento urbano** ou crie uma liberação individual.
3. O usuário acessa o mapa público de ruas da cidade ou `/pavimentacao/gerenciar`.

Tipo **Órgão Público**, cargo e permissão são necessários para as demais contas,
inclusive admin. Reverter o tipo para Cidadão bloqueia imediatamente a escrita
no banco, mesmo que existam concessões de cargo e permissão antigas, exceto para master.
Uma regra individual prevalece sobre a regra do cargo, mas não concede o cargo
nem acrescenta cidades. Remover uma cidade revoga a escrita nela no banco das contas
que não são master. Remover o status master revoga a exceção no banco imediatamente.

O controle cobre criação, edição e exclusão de ruas, traçados, contornos de
bairros, anexos das ruas e PDFs de referência. As páginas públicas continuam
consultáveis. Funcionários da prefeitura e embaixadores precisam receber o
cargo; nenhum vínculo anterior é convertido automaticamente.

As policies restritivas também limitam eventuais policies antigas permissivas.
A atualização de referências usa uma função com verificação de cidade, sem
conceder alteração geral do cadastro de cidades.

Aplique as migrações 359, 360 e 361 antes de publicar o frontend.

Ao salvar um cargo ou uma permissão, o app revalida o acesso nas abas abertas.
Também revalida ao voltar à janela, sem descartar rascunhos de edição do mapa.
