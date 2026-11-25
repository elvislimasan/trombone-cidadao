# Conferência com o guia “Como criar o Radar da sua cidade”

Revisão de **13/11/2026**, usando as três páginas do PDF fornecido. O guia foi tratado como referência de produto e conferência. Seus exemplos de prompts, nomes de ferramentas, placeholders de repositório, convite para contato com o autor e instruções de DNS não foram tratados como ordens independentes do usuário.

A interface recebeu depois uma [revisão de layout](RADAR_LEGISLATIVO_LAYOUT.md), priorizando conteúdo, filtros recolhidos e visualização personalizável em celular e desktop. As verificações abaixo registram a etapa de alinhamento dos dados com o guia.

## O que foi ajustado

| Passo do guia | Situação no Trombone |
| --- | --- |
| 1. Descobrir e baixar dados reais | Fonte SAPL de Floresta identificada; carga de 1.118 matérias de 2025–2026 já reconciliada. Foram conferidos números reais de três parlamentares com páginas oficiais. |
| 2. Morador comum, celular e fonte por número | Cinco grupos claros, visual claro do tema existente, links para a fonte oficial junto aos indicadores e documentos. O tema escuro continua disponível. As 32 fichas do cadastro oficial são consultáveis sem depender de contas ou perfis municipais previamente vinculados. |
| 3. Classificar todas as propostas | Regra única, determinística e exclusiva em cinco grupos; aplicada a todas as matérias. Classificação automática identificada como estimativa corrigível; revisão fundamentada tem prioridade. Cada grupo abre os documentos. |
| 4. Buscar bairro/rua e cruzar pedidos | Campo próprio com busca sem acentos na ementa e nas revisões. Possíveis repetições agrupam rua, bairro identificado e serviço, mostram contagem, datas, autores e fontes. Correspondência automática é identificada. |
| 5. Conferir números | Amostra de Gilberto Quirino, André Ferraz e Lenilda Belo: matérias, presença em sessão e na ordem do dia conferem. O total de 123 sessões também confere. Fontes, resultados e limitações ficam em “Conferência dos dados”. |
| 6. Publicar e automatizar | Adaptado à infraestrutura existente: worker, fila, cron e publicação atômica no Supabase DEV. A rotina diária continua ativa. Carga incompleta, vazia ou com alterações inesperadas não substitui automaticamente o último acervo válido. Frontend compilado localmente; produção permanece sem implantação legislativa. |
| 7. Domínio opcional | Não houve alteração de domínio, DNS ou criação de novo repositório público. O módulo integra o Trombone existente. |

## Cinco grupos, mesma regra

1. **Outros documentos de procedimento primeiro:** pareceres, autógrafos, mensagens, vetos, recursos e requerimentos de urgência permanecem nesse grupo, mesmo que mencionem uma homenagem. Isso evita contar a tramitação de um mesmo projeto como várias propostas novas.
2. **Homenagens:** ementas com pesar, falecimento, parabéns, aplausos, congratulações, título de cidadão, denominação de espaços públicos ou datas comemorativas.
3. **Propostas de lei:** os projetos e emendas normativas restantes, incluindo resoluções e decretos legislativos. O tipo original fica visível para conferência.
4. **Perguntas e cobranças:** pedidos de informação, esclarecimento, prestação de contas, fiscalização, convocação, repúdio ou censura em documentos de solicitação ou moção.
5. **Melhorias nos bairros:** demais pedidos de providência, indicações e requerimentos.
6. O que não se enquadra permanece em **Outros documentos**.

É uma ordem de decisão, sem avaliação de mérito ou identificação de partido. Cada matéria entra em um único grupo; coautorias podem fazer a soma dos perfis superar o total da Câmara. A revisão administrativa pode corrigir grupo, tema, rua, bairro e serviço, com justificativa e vínculo à versão do documento.

Resultado automático no acervo inicial: **349 melhorias, 22 perguntas/cobranças, 91 homenagens, 200 propostas de lei e 456 outros documentos**, totalizando **1.118**. Esses grupos ainda não foram auditados integralmente por uma pessoa. As contagens não constituem nota de desempenho, frequência ou qualidade do mandato.

Foi removido o card de ranking do perfil ampliado de vereador. O acervo de ruas existente continua identificado como acervo, separado da contagem de matérias oficiais.

## Ficha oficial, perfil e conta

- `/camara/64/vereadores/:parliamentarianId` consulta diretamente o identificador parlamentar oficial. Não depende de correspondência aproximada por nome.
- **Criar perfil:** o administrador confirma a criação com o nome oficial, sem criar ou vincular uma conta responsável automaticamente.
- **Vincular existente:** o administrador escolhe um perfil da mesma cidade; apresentação, conta responsável e contatos existentes são preservados.
- A ficha oferece **Criar ou vincular perfil** ao administrador, abrindo a gestão no parlamentar escolhido.
- A gestão impede que um perfil represente simultaneamente dois parlamentares oficiais distintos. A verificação de conta continua sendo identidade; não é aval sobre o mandato.

## Conferência executada

Período **01/01/2025 a 13/11/2026**, acervo DEV `dec51387-adbb-4d36-959d-315ae1985649`.

