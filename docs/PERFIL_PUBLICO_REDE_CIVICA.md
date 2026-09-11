# Perfil público e identidade cívica

## Resumo executivo

O Trombone Cidadão pode evoluir de uma plataforma onde a pessoa registra broncas para uma rede de participação cívica: cada usuário pode criar uma identidade pública, acompanhar o próprio histórico de cobranças e mostrar o que foi resolvido.

O perfil não deve copiar o Instagram inteiro. A proposta é uma **vitrine de impacto público**, com foco em:

- confiança sobre quem está cobrando;
- histórico verificável de broncas e atualizações;
- colaboração entre cidadãos, jornalistas, influenciadores, vereadores e órgãos públicos;
- compartilhamento simples de uma página pública;
- proteção contra exposição indevida, assédio e gamificação predatória.

O produto deve valorizar a qualidade e o desfecho das cobranças, não apenas o volume de publicações.

## Objetivo

Permitir que uma pessoa crie um nome de usuário único e um perfil público compartilhável, capaz de responder rapidamente:

1. Quem é esta pessoa dentro da rede?
2. Em que cidade ou cidades ela atua?
3. Que problemas ela ajudou a tornar visíveis?
4. Quantas dessas situações tiveram andamento ou resolução?
5. Como posso acompanhar, apoiar ou compartilhar este trabalho?

## Público prioritário

### Cidadão ativo

Quer acompanhar suas próprias broncas, construir credibilidade e mostrar resultados para sua comunidade.

### Jornalista ou comunicador local

Precisa de uma página confiável para divulgar as demandas que acompanha, sem depender de capturas de tela dispersas.

### Influenciador ou liderança comunitária

Quer centralizar cobranças por bairro, cidade ou tema e mobilizar apoiadores.

### Vereador, órgão público ou gestor

Pode ter um perfil institucional verificado para acompanhar demandas, publicar respostas e divulgar resultados sem apagar a autoria original da bronca.

## Princípios do produto

- **Impacto antes de vaidade:** resoluções, atualizações e evidências importam mais que contagem bruta.
- **Autoria preservada:** uma bronca continua pertencendo ao autor, mesmo quando recebe apoio ou é compartilhada.
- **Transparência de estado:** diferenciar registrada, em análise, encaminhada, em andamento, resolvida e não confirmada.
- **Privacidade por padrão:** o perfil público não expõe telefone, e-mail, endereço, documentos ou localização residencial.
- **Identidade responsável:** nomes de usuário não podem simular órgãos, pessoas públicas ou marcas sem verificação.
- **Moderação proporcional:** críticas e cobranças são permitidas; assédio, ameaça, doxxing e spam não.
- **Uma rede local primeiro:** a cidade e os bairros são o contexto principal, não uma timeline global indiferenciada.

## Experiência proposta

### URL pública

Formato principal:

```text
/@lairton
```

Formato alternativo compatível com SEO e integrações:

```text
/u/lairton
```

`/u/:username` pode ser a rota canônica, enquanto `/@:username` redireciona para ela. O link deve ser curto, copiável e funcionar para pessoas não autenticadas.

### Cabeçalho do perfil

Exibir:

- avatar;
- nome de exibição;
- `@username`;
- selo de verificação, quando aplicável;
- tipo de perfil: cidadão, jornalista, organização, órgão público, mandato ou liderança comunitária;
- cidade principal e áreas de atuação, sem endereço exato;
- biografia curta;
- link externo opcional;
- data de entrada na plataforma;
- botão **Compartilhar perfil**;
- botão **Acompanhar**, caso o sistema de seguidores seja habilitado.

Exemplo de apresentação:

```text
Mariana Souza
@marianasouza
Jornalista local · Floresta/PE
Cobro melhorias no transporte, saúde e iluminação pública.
```

### Resumo de impacto

O topo do perfil deve mostrar métricas interpretáveis, com links para o conteúdo que as sustenta:

