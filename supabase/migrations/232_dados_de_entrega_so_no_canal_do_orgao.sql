-- Dados de transporte de e-mail nao fazem parte da prestacao de contas
-- publica de uma bronca. Destinatario, aceite do provedor, bounce e repeticoes
-- de envio pertencem ao painel Canais do orgao.

begin;

-- Etapas manuais do orgao (programada, executada, protocolo etc.) continuam
-- publicas. As etapas geradas automaticamente pela integracao usam o papel
-- `sistema` e passam a ser visiveis somente para admin/master.
drop policy if exists report_official_steps_select
  on public.report_official_steps;
drop policy if exists report_official_steps_public_select
  on public.report_official_steps;
drop policy if exists report_official_steps_admin_system_select
  on public.report_official_steps;

create policy report_official_steps_public_select
  on public.report_official_steps
  for select
  to anon, authenticated
  using (registrado_por_papel is distinct from 'sistema');

create policy report_official_steps_admin_system_select
  on public.report_official_steps
  for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
  );

-- A pagina publica deixou de consumir esta contagem. Revogar o RPC evita que
-- o mesmo diagnostico operacional continue exposto fora do painel por uma
-- chamada direta ao PostgREST.
revoke execute on function public.cobrancas_da_bronca(uuid)
  from public, anon, authenticated;
grant execute on function public.cobrancas_da_bronca(uuid)
  to service_role;

-- O historico detalhado de envio continua no cartao do canal, mas somente
-- admin/master o recebe. Embaixadores ainda podem cadastrar o canal conforme
-- as regras existentes, sem acessar telemetria de entrega.
create or replace function public.envios_do_canal(
  p_canal uuid,
  p_limite integer default 20
)
returns table (
  id uuid,
  periodo text,
  referencia date,
  total_broncas integer,
  status text,
  enviado_em timestamptz,
  entregue_em timestamptz,
  confirmado_em timestamptz,
  protocolo_informado text,
  falha_motivo text,
  etapas_geradas integer
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select
    e.id,
    e.periodo,
    e.referencia,
    e.total_broncas,
    e.status,
    e.enviado_em,
    e.entregue_em,
    e.confirmado_em,
    e.protocolo_informado,
    e.falha_motivo,
    (
      select count(*)::integer
      from public.orgao_envio_itens i
      where i.envio_id = e.id and i.virou_etapa
    ) as etapas_geradas
  from public.orgao_envios e
  where e.canal_id = p_canal
    and (
      public.is_admin(auth.uid())
      or public.is_master(auth.uid())
    )
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$fn$;

comment on function public.envios_do_canal(uuid, integer) is
  'Historico operacional do canal, sem token, visivel somente para admin/master.';

notify pgrst, 'reload schema';

commit;
