# Plano de implementação — painel do eletricista no app

**Data:** 02/10/2026
**Estado:** plano para revisão, atualizado com o resumo dos áudios enviado pelo usuário. A transcrição literal ainda não foi verificada.

## 1. Objetivo

Dar ao eletricista **um painel operacional próprio e único** no aplicativo Android/iOS: receber ofertas de manutenção de iluminação, avaliar e aceitar um serviço, deslocar-se ao local, registrar a execução e acompanhar suas ordens. “Disponíveis” e “Minhas” são seções desse mesmo painel. A prefeitura continua podendo criar e atribuir ordens diretamente.

O painel do eletricista terá rota, navegação, cartões e detalhe de serviço próprios. Ao entrar nessa área, ele não verá o feed, o mapa e os formulários usados pelo cidadão, nem a lista administrativa genérica da prefeitura. O aplicativo instalado pode ser o mesmo; a experiência exibida depende do perfil institucional ativo.

O modelo de referência descrito pelo usuário é semelhante ao de um aplicativo de corridas: uma notificação leva à oportunidade; o profissional decide se aceita. **Não aceitar agora não impede aceitar depois.** Este documento separa **o resumo fornecido pelo usuário**, **o que foi confirmado no código** e **as decisões de implementação propostas**.

## 2. Fontes e limite desta versão

- Pedido do usuário: plano de implementação para o painel do eletricista, principalmente no app.
- Resumo dos áudios fornecido pelo usuário nesta conversa: notificar serviço pendente; permitir visualizar e aceitar ou não; ao aceitar, assumir responsabilidade; ordenar primeiro os urgentes, depois as ordens de serviço segundo sua prioridade e por fim as demais solicitações; oferecer busca/organização por proximidade; permitir aceitar mais tarde uma demanda inicialmente não aceita.
- Arquivos recebidos: `WhatsApp Ptt 2026-10-01 at 21.35.52.ogg` e `WhatsApp Ptt 2026-10-01 at 21.37.31.ogg`. Estão acessíveis, mas este ambiente não tem transcritor de fala em português. **A síntese acima vem da resposta do usuário, não de uma audição verificada dos arquivos.**
- Código analisado: `src/hooks/useMunicipalityWorkspace.js`, `src/components/municipality/MunicipalityLayout.jsx`, `src/pages/MunicipalDemandsPage.jsx`, `src/components/municipality/MunicipalDemandDrawer.jsx`, `src/lib/municipalDemand.js`, `src/lib/municipalExport.js`, `src/lib/offlineQueue.js`, `src/contexts/NotificationContext.jsx`, `supabase/migrations/304_eletricista_municipal.sql`, `310_corrigir_validacao_eletricista_ordem.sql`, `316_referencia_e_conclusao_opcional.sql` e `317_municipal_enabled_categories.sql`.
- A árvore de trabalho já contém alterações não relacionadas a este plano. Este documento descreve o estado local observado em 02/10/2026; não pressupõe que as migrações pendentes já estejam em produção.

## 3. Situação atual confirmada

1. O papel `eletricista` existe na equipe de uma secretaria. O workspace identifica esse papel e a navegação municipal mostra apenas “Ordens de serviço” para uma conta exclusivamente de eletricista.
2. A RLS da migração 304 limita a leitura do eletricista às ordens atribuídas a ele. A RPC de gravação permite alterar execução, resultado, registro técnico e status; impede mudanças no encaminhamento. A atribuição de eletricistas é limitada à categoria `iluminacao`.
3. O app usa hoje a mesma página de ordens da prefeitura. A entrada padrão da lista é o status `aberta`, que pode deixar fora da primeira tela ordens atribuídas em outras etapas. A lista móvel mostra cartões, mas mantém filtros, seleção, exportação e indicadores pensados para gestão.
4. No detalhe, o modo eletricista mostra as seções “Atendimento”, “Anexos” e “Histórico”. “Dados” e “Local” deixam de aparecer, embora título, descrição, endereço, poste e coordenadas sejam essenciais na rua.
5. O formulário faz upload dos anexos e depois chama `salvar_demanda_municipal`. Não há fila offline de ordens municipais; a fila IndexedDB existente atende outros fluxos. Falha de rede durante o trabalho em campo precisa de tratamento próprio.
6. A atribuição cria notificação interna `agency_case` com link para a ordem. O aplicativo tem infraestrutura de push e tratamento de links, mas a entrega e abertura desse caso específico precisam ser verificadas em dispositivo.
7. A migração 316 torna opcionais resultado, foto e registro técnico para concluir a ordem. Portanto, qualquer exigência nova de evidência precisa de decisão explícita e validação consistente no cliente e no servidor.
8. O fluxo atual só permite que o eletricista veja uma ordem **já atribuída a ele**. Não há uma fila de oportunidades abertas, nem ação de aceitar/adiar. `demandas_municipais.prioridade` já suporta `urgente`, `alta`, `normal` e `baixa`; as solicitações públicas sem ordem não têm a mesma prioridade operacional pronta para ordenar.