- broncas publicadas;
- broncas com atualização;
- broncas resolvidas ou normalizadas;
- apoios recebidos;
- bairros ou cidades alcançados;
- dias de participação, se a gamificação continuar ativa.

Evitar um número único de “influência”. O perfil deve explicar como cada métrica é calculada.

### Abas públicas

#### Atividade

Lista cronológica de ações públicas relevantes:

- nova bronca aprovada;
- atualização publicada;
- resolução confirmada;
- apoio em uma bronca;
- comentário público, apenas se o usuário optar por exibi-lo.

#### Broncas

Grade ou lista das broncas públicas do usuário, com filtros:

- todas;
- abertas;
- em andamento;
- resolvidas;
- por cidade;
- por categoria.

Cada item mostra foto/capa, categoria, cidade, estado atual, data e quantidade de apoios.

#### Resolvidas

Vitrine específica de impacto, priorizando:

- antes e depois, quando houver;
- atualização oficial;
- confirmação comunitária;
- tempo entre registro e resolução;
- link para a bronca completa.

#### Sobre

Biografia, cidades acompanhadas, links externos, badges/verificações e preferências públicas.

### Perfil vazio

Um perfil novo não deve parecer quebrado. Mostrar uma apresentação simples e uma chamada contextual:

```text
Este perfil ainda não publicou broncas.
Quando houver uma cobrança pública, ela aparecerá aqui.
```

Não exibir ranking vazio, números artificiais ou recomendações irrelevantes.

## Criação do nome de usuário

### Fluxo

1. A pessoa abre **Editar perfil** ou conclui o cadastro.
2. Informa o nome de usuário.
3. O sistema normaliza e verifica disponibilidade em tempo real.
4. A pessoa vê uma prévia do link público.
5. Ao salvar, o username fica reservado e o perfil público pode ser ativado.

### Regras

- entre 3 e 30 caracteres;
- letras minúsculas, números, ponto e sublinhado;
- sem espaços, acentos ou caracteres especiais;
- não diferenciar maiúsculas de minúsculas;
- não permitir username iniciado ou terminado por ponto;
- não permitir dois pontos consecutivos;
- reservar palavras como `admin`, `suporte`, `trombone`, `prefeitura`, `vereador`, `jornalista`, `oficial` e nomes de cidades conforme a política de verificação;
- não permitir termos ofensivos, ameaçadores ou usados para impersonação;
- permitir alteração, mas manter o endereço antigo redirecionando por um período limitado;
- aplicar limite de tentativas para evitar enumeração de usernames.

### Nome de exibição versus username

O nome de exibição pode conter acentos e nome completo. O username é um identificador estável e não deve ser usado para forçar a pessoa a publicar o nome civil.

## Visibilidade e privacidade

O usuário controla:

- perfil público ativado/desativado;
- exibição de cidade principal;
- exibição de broncas resolvidas;
- exibição de apoios e comentários;
- exibição de atividade recente;
- possibilidade de receber novos seguidores;
- indexação do perfil por mecanismos de busca.

### Conteúdo que nunca deve ficar público por padrão

- telefone;
- e-mail;
- identificadores internos;
- endereço residencial ou ponto exato do usuário;
- dados de moderação interna;
- broncas privadas ou rejeitadas;
- rascunhos;
- informações de pagamento;
- tokens e dados de autenticação.

Uma bronca pública pode ter localização pública própria, mas isso não deve revelar automaticamente a residência do autor.

## Verificação e tipos de conta

### Cidadão

Ativado automaticamente após o perfil público ser criado. Não recebe selo de verificação.

### Jornalista ou comunicador

Solicita verificação com link profissional, publicação, domínio, rede social ou outro comprovante. O selo deve significar apenas que a identidade ou função foi revisada, não que a plataforma concorda com opiniões.

### Vereador, mandato ou órgão público

Verificação manual obrigatória. O perfil deve informar claramente se representa uma pessoa, um mandato ou uma instituição. A troca de ocupante não deve apagar o histórico institucional.

### Organização ou liderança comunitária

