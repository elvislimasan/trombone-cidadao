# Auditoria das páginas rastreadas, mas não indexadas

Atualização de 12 de outubro de 2026: [nova auditoria das 83 URLs](auditoria-rastreadas-nao-indexadas-2026-10-12.md). As verificações atuais confirmam a correção dos desvios do Googlebot em produção e acrescentam três páginas públicas ao sitemap local, que passa a 113 URLs. Os resultados abaixo preservam a fotografia de 7 de outubro.

Fonte: `Tabela.csv` exportado pelo usuário do Search Console em 7 de outubro de 2026. O arquivo contém 89 URLs, com último rastreamento entre 4 de março e 5 de outubro de 2026. A exportação informa o status e a data, não a razão exata da decisão de indexação de cada página.

## Distribuição

| Tipo | URLs |
| --- | ---: |
| Categorias do guia | 43 |
| Broncas | 16 |
| Locais do guia | 9 |
| Notícias | 9 |
| Petições | 3 |
| Links de compartilhamento | 3 |
| Entrada do guia, com e sem `cidade=todas` | 2 |
| Perfis públicos | 2 |
| Obra pública | 1 |
| Estatísticas | 1 |
| Total | 89 |

Há duas URLs com `www` e 44 URLs com query. Aliases de compartilhamento, variantes de domínio e entradas gerais equivalentes não precisam ser indexados separadamente da página canônica.

## Verificações realizadas

Consultas à API pública de produção com a mesma chave anônima usada pelo navegador, sem alterar registros:

- As 43 categorias existem e estão ativas. **34 não têm nenhum local aprovado**, seis têm um local e três têm mais de um. A contagem considera associação direta, múltiplas categorias e filhos diretos da categoria.
- Os nove locais existem e têm status `approved`. Um não tem descrição cadastrada; os demais têm descrições. Isso não mede todos os demais campos ou mídias da página.
- As 16 broncas estão visíveis publicamente e aprovadas na moderação. Uma tem status `duplicate`: `efd94f2f-6081-4ecc-9c5a-946b166e1a2e`. Treze não têm descrição textual; fotos, endereço e histórico podem fornecer conteúdo útil, por isso não foram excluídas apenas pela descrição vazia.
- As nove notícias existem. As descrições têm de 84 a 256 caracteres. Algumas usam a mesma frase como subtítulo e descrição. Isso é um sinal para revisar a apresentação do conteúdo, sem demonstrar que o Google recusou essas URLs por essa razão; vídeos, galerias e referências não foram medidos nessa contagem.
- As três petições existem e estão abertas.
- Os dois perfis estão habilitados para visualização pública.
- A obra `db4c64e4-af1b-49f6-875d-906882df2f6a` existe e tem descrição de 1.339 caracteres.

O JSON [auditoria-rastreadas-nao-indexadas-2026-10-07.json](auditoria-rastreadas-nao-indexadas-2026-10-07.json) registra as 89 URLs, dados públicos verificados e amostras HTTP. Não contém credenciais nem dados de contato.

## Problemas técnicos confirmados

Nas amostras HTTP feitas com User-Agent Googlebot, sem seguir redirecionamentos, as páginas de categoria, local, bronca, perfil, petição e entrada do guia ainda respondem HTTP 302 para prévias no Supabase. As prévias são documentos de compartilhamento com metadados, link e redirecionamento; não apresentam o conteúdo completo das páginas. A remoção dos buscadores dessas regras, já preparada em `.htaccess`, continua necessária em produção.

As amostras de notícia e obra respondem HTTP 200 com título genérico, sem canônica no HTML inicial e com `<div id="root"></div>`. Isso **não prova falha de renderização pelo Google**: o aplicativo depende de JavaScript e de consultas públicas para mostrar o conteúdo. Para avaliar essa etapa, usar a inspeção de URL do Search Console e conferir o HTML renderizado e a captura de tela da versão publicada.

As consultas HTTP ignoraram a validação TLS somente no cliente de diagnóstico, devido ao erro de certificado registrado na primeira auditoria. As consultas à API pública usaram validação TLS normal.

## Alterações locais desta etapa

- Categorias sem locais recebem `noindex` somente depois de uma consulta bem sucedida. A regra não ativa `noindex` durante carregamento ou erro da API. Assim que uma categoria tiver conteúdo aprovado, o aplicativo deixa de declarar essa exclusão.
- As descrições do guia passam a citar a categoria, cidade, quantidade de locais e nomes dos primeiros locais presentes na página. A canônica mantém uma cidade específica quando essa seleção muda o conteúdo e consolida a entrada geral de todas as cidades.
- Notícias passam a declarar canônica e `og:url`; metadescrições removem HTML e usam o texto cadastrado.
- A tela atual de detalhe de obra passa a declarar título próprio, descrição, canônica e metadados Open Graph.
- O sitemap principal passa de 11 para **59 URLs**: as 11 entradas existentes mais 48 páginas públicas confirmadas nesta auditoria. Foram acrescentadas nove categorias com locais, 15 broncas, nove locais, nove notícias, três petições, dois perfis e uma obra. As 34 categorias vazias, três links `/share/` e a bronca duplicada não foram acrescentados. Os domínios www foram normalizados.

Na etapa seguinte, a [auditoria de páginas com redirecionamento](auditoria-paginas-redirecionamento.md) acrescentou mais 51 destinos confirmados, totalizando 110 URLs no sitemap atual.

O sitemap é estático e representa os registros verificados em 7 de outubro de 2026. Quando aprovações, remoções, categorias ou perfis públicos mudarem, atualizar a lista para que ela continue consistente com as páginas elegíveis. A regra `noindex` das categorias é calculada no aplicativo com os dados atuais, mas a inclusão de novas páginas no sitemap não é automática.

Os ajustes não implementam renderização no servidor. Conteúdo e metadados das páginas de detalhe continuam dependendo da execução do aplicativo. Pré-renderização ou renderização no servidor deve ser considerada se a inspeção do Google revelar que conteúdo público válido não está sendo renderizado.

## Validação e próximos passos

Os 29 testes de SEO, indexação, guia e compartilhamento passaram nesta etapa. Comando:

`node --import ./tools/test-alias.mjs --test src/test/searchIndexing.test.mjs src/test/publicPageSeo.test.mjs src/test/guideCategories.test.mjs src/test/guideDetails.test.mjs src/test/streetShareRoute.test.mjs`

O build de produção concluiu com sucesso. `.htaccess`, `robots.txt` e `sitemap.xml` gerados em `dist/` são idênticos às versões atuais de `public/`. Nada foi publicado nesta auditoria.

Depois de publicar o build, conferir as respostas sem redirecionamento ao Supabase, enviar o sitemap atualizado e testar no Search Console uma categoria com locais, uma bronca, uma notícia, um local e a obra. Inspecionar também uma categoria vazia para confirmar a exclusão intencional. Solicitar indexação das páginas públicas importantes depois de verificar o conteúdo renderizado. Isso não garante que o Google indexará todas as URLs.

Referências: [relatório de indexação de páginas](https://support.google.com/webmasters/answer/7440203?hl=pt-BR), [princípios de SEO em JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=pt-br).