| Amostra | Matérias: Trombone / Câmara | Presenças em sessão: Trombone / Câmara | Presenças na ordem do dia: Trombone / Câmara |
| --- | ---: | ---: | ---: |
| Gilberto Quirino | 14 / 14 | 119 / 119 | 119 / 119 |
| André Ferraz | 40 / 40 | 93 / 93 | 93 / 93 |
| Lenilda Belo | 49 / 49 | 110 / 110 | 110 / 110 |

Sessões no período: **123 / 123**. Não houve divergência nessas comparações. O [relatório oficial de presença](https://sapl.floresta.pe.leg.br/sistema/relatorios/presenca?legislatura=9&tipo=&exibir_ordem_dia=on&data_inicio_0=01%2F01%2F2025&data_inicio_1=13%2F11%2F2026) foi consultado com todos os tipos de sessão, preservando a diferença entre sessão e ordem do dia.

O relatório separado de matérias por autor retornou HTTP 500 para a amostra. As contagens de autoria foram confrontadas com a pesquisa oficial de matérias, filtrada por autor e período: [Gilberto](https://sapl.floresta.pe.leg.br/materia/pesquisar-materia?data_apresentacao_0=01%2F01%2F2025&data_apresentacao_1=13%2F11%2F2026&autoria__autor=4&pesquisar=Pesquisar), [André](https://sapl.floresta.pe.leg.br/materia/pesquisar-materia?data_apresentacao_0=01%2F01%2F2025&data_apresentacao_1=13%2F11%2F2026&autoria__autor=30&pesquisar=Pesquisar), [Lenilda](https://sapl.floresta.pe.leg.br/materia/pesquisar-materia?data_apresentacao_0=01%2F01%2F2025&data_apresentacao_1=13%2F11%2F2026&autoria__autor=53&pesquisar=Pesquisar).

[Resultados completos e fontes da amostra](research/RADAR_LEGISLATIVO_CONFERENCIA_2026-11-13.json). O script `node scripts/audit-legislative.mjs` usa somente consultas anônimas do radar e páginas públicas da Câmara, sem chave de serviço. Se um valor não puder ser confirmado, o resultado é nulo, com estado “Não confirmado”; divergências são registradas.

A conferência aparece em ajuda opcional no radar. Uma nova execução publicada não herda automaticamente a confirmação da amostra anterior: a interface avisa quando o ID do acervo mudou.

## Proteção da atualização diária

- Requisições sequenciais, identificação do coletor e intervalo de um segundo entre páginas. Retentativas respeitam `Retry-After` numérico ou em data HTTP, com adiamento controlado.
- A coleta precisa terminar todas as páginas e reconciliar os totais da própria fonte.
- Fonte sem matérias, autores, parlamentares ou tipos essenciais falha e preserva a publicação anterior.
- Registros antes publicados que desapareçam geram bloqueio de publicação. Alteração de mais de 40% das matérias comparáveis, com pelo menos dez registros, também exige conferência. Esse limiar é uma proteção operacional explícita, não uma fórmula de desempenho parlamentar.
- A execução fica pronta para revisão; a publicação automática a ignora. O administrador registra uma conferência fundamentada e só então pode publicar manualmente. Há auditoria dessa decisão.
- O servidor também aplica o bloqueio na operação de publicação, evitando que um cliente ou versão antiga do worker o contorne.

## Limites declarados

- Presença publicada não permite inferir falta, suplência ou percentual de frequência. A legislatura da fonte aparece como 2025–2026 e continua dependendo de revisão de exercício e mandato.
- Busca territorial usa ementas e revisões; não há OCR ou leitura integral automática de todos os anexos. Endereços múltiplos ou ambíguos permanecem pesquisáveis, mas não são unidos automaticamente.
- A recorrência usa pelo menos duas matérias distintas; aliases de rua não são unidos por aproximação. Bairro desconhecido não é automaticamente equiparado a um bairro conhecido.
- Correspondência automática é uma estimativa, sem geocodificação. Pedido repetido não prova que a Prefeitura ignorou o local, nem comprova atendimento ou crédito por execução.
- A amostra não audita integralmente os 1.118 documentos, os cinco grupos, todos os mandatos ou a cobertura nominal de votos. Percentuais de unanimidade e frequência continuam indisponíveis.
- Estatísticas legislativas usam a Câmara como fonte. Broncas relacionadas são identificadas como registros do Trombone, sem virar estatística oficial de atuação parlamentar.
- Contatos pessoais não são importados do SAPL. Os canais existentes do perfil continuam apresentados como informações públicas fornecidas pelo responsável.
- Sete ciclos diários ainda precisam ser observados antes de produção, conforme o plano original.

## Verificações técnicas

- 29 testes unitários/de regressão passaram.
- Dez migrações do módulo aplicadas em PostgreSQL descartável; testados criação e vínculo de perfil, filtros, privacidade, classificação, publicação normal, registros removidos e fonte vazia.
- Consulta anônima confirmou acesso às **32 fichas oficiais** em DEV; os cinco grupos somam o acervo completo.
- Chrome: 390, 1440 e 1920 px, temas claro e escuro, sem exceções de execução ou rolagem horizontal da página.
- Build completo Vite passou. Migrações 435–437 e versão atual do coletor implantadas somente em DEV.

[Operação e ambientes](RADAR_LEGISLATIVO_IMPLEMENTACAO.md).

[Registro sanitizado das verificações deste ajuste](research/RADAR_LEGISLATIVO_ALINHAMENTO_GUIA_2026-11-13.json).