Pode solicitar verificação por associação, coletivo, ONG ou iniciativa local. Deve existir um responsável autenticado e um canal para transferência da administração.

## Valor específico para vereadores e mandatos

O perfil público pode funcionar como uma **central de prestação de contas do mandato**, conectando cada divulgação a uma demanda real da população. O vereador ganha uma forma organizada de demonstrar trabalho; a população ganha contexto, histórico e possibilidade de verificar o resultado.

### Como o vereador pode divulgar o trabalho

#### 1. Publicar a atuação vinculada à bronca

O mandato pode responder a uma bronca pública com uma atualização identificada como **Resposta do mandato**. Essa atualização deve registrar:

- o que foi apurado;
- qual órgão foi acionado;
- número de protocolo ou ofício, quando puder ser público;
- data do encaminhamento;
- prazo informado pelo órgão;
- documentos ou links oficiais;
- próxima ação prevista.

A resposta fica vinculada à bronca original e não substitui a narrativa do cidadão.

#### 2. Criar compromissos acompanháveis

Quando o vereador assumir uma providência, o mandato pode criar um compromisso público:

```text
Solicitar reparo da iluminação na Rua X
Responsável: Mandato da Vereadora Ana Lima
Órgão acionado: Secretaria de Serviços Públicos
Prazo informado: 15/10/2026
Status: Em acompanhamento
```

O compromisso deve aceitar atualizações, documentos e mudança de status, mas a conclusão precisa ser confirmada pelo cidadão autor, pela comunidade ou por evidência pública. O vereador não deve conseguir marcar sozinho uma bronca como resolvida.

#### 3. Mostrar um painel de resultados

O perfil do mandato pode destacar:

- demandas recebidas;
- demandas encaminhadas;
- demandas com resposta oficial;
- demandas em acompanhamento;
- demandas resolvidas com confirmação;
- bairros atendidos;
- temas mais frequentes;
- tempo médio entre o recebimento e o primeiro encaminhamento.

Esses números precisam abrir a lista de casos que os compõem. O painel não deve apresentar apenas percentuais promocionais.

#### 4. Publicar relatórios por bairro

O mandato pode gerar uma página ou filtro compartilhável, por exemplo:

```text
Atuação do mandato no Bairro Centro
18 demandas acompanhadas · 7 resolvidas · 4 em andamento
```

O relatório deve listar as broncas, datas, órgãos acionados e estado atual. Isso transforma uma publicação genérica de rede social em uma prestação de contas verificável.

#### 5. Compartilhar atualizações prontas

Para cada resposta ou resultado, gerar um cartão com:

- nome e selo do mandato;
- título da bronca;
- cidade/bairro, quando público;
- ação realizada;
- estado atual;
- link para a página completa.

O cartão pode ser compartilhado no WhatsApp, Instagram Stories, Facebook e redes do dispositivo. A arte deve destacar o fato e o link, não apenas a foto do vereador.

#### 6. Receber demandas sem transformar o app em canal de propaganda

O perfil pode ter um botão **Enviar demanda ao mandato**, que direciona o cidadão para uma bronca existente ou para o fluxo de criação de uma nova bronca. A demanda continua pública e sujeita às regras da plataforma; não deve existir uma caixa privada que substitua o registro público quando a pessoa deseja transparência.

### O que o vereador ganha

- um link único para divulgar sua atuação;
- histórico pesquisável de encaminhamentos;
- redução de posts repetidos e planilhas desconectadas;
- evidência de presença nos bairros;
- identificação de problemas recorrentes para orientar políticas públicas;
- notificações apenas das demandas relevantes para sua área;
- possibilidade de responder diretamente sem apagar ou reescrever a reclamação original;
- relatório de resultados que pode ser compartilhado com imprensa e população.

### O que a população ganha

- sabe se a demanda foi recebida;
- vê qual órgão foi acionado;
- acompanha prazo e próximos passos;
- consegue comparar promessa, encaminhamento e resultado;
- pode confirmar ou contestar a resolução;
- encontra todas as atualizações em uma página, em vez de depender de publicações efêmeras.

