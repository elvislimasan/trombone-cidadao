-- 158_directory_city_id_not_null.sql
-- Achado na revisão final da Fase 3: o formulário público de sugestão de
-- diretório (UserDashboardPage.jsx) inseria sem city_id, deixando a linha
-- invisível para is_ambassador_of (NULL nunca casa) e fora do filtro
-- .in('city_id', myActiveCityIds) da moderação do embaixador — a fila de
-- "Guia de Serviços" nunca mostrava sugestões de cidadãos para embaixadores.
-- Corrigido no client (insert agora inclui activeCityId). Esta migration
-- blinda contra regressão: nenhuma linha nova pode ficar sem cidade.
-- Todas as linhas existentes já estão com city_id preenchido (0 nulas em dev).

alter table public.directory
  alter column city_id set not null;

notify pgrst, 'reload schema';
