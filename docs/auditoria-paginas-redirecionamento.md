# Páginas com redirecionamento — 7 de outubro de 2026

Foram analisadas as 57 URLs do texto exportado pelo Search Console, com datas de último rastreamento entre 15 de abril e 5 de outubro de 2026. Resultados reproduzíveis, sem credenciais ou dados de contato, estão em [auditoria-paginas-redirecionamento-2026-10-07.json](auditoria-paginas-redirecionamento-2026-10-07.json).

| Grupo | URLs | Resultado atual e interpretação |
| --- | ---: | --- |
| Notícias | 37 | Todas existem publicamente; HTTP 200 para Googlebot; consulta com comentários e autores também devolve os 37 registros. |
| Obras públicas | 13 | Todas existem publicamente; HTTP 200 para Googlebot; consulta com categoria e bairro também devolve os 13 registros. |
| Raiz HTTP, com e sem www | 2 | HTTP 301 para HTTPS. Exclusão da origem é esperada; o destino HTTPS é a página que deve ser indexada. |
| Ponto turístico antigo | 1 | HTTP 200 atualmente; Catedral do Bom Jesus dos Aflitos também existe em `directory`, aprovada, com vínculo explícito ao registro antigo. |
| `/app` | 1 | HTTP 200 inicial; o aplicativo redireciona Android e iOS com loja configurada após executar JavaScript. Comportamento intencional. |
| Abaixo-assinado canônico | 1 | Navegador recebe 200, mas Googlebot recebe 302 para a função externa `share-petition`. Precisa da publicação da correção anterior do `.htaccess`. |
| `/share/abaixo-assinado/...` | 2 | HTTP 302 para prévias de compartilhamento. São origens auxiliares; a indexação deve ocorrer no detalhe canônico da petição. |

A conferência HTTP das 57 URLs com Googlebot encontrou **52 respostas 200, duas 301 e três 302**. As consultas auxiliares de medições, mídias e pastas de documentos foram verificadas para uma obra de exemplo e funcionam hoje. Isso não reconstitui a execução JavaScript nem a disponibilidade da API nos rastreamentos anteriores. Os 50 detalhes de notícias e obras não apresentaram redirecionamento HTTP nesta auditoria; a causa histórica específica de cada classificação não está comprovada.

## Correções locais

Notícias e obras anteriormente navegavam automaticamente para suas listagens quando uma consulta falhava. A consulta principal agora usa `maybeSingle`, distinguindo ausência confirmada de falha. Uma falha mantém a URL e oferece **Tentar novamente**. Somente a ausência confirmada de conteúdo público recebe `noindex`. Falhas de consultas complementares da obra também permanecem na própria URL, sem apresentar valores financeiros incompletos como se fossem dados carregados. Recarregar conteúdo já aberto mantém a página enquanto a consulta está pendente; respostas antigas da consulta principal não substituem o registro de uma navegação mais recente.

Foi incluído um redirecionamento HTTP 301 específico, com destino confirmado pela API pública:

`/guia-da-cidade/ponto-turistico/3005f403-faf2-4c02-a670-160cd858d9e5` → `/guia-da-cidade/guia/e1be8ebc-ce63-4a5d-a29d-dbf023542231`.

O sitemap foi ampliado de 59 para **110 URLs**, adicionando 51 destinos verificados que ainda não estavam presentes. Os endereços HTTP, links de prévia, URL antiga do ponto turístico e `/app` não foram incluídos por causa desta exportação. É um retrato estático dos registros disponíveis na auditoria e precisa acompanhar futuras exclusões ou mudanças de visibilidade.

## Validação e publicação

Os 32 testes de indexação, metadados, tratamento de falhas, guia e compartilhamento passaram. O build de produção concluiu com sucesso em 1 min 41 s. `.htaccess`, `robots.txt` e `sitemap.xml` em `dist/` foram comparados com `public/`, incluindo as 110 URLs do sitemap. O teste de regras usa um avaliador do subconjunto de `mod_rewrite`; a confirmação final de status e cabeçalhos deve ocorrer na hospedagem Apache após publicar. Nenhuma alteração foi publicada nesta auditoria.

Depois da publicação, conferir o HTML renderizado na inspeção de URL para uma notícia, uma obra, a petição canônica e o cadastro novo da Catedral. O detalhe canônico deve carregar conteúdo e declarar sua própria canônica, sem voltar à listagem ou à prévia externa. Enviar o sitemap atualizado. As origens que redirecionam intencionalmente podem continuar classificadas como “Página com redirecionamento”; isso não constitui uma falha por si só.

As consultas à API usaram somente a chave anônima e verificação TLS normal. Os diagnósticos HTTP do site ignoraram a verificação do certificado após a falha de validade observada no ambiente; não foi alterada a configuração TLS do aplicativo.

Referências oficiais: [relatório de indexação de páginas](https://support.google.com/webmasters/answer/7440203?hl=pt-BR) e [redirecionamentos e Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects).
