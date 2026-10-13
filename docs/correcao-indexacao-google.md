# Correção da indexação no Google

## Evidências em produção em 7 de outubro de 2026

Consultas HTTP com User-Agent `Googlebot`, sem seguir redirecionamentos:

- `/robots.txt`: HTTP 302 para `share-public-profile?username=robots.txt` no Supabase.
- `/sitemap.xml`: HTTP 302 para `share-public-profile?username=sitemap.xml` no Supabase.
- `/guia-da-cidade`: HTTP 302 para `share-city-guide?type=index` no Supabase.
- `/bronca/00000000-0000-0000-0000-000000000000`: HTTP 302 para `share-preview` no Supabase. Esse ID fictício serviu apenas para testar a regra de roteamento.
- Com User-Agent de navegador, os endpoints de robots e sitemap retornavam o HTML do aplicativo, com HTTP 200, em vez de texto e XML.

A consulta com validação TLS falhou com `certificate has expired`; a inspeção HTTP acima desativou a validação apenas no cliente de diagnóstico. Verificar separadamente o certificado e sua cadeia na hospedagem antes de concluir se a falha é do site ou do ambiente de consulta.

O segundo print do Search Console mostra 165 URLs não indexadas:

| Motivo | URLs | Interpretação e ação |
| --- | ---: | --- |
| Página com redirecionamento | 57 | Pode ser esperado para aliases e links de compartilhamento. Conferir se o destino canônico existe e está indexado; páginas públicas canônicas não devem ser desviadas para prévias. |
| Erro de redirecionamento | 6 | Prioridade: inspecionar as cadeias das URLs reais. As regras antigas e as prévias que apontam de volta ao site oferecem uma explicação possível, ainda sem correspondência confirmada com esses seis exemplos. |
| Erro soft 404 | 5 | Conferir se são páginas realmente inexistentes ou conteúdo válido que não foi renderizado. `noindex` foi adicionado a algumas telas de erro; não aplicar essa exclusão a conteúdo válido. |
| Página alternativa com tag canônica adequada | 5 | Exclusão esperada se a versão canônica correta estiver indexada. |
| Cópia sem página canônica selecionada pelo usuário | 1 | Inspecionar a URL e declarar a canônica correta. A correção atual cobre as páginas atendidas pelo SEO compartilhado e petições. |
| Rastreada, mas não indexada no momento | 89 | O Google já rastreou essas URLs. Verificar conteúdo renderizado, duplicidade, links internos e relevância. Sitemap e solicitação de indexação não garantem inclusão. |
| Cópia, o Google e o usuário selecionaram uma página canônica diferente | 2 | Comparar canônica declarada e escolhida pelo Google, conteúdo, links e redirecionamentos. |

O usuário forneceu os exemplos dos erros de redirecionamento, soft 404 e alternativas com canônica, além do CSV com as 89 URLs rastreadas mas não indexadas. A análise deste último grupo está em [auditoria-rastreadas-nao-indexadas.md](auditoria-rastreadas-nao-indexadas.md). Ainda faltam exemplos dos três casos de divergência/ausência de canônica.

## Exemplos específicos fornecidos pelo Search Console

### Erros de redirecionamento

Cinco exemplos contêm cidade `null`: `gilberto-quirino-de-sa`, `andre-alexandre-ferraz-de-sa-moura-manicoba`, `marcos-antonio-de-carvalho`, `francisco-ferraz-novaes-neto` e `pedro-gomes-vilarim-junior`, todos sob `/vereadores/null/`.

A consulta HTTP com Googlebot confirmou que o primeiro endereço recebe HTTP 302 para `share-councilor?city=null&slug=gilberto-quirino-de-sa`. O código da função retorna ao mesmo endereço quando não encontra o vereador. As regras anteriores redirecionam novamente ao Supabase, formando a cadeia circular.

O sexto exemplo, `https://www.trombonecidadao.com.br/embaixador`, recebe HTTP 302 para `share-public-profile?username=embaixador` com Googlebot: uma rota privada do aplicativo está sendo confundida com username. A remoção dos buscadores das regras sociais interrompe esse encaminhamento. Foi acrescentado HTTP 301 do domínio www para o domínio sem www, preservando caminho e query. O painel de embaixador continua sendo uma rota autenticada, sem intenção de indexação pública.

O gerador de rotas legislativas agora valida a cidade. Os cards exibem o autor sem link quando não há cidade confiável; o ranking sem filtro só usa uma cidade quando todas as ruas daquele autor identificam a mesma cidade. Para recuperar links antigos com `null`, a página consulta o slug e só encaminha ao perfil correto se encontrar exatamente um cadastro. Se o slug for ambíguo ou inexistente, exibe a tela indisponível com `noindex`, sem inventar cidade nem executar consultas com `city_id=null`.

### Soft 404

Os endpoints antigos `/servicos?categoria=97fd7528-3ffe-4426-85ee-8e5294799c6f&cidade=todas` e `/servicos/guia/41dc64af-f458-406a-8ae4-46d423e93788` retornam o HTML genérico da SPA com HTTP 200, tanto para navegador quanto para Googlebot. A versão publicada não oferece redirecionamento HTTP dessas rotas.

