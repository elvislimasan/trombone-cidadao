# Análise das alterações de indexação — 7 de outubro de 2026

Os quatro achados da revisão inicial foram corrigidos localmente. O diagnóstico abaixo preserva o estado anterior às correções para explicar seus impactos; a situação atual está resumida na tabela seguinte.

| Achado | Correção implementada |
| --- | --- |
| `noindex` durante falhas temporárias | Perfis, locais e vereadores separam erro de consulta, ausência confirmada e privacidade. Erros oferecem tentativa novamente sem `noindex`. O resolvedor de vereador antigo também preserva os erros da API. |
| Canônicas duplicadas | `DynamicSeo` passou a usar `react-helmet`, como o SEO global. O provider assíncrono sem consumidores foi removido. Teste com os componentes reais montados confirma uma única canônica e preservação de links do aplicativo para broncas e obras. |
| Bronca redirecionada à home em falhas | O carregamento usa `maybeSingle` com classificação de erro e ausência. A URL permanece; erro oferece nova tentativa e ausência confirmada recebe `noindex`. |
| Metadados do guia com dados de outra cidade | `useGuideDirectory` associa cada resposta à cidade consultada e à requisição vigente. Trocar de cidade invalida os dados no próprio render; respostas e erros antigos são ignorados. |

Foram acrescentados oito testes de regressão, com DOM montado e consultas controladas, além da atualização dos testes existentes. **97 testes passaram** na validação do conjunto e o **build de produção concluiu com sucesso em 2 minutos**. Os arquivos `.htaccess`, `robots.txt` e `sitemap.xml` em `dist/` foram conferidos contra `public/`, com as 110 URLs do sitemap. Nenhuma alteração foi publicada.

Escopo: alterações de SEO, rotas públicas, compartilhamento e carregamento realizadas nesta sequência, comparadas com `HEAD`. Os scripts SQL de PR8 e os submódulos com alterações pertencem a outro trabalho; não foram executados nesta análise. A revisão inicial apenas diagnosticou os problemas; as mudanças da tabela foram realizadas na etapa posterior, a pedido do usuário.

## Diagnóstico anterior às correções

### 1. Alta prioridade: falhas temporárias podem gerar `noindex` em páginas válidas

