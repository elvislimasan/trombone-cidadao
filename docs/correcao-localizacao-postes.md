# Correção da localização dos postes

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