## 4. Fluxo proposto no aplicativo

### 4.1 Entrada e painel de oportunidades — prioridade P0

- Após autenticação com perfil institucional de eletricista, abrir uma rota e um layout próprios, por exemplo `/prefeitura/eletricista`. Este é **um painel**, com duas seções: **Disponíveis** (podem ser aceitas) e **Minhas** (já aceitas ou atribuídas pela prefeitura). Uma notificação de novo serviço abre a prévia da oferta; não aceita automaticamente.
- Na área **Disponíveis**, apresentar nesta ordem padrão: **(1) urgentes**, **(2) ordens de serviço com prioridade alta/normal/baixa**, **(3) demais solicitações de iluminação ainda sem ordem**. Dentro de cada grupo, usar prioridade, prazo e antiguidade como desempate. Uma ordem urgente aparece no primeiro grupo. Não deixar solicitações sem triagem fingirem ser urgentes por número de apoios ou proximidade.
- “Perto de mim” é um modo opcional, com permissão de localização solicitada no momento do uso. Mostrar distância aproximada e permitir ordenar por distância **dentro dos grupos de urgência**; urgentes continuam em destaque. Sem GPS ou coordenadas válidas, manter a ordenação padrão e permitir busca por bairro/endereço.
- Na área **Minhas**, separar **Para fazer**, **Em execução**, **Enviadas para conferência** e **Histórico**. A primeira tela deve mostrar as pendências reais, inclusive `programada` e `em_andamento`, e não só o status `aberta`.
- Em cada cartão: origem (ordem ou solicitação), protocolo, poste/plaqueta quando houver, tipo de problema, endereço/bairro, prioridade, prazo, distância quando disponível e estado. Ocultar exportação, seleção em massa e controles de gestão.
- Estados próprios: carregando, sem ofertas, sem serviços assumidos, sem internet com dados locais e erro recuperável.

### 4.2 Oferta, aceitação e “agora não” — prioridade P0

- A prévia da oferta mostra os dados necessários à decisão: problema, local, prioridade, prazo, fotos públicas/relevantes e distância opcional. Dados internos da prefeitura e de cidadãos não entram na oferta.
- Botões **Aceitar serviço** e **Agora não**. “Agora não” apenas recolhe a oferta do destaque para aquele eletricista por um período curto ou até nova visita à lista; ela continua disponível na área **Todas as disponíveis** e pode ser aceita depois, enquanto outro profissional não a assumir. Não transformar essa ação em recusa definitiva, cancelamento ou bloqueio da demanda.
- A aceitação deve ser **atômica no servidor**: validar papel ativo na secretaria de iluminação e prefeitura correta, bloquear o registro, conferir que ainda está disponível, atribuir ao usuário, gravar evento e devolver a ordem. Se outra pessoa aceitar antes, informar “serviço já assumido” e atualizar a fila. Repetir a mesma aceitação por falha de rede deve devolver o mesmo resultado sem duplicar ordem.
- Uma solicitação pública sem ordem precisa virar uma ordem municipal e ser vinculada a ela no mesmo fluxo de aceitação, ou passar por triagem antes de ser ofertada. Para preservar a categoria “demais solicitações pendentes” pedida pelo usuário, a proposta é criar/vincular a ordem automaticamente na aceitação. Usar a restrição única de vínculo do relato e uma RPC específica; não fazer duas gravações independentes no cliente.
- Ordens já atribuídas pelo gestor entram diretamente em **Minhas**, sem convite de aceite. Ordens aceitas não continuam disponíveis aos demais profissionais. Se forem desatribuídas, voltam ao conjunto elegível conforme decisão do gestor.

