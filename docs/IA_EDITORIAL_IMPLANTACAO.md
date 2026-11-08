# Central Editorial — obras, broncas, ruas e arborização

Implementação local iniciada em 06/11/2026, conforme o [plano de IA jornalística](PLANO_IA_JORNALISTICA_E_CONTEUDO.md). Este guia distingue o piloto entregue das etapas futuras. As alterações não foram aplicadas a um Supabase remoto nem publicadas no Vercel por esta tarefa.

**Expansão em 06/11/2026:** a migração 412 amplia o piloto de obras para broncas públicas, ruas, inventário arbóreo e perfis públicos de árvores da comunidade. A migração **413** acrescenta estilos por versão e roteiros com cenas e falas. Aplicar somente as migrações ainda pendentes, na ordem; não reaplicar as criações das tabelas do piloto.

## Escopo implementado

- Página `/admin/editorial`, acessível pelo painel administrativo, por Gerenciar Notícias e por Gerenciar Obras.
- Levantamentos agregados de obras paralisadas, inacabadas, concluídas e com previsão de término vencida, por cidade.
- Filtro **Assunto**: todos, obras, broncas, ruas e arborização. A análise manual consulta o recorte selecionado; a análise diária continua cobrindo todos os assuntos da cidade, usando a mesma memória.
- Broncas públicas registradas, em acompanhamento e registradas como resolvidas, com distribuição por categoria e bairro. Os números são acumulados da base pública elegível; não representam uma janela dos últimos dias nem ocorrências únicas. Apenas `is_public=true`, moderação `approved`, situações `pending`, `in-progress`, `pending_resolution` e `resolved`, e sinais nulos/concluídos entram. Duplicatas, sinais abertos/vazios, relatos não aprovados e solicitações internas ficam de fora.
- Ruas sem pavimentação, parcialmente pavimentadas e pavimentadas, com tipos de pavimento e bairro principal cadastrado. O percentual usa o número de registros de rua, sem estimar extensão, área, população atendida ou bairros adicionais vinculados.
- Árvores sinalizadas para atenção/avaliação técnica, locais planejados e árvores existentes com data de plantio registrada. O denominador de árvores existentes exclui planejadas e removidas; o de locais planejados inclui registros existentes e planejados do inventário. O rótulo de risco não comprova risco de queda.
- Perfis públicos aprovados de árvores da comunidade, tratados separadamente do inventário municipal. Perfis privados, pendentes ou rejeitados não entram nem nas contagens. Endereço, coordenadas, autor e nomes livres dos perfis não são usados no levantamento.
- Universo consultado diretamente no banco, com `city_id` e `is_complete=true`, incluindo concluídas. `is_complete` representa cadastro publicável; a situação da obra continua em `status`.
- Contagens, percentuais, valores contratuais conhecidos, lacunas, distribuição por bairro e exemplos de obras. Não utiliza valores simulados do componente `AIReports`.
- Propostas ordenadas por regras explícitas, com memória compartilhada por cidade e assunto. Essa seleção inicial é determinística; a IA realiza a redação e os ajustes quando solicitados.
- Notícia e roteiros de 30 segundos, 60 segundos e 2–3 minutos, com referências por trecho e validação de estrutura e números.
- Tom escolhido pelo editor: **Informativo**, **Conversado**, **Leve**, **Com humor** ou **Crítico e construtivo**. As notícias permitem abordagem direta, explicativa ou história local baseada nos registros, além de orientação livre de estilo.
- Vídeos em apresentação, narração ou diálogo entre dois apresentadores. Cada cena possui papel de quem fala, fala exata, sugestão de captação/edição, texto na tela e referências. As falas são texto original para apresentação, não declarações atribuídas a pessoas entrevistadas.
- Texto com instruções de voz mais naturais, variação de abertura e transições, evitando repetir ressalvas em todas as frases. Humor não permite inventar fatos ou insinuar crimes, nem ridicularizar moradores ou pessoas afetadas.
- Responsável pela pauta, liberação para outro editor, descarte com motivo, rascunhos privados, versões preservadas e histórico de decisões. Master pode liberar uma pauta cujo responsável esteja indisponível.
- Aprovação humana da versão, cópia do conteúdo aprovado e publicação explícita de notícia com vínculos ao tipo correto de fonte, em uma transação idempotente. Obras e broncas também usam seus vínculos legados; ruas, árvores e perfis da comunidade aparecem nos registros consultados da notícia.
- Conferência das fontes atuais antes de gerar, salvar, aprovar, copiar ou publicar. Mudanças incompatíveis bloqueiam a operação; reanálise atualiza ou propõe desdobramento.
- Limite atômico de chamadas por cidade/dia e controle de geração simultânea por pauta/formato.
- Rotina SQL diária às 06h de Fortaleza, disponível quando `pg_cron` estiver instalado e após ativação explícita por cidade. A rotina produz propostas, sem gerar texto, chamar o provedor ou publicar.

## Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/411_editorial_works_pilot.sql` | Tabelas privadas, RLS, funções de análise, fluxo editorial, cotas e agendamento opcional. |
| `supabase/migrations/412_editorial_city_subjects.sql` | Adaptadores dos novos assuntos, filtro, fontes tipadas e análise diária expandida. |
| `supabase/migrations/413_editorial_styles_and_scripts.sql` | Perfil editorial por versão, cache por estilo, cenas/falas e validação dos campos de roteiro. |
| `supabase/functions/editorial-generate/index.ts` | Entrada da função autenticada de geração. |
| `supabase/functions/_shared/editorialAi.js` | Contrato do provedor, instruções editoriais, validação e orquestração da geração. |
| `supabase/functions/_shared/editorialStyle.js` | Tons, abordagens, condução de vídeo, papéis e normalização do perfil editorial. |
| `src/lib/editorial.js` | Cliente da Central Editorial. |
| `src/pages/admin/EditorialPage.jsx` | Pautas, produção, fontes, aprovação e publicação. |
| `src/pages/admin/editorial.css` | Layout fluido, com adaptações para desktop e celular. |

## Implantação

1. Confirmar explicitamente o ambiente de destino, a cópia de segurança e as migrações já aplicadas. Não executar um `db push` indiscriminado: o repositório contém muitas migrações de outros módulos.
2. Aplicar as migrações pendentes em sequência: `411_editorial_works_pilot.sql`, `412_editorial_city_subjects.sql` e `413_editorial_styles_and_scripts.sql`. Se 411 e 412 já estiverem instaladas, aplicar apenas a **413**. A expansão depende de `reports`, `pavement_streets`, `city_trees`, `community_trees` e `news_reports`, conforme as migrações existentes do projeto. Validar o schema efetivo antes de aplicar em produção.
3. Nos segredos das Edge Functions, configurar `GEMINI_API_KEY` e **`EDITORIAL_GEMINI_MODEL`**. O segundo aceita o identificador do modelo validado para o piloto. `GEMINI_MODEL` funciona como fallback de configuração; nenhum modelo é escolhido implicitamente pelo novo código. As variáveis de servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` também precisam estar disponíveis.
4. Publicar somente a função necessária no projeto explicitamente escolhido:

   ```powershell
   supabase functions deploy editorial-generate --project-ref <referencia-do-ambiente>
   ```

   Manter a verificação JWT padrão. A função também autentica o usuário e reserva a geração com suas permissões. Não usar `--no-verify-jwt` para este endpoint.

5. Republicar `editorial-generate` para atualizar as instruções e usar a reserva com perfil editorial (`editorial_reserve_generation_styled`), publicar o frontend e abrir `/admin/editorial` com uma conta master. A migração 413 deve preceder a nova função e a interface. Escolher cidade e assunto e executar **Analisar dados**.
6. Fazer um teste editorial com registros conhecidos: conferir contagens e fontes, produzir conteúdo, editar, aprovar e testar a publicação no ambiente de homologação.
7. Após conferir a cobertura anterior, conceder acesso à equipe e, se desejado, ativar **Diária · 06h** na cidade. Sem `pg_cron`, a ativação é recusada com mensagem explícita e a análise manual continua disponível.

Nunca colocar chaves privadas em variáveis `VITE_`, comandos com valores literais no histórico, documentos ou código versionado. A credencial privilegiada anteriormente compartilhada precisa ser rotacionada antes do uso do serviço; este desenvolvimento não executou a rotação.

## Acesso da equipe

Master tem acesso ao piloto. Demais usuários precisam ser administradores e receber concessão explícita na tabela `editorial_access`. Editar obras ou atuar como gestor municipal não concede acesso editorial automaticamente.

Exemplo de concessão, a executar por operador autorizado no ambiente escolhido, substituindo os parâmetros:

```sql
insert into public.editorial_access(city_id,user_id,can_approve,can_publish)
values (<id-da-cidade>, '<uuid-do-administrador>', false, false)
on conflict(city_id,user_id) do update
set can_approve=excluded.can_approve, can_publish=excluded.can_publish;
```

Uma concessão permite consultar, assumir pauta e produzir conteúdo. `can_approve` e `can_publish` são capacidades adicionais e independentes. Apenas master configura a análise diária neste piloto. Não há tela de gestão dessas concessões nesta entrega.

`editorial_settings.daily_ai_limit` começa em 30 tentativas por cidade/dia, no fuso de Fortaleza. Tentativas reservadas também consomem a cota quando o provedor falha. Ajustes de limite são administrativos no banco; esta versão limita chamadas, não representa um teto financeiro em reais.

## Memória e materialidade

As chaves estáveis são cidade + tópico: obras (`works.*`), broncas (`reports.registered`, `reports.active`, `reports.resolved`), ruas (`streets.unpaved`, `streets.partial`, `streets.paved`) e arborização (`arborization.attention`, `arborization.planned`, `arborization.planted`, `arborization.community`). O hash ignora hora da coleta e correções de título, mas considera membros do conjunto e campos relevantes. Repetir a análise reaproveita fatos conhecidos, inclusive pautas descartadas.

Os hashes e as fontes das versões anteriores de obras são preservados. Nos novos assuntos, corrigir bairro, categoria, situação, espécie ou planejamento invalida a base correspondente. Uma análise filtrada não marca os demais assuntos como atualizados nem impede a análise diária geral.

O piloto considera material uma mudança que atinja algum destes critérios, comparada com a linha de base da última proposta:

- Mudança de pelo menos duas obras, ou de 10% do conjunto com mínimo de uma obra.
- Diferença de cinco pontos percentuais na participação sobre o universo.
- Alteração de pelo menos 5% na soma contratual conhecida, com mínimo de R$ 1.
- Duas entradas/saídas na composição, mesmo mantendo a contagem. Uma substituição de obra representa uma saída e uma entrada.

Mudanças menores atualizam a base de uma pauta aberta, sem gerar outra proposta. A linha de base permanece para detectar o acumulado. As versões de conteúdo guardam suas próprias fontes; se a base mudar, a versão precisa ser atualizada e aprovada novamente. Se um conjunto antes existente chegar a zero, isso também pode produzir um acompanhamento. Não são criadas pautas iniciais sobre conjuntos vazios.

Os limiares e a prioridade por assunto estão versionados em SQL (`works-v1` e `subjects-v1`). Sua calibragem com a equipe precede a expansão para outras cidades. O sistema ainda não cria ângulos livres ou agrupamentos semânticos.

## Publicação

**Aprovar versão** registra a conferência dos fatos, fontes e contexto. **Publicar notícia** requer capacidade de publicação e confirmação específica na interface. A notícia é criada em `news` e vinculada ao conjunto de obras consultadas. Ela inclui data do levantamento, limite do universo e identificação da assistência de IA.

Nenhum e-mail, push ou mensagem em rede social é enviado por essa publicação. Roteiros podem ser aprovados e copiados, inclusive após publicar a notícia sobre os mesmos fatos. A cópia é uma entrega ao editor, não uma confirmação de publicação em outro canal.

`news_editorial_sources` guarda os vínculos tipados. A leitura pública desse índice revalida a visibilidade da fonte; o vínculo legado de bronca de uma notícia editorial também é ocultado quando ela deixa de ser pública/elegível. Isso não reescreve automaticamente o HTML de uma notícia já publicada: correções e retiradas editoriais continuam exigindo revisão humana.

As validações conferem referências e números, mas não comprovam relações causais nem detectam todas as afirmações textuais sem suporte. A confirmação humana é indispensável. O conteúdo proposto não pode substituir apuração ou avaliação técnica da situação de uma obra.

## Escolha do estilo e produção dos roteiros

1. Selecionar formato e duração. Em **Estilo**, escolher tom e abordagem da notícia ou condução do vídeo. **Orientação livre** permite detalhar o pedido, por exemplo “gancho curto, linguagem próxima e uma tirada leve”.
2. Gerar o conteúdo. O perfil usado é persistido em `editorial_generations.brief` e `editorial_contents.brief`; a resposta do modelo não pode escolher outro perfil silenciosamente.
3. Para experimentar outro tom, mudar a seleção e executar **Aplicar estilo em nova versão**. O texto anterior continua visível e identificado até gerar a adaptação. Isso cria outra versão da mesma pauta, sem simular uma nova descoberta jornalística e sem herdar a aprovação anterior.
4. Nos roteiros, editar **Quem fala**, **Fala**, **Cena sugerida** e **Texto na tela**. Diálogos exigem participação dos dois apresentadores; narração usa o papel de narrador. Os papéis não representam depoimentos reais.
5. Conferir, aprovar e copiar. A cópia inclui falas identificadas, cenas e texto de tela, além das fontes. A duração da locução é estimada com 140 palavras/minuto; precisa ser conferida em leitura. O sistema não renderiza o vídeo nem sintetiza vozes.

O cache compara tom, abordagem/condução relevante e orientação livre, além dos fatos e da versão-base. Não retorna o mesmo texto informativo quando o usuário pede humor. Alterar uma opção exclusiva de vídeo não regenera uma notícia. Repetir uma solicitação já concluída preserva o resultado existente.

Cada versão guarda seu perfil. Editar o texto manualmente preserva o perfil de origem; o novo texto ainda precisa ser aprovado. As versões anteriores continuam disponíveis no histórico, com seus tons e estilos. Preferências selecionadas ainda não aplicadas não mudam a classificação do texto aprovado.

As validações de referências e números abrangem também cenas e textos na tela. Elas não distinguem automaticamente toda piada, analogia ou insinuação sem suporte: a revisão humana continua obrigatória. Roteiros legados sem perfil estruturado permanecem legíveis e podem ser atualizados explicitamente; a migração não inventa cenas para eles nem altera a aprovação armazenada.

## Validação executada e reprodução

```powershell
node --test --test-isolation=none src/test/editorialAi.test.mjs
node tools/validate-editorial-db.mjs
node tools/validate-editorial-ui.mjs
npx vite build
```

- O teste de banco cria um PostgreSQL descartável em loopback, com fixtures próprias; não lê `.env` nem se conecta ao Supabase remoto. Em Windows, usa PostgreSQL 17 no caminho padrão ou `POSTGRES_BIN`. O processo é encerrado ao final.
- O teste de interface usa componentes e cliente reais, com Supabase simulado, em Chrome local. Confere 1440 px, 1920 px e 390 px, ausência de rolagem horizontal, filtros e publicação dos quatro assuntos, edição, aprovação, roteiro posterior e isolamento entre cidades. Capturas ficam em `.tmp/editorial-ui/`.
- O teste de banco aplica 411, 412 e 413 em sequência, preserva versões legadas e verifica privacidade, denominadores, fontes, análise diária, cache por estilo, perfis imutáveis e números nos campos de roteiro.
- O teste de interface também exercita escolha de tom, orientação livre, nova versão com outro estilo, edição de cenas, diálogo, narração e cópia do roteiro com identificação das falas.
- O teste do provedor simula respostas de rede. Nenhuma chamada real ao Gemini foi feita nesta tarefa. Configuração remota, qualidade editorial do modelo escolhido e capacidade de `pg_cron` precisam de teste em homologação.

## Próximas entregas do plano

1. Curadoria/importação da cobertura já existente, incluindo notícias manuais e importadas. Até lá, o primeiro levantamento avisa que a equipe deve conferir a cobertura anterior.
2. Ampliar os adaptadores existentes com períodos comparáveis, novas oportunidades de pauta e evidências documentais, preservando as definições e a privacidade de cada módulo.
3. Apuração assistida, evidências documentais, novas fontes fornecidas pelo editor e acompanhamento por evento individual.
4. Fila durável de análises extensas, checkpoints por lote e controle financeiro por tokens; o piloto diário roda SQL para uma cidade de cada vez.
5. Diversidade territorial, novos ângulos, comparação histórica de situação e deduplicação entre módulos. Não há histórico confiável anterior à implantação que permita afirmar evolução passada automaticamente.
6. Fluxo de correção/retirada de notícia já publicada quando uma fonte muda ou é removida. O piloto bloqueia operações novas com base desatualizada, mas não retira automaticamente uma notícia existente.
7. Gestão visual de acessos, ajustes de materialidade, outbox de notificações opcionais e revisão independente para pautas sensíveis.
