-- Executar somente no SQL Editor do projeto de PRODUCAO mrejgpcxaevooofyenzq.
-- Corrige a URL da integracao, preservando o secret e os envios existentes.
-- Nao chama net.http_post nem dispara e-mails durante a execucao deste script.
-- Os crons voltam a usar esta URL nas proximas execucoes.

begin;

do $fix$
declare
  v_url constant text := 'https://mrejgpcxaevooofyenzq.supabase.co/functions/v1/send-agency-report';
begin
  if not exists (select 1 from public.integracao_orgao where id = true) then
    raise exception 'integracao_orgao nao configurada. Cadastre a URL e o secret correspondente a ORGAO_FUNCTION_SECRET de producao.';
  end if;

  -- Valida a URL com o mesmo parser que falhou no cron, sem criar requisicoes.
  perform net._encode_url_with_params_array(v_url, array[]::text[]);

  update public.integracao_orgao
  set function_url = v_url,
      updated_at = now()
  where id = true
    and function_url is distinct from v_url;
end;
$fix$;

-- Confere somente a URL; nao revela o secret.
select function_url from public.integracao_orgao where id = true;

commit;
