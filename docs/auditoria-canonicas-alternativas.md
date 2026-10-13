# Página alternativa com tag canônica adequada — 7 de outubro de 2026

As cinco URLs da captura são versões alternativas de páginas já representadas por uma URL preferida. A classificação indica que o Google reconheceu a canônica; a exclusão da alternativa é esperada. Ela não confirma, por si só, que o destino esteja indexado — isso deve ser conferido na inspeção da URL canônica.

| Alternativa apresentada | Canônica esperada no código atual |
| --- | --- |
| `/?from=AppAgg.com&utm_campaign=AppAgg.com&utm_medium=referral&utm_source=AppAgg.com` | `https://trombonecidadao.com.br/` |
| `https://www.trombonecidadao.com.br/` | `https://trombonecidadao.com.br/` |
| `https://www.trombonecidadao.com.br/servicos` | `https://trombonecidadao.com.br/guia-da-cidade` |
| `https://www.trombonecidadao.com.br/cadastro` | `https://trombonecidadao.com.br/cadastro` |
| `https://www.trombonecidadao.com.br/termos-de-uso` | `https://trombonecidadao.com.br/termos-de-uso` |

A URL de campanha mantém seus parâmetros para atribuição de tráfego, mas a canônica da home usa somente o endereço limpo. O componente `SEO` de `src/App.jsx` usa o domínio de produção sem `www` e o pathname, sem query ou fragmento. As configurações locais `.env` e `.env.production` também usam esse domínio. Cadastro e termos herdam essa canônica e não a substituem por outro endereço.

`/servicos` é uma rota antiga. As correções anteriores em `.htaccess` e `LegacyGuideRedirect` encaminham ao guia atual. O helper de SEO do guia declara `https://trombonecidadao.com.br/guia-da-cidade` para a visão geral de todas as cidades; vistas de uma cidade específica mantêm o filtro relevante.

## Verificação

As cinco URLs responderam HTTP 200 para navegador e Googlebot na auditoria de produção. O HTML inicial não contém uma canônica nem um cabeçalho HTTP `Link` de canônica; ela é gerada pelo React. Isso não demonstra uma falha: a própria captura informa que o Google reconheceu uma canônica adequada.

Foi renderizado localmente o componente real `SEO` de `src/App.jsx` com React e Helmet, usando o domínio de produção, para as quatro alternativas fora do guia. Cada resultado contém uma única canônica com o destino esperado, sem `noindex`. Para `/servicos`, foram verificados o resolvedor de redirecionamento e o helper de SEO do destino. Esses checks não equivalem a uma inspeção do DOM renderizado em produção, nem identificam a canônica que o Google escolheu em cada rastreamento antigo. Evidências em [auditoria-canonicas-alternativas-2026-10-07.json](auditoria-canonicas-alternativas-2026-10-07.json).

Não houve mudança de código nesta etapa. O 301 de `www` para o domínio sem `www` e os redirecionamentos das rotas antigas já estão preparados localmente nas etapas anteriores, mas permanecem pendentes de publicação. Após publicar, as alternativas podem passar a aparecer como “Página com redirecionamento”, também esperado.

Para avaliar a indexação, inspecionar os destinos da tabela e comparar **Canônica declarada pelo usuário** com **Canônica selecionada pelo Google**. Priorizar divergências ou ausência de indexação das páginas que precisam aparecer na pesquisa, em vez de tentar indexar as cinco variantes separadamente.

As verificações HTTP do site ignoraram a validação do certificado após a falha de validade observada no ambiente; a configuração TLS do aplicativo não foi alterada.

Referência oficial: [consolidação de URLs duplicadas e definição de canônica](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