### Regras de confiança para mandatos

- O selo deve identificar a conta verificada, não endossar o político.
- O mandato não pode excluir broncas, apoios ou comentários de terceiros.
- A resposta do mandato deve ter autoria, data e histórico de edição.
- Uma publicação promocional deve ser separada visualmente de uma atualização factual.
- O sistema deve exibir quando uma resolução foi confirmada pelo cidadão, pela comunidade, por órgão público ou apenas declarada pelo mandato.
- Trocas de vereador devem permitir transferir a conta institucional do mandato sem apagar o histórico.
- Perfis pessoais e perfis institucionais devem ser claramente diferentes.
- O mandato deve poder responder apenas em cidades e temas compatíveis com seu escopo, evitando apropriação de demandas de outras localidades.

### Limite entre prestação de contas e propaganda

O produto deve ser desenhado para informar, não para criar uma ferramenta de campanha. A plataforma deve revisar com assessoria jurídica e de compliance as regras aplicáveis antes de oferecer recursos de impulsionamento, segmentação política, anúncios ou mensagens em massa. No MVP, recomenda-se não vender alcance nem permitir publicidade política direcionada.

## Engajamento saudável

## Como reaproveitar os outros módulos da plataforma

O perfil público pode ser a camada que conecta os módulos já existentes, sem duplicar suas telas nem criar uma nova rede social paralela. Cada módulo deve contribuir com uma prova diferente de participação cívica.

### Visão geral do perfil de impacto

O perfil pode ter uma seção **Meu impacto na cidade** com cartões compactos e links para as telas originais:

| Módulo existente | O que aparece no perfil | Valor para o cidadão | Valor para jornalista, influenciador ou vereador |
| --- | --- | --- | --- |
| Broncas | publicadas, apoiadas, atualizadas e resolvidas | histórico de cobrança | pauta, evidência e prestação de contas |
| Obras públicas | obras acompanhadas, paradas, em andamento e concluídas | fiscalização do dinheiro público | relatório territorial de acompanhamento |
| Petições | criadas, assinadas e metas alcançadas | mobilização coletiva | demonstração de apoio a uma causa |
| Patrulhas | saídas, bairros percorridos e verificações feitas | participação em campo | prova de presença e cobertura local |
| Missões e medalhas | marcos de qualidade e colaboração | reconhecimento de contribuição | identificação de lideranças comunitárias |
| Estatísticas | recorte por cidade, categoria e status | contexto para entender o problema | dados para comunicação e mandato |
| Radar da cidade | acontecimentos acompanhados e áreas monitoradas | informação local em tempo real | divulgação de alertas e acompanhamento de resposta |
| Pavimentação | ruas verificadas, cobertura e conflitos | evidência sobre a condição das ruas | diagnóstico territorial, sem prometer obra |
| Serviços | pontos e serviços públicos consultados | acesso a recursos da cidade | orientação útil para a população |
| Notícias | matérias ou atualizações relacionadas | contexto e memória local | distribuição de informação verificada |
| Favoritos | broncas e obras acompanhadas | organização pessoal | fila privada de monitoramento |

O perfil não deve somar tudo em um número único. Uma patrulha, uma assinatura de petição e uma obra concluída são ações diferentes; o valor está na narrativa conectada e nos links para evidências.

### Obras públicas: o principal módulo complementar

O módulo de obras pode transformar o perfil em uma vitrine de fiscalização contínua. Para cada usuário, mandato ou organização, exibir:

- obras públicas acompanhadas;
- obras paradas ou inacabadas que estão na lista de atenção;
- obras em andamento;
- obras concluídas, sem presumir que conclusão administrativa significa qualidade comprovada;
- investimento associado, quando o dado for público;
- bairro, área e construtora;
- última atualização e tempo desde a última atualização;
- broncas relacionadas à obra;
- fotos ou evidências antes/depois, quando existirem;
- link para o mapa e para os detalhes da obra.

