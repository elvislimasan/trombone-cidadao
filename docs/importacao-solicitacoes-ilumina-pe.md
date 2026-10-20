# Solicitações do projeto Ilumina PE

O importador transforma a planilha PDF de 20 colunas em solicitações municipais internas de iluminação, com tipo de problema `other` (Outro). A descrição indica diretamente a troca de lâmpada de vapor de sódio por luminária LED, com quantidades, potências e referência aos itens da planilha. Os dados completos do PDF ficam no JSON extraído; o plano registra os vínculos e as pendências. Não altera o cadastro dos postes.

Extraia o PDF com Python e PyMuPDF:

```powershell
python scripts/extract-lighting-service-pdf.py "C:\caminho\planilha.pdf" .tmp/ilumina-linhas.json
```

Prepare a prévia no projeto vinculado em `supabase/.temp/project-ref`, usando as credenciais de desenvolvimento do `.env`:

```powershell
node scripts/import-lighting-service-requests.mjs --city-id 64 --input .tmp/ilumina-linhas.json --output .tmp/ilumina-plano.json
```

Confira `requests` e `pending` no plano antes de aplicar. O vínculo usa somente postes aprovados, não removidos e da cidade escolhida:

- Barramento único em `identifier` ou `plate`: usa o código, removendo o prefixo sequencial do identificador. Diferenças de coordenadas acima do raio aparecem como aviso na solicitação.
- Barramento repetido: usa as coordenadas para distinguir os postes com aquele código.
- Barramento ausente ou não encontrado: procura pelas coordenadas.
- Correspondência por coordenadas: aceita distância de até 20 metros, com pelo menos 3 metros de diferença para o segundo candidato. `--radius` permite ajustar o raio até 30 metros.
- Linhas vinculadas ao mesmo poste são consolidadas quando suas coordenadas ficam a até 10 metros umas das outras. Quando pontos distintos disputam o mesmo poste, um vínculo por código único tem precedência. Na ausência desse vínculo, aproveita somente o ponto sem barramento divergente a até 10 metros do poste, desde que seja pelo menos 3 metros mais próximo do que os demais pontos concorrentes. Os outros pontos continuam pendentes.

Para aplicar, forneça `MUNICIPAL_REPORT_ACCESS_TOKEN` por variável de ambiente, usando uma sessão autenticada do autor municipal. O usuário precisa ser membro ativo da prefeitura e as regras do banco continuam validando a permissão de cadastro. Não grave a sessão em arquivos nem no plano.

```powershell
node scripts/import-lighting-service-requests.mjs --city-id 64 --input .tmp/ilumina-linhas.json --output .tmp/ilumina-importacao.json --apply
```

Os UUIDs são determinados pelo conteúdo extraído, cidade, prefeitura e poste. Repetir a mesma importação reaproveita os registros existentes sem sobrescrever atendimento, descrição ou status. O plano registra cada inserção para permitir conferência e retomada após uma interrupção. O protocolo final é atribuído pelo banco.

As pendências precisam ser conferidas com o cadastro ou em campo. Não aumente o raio apenas para atingir o número de linhas do PDF: pontos diferentes podem representar postes ainda ausentes do cadastro.

Validação local:

```powershell
node --test --test-isolation=none src/test/lightingServiceRequests.test.mjs
node node_modules/eslint/bin/eslint.js --no-ignore scripts/lib/lightingServiceRequests.mjs scripts/import-lighting-service-requests.mjs src/test/lightingServiceRequests.test.mjs --max-warnings 0
```
