# Importação revisada do Ilumina PE em Floresta

Use `npm run import:ilumina` para reproduzir a revisão, inclusive em produção.
O comando usa os dados versionados, sem depender de `.tmp`, dos anexos do chat
ou dos IDs e protocolos do desenvolvimento.

## Estado conferido em 21/10/2026

- 420 itens no PDF validado; a extração inclui as correções de células mescladas.
- 395 solicitações internas, do tipo `other`, cobrindo 405 itens.
- 4 itens excluídos por inexistência física confirmada pelo usuário: **77, 79, 151 e 350**.
- 11 itens ainda sem vínculo confirmado: **13, 39, 43, 76, 118, 228, 291, 345, 365, 366 e 409**.

Os arquivos em `scripts/data/ilumina-pe-floresta-2026.*.json` preservam os
vínculos conferidos por código e posição, as exclusões e as pendências.
O resumo não considera os quatro pontos inexistentes como serviços executados.

A revisão reproduz 16 cadastros de postes, se ainda faltarem no destino, e
3 correções do inventário: número/plaqueta de `X059038`, posição/plaqueta de
`S230912` e remoção do registro `48 - FLY` do mapa ativo. Também preserva as
coordenadas ajustadas de `ILUMINA-PE-078` e os cadastros `ILUMINA-PE-124` e
`Z224906`. Identificadores `ILUMINA-PE-NNN` são locais; não são barramentos
confirmados da concessionária.

Os vínculos incluem o item **85 → X076778**. A revisão de candidatos utilizou
os vínculos existentes para separar o único poste disponível a até 20 m;
casos com mais de um candidato disponível continuam pendentes.

## Execução no ambiente de destino

1. Configure as credenciais do ambiente de destino e vincule o mesmo projeto
   no Supabase CLI. O importador recusa divergência entre o `.env`/ambiente e o
   projeto vinculado. Desenvolvimento: `xxdletrjyjajtrmhwzev`;
   produção: `mrejgpcxaevooofyenzq`.
2. Confira as migrações do destino. A migração **367** permite que o eletricista
   visualize e aceite solicitações internas, mantendo sua privacidade.
3. Gere o plano sem gravar dados:

   ```powershell
   npm run import:ilumina -- --output .tmp/ilumina-destino-plano.json
   ```

4. Confira `project`, `summary`, `inventoryChanges`, `pending` e `excluded`.
   Postes novos são representados com IDs negativos somente na simulação.
5. Para aplicar, defina `MUNICIPAL_REPORT_ACCESS_TOKEN` com a sessão válida do
   autor municipal autorizado e execute:

   ```powershell
   npm run import:ilumina -- --output .tmp/ilumina-destino-resultado.json --apply
   ```

O plano utiliza a chave de serviço somente na consulta sem aplicação. A
aplicação usa a sessão municipal com a chave pública do destino, registra a
autoria e aplica primeiro as correções do inventário pelas RPCs municipais.
Coordenadas, códigos duplicados ou alterações incompatíveis com a revisão
interrompem a operação para conferência.

As solicitações são gravadas como `is_public=false`,
`moderation_status=internal`, `issue_type=other`, com descrição da troca de
vapor de sódio para LED conforme as quantidades e potências do PDF. LED é o
serviço solicitado; não é registrado como já instalado durante a importação.

Reexecutar recupera cadastros e solicitações já existentes. O importador não
usa `upsert`, não reinicia ordens em atendimento e não substitui uma lâmpada
LED já instalada por uma lâmpada de sódio. O arquivo de resultado é salvo a
cada etapa e permite retomar uma execução interrompida.

## Validação

```powershell
node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/lightingServiceRequests.test.mjs src/test/lightingServiceReview.test.mjs
```

Os testes incluem uma simulação de produção com IDs diferentes, reaplicação,
exclusões, referências duplicadas, alterações posteriores e solicitações privadas.