#### Como o vereador usaria obras

O mandato poderia publicar uma atualização factual como:

```text
Obra acompanhada: reforma da praça do Bairro Centro
Situação no cadastro: em andamento
Última verificação: 04/09/2026
Próximo passo informado: conclusão da iluminação
```

O vereador não deve poder mudar o status oficial da obra só para melhorar seu perfil. Ele pode registrar que visitou, solicitou informação, protocolou pedido ou recebeu resposta. O status da obra continua vindo da fonte autorizada, e a plataforma deve separar:

- **situação oficial da obra**;
- **ação do mandato**;
- **verificação comunitária**;
- **evidência publicada**.

Essa separação evita que uma visita seja apresentada como entrega ou que uma obra cadastrada como concluída seja usada como propaganda sem evidência.

#### Cartão compartilhável de obra

Criar um cartão de compartilhamento com:

- nome da obra;
- cidade e bairro;
- situação atual;
- valor público, quando disponível;
- ação registrada pelo usuário ou mandato;
- data da última atualização;
- link para detalhes.

O cartão deve dizer **“obra acompanhada”**, **“obra em andamento”** ou **“obra concluída no cadastro”**, conforme o dado real. Evitar frases automáticas como “obra entregue pelo vereador”.

### Petições como mobilização formal

As petições podem aparecer em três blocos:

- **Criadas:** causas iniciadas pelo perfil;
- **Apoiadas:** petições assinadas pelo usuário;
- **Encerradas com resultado:** petições cuja meta, resposta ou vitória está registrada.

Para mandatos e lideranças, a página pode reunir petições e broncas sobre o mesmo tema. Um abaixo-assinado sobre iluminação, por exemplo, pode apontar para as broncas e obras relacionadas, formando uma linha de mobilização:

```text
Problema identificado → apoio coletivo → petição → encaminhamento → resposta → resultado
```

Não misturar assinatura com autoria. Assinar uma petição demonstra apoio, mas não significa que o usuário criou ou representa a causa.

### Patrulhas e verificação em campo

As patrulhas são úteis para provar presença e observação local, especialmente para líderes comunitários, jornalistas e vereadores. O perfil pode mostrar:

- número de patrulhas públicas compartilhadas;
- bairros percorridos;
- broncas confirmadas, atualizadas ou descartadas;
- distância total apenas como dado secundário;
- última patrulha compartilhada;
- fotos e registros produzidos durante a saída.

O destaque deve ser a contribuição validada, não quilômetros percorridos. Passar perto de um local sem confirmar um problema não deve aparecer como fiscalização concluída.

### Missões, medalhas e qualidade

O sistema de missões pode fornecer reconhecimento leve para perfis públicos:

- observação confiável;
- participação em diferentes bairros;
- confirmação de problemas de outras pessoas;
- atualizações aceitas;
- colaboração em petições ou patrulhas.

Exibir somente medalhas desbloqueadas e explicar o critério. Não mostrar um ranking como se fosse autoridade sobre a cidade. Medalhas não devem aumentar alcance, prioridade de bronca ou poder de moderação.

### Estatísticas como contexto, não autopromoção

O módulo de estatísticas pode alimentar comparações honestas:

- broncas por status;
- categorias mais frequentes;
- evolução mensal;
- resoluções;
- recorte por cidade;
- obras por situação;
- cobertura e lacunas de verificação.

No perfil, usar no máximo um resumo e links para a estatística completa. Para um vereador, por exemplo, “acompanhou 12 obras” é menos informativo que “acompanhou 12 obras, sendo 3 paralisadas e 4 em andamento”, desde que a lista esteja acessível.

### Radar, serviços e notícias

Esses módulos podem compor a camada de utilidade pública do perfil:

- radar: alertas e eventos que o perfil acompanha ou divulgou;
- serviços: guias úteis compartilhados pela pessoa ou mandato;
- notícias: matérias relacionadas às demandas, desde que a autoria jornalística seja preservada.

