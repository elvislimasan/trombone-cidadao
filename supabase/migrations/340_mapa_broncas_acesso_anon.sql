begin;

-- A politica original referencia pode_acessar_prefeitura, cuja execucao e
-- reservada a authenticated. Mesmo dentro de CASE, o PostgreSQL verifica
-- a permissao da funcao ao preparar a expressao e anon recebe erro 42501.
-- Separa os papeis sem conceder funcoes municipais ao visitante.
alter policy reports_hide_internal_municipal on public.reports
  to authenticated;

drop policy if exists reports_hide_internal_municipal_anon on public.reports;
create policy reports_hide_internal_municipal_anon
  on public.reports as restrictive for select to anon
  using (is_public);

-- A politica e restritiva: as regras existentes de moderacao e leitura
-- continuam necessarias para uma bronca publica aparecer no mapa/feed.
-- A visibilidade de usuarios autenticados e das midias permanece nas
-- politicas existentes, inclusive a protecao de solicitacoes internas.
notify pgrst, 'reload schema';

commit;
