# Eletricista: envio pendente e filtro por serviço

As recusas `Executor só pode registrar o serviço atribuído` e `Altere a situação, o tipo ou a potência, ou registre um serviço` são erros de validação, não de conexão. Repetir o mesmo envio sem corrigir essas regras mantém o registro bloqueado.

A migração `435_electrician_visit_sync.sql` permite atualizar os campos técnicos de uma ordem de iluminação quando o atendimento correspondente foi registrado pelo executor atribuído, na mesma transação. A atribuição, programação e os demais campos continuam protegidos. Uma visita sem alterações registra uma vistoria no histórico, sem criar serviço concluído, resolver solicitações ou alterar a versão do poste. As verificações de acesso, concorrência e os recibos da sincronização continuam ativos.

**Enviar agora** também prepara para nova tentativa os registros bloqueados da prefeitura exibida. Os IDs, argumentos, dependências e fotos são preservados; a fila só confirma o envio após receber a resposta ou o recibo do servidor.

O filtro **Tipo de serviço** combina o problema informado nas solicitações com os serviços da ordem, incluindo serviços secundários e problemas de solicitações vinculadas. A migração `436_electrician_service_filter.sql` cria uma consulta filtrada antes da paginação e mantém a consulta anterior para clientes já publicados. Busca, ordenação e filtros funcionam juntos; mudar o tipo volta à primeira página.

## Ativação

1. Aplicar as migrações 435 e 436, nessa ordem.
2. Publicar o frontend atualizado.
3. No mesmo navegador e na conta que guardaram os registros, abrir a fila e tocar em **Enviar agora**. Os registros existentes são reutilizados.

As migrações foram validadas em PostgreSQL local descartável; não foram aplicadas ao Supabase remoto. O teste reproduz as duas recusas antes da correção, confirma reenvio idempotente, preserva as restrições de edição e verifica filtros paginados e solicitações internas. A interface foi conferida em 390, 1440 e 1920 px. Os registros reais guardados no aparelho não estão acessíveis no ambiente de desenvolvimento.

Verificações: `node tools/validate-electrician-sync-filter-db.mjs`, `node tools/validate-electrician-pagination-ui.mjs` e testes `electricianOffline`, `electricianOfflineStatus`, `electricianPanel` e `electricianPoleVisitDrawer`.