Uma notícia não deve parecer escrita pelo perfil só porque foi compartilhada por ele. O cartão precisa mostrar claramente a fonte original.

### Favoritos e acompanhamento privado

Favoritos são úteis para o usuário, mas não devem ser públicos por padrão. Eles podem alimentar:

- a fila pessoal de acompanhamento;
- lembretes de atualização;
- recomendações locais no painel privado;
- um bloco público opcional chamado **Acompanhando agora**.

Para mandatos, o bloco público pode mostrar obras e broncas acompanhadas, mas o usuário deve escolher item por item. Não expor automaticamente tudo que foi salvo como favorito.

### Relatórios e canais do órgão

Os relatórios públicos de órgão e os canais de envio já existentes podem enriquecer a cadeia de prestação de contas:

- mostrar quando uma demanda foi enviada ao canal correto;
- registrar entrega confirmada pelo provedor;
- vincular protocolo ou resposta oficial;
- indicar o que ainda não teve confirmação.

O perfil não deve transformar “e-mail enviado” em “problema resolvido”. Os estados precisam continuar separados: preparado, enviado, entregue, respondido e resolvido.

### Metas comunitárias e campanhas

Metas de cobertura, campanhas e ações coletivas podem aparecer como participações temporárias:

- meta da cidade ou do bairro;
- período da campanha;
- contribuição do usuário;
- resultado público da meta;
- uso que a prefeitura ou organização fez dos dados.

O resultado da meta deve ser compartilhado junto com o que foi produzido e utilizado. Contar ruas verificadas sem informar o que aconteceu depois enfraquece a confiança.

## Composição recomendada por tipo de perfil

### Cidadão

Broncas, resoluções, apoios, patrulhas, medalhas e favoritos privados.

### Jornalista

Broncas acompanhadas, obras investigadas, notícias publicadas, petições relacionadas e relatórios por bairro. O perfil deve permitir indicar links para veículos ou portfólio.

### Influenciador ou liderança comunitária

Broncas mobilizadas, petições criadas, campanhas, bairros alcançados e resoluções confirmadas.

### Vereador ou mandato

Broncas recebidas, respostas do mandato, compromissos, obras acompanhadas, relatórios por bairro, petições apoiadas e resultados confirmados.

### Órgão público

Demandas recebidas, relatórios de encaminhamento, respostas oficiais, obras sob sua responsabilidade e tempo de resposta. O perfil deve ser institucional, sem ranking de servidores.

## Regra de integração

O perfil público deve ser um **índice de evidências**, não um segundo banco de dados. Cada cartão deve apontar para o módulo de origem, obedecer às mesmas regras de privacidade e usar o estado oficial daquela entidade.

Antes de adicionar qualquer métrica ao perfil, responder:

1. Qual é a fonte do dado?
2. Quem pode alterá-lo?
3. O estado é oficial, declarado pelo usuário ou confirmado pela comunidade?
4. O visitante consegue abrir os casos que formam o número?
5. O número pode incentivar spam, apropriação política ou exposição indevida?

Se a resposta não for clara, o dado deve ficar fora do resumo público até que exista uma regra verificável.

### Seguir um perfil

Seguir deve servir para receber atualizações importantes, não uma enxurrada de notificações. Preferências sugeridas:

- novas broncas;
- resoluções;
- atualizações de broncas já apoiadas;
- resumo semanal.

### Apoiar broncas

O apoio existente deve aparecer no perfil como participação agregada, sem transformar cada apoio em uma postagem social. Evitar contadores que incentivem competição vazia.

### Compartilhar

Cada perfil deve gerar:

- link copiável;
- cartão Open Graph com nome, cidade, resumo de impacto e avatar;
- compartilhamento para WhatsApp, Instagram Stories e redes do dispositivo;
- links individuais para broncas e resoluções.

O cartão de compartilhamento deve priorizar uma conquista verificável, por exemplo:

```text
Mariana Souza ajudou a acompanhar 12 cobranças em Floresta.
3 foram resolvidas. Veja o histórico no Trombone Cidadão.
```