### 4.3 Detalhe de campo — prioridade P0

- Abrir uma tela móvel dedicada, mantendo a URL da ordem para deep link. Mostrar de imediato **o que fazer**, **onde fica** e **qual o estado da ordem**. Exibir descrição, observações úteis, problema, poste/plaqueta, endereço, bairro, referência, coordenadas, prazo e anexos relevantes em leitura.
- Ações fixas ao alcance do polegar: **Abrir rota** (aplicativo de mapas usando coordenadas ou endereço), **Iniciar serviço** e **Registrar execução**. Confirmar a localização antes de abrir um mapa externo; endereço/coordenadas ausentes devem ser explicados na tela.
- Mostrar histórico resumido e dados de solicitações vinculadas sem expor ao eletricista controles de triagem, edição de categoria, redistribuição ou publicação de resposta ao cidadão.
- Se a ordem foi desatribuída ou alterada em outro aparelho, atualizar a tela e explicar o novo estado antes de salvar.

### 4.4 Registro da execução — prioridade P0

- Formulário curto: ação realizada/resultado, registro técnico opcional, foto(s) opcional(is) conforme regra atual, data/hora da execução e prévia dos anexos. Permitir capturar pela câmera ou escolher da galeria; comprimir imagem e informar claramente o progresso do envio.
- A ação principal proposta é **Enviar para conferência**, gravando `aguardando_confirmacao`. A prefeitura revisa e marca `concluida`. A RPC atual permite ao eletricista concluir diretamente; restringir isso no servidor **somente se a prefeitura aprovar essa regra de conferência**.
- Ao salvar, mostrar confirmação com protocolo, novo status e destino da conferência. Em erro ou conflito de versão, preservar o preenchimento e os arquivos para corrigir/repetir a tentativa.
- A foto de conclusão vinculada a solicitação pública deve continuar privada por padrão. A publicação ao cidadão permanece decisão de quem faz a conferência, salvo regra de produto explicitamente diferente.

### 4.5 Continuidade no campo — prioridade P1

- Cache local apenas das ordens atribuídas ao usuário e dos dados necessários para leitura em campo. Limpar ou isolar por conta/prefeitura; não mostrar dados de uma conta anterior ao alternar login.
- Rascunho local para texto e fotos da execução. Para envio offline real, criar operação idempotente com chave própria, versão da ordem, fila de anexos e reconciliação de conflito; reutilizar padrões de `offlineQueue.js`, sem presumir que o remetente atual já suporte demandas municipais.
- Diferenciar **rascunho neste aparelho**, **aguardando envio**, **enviando**, **enviado** e **precisa de revisão**. Nunca indicar “concluído” antes da confirmação do servidor. Se o usuário perder o acesso à ordem, interromper o envio pendente e oferecer cópia do registro técnico.

### 4.6 Notificações — prioridade P0 para ofertas; P1 para lembretes

- Criar aviso de **serviço disponível** para eletricistas elegíveis da secretaria de iluminação. O toque abre a prévia para aceitar ou deixar para depois; não atribui o serviço ao tocar. Destacar urgentes imediatamente e agrupar/limitar alertas comuns para não gerar um push por cada relato antigo.
- Manter avisos de atribuição direta, alteração de prazo, devolução para ajuste e contestação. O toque deve abrir o item certo na conta e prefeitura corretas, inclusive com o app fechado.
- Não reenviar repetidamente a mesma oferta que o profissional marcou “Agora não”, mas mantê-la encontrável na lista. Evitar notificações duplicadas e omitir dados internos na tela bloqueada. Atualizar a fila ao voltar do segundo plano.

## 5. Contrato de dados e autorização

