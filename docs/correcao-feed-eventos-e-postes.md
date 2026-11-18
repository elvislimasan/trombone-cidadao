# Eventos no feed e gravação de postes

## Postes — produção, 16/11/2026

A migração 373 substituía a autorização de `gerir_iluminacao_municipal` com uma expressão regular que também consumia a gravação. A função passou a devolver `null`, sem alterar o poste ou inserir histórico. A migração 430 restaura criação, edição e remoção, mantendo a autorização atual por `municipal_city_action(..., 'lighting')`.

Aplicada no projeto `mrejgpcxaevooofyenzq`. Os ajustes diretos dos quatro cadastros foram posteriormente desfeitos a pedido do cliente, mantendo a correção do código e da função do banco. Estado confirmado após a reversão:

| Registro | Ajuste confirmado |
| --- | --- |
| 869 — S231058 | Restaurado ao mapa ativo como apagado |
| 2334 — ILUMINA-PE-099 | Restaurado ao mapa ativo como apagado |
| 497 — S230928 | Código original restaurado de Z251008 para `28 - S230928` |
| 1023 — S231095 | Código original restaurado de Z238976 para `24 - S231095` |

Coordenadas, dados técnicos e solicitações vinculadas preservados. A reversão foi executada pela função corrigida e registrada em quatro novas entradas de histórico, sem apagar as operações anteriores. O cadastro completo foi conferido antes de gravar para evitar sobrescrever edições posteriores; a conferência final também verificou a manutenção da migração 430. Os metadados vazios adicionados pelas renumerações foram restaurados ao estado anterior.

Backups anteriores: `.tmp/production-pole-repair-before.json` e `.tmp/pole-1023-before-*.json`. Conferência anterior à reversão e resultado: `.tmp/undo-pole-adjustments-inspection.json` e `.tmp/undo-pole-adjustments-result.json`. Outras alterações diretas de cadastro exigem uma instrução do cliente.

A interface passa a rejeitar retorno vazio da RPC e verifica o código persistido antes de anunciar sucesso na edição.

## Eventos

Eventos encerram no término informado; sem término, usam a janela de seis horas já definida na migração 233. A interface calcula esse encerramento também entre execuções do cron e atualiza a lista a cada 30 segundos e ao retomar a janela. Eventos encerrados saem do feed ativo e ficam na seção “Eventos encerrados” do Radar. Alertas operacionais continuam com a regra de previsão vencida.

Eventos usam “Encerrado” no histórico e no detalhe, sem previsão vencida nem confirmação de normalização. A recorrência semanal continua sendo avançada pelo cron existente.

Em produção, a migração 233 e o cron de cinco minutos estavam ativos, com execuções bem-sucedidas. Não havia registro da sessão da Câmara no momento da inspeção. O cliente publica a pasta `dist` na hospedagem web; o build atualizado foi gerado nessa pasta. As mudanças da interface não são distribuídas pela migração 430.

## Validação

- `node tools/validate-pole-writes-db.mjs`: PostgreSQL descartável; reproduz a falha da 373 e verifica criação, renumeração, remoção, histórico, títulos, validações e permissões após a 430.
- Testes de eventos, feed, mídia, compartilhamento e edição/remoção de postes: 101 testes aprovados.
- Build Vite de produção.
- Radar conferido no navegador em 390, 1440 e 1920 px, com dados simulados, sem rolagem horizontal; margens desktop de 43,2 e 57,6 px.