## Reputação cívica

Não criar um “score de pessoa” público no MVP. Em vez disso, mostrar sinais explicáveis:

- perfil verificado;
- número de broncas aprovadas;
- proporção de broncas com atualização;
- resoluções confirmadas;
- apoios recebidos;
- tempo de participação;
- contribuição em cidades ou bairros.

Uma métrica agregada pode ser estudada depois, desde que:

- tenha fórmula pública;
- não penalize quem denuncia pouco, mas com qualidade;
- não premie spam;
- permita contestação;
- não seja usada para restringir acesso ou visibilidade sem revisão.

## Modelo de dados sugerido

### Alterações em `profiles`

Adicionar campos públicos e de controle:

```sql
alter table public.profiles
  add column if not exists username text,
  add column if not exists username_normalized text,
  add column if not exists public_profile_enabled boolean not null default false,
  add column if not exists public_profile_type text not null default 'citizen',
  add column if not exists public_bio text,
  add column if not exists public_website text,
  add column if not exists public_city_visible boolean not null default true,
  add column if not exists public_activity_visible boolean not null default true,
  add column if not exists public_searchable boolean not null default true,
  add column if not exists verification_status text not null default 'none',
  add column if not exists verified_at timestamptz;

create unique index if not exists profiles_username_normalized_key
  on public.profiles (username_normalized)
  where username_normalized is not null;
```

### Tabelas futuras

#### `profile_follows`

```text
follower_id uuid
followed_id uuid
created_at timestamptz
```

Chave única em `(follower_id, followed_id)` e bloqueio de auto-seguimento.

#### `profile_verification_requests`

```text
id uuid
profile_id uuid
requested_type text
evidence_url text
note text
status text -- pending, approved, rejected, revoked
reviewed_by uuid
reviewed_at timestamptz
created_at timestamptz
```

#### `profile_username_history`

Guardar usernames anteriores, data de alteração e motivo. Isso permite redirecionamento, auditoria e prevenção de impersonação após uma troca.

### RPCs recomendadas

- `check_username_availability(p_username text)`;
- `set_public_username(p_username text)`;
- `get_public_profile(p_username text)`;
- `get_public_profile_stats(p_profile_id uuid)`;
- `request_profile_verification(...)`;
- `follow_public_profile(p_profile_id uuid)`;
- `unfollow_public_profile(p_profile_id uuid)`.

A leitura pública deve retornar apenas dados explicitamente públicos. Não depender de `select *` em `profiles` para uma página pública.

## Segurança e RLS

- O usuário pode editar somente seus próprios campos de perfil.
- Campos administrativos, `is_admin`, dados internos e status de moderação não podem ser alterados pelo cliente.
- A leitura pública exige `public_profile_enabled = true`.
- Broncas exibidas no perfil precisam estar aprovadas e respeitar as mesmas regras de visibilidade da página `/bronca/:reportId`.
- Usuários bloqueados, suspensos ou com perfil desativado não devem aparecer em buscas públicas.
- A checagem de disponibilidade de username deve responder apenas disponível/indisponível, sem revelar quem possui o nome.
- Todas as RPCs de escrita devem validar `auth.uid()` e aplicar rate limit no cliente e, quando possível, no servidor.
- URLs externas, biografias e nomes devem ser sanitizados na renderização e nos cartões de compartilhamento.
- O perfil público deve ter ação de denúncia e bloqueio.

## Moderação

### Ações do usuário

- denunciar perfil;
- denunciar conteúdo publicado;
- bloquear perfil;
- ocultar atividade própria;
- desativar o perfil público;
- solicitar correção de categoria ou verificação.

### Ações administrativas

- suspender perfil público sem apagar a conta;
- liberar ou revogar verificação;
- bloquear username;
- preservar histórico de alterações;
- remover conteúdo público que viole as regras;
- registrar motivo e responsável em log de auditoria.

### Casos de risco

