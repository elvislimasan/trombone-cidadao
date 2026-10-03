begin;

-- Exige os dois campos também quando o eletricista conclui pela tela municipal.
do $migration$
declare
  definition text;
  marker text := '  v_execucao=d.status in (''aguardando_confirmacao'',''concluida'')';
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(marker in definition) = 0 then
    raise exception 'Definição inesperada de salvar_demanda_municipal';
  end if;
  definition := replace(definition, marker, $guard$  if not v_nova and d.status='concluida' and anterior.status is distinct from 'concluida'
    and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista' then
    if d.service_type not in ('lamp_replacement','arm_installation','other') or d.service_type is null then
      raise exception 'Selecione o serviço executado';
    end if;
    if length(btrim(coalesce(d.resultado,'')))<10 then
      raise exception 'Descreva o resultado do serviço com pelo menos 10 caracteres';
    end if;
  end if;
$guard$ || marker);
  execute definition;
end $migration$;

-- A conclusão com atualização do poste usa a mesma assinatura existente da RPC.
-- Os campos do atendimento chegam no JSON, mas são retirados antes de salvar o poste.
do $migration$
declare
  definition text;
  before_allowed text := $old$'switch_code','company_number')) then raise exception 'Campo de poste não permitido'; end if;$old$;
  after_allowed text := $new$'switch_code','company_number','service_type','resultado')) then raise exception 'Campo de poste não permitido'; end if;$new$;
  before_details text := $old$v_details=coalesce(p.raw_properties->'municipal','{}'::jsonb)||(p_poste-array['lamp_type','lamp_power_w']);$old$;
  after_details text := $new$v_details=coalesce(p.raw_properties->'municipal','{}'::jsonb)||(p_poste-array['lamp_type','lamp_power_w','service_type','resultado']);$new$;
  before_save text := $old$jsonb_build_object('status','concluida','executada_em',now()),d.versao$old$;
  after_save text := $new$jsonb_build_object('status','concluida','executada_em',now(),
      'service_type',p_poste->>'service_type','resultado',btrim(p_poste->>'resultado')),d.versao$new$;
  before_size text := 'octet_length(p_poste::text)>8192';
  before_type text := $old$  v_type=nullif(btrim(p_poste->>'lamp_type'),'');$old$;
begin
  definition := pg_get_functiondef('public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)'::regprocedure);
  if position(before_allowed in definition)=0 or position(before_details in definition)=0
    or position(before_save in definition)=0 or position(before_size in definition)=0
    or position(before_type in definition)=0 then
    raise exception 'Definição inesperada de resolver_ordem_eletricista';
  end if;
  definition := replace(definition, before_allowed, after_allowed);
  definition := replace(definition, before_details, after_details);
  definition := replace(definition, before_save, after_save);
  definition := replace(definition, before_size, 'octet_length(p_poste::text)>32768');
  definition := replace(definition, before_type, $guard$  if p_poste->>'service_type' not in ('lamp_replacement','arm_installation','other')
    or p_poste->>'service_type' is null then
    raise exception 'Selecione o serviço executado';
  end if;
  if length(btrim(coalesce(p_poste->>'resultado','')))<10
    or length(btrim(p_poste->>'resultado'))>4000 then
    raise exception 'Descreva o resultado do serviço com 10 a 4000 caracteres';
  end if;
$guard$ || before_type);
  execute definition;
end $migration$;

notify pgrst, 'reload schema';
commit;
