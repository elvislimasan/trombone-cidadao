# Paginação das solicitações do eletricista

As listas “Minhas ordens” e “Disponíveis” carregam 20 serviços por página. “Anterior” e “Próxima” substituem o carregamento acumulativo; o rodapé informa a faixa exibida e o total. Só a aba aberta consulta os serviços; as fotos e identificadores dos postes são buscados para os itens da página.

A RPC `listar_painel_eletricista` aplica a busca por poste, placa, protocolo e endereço, a ordenação, a etapa e a exclusão de serviços adiados antes da paginação. Busca e mudança de filtros voltam à primeira página; consultas antigas são canceladas e suas respostas ignoradas. As contagens das etapas abrangem todas as ordens próprias. Se a última página deixar de existir, a resposta usa a última página válida.

As regras de município, vínculo ativo, atribuição, publicação e solicitações já vinculadas são preservadas. Uma ordem atribuída não aparece como oportunidade para outro eletricista. O mapa mantém seu carregamento independente.

Antes de publicar o frontend, aplicar `supabase/migrations/350_electrician_panel_pagination.sql`, após a migração 348. A migração 350 cria a nova RPC e um índice para as ordens atribuídas; mantém a RPC antiga, usada na prévia e por clientes anteriores. Nenhuma migração foi aplicada ao Supabase remoto nesta alteração.

Validação local: `node tools/validate-atendimento-flows-db.mjs` testa paginação, contagens, pesquisa fora da primeira página, ordenação, adiados e permissões em PostgreSQL descartável. `node tools/validate-electrician-pagination-ui.mjs` testa os componentes reais em Chrome com dados locais: páginas de 20/20/13 itens, busca, filtros, abas, respostas atrasadas e recuperação de erro, em 390, 1440 e 1920 px. Capturas em `.tmp/electrician-pagination-validation/`.
