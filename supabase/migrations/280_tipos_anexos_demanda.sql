-- Separa evidências de trabalho dos comprovantes de conclusão publicados na bronca.
alter table public.demanda_anexos add column if not exists tipo text not null default 'execucao';

-- Anexos já compartilhados eram usados como comprovantes públicos.
update public.demanda_anexos set tipo = 'conclusao' where visibilidade = 'publica' and tipo = 'execucao';

alter table public.demanda_anexos drop constraint if exists demanda_anexos_tipo_check;
alter table public.demanda_anexos add constraint demanda_anexos_tipo_check check (tipo in ('execucao', 'conclusao'));
alter table public.demanda_anexos drop constraint if exists demanda_anexos_execucao_interna_check;
alter table public.demanda_anexos add constraint demanda_anexos_execucao_interna_check check (tipo <> 'execucao' or visibilidade = 'interna');

-- A função existente mantém as validações de acesso, arquivos e andamento.
do $$
declare
  definition text;
  old_columns text := 'demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,criado_por)';
  new_columns text := 'demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,tipo,criado_por)';
  old_values text := 'coalesce(v_file->>''visibilidade'',''interna''),auth.uid()';
  new_values text := 'coalesce(v_file->>''visibilidade'',''interna''),coalesce(v_file->>''tipo'',''execucao''),auth.uid()';
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position(old_columns in definition) > 0 and position(old_values in definition) > 0 then
    execute replace(replace(definition, old_columns, new_columns), old_values, new_values);
  elsif position(new_columns in definition) = 0 or position(new_values in definition) = 0 then
    raise exception 'Inserção de anexos da ordem não reconhecida. Revise a função antes de aplicar esta migração.';
  end if;
end;
$$;

create or replace function public.atendimento_publico_bronca(p_report uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('protocolo',d.protocolo,'status',d.status,'orgao',coalesce(c.nome,p.nome),
    'previsto_em',d.previsto_em,'executada_em',d.executada_em,'resultado',d.resultado,'revisao_pendente',d.revisao_pendente,
    'updated_at',d.updated_at,
    'anexos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'mime_type',a.mime_type,
      'storage_path',a.storage_path,'tipo',a.tipo,'visibilidade',a.visibilidade,'created_at',a.created_at) order by a.created_at desc)
      from public.demanda_anexos a where a.demanda_id=d.id and a.tipo='conclusao' and a.visibilidade='publica'
        and a.created_at >= d.ciclo_iniciado_em and d.status in ('aguardando_confirmacao','concluida')),'[]'::jsonb))
  from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id join public.prefeituras p on p.id=d.prefeitura_id
  left join public.orgao_canais c on c.id=d.canal_id
  where b.report_id=p_report and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false)
$$;
revoke all on function public.atendimento_publico_bronca(uuid) from public;
grant execute on function public.atendimento_publico_bronca(uuid) to anon,authenticated;