- perfil fingindo ser prefeitura ou vereador;
- campanha coordenada de spam;
- publicação de telefone ou endereço de terceiro;
- perseguição a servidor, empresa ou cidadão;
- uso do perfil para difamação sem relação com uma bronca verificável;
- tentativa de manipular contadores com contas automatizadas.

## MVP recomendado

### Incluído

1. Username único e editável.
2. Perfil público acessível por `/u/:username`.
3. Avatar, nome de exibição, bio, tipo de perfil e cidade opcional.
4. Lista pública de broncas aprovadas do usuário.
5. Aba ou filtro de resolvidas.
6. Métricas básicas explicáveis.
7. Compartilhamento de perfil e metadados Open Graph.
8. Ativação/desativação do perfil.
9. Denúncia do perfil.
10. RLS e RPC de leitura pública segura.

### Fora do MVP

- mensagens diretas;
- stories;
- vídeos curtos;
- timeline global;
- algoritmo de recomendação;
- verificação automática;
- monetização de influenciadores;
- sistema de seguidores com notificações em tempo real;
- comentários novos no perfil, separados dos comentários das broncas.

## Fases de entrega

### Fase 1: identidade e perfil público

- migration de campos e índice;
- validação de username;
- edição na página `/perfil`;
- nova página `/u/:username`;
- consulta pública segura;
- listagem de broncas aprovadas;
- compartilhamento básico.

### Fase 2: impacto e confiança

- métricas de resolução e atualização;
- aba de resolvidas;
- cartões Open Graph personalizados;
- denúncia, bloqueio e moderação;
- solicitação de verificação;
- badges de tipo de perfil.

### Fase 3: rede local

- seguir perfis;
- preferências de notificação;
- resumos por cidade;
- perfis institucionais e de mandato;
- colaboração entre autores em broncas relacionadas.

## Critérios de aceite do MVP

- Um usuário autenticado consegue reservar um username disponível.
- Dois usuários não conseguem usar o mesmo username, inclusive variando maiúsculas e minúsculas.
- O usuário consegue ativar e desativar o perfil público.
- Uma pessoa não autenticada consegue abrir o link público sem acessar dados privados.
- O perfil público mostra apenas broncas aprovadas e visíveis.
- Broncas resolvidas aparecem em uma visão separada ou filtro claro.
- A página possui título, descrição e imagem de compartilhamento coerentes.
- Telefone, e-mail, dados administrativos e rascunhos não aparecem no HTML nem na resposta pública.
- Um perfil denunciado pode ser ocultado por moderação sem apagar seu histórico interno.
- Alterar o username não quebra imediatamente links antigos, dentro da política de redirecionamento definida.

## Métricas de sucesso

### Ativação

- percentual de usuários ativos que escolhem username;
- percentual que ativa o perfil público;
- tempo entre abrir a edição e publicar o perfil.

### Engajamento de qualidade

- compartilhamentos de perfis que geram visitas;
- visitas que abrem uma bronca;
- novos apoios após o compartilhamento;
- broncas com pelo menos uma atualização;
- resoluções confirmadas após a criação do perfil.

### Saúde da rede

- denúncias por mil perfis públicos;
- taxa de usernames bloqueados;
- perfis suspensos por impersonação;
- concentração de atividade em poucos usuários;
- percentual de notificações desligadas por excesso.

## Decisão de produto

O perfil público deve ser vendido ao usuário como **“seu histórico de participação na cidade”**, e não como uma página de vaidade. Essa linguagem diferencia o Trombone Cidadão de redes sociais tradicionais e cria uma razão concreta para jornalistas, influenciadores e representantes públicos compartilharem seus links: o perfil funciona como uma prestação de contas navegável, com broncas, evidências, atualizações e resultados.

## Nota operacional

O arquivo `.env` atualmente contém chaves sensíveis e tokens de serviços. Antes de publicar esta funcionalidade ou compartilhar o repositório, as chaves privadas devem ser removidas do controle de versão e rotacionadas, especialmente `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, tokens de pagamento e segredos de reCAPTCHA.