| Item | Situação atual | Ação planejada |
| --- | --- | --- |
| Ofertas disponíveis | Não existe fluxo de oferta; eletricista só lê ordem atribuída | Criar RPC de listagem de ofertas para eletricistas ativos da secretaria de iluminação, retornando apenas resumo permitido antes da aceitação. Manter a RLS do detalhe completo restrita ao responsável. |
| Aceitação de ordem | Atribuição feita por gestor/operador | Criar RPC transacional para assumir ordem sem responsável, com bloqueio concorrente, verificação de papel, evento e idempotência. Não permitir aceitar ordem já assumida por outro profissional. |
| Solicitação sem ordem | Relato público e ordem são entidades diferentes | Definir elegibilidade da solicitação publicada, ativa, de iluminação e ainda sem vínculo. Na aceitação, criar e vincular uma única ordem na mesma transação. |
| “Agora não” | Não existe | Registrar decisão temporária por usuário ou somente preferência local sincronizada, sem bloquear a oferta para ninguém e sem impedir aceite futuro. |
| Prioridade | Ordem tem `prioridade`; relato avulso não tem prioridade operacional equivalente | Ordenar urgentes pela prioridade municipal explícita, depois ordens pela prioridade e demais relatos. Criar triagem/prioridade operacional de relatos apenas se a prefeitura precisar promover um relato avulso a urgente. |
| Proximidade | Ordem e poste podem ter coordenadas | Calcular distância sob consentimento. Se a lista for grande, buscar candidatos por região no servidor sem romper a prioridade global nem perder urgentes fora da área. Não usar rastreamento contínuo para o MVP. |
| Leitura da ordem aceita | RLS por prefeitura, secretaria e atribuição | Manter. Criar consulta enxuta para a fila e detalhe móvel, sempre limitada pelo servidor. |
| Mudança de status | `em_andamento`, `aguardando_confirmacao` e `concluida` são permitidos ao eletricista | Definir a transição final com a prefeitura; se houver conferência obrigatória, retirar `concluida` do papel na RPC e testar acesso direto. |
| Anexos | Bucket `municipal-demand-files`; upload separado da RPC | Validar tipo/tamanho no app e servidor; tratar upload órfão, repetição e arquivo pendente em rascunho. |
| Concorrência | `versao` é checada pela RPC | Mostrar conflito de forma legível e permitir recarregar/comparar sem perder o registro local. |
| Poste | Ordem pode guardar `pole_id` e coordenadas | Expor ao eletricista apenas os dados técnicos necessários à ordem atribuída; não abrir acesso geral ao cadastro municipal. |
| Notificação | Evento de atribuição `agency_case` | Confirmar webhook/push, deep link, troca de conta e ausência de duplicata em Android/iOS. |

**Regra de segurança:** toda limitação de papel deve existir na RPC/RLS; esconder botões na interface é apenas apresentação. A oferta revela um resumo controlado, não concede acesso à ordem completa. Testar acesso direto à URL e chamadas manuais com conta de eletricista não atribuído, eletricista atribuído, membro de outra cidade/secretaria, gestor e administrador.

## 6. Ordem de implementação

1. **Fechar regras ainda abertas:** decidir quais relatos sem ordem são elegíveis, quem pode marcar urgência, duração do destaque “Agora não”, quem conclui e qual evidência é exigida. O resumo do usuário já define o fluxo de oferta e aceite; uma transcrição literal pode acrescentar detalhes depois.
2. **Contrato de ofertas e aceite:** migração Supabase para RPC de listagem e RPC transacional de aceitação de ordem ou relato. Incluir testes de concorrência entre dois eletricistas, vínculo único, cidade/secretaria, tentativa repetida e usuário desativado. Manter os registros de oferta/adiamento separados do status oficial da ordem.
3. **Painel móvel:** criar rota/tela, redirecionamento por papel, áreas **Disponíveis** e **Minhas**, prévia, aceite, “Agora não”, ordenação em três grupos, busca e modo “Perto de mim”. Integrar estados de loading/erro/vazio e atualização quando outra pessoa assumir um serviço.
4. **Notificações:** disparar ofertas novas/urgentes para elegíveis com controle de volume e deep link da prévia; conferir aviso da atribuição direta e retorno da prefeitura em Android/iOS.
5. **Detalhe e execução:** mostrar local/poste e contexto da ordem aceita, abertura de rota, formulário curto e estados de envio. Reutilizar a RPC atual quando possível; criar migração para eventual mudança no contrato de status/evidência.
6. **Fotos e resiliência:** integrar câmera/galeria Capacitor, compressão, rascunho local e tratamento de rede. Implementar envio offline só com idempotência, conflito de versão e limpeza por conta definidos. Aceitação offline não deve prometer reserva: requer confirmação online do servidor.
7. **Validação e lançamento gradual:** testar com contas reais de cada papel em ambiente de teste, Android e iOS; acompanhar ofertas vistas, aceites, conflitos, tempo até execução, falhas de envio e ordens paradas em conferência antes de liberar a todos.