O `.htaccess` agora responde HTTP 301 para a categoria ou detalhe correspondente sob `/guia-da-cidade`, preservando a query. A mesma regra cobre a segunda categoria `cbb55406-4cf1-4c54-b400-f223ff1bcf99` e o segundo item `8b2321c9-b116-49a0-a994-f9d15f94a492` exibidos no relatório. O fallback React também transforma a categoria diretamente em caminho, evitando uma segunda navegação. Essas mudanças não confirmam que cada ID ainda existe no banco: categorias e itens realmente inexistentes recebem `noindex` após carregar.

`/cdn-cgi/l/email-protection` também retornava o HTML da SPA com HTTP 200. É um endpoint técnico de proteção de e-mail, não conteúdo público. Foi acrescentada resposta HTTP 404 no Apache para esse caminho antes do fallback. O código atual usa links `mailto:` no contato e no rodapé. Caso o Cloudflare ainda gere links de ofuscação, verificar sua configuração na hospedagem; regras na borda podem responder antes do Apache.

### Alternativas com canônica adequada

O relatório inclui a raiz com parâmetros AppAgg/UTM e versões www da raiz, `/servicos`, `/cadastro` e `/termos-de-uso`. Esse grupo não exige que os aliases sejam indexados. Conferir a versão canônica correspondente; a unificação do domínio e o redirecionamento das rotas legadas tornam os sinais mais consistentes.

## Alterações

- `.htaccess`: arquivos reais e endpoints de indexação são atendidos antes das regras de prévia. Googlebot e outros buscadores deixam de ser redirecionados para prévias sociais; os agentes de WhatsApp, Facebook e outras redes continuam recebendo as prévias.
- `public/robots.txt`: permite o rastreamento e anuncia o sitemap. Não bloqueia recursos JavaScript/CSS necessários à renderização.
- `public/sitemap.xml`: após analisar os CSVs de páginas rastreadas e redirecionamentos, contém 110 URLs públicas verificadas. Não inclui painéis, páginas privadas, prévias `/share/`, categorias vazias nem IDs fictícios. A lista é estática e precisa ser atualizada quando os registros públicos mudarem. A conferência dos 57 redirecionamentos está em [auditoria-paginas-redirecionamento.md](auditoria-paginas-redirecionamento.md).
- SEO compartilhado (`DynamicSeo`, usado pelas broncas e algumas outras telas) e página de petição: declaram a URL canônica da página. Isso não adiciona canônicas a todas as rotas do aplicativo.
- Páginas inexistentes, perfis indisponíveis e broncas não encontradas: recebem `noindex` após a renderização. O fallback da SPA ainda responde HTTP 200; isso não implementa HTTP 404 no servidor nem renderização no servidor.

## Validação e publicação

Executar `node --import ./tools/test-alias.mjs --test src/test/searchIndexing.test.mjs src/test/streetShareRoute.test.mjs src/test/pavementStreetHistory.test.mjs src/test/councilorShareAndStatus.test.mjs src/test/councilorIdentityLink.test.mjs src/test/guideCategories.test.mjs src/test/guideDetails.test.mjs` e `npm run build`.

Verificação local concluída após analisar os exemplos: 81 testes passaram, incluindo 10 testes de indexação, e o build de produção terminou com sucesso. Os arquivos `.htaccess`, `robots.txt` e `sitemap.xml` em `dist/` foram comparados com os arquivos de `public/` e são idênticos. Uma expectativa antiga do teste de vínculo entre perfis foi atualizada de `/u/username` para a rota canônica `/username`, que já existia no código antes desta correção.

Na etapa posterior de revisão, foram corrigidos os quatro achados descritos em [analise-impactos-indexacao.md](analise-impactos-indexacao.md): estados de erro sem `noindex` indevido, um único gerenciador de metadados, broncas com tentativa novamente na própria URL e consultas do guia vinculadas à cidade atual. O conjunto atualizado passou em 97 testes, incluindo oito testes novos de regressão com DOM e consultas controladas.

Os testes de rotas avaliam o subconjunto de regras usado no arquivo; a verificação HTTP na hospedagem continua necessária. As alterações locais só entram em vigor após publicar o build, incluindo `.htaccess`, `robots.txt` e `sitemap.xml`. Se o CDN mantiver respostas antigas, invalidar o cache desses endpoints e das páginas afetadas.

Após publicar:

1. Confirmar que `/robots.txt` responde HTTP 200 com texto e `/sitemap.xml` responde HTTP 200 com XML, tanto para navegador quanto para Googlebot.
2. Confirmar que páginas públicas canônicas não redirecionam o Googlebot para o Supabase.
   Conferir também os cinco links legislativos antigos, as quatro URLs antigas do guia, o redirecionamento de www e o HTTP 404 do endpoint de e-mail. Se um slug legislativo for ambíguo ou não existir, conferir a tela indisponível com `noindex` após renderizar.
3. Enviar `https://trombonecidadao.com.br/sitemap.xml` em **Search Console → Sitemaps**.
4. Em **Indexação → Páginas**, consultar o motivo e exemplos reais. Na inspeção da URL, testar a versão publicada e conferir a URL canônica após a renderização.
5. Solicitar indexação das páginas públicas importantes e usar **Validar correção** no motivo correspondente, quando disponível.

Referências: [relatório de indexação](https://support.google.com/webmasters/answer/7440203?hl=pt-BR), [SEO em JavaScript e soft 404](https://developers.google.com/search/docs/crawling-indexing/javascript/fix-search-javascript).