- [PublicProfilePage.jsx](../src/pages/PublicProfilePage.jsx#L277) reúne `error`, ausência de perfil e perfil privado na mesma condição. O novo `noindex` é emitido nos três casos. O hook `usePublicProfile` realmente define `error` e limpa o perfil quando a RPC falha.
- [DirectoryDetailsPage.jsx](../src/pages/DirectoryDetailsPage.jsx#L45) termina o carregamento após um erro de consulta. Na abertura inicial, `item` continua nulo e a nova tag em sua linha 108 marca o endereço como `noindex`, mesmo sem ausência confirmada.
- [CouncilorProfilePage.jsx](../src/pages/CouncilorProfilePage.jsx#L46) não distingue os erros de consulta da ausência de dados. Se a consulta do vereador e a inferência pelas ruas não fornecerem dados durante uma falha, o novo `noindex` também aparece.

**Impacto:** um conteúdo público válido pode receber uma instrução de exclusão se o Google o renderizar durante uma indisponibilidade da API. Não significa exclusão permanente ou já observada em produção, mas contradiz a distinção correta implementada para notícias e obras.

**Correção recomendada:** usar estados separados de carregamento, erro, ausência confirmada e conteúdo privado. Emitir `noindex` para ausência confirmada ou privacidade; falha de rede ou consulta deve oferecer tentativa novamente na própria URL.

### 2. Média prioridade: a bronca passa a ter duas tags canônicas

[App.jsx](../src/App.jsx#L241) usa `react-helmet` e já declara a canônica global. [DynamicSeo.jsx](../src/components/DynamicSeo.jsx#L103) usa `react-helmet-async` e agora também declara a canônica. Os dois pacotes gerenciam conjuntos distintos de tags e não deduplicam entre si.

Uma reprodução local em DOM com `happy-dom`, React, o `DynamicSeo` real e o Helmet global confirmou:

```html
<link rel="canonical" href="https://trombonecidadao.com.br/bronca/abc" data-react-helmet="true">
<link rel="canonical" href="https://trombonecidadao.com.br/bronca/abc" data-rh="true">
```

**Impacto:** a declaração fica duplicada. No caso reproduzido os destinos são iguais; não foi demonstrada divergência de URLs nem rejeição pelo Google. Mesmo assim, a implementação deixa de garantir uma única canônica, como recomenda a documentação do Google.

**Correção recomendada:** padronizar o gerenciador de metadados ou retirar a canônica global nas páginas em que o componente específico a controla. Validar o DOM montado com os dois componentes, além dos testes isolados de cada um.

### 3. Média prioridade: broncas ainda redirecionam para a home ao falhar

[ReportPage.jsx](../src/pages/ReportPage.jsx#L1089) continua tratando erro da API e ausência do registro juntos e executa `navigate('/')`. A nova condição de `noindex` na linha 1522 não cria uma página estável para conteúdo indisponível nem diferencia falha temporária.

**Impacto:** permanece uma origem de redirecionamento para destino sem relação com a bronca, justamente o comportamento removido de notícias e obras. O fluxo de redirecionamento é anterior a estas alterações; a nova tag não o resolve.

**Correção recomendada:** aplicar a mesma separação entre erro e ausência usada em `fetchPublicDetail`, com tentativa novamente em caso de falha e estado de indisponibilidade sem redirecionamento automático em caso de ausência.

### 4. Média prioridade: a decisão de `noindex` no guia não está vinculada à cidade da consulta

[ServicesPage.jsx](../src/pages/ServicesPage.jsx#L217) refaz as consultas quando a cidade muda, mas não cancela nem ignora uma resposta anterior. `dataReady` indica somente sucesso, sem registrar a cidade que produziu os dados. A canônica e a decisão de `noindex` usam a cidade atualmente selecionada.

**Impacto:** ao trocar de cidade com consultas em andamento, a resposta antiga pode sobrescrever a nova. Uma categoria com locais na cidade atual pode ser apresentada como vazia e receber `noindex`, ou seus metadados descreverem locais de outra cidade. O problema de concorrência já existia nos dados da interface; estas alterações ampliam seu efeito para os sinais de indexação. A conclusão decorre do fluxo de código, não de uma medição no Google.

**Correção recomendada:** associar os dados ao identificador da cidade e da requisição; ignorar respostas antigas e só decidir indexabilidade quando os dados corresponderem ao contexto atual.

## Benefícios e efeitos previstos

| Alteração | Benefício ou efeito esperado | Limite relevante |
| --- | --- | --- |
| Remover buscadores das regras de prévias externas | Googlebot acessa o conteúdo no domínio público, sem 302 para o Supabase. Reduz chamadas de prévias para esses rastreadores. | O conteúdo e os metadados continuam dependendo da execução de JavaScript e da API. |
| Proteger arquivos reais, `robots.txt` e `sitemap.xml` | Corrige respostas em HTML ou prévias de perfil para endpoints de rastreamento. | Precisa publicar os arquivos e confirmar comportamento na hospedagem e no CDN. |
| Consolidar `www` e rotas antigas com 301 | Mantém caminhos e parâmetros, reúne versões equivalentes e encaminha o ponto turístico ao cadastro migrado confirmado. | Algumas origens continuam legitimamente excluídas como páginas com redirecionamento. URLs antigas podem atravessar mais de um salto, sem evidência de loop nas regras locais. |
| Validar cidade nos links de vereadores | Evita novas URLs `/vereadores/null/...`; mantém os cards informativos quando a cidade é ambígua. | Nesses casos o card deixa de ser clicável. A recuperação de uma URL antiga depende de um registro único em `councilors`. |
| Canônicas e metadados próprios | Descrevem notícias, obras, categorias e páginas públicas com seus destinos preferidos. | O gerenciador foi unificado e a canônica única foi testada localmente; confirmar também após publicar. |
| `noindex` de categorias vazias | Retira versões sem locais públicos, com base nos dados carregados para a cidade atual. A tag desaparece quando entram locais. | As 34 categorias vazias são uma fotografia da auditoria, não uma previsão exata do próximo relatório. |
| Notícias e obras com tentativa novamente | Uma falha mantém a URL e deixa de enviar o visitante à listagem. Ausência confirmada recebe `noindex`. | Nas obras, uma falha complementar também impede a exibição do detalhe completo; evita mostrar totais financeiros incompletos como carregados. |
| Sitemap com 110 URLs verificadas | Facilita a descoberta dos destinos públicos; não contém duplicatas na conferência local. | É estático, não representa necessariamente todo o acervo e não se atualiza após exclusões, novos cadastros ou mudanças de visibilidade. |

## Impactos para usuários e operação

O 301 de `www` para o domínio principal muda a origem do navegador. [customSupabaseClient.js](../src/lib/customSupabaseClient.js#L7) armazena a sessão no `window.localStorage`. Usuários que usavam somente `www` podem precisar entrar novamente ao chegar ao domínio sem `www`. Preferências de cidade e notícias favoritas guardadas localmente também não são compartilhadas entre as duas origens. Isso não apaga contas, registros ou dados armazenados no servidor.

As regras de WhatsApp, Facebook e demais prévias sociais permanecem. Links `/share/...` continuam sendo auxiliares de compartilhamento, sem necessidade de indexação individual. O aplicativo nativo recebe os metadados e o tratamento de erros novos após distribuir uma versão com esse código; as regras do Apache atuam na hospedagem web.

Não foram adicionadas dependências nem executadas migrações de banco para as correções de SEO. Não houve mudança do layout das páginas de conteúdo. A maior mudança funcional, além dos redirecionamentos de domínio, é o comportamento ao falhar o carregamento.

O relatório do Search Console pode trocar “soft 404” por “Excluída pela tag noindex” nas ausências intencionais e trocar “Página alternativa com tag canônica adequada” por “Página com redirecionamento” após o 301. Essas trocas podem representar correção técnica, mesmo sem redução imediata do total de URLs excluídas. Mais URLs no sitemap também não significam aumento garantido de indexação ou tráfego.

## Evidências da revisão inicial e limites da validação

- Nesta revisão, **89 testes passaram**, abrangendo indexação, carregamento público, vereadores, histórico de ruas, guia e compartilhamentos.
- O último build de produção deste conjunto foi concluído com sucesso em 1 min 41 s na etapa anterior. Não foi repetido aqui porque nenhum código foi alterado.
- O sitemap atual contém **110 URLs, sem duplicatas**.
- A reprodução conjunta dos pacotes de Helmet produziu **duas canônicas**; os testes existentes verificam `DynamicSeo` isoladamente e não detectam esse caso.
- Os testes das regras de hospedagem usam um avaliador de um subconjunto de `mod_rewrite`, sem executar Apache. Não comprovam a configuração do proxy ou CDN de produção.
- As auditorias HTTP anteriores confirmaram 200 para as 37 notícias e 13 obras, e 302 indevido da petição canônica para Googlebot. Não reconstituem o JavaScript executado em cada rastreamento histórico.

Os quatro pontos foram corrigidos e os novos testes cobrem erro, ausência, recuperação, privacidade, canônica única e respostas fora de ordem. Após publicar, conferir Googlebot, navegador e prévias sociais, os tipos de conteúdo de `robots.txt` e `sitemap.xml`, uma única canônica no DOM e conteúdo renderizado na inspeção de URL. A confirmação de indexação depende de novos rastreamentos; não há prazo ou ganho de tráfego garantido.

Referências: [Google sobre canônicas geradas por JavaScript e soft 404](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) e [consolidação de URLs duplicadas](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