Arquivos prováveis: `src/App.jsx`, `src/components/municipality/MunicipalityLayout.jsx`, `src/hooks/useMunicipalityWorkspace.js`, nova página e componentes em `src/pages/` e `src/components/municipality/`, `src/lib/municipalDemand.js`, `src/lib/municipalExport.js`, `src/contexts/NotificationContext.jsx`, camada de rascunho/fila offline e novas migrações Supabase para oferta, aceite e eventual mudança no contrato de execução.

## 7. Critérios de aceite

- Uma conta com perfil institucional de eletricista entra em seu painel próprio, sem passar pela visualização do cidadão ou pela lista administrativa da prefeitura. No mesmo painel, vê ofertas elegíveis e suas ordens de iluminação. O padrão coloca urgentes acima das ordens prioritárias e estas acima das solicitações avulsas; dentro de “Minhas”, uma ordem em `programada` ou `em_andamento` aparece sem mudar filtro.
- O push de serviço disponível abre a prévia sem atribuir automaticamente. “Agora não” não cancela o serviço nem impede que o mesmo eletricista o aceite depois, caso ainda esteja disponível.
- Dois eletricistas tentando aceitar a mesma oportunidade ao mesmo tempo produzem uma única ordem responsável. Solicitação avulsa aceita gera uma única ordem vinculada, mesmo após tentativa repetida por falha de rede.
- O modo “Perto de mim” pede consentimento, mostra distância aproximada e funciona sem GPS como uma lista normal; proximidade não esconde urgentes.
- Ao abrir a ordem, consegue localizar o poste e o endereço e abrir rota sem entrar no painel de gestão.
- Consegue iniciar, registrar e enviar a execução com ou sem foto conforme a regra aprovada; a interface mostra o status confirmado pelo servidor.
- Perder internet ou receber conflito não apaga texto/fotos já capturados e não mostra sucesso falso.
- Uma ordem desatribuída desaparece de **Minhas** e deixa de aceitar gravação pelo antigo responsável, inclusive por chamada direta à RPC.
- A atribuição e uma devolução geram no máximo uma notificação acionável; tocar no aviso abre a ordem correta no app instalado.
- Gestor/administrador conseguem conferir o registro, os anexos, quem executou e os horários; a solicitação do cidadão mantém seu fluxo próprio de verificação.
- Em telas móveis de 360, 390 e 430 px, as ações essenciais cabem sem rolagem horizontal e respeitam áreas seguras. Se o layout desktop for alterado, conferir 1440 e 1920 px e manter o contêiner externo fluido com margens de até 64 px a partir de 1200 px, conforme `AGENTS.md`.

## 8. Pendências para revisão do usuário

1. **Áudios:** confirmar o resumo enviado pelo usuário com transcrição literal, se disponível. O fluxo de oferta, aceite posterior e ordenação já está incorporado neste plano.
2. **Elegibilidade:** todas as solicitações públicas de iluminação pendentes e sem ordem podem virar oferta, ou só as que a prefeitura validar? Quem pode marcar uma solicitação avulsa como urgente?
3. **“Agora não”:** a oferta apenas sai do destaque até abrir novamente a lista, ou fica silenciada por algumas horas? Em ambos os casos, segue aceitável mais tarde.
4. **Conferência:** o eletricista envia a execução para revisão ou pode encerrar a ordem diretamente?
5. **Evidência:** foto, descrição técnica, ambas ou nenhuma são exigidas? A migração 316 hoje deixa ambas opcionais.
6. **Offline:** leitura e rascunho local bastam para a primeira entrega, ou o envio da execução deve funcionar sem rede desde o início? O aceite exige confirmação online.
7. **Dados técnicos:** quais informações de poste/luminária e ações de manutenção precisam constar no registro do eletricista?

Os itens 2 a 7 são decisões abertas de produto e operação, não afirmações adicionais sobre os áudios.
