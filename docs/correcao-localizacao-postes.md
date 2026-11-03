# Correção da localização dos postes

## Cidade no envio de broncas — S231465

O envio autenticado e o anônimo consultam agora cidade e coordenadas do cadastro atual do poste na mesma leitura. Antes, o formulário descartava a cidade cadastrada e dependia de geocodificação externa para enviar, inclusive quando apenas o endereço estava vazio. A cidade do formulário ou do usuário não substitui essa conferência. Postes legados sem cidade continuam usando a resolução pelas coordenadas cadastradas.

Na consulta somente de leitura ao ambiente de desenvolvimento configurado neste workspace, S231465 corresponde ao ID 1216, com `city_id=64`, posição `(-8.601985, -38.572948)` e endereço nulo. Esse cenário está coberto em `src/test/reportPole.test.mjs`, incluindo geocodificação indisponível, coordenadas inválidas e falhas na consulta opcional de bairro. `src/test/reportPoleAddress.test.mjs` verifica que a busca de endereço não perde a cidade cadastrada.

Em produção, foi confirmada uma segunda causa: `reverse-geocode` retornava `city="Floresta-PE"` e `state_uf="PE"`; `match_city` retornava nulo para esse nome. O serviço agora remove apenas o sufixo de UF delimitado e correspondente à UF informada, devolvendo `Floresta` e `PE` separadamente. A mesma normalização está no fallback direto do frontend. Nomes com hífen e sufixos de outra UF são preservados.

A correção do serviço foi publicada em produção (`mrejgpcxaevooofyenzq`) em 03/11/2026, mantendo `verify_jwt=false`. Após o deploy, a consulta pública nas coordenadas do S231465, nos níveis 18 e 10, retornou `Floresta`/`PE`, e `match_city` resolveu ID 64. Não foi necessário alterar o cadastro do poste nem criar bronca de teste. A verificação ficou em `.tmp/s231465-production/verification.json`; a versão anterior da função foi preservada na mesma pasta. Aplicativos já instalados recebem a correção do servidor; reabrir o app ou recarregar a página elimina respostas antigas mantidas em memória.

A proteção adicional que usa o cadastro do poste no envio ainda exige publicar o frontend e incluir a atualização no aplicativo Android; não exige migração de banco. A identificação de ruas em cruzamentos permanece fora desta alteração, conforme solicitado.

## Correção de coordenadas e endereços

O ponto informado (-8.5974, -38.5907) fica junto à Rua José do Carmo Menezes de Sá. O poste X171815 está em (-8.597442, -38.590736), cerca de 9 m do traçado cadastrado dessa rua. X171816 está em (-8.597515, -38.590472), cerca de 5 m do mesmo traçado.

A consulta ao serviço de geocodificação retorna Rua João Ernesto para esse trecho. No cadastro municipal, o nome da Rua José do Carmo termina com “teste teste teste” e é excluído da consulta `mapped_street_address`; além disso, essa consulta aceita somente pontos até 5 m de uma rua. Não foram alterados nomes do cadastro de ruas nem relaxados os critérios para todos os postes.

No mapa municipal de iluminação, abra o poste e escolha **Corrigir localização e identificador no mapa**. Na etapa Localização, arraste o pin, toque no mapa ou digite latitude/longitude e clique em **Atualizar pin**. Vírgulas decimais são aceitas. Confira o endereço sugerido e corrija o texto quando necessário. **Buscar endereço do pin** permite repetir a consulta sem deslocar o poste. A sugestão automática ainda pode identificar uma rua vizinha.

O salvamento aguarda a consulta ou a edição manual do endereço e a aplicação das coordenadas digitadas. A RPC atualiza latitude, longitude e `geom` na mesma operação, mantendo as permissões existentes de gestor de iluminação/administrador. O histórico registra coordenadas anteriores e novas. Clientes antigos que enviam ambas nulas mantêm a posição existente.

## Publicação

Aplicar as migrações **346_municipal_pole_location_edit.sql** e **347_floresta_carmo_pole_addresses.sql** antes de publicar o frontend. A 347 prepara a correção dos dois endereços para Rua José do Carmo, mantendo bairro, coordenadas e dados da lâmpada. A correção exige município, identificador, coordenadas exatas e endereço antigo conhecidos; endereços confirmados por usuário são preservados. As migrações não foram aplicadas ao Supabase durante esta tarefa.

## Verificação

- `node --import ./tools/test-alias.mjs --test --test-isolation=none src/test/poleLocationEdit.test.mjs src/test/poleCoordinateFields.test.mjs`
- `node tools/validate-pole-location-db.mjs` usa apenas o cluster descartável `.tmp/municipal-demand-pg` na porta 55439. O fixture espacial usa o tipo `point` de PostgreSQL, sem PostGIS; verifica persistência e ordem longitude/latitude, histórico, permissões, clientes antigos e preservação de correções manuais.
- O formulário foi conferido no Edge headless em 1440 × 900, 1920 × 1080, 390 × 844 e 390 × 600, usando seus componentes e CSS de produção em uma página local com mapa simulado. Não houve rolagem horizontal; o rodapé permaneceu acessível e a área mínima do mapa foi mantida na tela baixa. As capturas estão em `.tmp/pole-layout-*.png`.
- Conferir no navegador, após publicar: arraste de poste existente, aplicação de coordenadas e endereço manual, nova seleção após salvar, atualização dos agrupamentos do mapa e funcionamento em celular. O formulário interno permite rolagem para manter o mapa acessível em telas baixas; o contêiner da página continua fluido.
