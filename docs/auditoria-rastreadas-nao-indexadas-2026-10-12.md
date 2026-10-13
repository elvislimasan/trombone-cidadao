# URLs rastreadas, mas não indexadas — 12 de outubro de 2026

A lista fornecida contém **83 URLs**, com último rastreamento entre 13 de abril e 10 de outubro de 2026. O campo `Pendente` é o status da validação exportada; ele não explica por que cada URL ficou fora do índice. A lista anterior tinha 89 URLs. Essa redução, isoladamente, não comprova que seis páginas foram indexadas: há entradas e saídas entre as duas listas.

As verificações atuais estão em [auditoria-rastreadas-nao-indexadas-2026-10-12.json](auditoria-rastreadas-nao-indexadas-2026-10-12.json). Foram feitas consultas HTTP GET como Googlebot, sem seguir redirecionamentos e com validação TLS ativa, e consultas à API pública usando somente a chave anônima do navegador. Nenhum registro em produção foi alterado. O relatório não inclui chaves nem dados de contato.

## O que já está corrigido em produção

- `robots.txt`: HTTP 200, `text/plain`, permite o rastreamento e informa o sitemap.
- `sitemap.xml`: HTTP 200, `application/xml`, com 110 URLs; correspondia ao arquivo local antes da atualização desta etapa.
- As 76 URLs sem redirecionamento respondem HTTP 200 no domínio do site. O desvio dessas páginas para prévias no Supabase observado em 7 de outubro não se repetiu.
- As quatro variantes com `www` respondem HTTP 301 para o mesmo caminho sem `www`. Os quatro destinos respondem HTTP 200.
- Os três links `/share/` respondem HTTP 302 para prévias de compartilhamento. As páginas públicas correspondentes respondem HTTP 200. Esses links auxiliares não precisam de indexação própria.
- A consulta HTTPS não reproduziu a falha de certificado registrada na auditoria anterior.

## Conteúdo da lista atual

| Grupo | URLs | Resultado da consulta pública |
| --- | ---: | --- |
| Categorias do guia | 37 | Todas existem e estão ativas; **32 não têm locais aprovados** e cinco têm conteúdo. |
| Broncas | 16 | Todas visíveis anonimamente e aprovadas na moderação; uma tem status `duplicate`. |
| Notícias | 9 | Todas visíveis; descrições com 84 a 256 caracteres. |
| Locais do guia | 9 | Todos têm status `approved`. |
| Petições | 3 | Todas têm status `open`. |
| Perfis | 2 | Ambos têm perfil público habilitado. |
| Entrada geral do guia | 2 | Com e sem `cidade=todas`; representam a mesma seleção geral. |
| Compartilhamentos | 3 | URLs auxiliares de prévia. |
| Obra | 1 | Registro visível na API pública. |
| Estatísticas | 1 | Variante `www` redireciona para a página pública. |

As contagens de categorias consideram a categoria principal, categorias adicionais e filhos diretos, como no aplicativo. A regra existente em `guidePageSeo` declara `noindex` para categorias sem conteúdo somente depois de uma consulta bem sucedida. Não pedir indexação dessas 32 páginas enquanto continuarem vazias. Essa conclusão vem dos dados públicos e do código local; a presença efetiva da tag no HTML renderizado pelo Google exige inspeção no Search Console.

Doze broncas não têm descrição textual cadastrada. Isso e a extensão pequena das descrições das notícias justificam uma revisão editorial, mas **não comprovam a causa da exclusão**. A auditoria não mediu vídeos, galerias, histórico e demais elementos de conteúdo. Não foi aplicado `noindex` a páginas válidas apenas por terem pouco texto.

## Correção local desta etapa

O sitemap passa de **110 para 113 URLs**, incluindo três páginas cuja visibilidade pública foi confirmada:

- `/abaixo-assinado/5142097e-9de4-443c-b3d1-6456834785fa` — petição aberta.
- `/bronca/2efabfaa-05c5-4674-a331-901d190a29f1` — bronca aprovada; incluída sem `www`.
- `/bronca/a315ee22-4b41-4b55-817a-67c92d88e2e5` — bronca aprovada; incluída sem `www`.

A notícia `ea016e41-9f4a-4ec3-a2ed-791c0251a15b`, nova nesta lista, já estava no sitemap. A variante da categoria com `categoria=...` é consolidada pela canônica existente que conserva somente a cidade. Não foram incluídas categorias vazias, a bronca duplicada ou URLs auxiliares `/share/`.

O JSON registra a situação **anterior** à edição local do sitemap: os campos `in_local_sitemap` e `matches_local` são uma fotografia daquele momento. A alteração para 113 URLs ainda precisa ser publicada. O sitemap continua estático.

## O que falta verificar no Google

Todas as 76 respostas HTTP 200 têm o contêiner React vazio no HTML inicial. Isso é compatível com o aplicativo atual, que carrega conteúdo e metadados via JavaScript. Não comprova que o Google falhou ao renderizar essas páginas.

Depois de publicar o sitemap atualizado, enviá-lo no Search Console. Na inspeção de URL, testar a versão publicada de uma bronca, uma notícia, uma petição e uma categoria com locais. Conferir o HTML renderizado, a captura de tela, a ausência de `noindex` nas páginas válidas e a canônica declarada versus a escolhida pelo Google. Se o conteúdo público não aparecer na renderização, investigar os recursos JavaScript e as consultas da API; avaliar pré-renderização ou renderização no servidor com base nessa evidência.

Solicitar indexação somente das páginas públicas prioritárias após essas verificações. Sitemap, HTTP 200 e metadados adequados tornam a página elegível, mas não garantem sua inclusão. Referências: [relatório de indexação de páginas](https://support.google.com/webmasters/answer/7440203?hl=pt-BR), [SEO em JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=pt-br), [requisitos técnicos do Google](https://developers.google.com/search/docs/essentials/technical?hl=pt-br).

## Reprodução e validação

No Windows, executar `node tools/audit-search-indexing.mjs <arquivo.csv> <relatorio.json>` na raiz do projeto. O utilitário requer `curl.exe`, lê apenas a chave anônima da configuração local e não publica alterações. Ele audita o formato simples de três colunas do arquivo fornecido; não é um importador geral de CSV. As consultas não renderizam JavaScript e não substituem a inspeção do Search Console.

Validação local: **36 testes passaram**, cobrindo SEO público, regras de rastreamento, regressões de carregamento, categorias e detalhes do guia. O build de produção (`node node_modules/vite/bin/vite.js build`) concluiu com sucesso. A nova verificação do sitemap cobre as páginas públicas da lista atual e as exclusões intencionais, sem acessar a rede durante os testes. O sitemap gerado em `dist/` corresponde ao arquivo atualizado em `public/`.
