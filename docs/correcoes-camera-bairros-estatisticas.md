# Câmera, bairros e estatísticas

As barras de categorias contam apenas broncas públicas aprovadas com status
`pending`. Broncas resolvidas, em andamento, aguardando confirmação, duplicadas
ou rejeitadas ficam fora dessas barras. O PDF continua indicando explicitamente
as broncas abertas (`pending` e `in-progress`).

O cadastro de bairros da cidade padroniza nomes sem acento e variações de DNER.
O bairro de um marcador não pode vir de uma consulta anterior nem da consulta
municipal em zoom 10. Associações pelo endereço exigem um bairro explícito e
único; mencionar dois bairros exige revisão.

Nos postes, o endereço atual corrigido pode fornecer o bairro. O campo
`source_address` do KMZ representa setores antigos e não substitui esse
endereço. Correções existentes nos metadados municipais são preservadas.
O preenchimento salva `raw_properties.neighborhood` e `neighborhood_source`,
mantendo os demais dados técnicos. Uma alteração do marcador invalida o bairro
automático anterior.

## Aplicação no ambiente escolhido

As alterações de banco estão nas migrações `344_report_neighborhood_association.sql`
e `345_pole_neighborhood_association.sql`. A primeira recupera associações
inequívocas de broncas antigas e atende clientes antigos por gatilho. A segunda
recupera os bairros dos postes por endereço atual ou broncas vinculadas da mesma
cidade, quando há apenas um bairro possível. Os gatilhos continuam funcionando
em cadastros novos e edições.

As funções a publicar junto com o frontend são `reverse-geocode`,
`create-anonymous-report` e `generate-street-history`.

Depois das migrações, é possível consultar pelas coordenadas os bairros ainda
ausentes. Os comandos abaixo geram prévias em `.tmp`, sem gravar no Supabase:

```powershell
npm run reports:neighborhoods -- --city-id 64 --geocode
npm run poles:neighborhoods -- --city-id 64 --geocode
```

O ID 64 é o de Floresta no ambiente de desenvolvimento consultado; confirme o
ID no ambiente de destino. Para gravar os resultados revisados, acrescente
`--apply`. Os scripts conferem o projeto vinculado e preservam um snapshot
anterior. A gravação protege contra mudanças concorrentes no marcador,
endereço e metadados. Bairros desconhecidos ou compostos ficam para revisão.

Prévia sem geocodificação feita em 05/10/2026 no projeto de desenvolvimento:
2.262 postes, 1.290 associações recuperáveis e 972 ainda não identificadas.
Nenhuma associação remota foi alterada durante essa prévia.

## Câmera e Gemini

A câmera web oferece zoom pelo hardware quando disponível e zoom digital
centralizado de até 4× para fotos nos demais casos. Prévia e foto usam o mesmo
recorte. A iluminação usa `torch` quando a câmera/navegador expõe esse controle;
nos demais casos, o formulário oferece a câmera do aparelho. O flash precisa
ser validado também em um celular real.

`PROHIBITED_CONTENT` é um bloqueio retornado pelo Gemini. Ele não informa, por
si só, qual trecho dos PDFs provocou a classificação. A função retorna um
erro específico, mantém os textos existentes e registra o motivo do provedor.
Respostas bloqueadas, truncadas ou incompletas não viram rascunhos válidos.
Os filtros de segurança permanecem ativos.

## Verificação

Os testes cobrem contagem de pendentes, bairro do marcador, respostas fora de
ordem, nomes canônicos, vínculos de postes, recorte do zoom e erros da IA.
`node tools/validate-report-neighborhoods-db.mjs` aplica as duas migrações
em PostgreSQL local descartável, incluindo casos ambíguos, cidade diferente,
preservação de dados e reexecução das migrações.
