-- Painel autenticado das prefeituras.
--
-- `orgao_canais` continua sendo o cadastro da secretaria e o destino dos
-- relatorios por e-mail. As tabelas abaixo acrescentam equipe e fluxo de
-- trabalho sem transformar entrega de e-mail em estado operacional.

begin;

-- A identidade institucional e exclusiva. Depois que a conta entra em uma
-- prefeitura ela deixa de ser uma conta cidada comum; o cliente nao pode
-- alternar esse campo para acumular os dois contextos na mesma sessao.
alter table public.profiles
  add column if not exists tipo_conta text not null default 'cidadao';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_tipo_conta_valido'
  ) then
    alter table public.profiles
      add constraint profiles_tipo_conta_valido
      check (tipo_conta in ('cidadao', 'prefeitura'));
  end if;
end;
$$;

-- A prefeitura e o tenant institucional. Ela e separada das secretarias para
-- que o administrador municipal possa criar quantos canais precisar sem que
-- um admin da plataforma participe da operacao diaria.
create table if not exists public.prefeituras (
  id            uuid primary key default gen_random_uuid(),
  city_id       bigint not null unique references public.cities(id) on delete restrict,
  nome          text not null,
  status        text not null default 'ativa',
  criado_por    uuid references public.profiles(id) on delete set null,
  aprovado_por  uuid references public.profiles(id) on delete set null,
  aprovado_em   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint prefeituras_nome_nao_vazio check (length(btrim(nome)) between 3 and 160),
  constraint prefeituras_status_valido check (status in ('ativa', 'suspensa'))
);

create table if not exists public.prefeitura_membros (
  id             uuid primary key default gen_random_uuid(),
  prefeitura_id  uuid not null references public.prefeituras(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  papel          text not null default 'colaborador',
  ativo          boolean not null default true,
  convidado_por  uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint prefeitura_membros_papel_valido check (papel in ('administrador', 'colaborador')),
  constraint prefeitura_membros_unico unique (prefeitura_id, user_id)
);

create index if not exists prefeitura_membros_por_usuario_idx
  on public.prefeitura_membros (user_id, prefeitura_id) where ativo;

-- Reaplicacoes da migration tambem corrigem membros criados antes da coluna de
-- tipo de conta. Papeis da plataforma nunca sao convertidos automaticamente.
update public.profiles p
set tipo_conta = 'prefeitura'
from public.prefeitura_membros m
where m.user_id = p.id and m.ativo
  and not coalesce(p.is_admin, false)
  and not coalesce(p.is_master, false)
  and not coalesce(p.is_ambassador, false)
  and p.tipo_conta is distinct from 'prefeitura';

create table if not exists public.prefeitura_solicitacoes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  city_id              bigint not null references public.cities(id) on delete restrict,
  prefeitura_nome      text not null,
  cargo                text not null,
  email_institucional  text not null,
  telefone             text,
  mensagem             text,
  status               text not null default 'pendente',
  analisado_por        uuid references public.profiles(id) on delete set null,
  analisado_em         timestamptz,
  motivo               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint prefeitura_solicitacoes_status_valido check (status in ('pendente', 'aprovada', 'recusada')),
  constraint prefeitura_solicitacoes_email_valido check (email_institucional ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  constraint prefeitura_solicitacoes_cargo_valido check (length(btrim(cargo)) between 2 and 120)
);

create unique index if not exists prefeitura_solicitacao_pendente_unica
  on public.prefeitura_solicitacoes (user_id) where status = 'pendente';

create table if not exists public.prefeitura_convites (
  id                uuid primary key default gen_random_uuid(),
  prefeitura_id     uuid not null references public.prefeituras(id) on delete cascade,
  canal_id          uuid references public.orgao_canais(id) on delete cascade,
  email_convidado   text not null,
  papel_prefeitura  text not null default 'colaborador',
  papel_orgao       text,
  token             uuid not null unique default gen_random_uuid(),
  status            text not null default 'pendente',
  convidado_por     uuid references public.profiles(id) on delete set null,
  aceito_por        uuid references public.profiles(id) on delete set null,
  expires_at        timestamptz not null default (now() + interval '7 days'),
  aceito_em         timestamptz,
  created_at        timestamptz not null default now(),
  constraint prefeitura_convites_email_valido check (email_convidado ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  constraint prefeitura_convites_papel_valido check (papel_prefeitura in ('administrador', 'colaborador')),
  constraint prefeitura_convites_orgao_papel_valido check (papel_orgao is null or papel_orgao in ('gestor', 'operador', 'leitura')),
  constraint prefeitura_convites_status_valido check (status in ('pendente', 'aceito', 'revogado', 'expirado')),
  constraint prefeitura_convites_canal_coerente check (
    (canal_id is null and papel_orgao is null) or (canal_id is not null and papel_orgao is not null)
  )
);

create unique index if not exists prefeitura_convite_pendente_unico
  on public.prefeitura_convites (prefeitura_id, lower(email_convidado), coalesce(canal_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pendente';

create table if not exists public.orgao_membros (
  id          uuid primary key default gen_random_uuid(),
  canal_id    uuid not null references public.orgao_canais(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  papel       text not null default 'operador',
  ativo       boolean not null default true,
  convidado_por uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint orgao_membros_papel_valido check (papel in ('gestor', 'operador', 'leitura')),
  constraint orgao_membros_unico unique (canal_id, user_id)
);

create index if not exists orgao_membros_por_usuario_idx
  on public.orgao_membros (user_id, canal_id) where ativo;

-- Toda prefeitura tem uma caixa interna de triagem. Ela nao envia e-mail e nao
-- aparece no cadastro de secretarias; serve para que nenhuma bronca aprovada da
-- cidade suma do painel enquanto a distribuicao por categoria nao foi feita.
alter table public.orgao_canais
  add column if not exists canal_triagem boolean not null default false;

create unique index if not exists orgao_canais_uma_triagem_por_cidade
  on public.orgao_canais (city_id) where canal_triagem;

create table if not exists public.orgao_casos (
  report_id     uuid primary key references public.reports(id) on delete cascade,
  canal_id      uuid not null references public.orgao_canais(id) on delete restrict,
  status        text not null default 'nova',
  prioridade    text not null default 'normal',
  protocolo     text,
  atribuido_a   uuid references public.profiles(id) on delete set null,
  prazo_em      timestamptz,
  recebido_em   timestamptz,
  ultima_resposta_publica_em timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint orgao_casos_status_valido check (status in (
    'nova', 'recebida', 'triagem', 'atribuida', 'programada', 'em_execucao',
    'execucao_informada', 'aguardando_confirmacao', 'encerrada', 'recusada'
  )),
  constraint orgao_casos_prioridade_valida check (prioridade in ('baixa', 'normal', 'alta', 'urgente'))
);

create index if not exists orgao_casos_fila_idx
  on public.orgao_casos (canal_id, status, prioridade, created_at desc);
create index if not exists orgao_casos_atribuido_idx
  on public.orgao_casos (atribuido_a, status) where atribuido_a is not null;
create index if not exists orgao_casos_paginacao_canal_idx
  on public.orgao_casos (canal_id, updated_at desc, report_id);
create index if not exists orgao_casos_paginacao_status_idx
  on public.orgao_casos (status, updated_at desc, report_id);
create index if not exists orgao_casos_prazo_aberto_idx
  on public.orgao_casos (prazo_em)
  where prazo_em is not null and status not in ('encerrada', 'recusada');
create index if not exists orgao_casos_protocolo_busca_idx
  on public.orgao_casos using gin (protocolo gin_trgm_ops);
create index if not exists reports_orgao_busca_idx
  on public.reports using gin (
    (coalesce(title, '') || ' ' || coalesce(address, '') || ' ' || coalesce(neighborhood, '')) gin_trgm_ops
  );

create table if not exists public.orgao_caso_eventos (
  id          bigint generated by default as identity primary key,
  report_id   uuid not null references public.orgao_casos(report_id) on delete cascade,
  canal_id    uuid not null references public.orgao_canais(id) on delete cascade,
  tipo        text not null,
  de_status   text,
  para_status text,
  detalhes    jsonb not null default '{}'::jsonb,
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint orgao_caso_eventos_tipo_valido check (tipo in (
    'encaminhada', 'atualizada', 'atribuida', 'resposta_publica', 'nota_interna'
  ))
);

create index if not exists orgao_caso_eventos_por_caso_idx
  on public.orgao_caso_eventos (report_id, created_at desc);

create table if not exists public.orgao_respostas (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.orgao_casos(report_id) on delete cascade,
  canal_id      uuid not null references public.orgao_canais(id) on delete cascade,
  orgao_nome    text not null,
  autor_id      uuid references public.profiles(id) on delete set null,
  visibilidade text not null,
  mensagem      text not null,
  created_at    timestamptz not null default now(),
  constraint orgao_respostas_visibilidade_valida check (visibilidade in ('publica', 'interna')),
  constraint orgao_respostas_mensagem_nao_vazia check (length(btrim(mensagem)) between 2 and 4000)
);

create index if not exists orgao_respostas_por_caso_idx
  on public.orgao_respostas (report_id, created_at);

create or replace function public.garantir_triagem_prefeitura(
  p_city_id bigint,
  p_criado_por uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canal uuid;
begin
  insert into public.orgao_canais (
    city_id, nome, email, reply_to, ativo, criado_por, canal_triagem
  ) values (
    p_city_id,
    'Triagem municipal',
    'triagem+' || p_city_id::text || '@trombone.invalid',
    'triagem+' || p_city_id::text || '@trombone.invalid',
    false,
    p_criado_por,
    true
  )
  on conflict (city_id) where canal_triagem do update
    set updated_at = now()
  returning id into v_canal;

  -- Trazer o passivo sem gerar uma notificacao por bronca antiga.
  perform set_config('app.silenciar_notificacao_orgao', '1', true);
  insert into public.orgao_casos (report_id, canal_id)
  select r.id, v_canal
  from public.reports r
  where r.city_id = p_city_id
    and coalesce(r.moderation_status, 'approved') = 'approved'
    and not coalesce(r.is_petition, false)
    and r.status in ('pending', 'in-progress', 'pending_resolution')
  on conflict (report_id) do nothing;
  perform set_config('app.silenciar_notificacao_orgao', '0', true);

  return v_canal;
end;
$$;

-- Funcoes de autorizacao. Admin/master da plataforma nao recebem acesso
-- operacional por tabela: eles administram cadastros em /admin/prefeituras.
create or replace function public.papel_na_prefeitura(p_user uuid, p_prefeitura uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.papel
  from public.prefeitura_membros m
  join public.prefeituras p on p.id = m.prefeitura_id and p.status = 'ativa'
  where m.user_id = p_user and m.prefeitura_id = p_prefeitura and m.ativo
  limit 1
$$;

create or replace function public.pode_acessar_prefeitura(p_user uuid, p_city_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null
    and not public.is_admin(p_user)
    and not public.is_master(p_user)
    and exists (
    select 1
    from public.prefeitura_membros m
    join public.prefeituras p on p.id = m.prefeitura_id
    where m.user_id = p_user and m.ativo
      and p.city_id = p_city_id and p.status = 'ativa'
  )
$$;

create or replace function public.pode_administrar_prefeitura(p_user uuid, p_city_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null
    and not public.is_admin(p_user)
    and not public.is_master(p_user)
    and exists (
    select 1
    from public.prefeitura_membros m
    join public.prefeituras p on p.id = m.prefeitura_id
    where m.user_id = p_user and m.ativo and m.papel = 'administrador'
      and p.city_id = p_city_id and p.status = 'ativa'
  )
$$;

-- Substitui a autoridade da migration 222. Canal institucional e gerido pela
-- prefeitura; embaixador e admin da plataforma nao se tornam servidor publico.
create or replace function public.pode_gerir_canal_do_orgao(p_user uuid, p_city_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.pode_administrar_prefeitura(p_user, p_city_id)
$$;

create or replace function public.papel_no_orgao(p_user uuid, p_canal uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.papel
  from public.orgao_membros m
  where m.user_id = p_user and m.canal_id = p_canal and m.ativo
  limit 1
$$;

create or replace function public.pode_ver_caso_do_orgao(p_user uuid, p_canal uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and exists (
    select 1 from public.orgao_canais c
    where c.id = p_canal
      and public.pode_acessar_prefeitura(p_user, c.city_id)
      and (
        public.pode_administrar_prefeitura(p_user, c.city_id)
        or public.papel_no_orgao(p_user, p_canal) is not null
      )
  )
$$;

create or replace function public.pode_operar_caso_do_orgao(p_user uuid, p_canal uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and exists (
    select 1 from public.orgao_canais c
    where c.id = p_canal
      and public.pode_acessar_prefeitura(p_user, c.city_id)
      and (
        public.pode_administrar_prefeitura(p_user, c.city_id)
        or public.papel_no_orgao(p_user, p_canal) in ('gestor', 'operador')
      )
  )
$$;

create or replace function public.pode_gerir_equipe_do_orgao(p_user uuid, p_canal uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orgao_canais c
    where c.id = p_canal
      and public.pode_administrar_prefeitura(p_user, c.city_id)
  )
$$;

-- Somente os fluxos institucionais abaixo podem transformar uma conta cidada
-- em conta de prefeitura. A flag e local a transacao e nao pode ser enviada
-- pelo PostgREST como parte de um update comum do perfil.
create or replace function public.marcar_conta_como_prefeitura(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil public.profiles%rowtype;
begin
  select * into v_perfil
  from public.profiles
  where id = p_user
  for update;

  if not found then raise exception 'Perfil do funcionario nao encontrado'; end if;
  if coalesce(v_perfil.is_admin, false)
     or coalesce(v_perfil.is_master, false)
     or coalesce(v_perfil.is_ambassador, false) then
    raise exception 'Use uma conta institucional separada dos papeis da plataforma';
  end if;
  if v_perfil.tipo_conta = 'cidadao' and (
    exists (select 1 from public.reports r where r.author_id = p_user limit 1)
    or exists (select 1 from public.petitions p where p.author_id = p_user limit 1)
    or exists (select 1 from public.report_updates u where u.author_id = p_user limit 1)
    or exists (select 1 from public.comments c where c.author_id = p_user limit 1)
    or exists (select 1 from public.signatures s where s.user_id = p_user limit 1)
  ) then
    raise exception 'Esta conta ja possui participacao cidada. Crie uma conta institucional separada com o e-mail convidado';
  end if;

  perform set_config('app.permitir_tipo_conta_prefeitura', '1', true);
  update public.profiles
  set tipo_conta = 'prefeitura'
  where id = p_user and tipo_conta is distinct from 'prefeitura';
end;
$$;

create or replace function public.proteger_tipo_conta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo_conta is distinct from old.tipo_conta
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(current_setting('app.permitir_tipo_conta_prefeitura', true), '') <> '1' then
    raise exception 'O tipo da conta e definido pelo vinculo institucional';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_tipo_conta on public.profiles;
create trigger profiles_proteger_tipo_conta
before update of tipo_conta on public.profiles
for each row execute function public.proteger_tipo_conta();

create or replace function public.vincular_conta_a_prefeitura()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ativo then
    perform public.marcar_conta_como_prefeitura(new.user_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists a_vincular_conta_a_prefeitura on public.prefeitura_membros;
create trigger a_vincular_conta_a_prefeitura
before insert or update of user_id, ativo on public.prefeitura_membros
for each row execute function public.vincular_conta_a_prefeitura();

-- Toda atribuicao de secretaria precisa apontar para um colaborador ativo da
-- mesma prefeitura. Isso impede inserir um perfil qualquer pelo cliente.
create or replace function public.validar_membro_do_orgao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_city_id bigint;
begin
  select city_id into v_city_id from public.orgao_canais where id = new.canal_id;
  if not public.pode_acessar_prefeitura(new.user_id, v_city_id) then
    raise exception 'O funcionario precisa pertencer a esta prefeitura';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists a_validar_membro_do_orgao on public.orgao_membros;
create trigger a_validar_membro_do_orgao
before insert or update on public.orgao_membros
for each row execute function public.validar_membro_do_orgao();

-- Ativar/desativar uma secretaria tambem e decisao do administrador municipal.
create or replace function public.orgao_canal_so_admin_ativa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.canal_triagem and new.ativo then
    raise exception 'A triagem municipal e interna e nao pode enviar relatorios';
  end if;
  if new.ativo is distinct from old.ativo then
    -- UID nulo e reservado ao service role dos webhooks de entrega/bounce.
    if auth.uid() is not null
       and not public.pode_administrar_prefeitura(auth.uid(), new.city_id) then
      raise exception 'somente o administrador da prefeitura pode ativar este canal';
    end if;
    if new.ativo then
      new.ativado_por := coalesce(auth.uid(), new.ativado_por);
      new.ativado_em := now();
      new.desativado_em := null;
      new.desativado_motivo := null;
    else
      new.desativado_em := coalesce(new.desativado_em, now());
    end if;
  end if;
  return new;
end;
$$;

-- A migration 222 ja cria este trigger. Recria-lo aqui deixa esta migration
-- autocontida e garante que reaplicacoes usem a regra institucional atual.
drop trigger if exists a_orgao_canal_so_admin_ativa on public.orgao_canais;
create trigger a_orgao_canal_so_admin_ativa
before update on public.orgao_canais
for each row execute function public.orgao_canal_so_admin_ativa();

-- O admin da plataforma aprova o cadastro e cria o primeiro administrador
-- municipal. Isso nao o inclui na prefeitura nem abre o painel operacional.
create or replace function public.revisar_solicitacao_prefeitura(
  p_solicitacao uuid,
  p_aprovar boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solicitacao public.prefeitura_solicitacoes%rowtype;
  v_prefeitura uuid;
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente o administrador da plataforma pode analisar cadastros';
  end if;

  select * into v_solicitacao
  from public.prefeitura_solicitacoes
  where id = p_solicitacao and status = 'pendente'
  for update;
  if not found then raise exception 'Solicitacao pendente nao encontrada'; end if;

  if p_aprovar then
    insert into public.prefeituras (city_id, nome, status, criado_por, aprovado_por, aprovado_em)
    values (
      v_solicitacao.city_id, btrim(v_solicitacao.prefeitura_nome), 'ativa',
      v_solicitacao.user_id, auth.uid(), now()
    )
    on conflict (city_id) do update
      set status = 'ativa', aprovado_por = auth.uid(), aprovado_em = now(), updated_at = now()
    returning id into v_prefeitura;

    perform public.garantir_triagem_prefeitura(v_solicitacao.city_id, v_solicitacao.user_id);

    insert into public.prefeitura_membros (
      prefeitura_id, user_id, papel, ativo, convidado_por
    ) values (
      v_prefeitura, v_solicitacao.user_id, 'administrador', true, auth.uid()
    )
    on conflict (prefeitura_id, user_id) do update
      set papel = 'administrador', ativo = true, updated_at = now();
  end if;

  update public.prefeitura_solicitacoes
  set status = case when p_aprovar then 'aprovada' else 'recusada' end,
      analisado_por = auth.uid(), analisado_em = now(),
      motivo = nullif(btrim(coalesce(p_motivo, '')), ''), updated_at = now()
  where id = p_solicitacao;

  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  values (
    v_solicitacao.user_id,
    'municipality_access',
    case when p_aprovar then 'Acesso da prefeitura aprovado' else 'Cadastro da prefeitura analisado' end,
    case when p_aprovar
      then 'Seu painel institucional ja esta disponivel.'
      else coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Seu pedido nao foi aprovado.')
    end,
    case when p_aprovar then '/prefeitura/broncas' else '/prefeitura/acesso' end,
    false, now()
  );

  return jsonb_build_object('ok', true, 'aprovada', p_aprovar, 'prefeitura_id', v_prefeitura);
end;
$$;

create or replace function public.criar_convite_administrador_prefeitura(
  p_city_id bigint,
  p_prefeitura_nome text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefeitura uuid;
  v_token uuid := gen_random_uuid();
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente o administrador da plataforma pode criar este convite';
  end if;
  if btrim(coalesce(p_prefeitura_nome, '')) = '' then raise exception 'Informe o nome da prefeitura'; end if;
  if btrim(coalesce(p_email, '')) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Informe um e-mail valido';
  end if;

  insert into public.prefeituras (city_id, nome, status, criado_por, aprovado_por, aprovado_em)
  values (p_city_id, btrim(p_prefeitura_nome), 'ativa', auth.uid(), auth.uid(), now())
  on conflict (city_id) do update
    set nome = excluded.nome, status = 'ativa', aprovado_por = auth.uid(), aprovado_em = now(), updated_at = now()
  returning id into v_prefeitura;

  perform public.garantir_triagem_prefeitura(p_city_id, auth.uid());

  update public.prefeitura_convites
  set status = 'revogado'
  where prefeitura_id = v_prefeitura
    and lower(email_convidado) = lower(btrim(p_email))
    and papel_prefeitura = 'administrador'
    and status = 'pendente';

  insert into public.prefeitura_convites (
    prefeitura_id, email_convidado, papel_prefeitura, token, convidado_por
  ) values (
    v_prefeitura, lower(btrim(p_email)), 'administrador', v_token, auth.uid()
  );

  return jsonb_build_object(
    'ok', true, 'prefeitura_id', v_prefeitura, 'token', v_token,
    'expires_at', now() + interval '7 days'
  );
end;
$$;

create or replace function public.preview_convite_prefeitura(p_token uuid)
returns table (
  prefeitura_nome text,
  cidade_nome text,
  cidade_uf text,
  email_mascarado text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.nome, c.name, s.uf,
    regexp_replace(i.email_convidado, '(^.).*(@.*$)', '\1***\2'),
    i.expires_at
  from public.prefeitura_convites i
  join public.prefeituras p on p.id = i.prefeitura_id and p.status = 'ativa'
  join public.cities c on c.id = p.city_id
  left join public.states s on s.id = c.state_id
  where i.token = p_token and i.status = 'pendente' and i.expires_at > now()
  limit 1
$$;

create or replace function public.aceitar_convite_prefeitura(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_convite public.prefeitura_convites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite'; end if;
  if public.is_admin(auth.uid()) or public.is_master(auth.uid()) then
    raise exception 'Administradores da plataforma nao entram no painel operacional';
  end if;
  select * into v_convite
  from public.prefeitura_convites
  where token = p_token and status = 'pendente'
  for update;
  if not found or v_convite.expires_at <= now() then raise exception 'Convite invalido ou expirado'; end if;
  if v_email <> lower(v_convite.email_convidado) then
    raise exception 'Este convite pertence a outro e-mail';
  end if;

  insert into public.prefeitura_membros (
    prefeitura_id, user_id, papel, ativo, convidado_por
  ) values (
    v_convite.prefeitura_id, auth.uid(), v_convite.papel_prefeitura, true, v_convite.convidado_por
  )
  on conflict (prefeitura_id, user_id) do update
    set papel = excluded.papel, ativo = true, updated_at = now();

  if v_convite.canal_id is not null then
    insert into public.orgao_membros (canal_id, user_id, papel, ativo, convidado_por)
    values (v_convite.canal_id, auth.uid(), v_convite.papel_orgao, true, v_convite.convidado_por)
    on conflict (canal_id, user_id) do update
      set papel = excluded.papel, ativo = true, updated_at = now();
  end if;

  update public.prefeitura_convites
  set status = 'aceito', aceito_por = auth.uid(), aceito_em = now()
  where id = v_convite.id;

  return jsonb_build_object('ok', true, 'prefeitura_id', v_convite.prefeitura_id);
end;
$$;

create or replace function public.adicionar_funcionario_prefeitura(
  p_canal uuid,
  p_user uuid,
  p_papel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_city_id bigint;
  v_prefeitura uuid;
begin
  select city_id into v_city_id from public.orgao_canais where id = p_canal;
  if v_city_id is null then raise exception 'Secretaria nao encontrada'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_city_id) then
    raise exception 'Somente o administrador da prefeitura pode cadastrar funcionarios';
  end if;
  if p_papel not in ('gestor', 'operador', 'leitura') then raise exception 'Papel invalido'; end if;

  select id into v_prefeitura from public.prefeituras
  where city_id = v_city_id and status = 'ativa';

  insert into public.prefeitura_membros (prefeitura_id, user_id, papel, ativo, convidado_por)
  values (v_prefeitura, p_user, 'colaborador', true, auth.uid())
  on conflict (prefeitura_id, user_id) do update set ativo = true, updated_at = now();

  insert into public.orgao_membros (canal_id, user_id, papel, ativo, convidado_por)
  values (p_canal, p_user, p_papel, true, auth.uid())
  on conflict (canal_id, user_id) do update
    set papel = excluded.papel, ativo = true, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.criar_convite_funcionario_prefeitura(
  p_canal uuid,
  p_email text,
  p_papel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_city_id bigint;
  v_prefeitura uuid;
  v_token uuid := gen_random_uuid();
begin
  select city_id into v_city_id from public.orgao_canais where id = p_canal;
  if v_city_id is null then raise exception 'Secretaria nao encontrada'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_city_id) then
    raise exception 'Somente o administrador da prefeitura pode convidar funcionarios';
  end if;
  if p_papel not in ('gestor', 'operador', 'leitura') then raise exception 'Papel invalido'; end if;
  if btrim(coalesce(p_email, '')) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Informe um e-mail valido';
  end if;

  select id into v_prefeitura from public.prefeituras
  where city_id = v_city_id and status = 'ativa';

  update public.prefeitura_convites
  set status = 'revogado'
  where prefeitura_id = v_prefeitura and canal_id = p_canal
    and lower(email_convidado) = lower(btrim(p_email)) and status = 'pendente';

  insert into public.prefeitura_convites (
    prefeitura_id, canal_id, email_convidado, papel_prefeitura,
    papel_orgao, token, convidado_por
  ) values (
    v_prefeitura, p_canal, lower(btrim(p_email)), 'colaborador',
    p_papel, v_token, auth.uid()
  );

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', now() + interval '7 days');
end;
$$;

-- Aprovacao ou troca de categoria/cidade roteia a bronca para a secretaria
-- ativa responsavel. ON CONFLICT preserva o trabalho ja feito no caso.
create or replace function public.sincronizar_caso_do_orgao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canal uuid;
begin
  if coalesce(new.moderation_status, 'approved') <> 'approved'
     or coalesce(new.is_petition, false)
     or new.city_id is null then
    return new;
  end if;

  select oc.canal_id into v_canal
  from public.orgao_categorias oc
  join public.orgao_canais c on c.id = oc.canal_id and c.ativo and not c.canal_triagem
  where oc.city_id = new.city_id and oc.category_id = new.category_id
  limit 1;

  if v_canal is null then
    select c.id into v_canal
    from public.orgao_canais c
    join public.prefeituras p on p.city_id = c.city_id and p.status = 'ativa'
    where c.city_id = new.city_id and c.canal_triagem
    limit 1;
  end if;

  if v_canal is null then return new; end if;

  insert into public.orgao_casos (report_id, canal_id)
  values (new.id, v_canal)
  on conflict (report_id) do update
    set canal_id = excluded.canal_id,
        atribuido_a = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id then null
          else public.orgao_casos.atribuido_a
        end,
        status = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id
               and public.orgao_casos.status not in ('encerrada', 'recusada') then 'triagem'
          else public.orgao_casos.status
        end,
        updated_at = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id then now()
          else public.orgao_casos.updated_at
        end;
  return new;
end;
$$;

drop trigger if exists a_sincronizar_caso_do_orgao on public.reports;
create trigger a_sincronizar_caso_do_orgao
after insert or update of moderation_status, category_id, city_id on public.reports
for each row execute function public.sincronizar_caso_do_orgao();

-- Um canal pode ser configurado muito depois de as broncas terem sido
-- publicadas. Ao ativar o canal ou incluir uma categoria, trazemos tambem a
-- fila aberta que ja existia; sem isso, so as broncas futuras apareceriam.
create or replace function public.popular_casos_do_canal(p_canal uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  insert into public.orgao_casos (report_id, canal_id)
  select r.id, c.id
  from public.orgao_canais c
  join public.orgao_categorias oc on oc.canal_id = c.id
  join public.reports r on r.city_id = c.city_id and r.category_id = oc.category_id
  where c.id = p_canal
    and c.ativo
    and coalesce(r.moderation_status, 'approved') = 'approved'
    and not coalesce(r.is_petition, false)
    and r.status in ('pending', 'in-progress', 'pending_resolution')
  on conflict (report_id) do update
    set canal_id = excluded.canal_id,
        atribuido_a = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id then null
          else public.orgao_casos.atribuido_a
        end,
        status = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id
               and public.orgao_casos.status not in ('encerrada', 'recusada') then 'triagem'
          else public.orgao_casos.status
        end,
        updated_at = case
          when public.orgao_casos.canal_id is distinct from excluded.canal_id then now()
          else public.orgao_casos.updated_at
        end;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- A fila usa paginacao no banco. Retornar SETOF preserva os relacionamentos
-- do PostgREST, enquanto SECURITY INVOKER mantem a RLS como fonte de verdade.
create or replace function public.listar_casos_prefeitura(
  p_canal uuid default null,
  p_status text default 'abertas',
  p_busca text default null
)
returns setof public.orgao_casos
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select caso.*
  from public.orgao_casos caso
  join public.reports r on r.id = caso.report_id
  join public.orgao_canais canal on canal.id = caso.canal_id
  where (p_canal is null or caso.canal_id = p_canal)
    and (
      coalesce(p_status, 'abertas') = 'all'
      or (coalesce(p_status, 'abertas') = 'abertas' and caso.status not in ('encerrada', 'recusada'))
      or caso.status = p_status
    )
    and (
      nullif(btrim(coalesce(p_busca, '')), '') is null
      or (coalesce(r.title, '') || ' ' || coalesce(r.address, '') || ' ' || coalesce(r.neighborhood, ''))
           ilike '%' || btrim(p_busca) || '%'
      or coalesce(caso.protocolo, '') ilike '%' || btrim(p_busca) || '%'
      or canal.nome ilike '%' || btrim(p_busca) || '%'
    )
  order by caso.updated_at desc, caso.report_id
$$;

create or replace function public.resumo_casos_prefeitura(p_canal uuid default null)
returns table (
  total bigint,
  abertas bigint,
  novas bigint,
  atrasadas bigint,
  aguardando_confirmacao bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint,
    count(*) filter (where caso.status not in ('encerrada', 'recusada'))::bigint,
    count(*) filter (where caso.status = 'nova')::bigint,
    count(*) filter (
      where caso.prazo_em < now() and caso.status not in ('encerrada', 'recusada')
    )::bigint,
    count(*) filter (
      where caso.status in ('execucao_informada', 'aguardando_confirmacao')
    )::bigint
  from public.orgao_casos caso
  where p_canal is null or caso.canal_id = p_canal
$$;

create or replace function public.orgao_categoria_popula_painel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.popular_casos_do_canal(new.canal_id);
  return new;
end;
$$;

drop trigger if exists z_orgao_categoria_popula_painel on public.orgao_categorias;
create trigger z_orgao_categoria_popula_painel
after insert or update of canal_id, category_id on public.orgao_categorias
for each row execute function public.orgao_categoria_popula_painel();

create or replace function public.orgao_categoria_retorna_triagem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_triagem uuid;
begin
  select id into v_triagem
  from public.orgao_canais
  where city_id = old.city_id and canal_triagem
  limit 1;

  if v_triagem is not null then
    update public.orgao_casos caso
    set canal_id = v_triagem,
        atribuido_a = null,
        status = case
          when caso.status in ('encerrada', 'recusada') then caso.status
          else 'triagem'
        end,
        updated_at = now()
    from public.reports r
    where caso.report_id = r.id
      and caso.canal_id = old.canal_id
      and r.city_id = old.city_id
      and r.category_id = old.category_id
      and r.status in ('pending', 'in-progress', 'pending_resolution');
  end if;
  return old;
end;
$$;

drop trigger if exists z_orgao_categoria_retorna_triagem on public.orgao_categorias;
create trigger z_orgao_categoria_retorna_triagem
after delete on public.orgao_categorias
for each row execute function public.orgao_categoria_retorna_triagem();

create or replace function public.orgao_canal_ativo_popula_painel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_triagem uuid;
begin
  if new.ativo and not old.ativo then
    perform public.popular_casos_do_canal(new.id);
  elsif old.ativo and not new.ativo and not new.canal_triagem then
    select id into v_triagem
    from public.orgao_canais
    where city_id = new.city_id and canal_triagem
    limit 1;
    if v_triagem is not null then
      update public.orgao_casos caso
      set canal_id = v_triagem,
          atribuido_a = null,
          status = case
            when caso.status in ('encerrada', 'recusada') then caso.status
            else 'triagem'
          end,
          updated_at = now()
      from public.reports r
      where caso.report_id = r.id and caso.canal_id = new.id
        and r.status in ('pending', 'in-progress', 'pending_resolution');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists z_orgao_canal_ativo_popula_painel on public.orgao_canais;
create trigger z_orgao_canal_ativo_popula_painel
after update of ativo on public.orgao_canais
for each row execute function public.orgao_canal_ativo_popula_painel();

create or replace function public.orgao_caso_criado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.orgao_caso_eventos (report_id, canal_id, tipo, para_status, detalhes)
  values (new.report_id, new.canal_id, 'encaminhada', new.status, jsonb_build_object('origem', 'roteamento_automatico'));

  if coalesce(current_setting('app.silenciar_notificacao_orgao', true), '') <> '1' then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select destinatarios.user_id, 'agency_case', 'Nova demanda para sua secretaria',
           coalesce(r.title, 'Uma nova bronca foi encaminhada ao orgao.'),
           '/prefeitura/broncas', new.report_id, false, now()
    from (
      select m.user_id
      from public.orgao_membros m
      where m.canal_id = new.canal_id and m.ativo
      union
      select pm.user_id
      from public.prefeitura_membros pm
      join public.prefeituras p on p.id = pm.prefeitura_id and p.status = 'ativa'
      join public.orgao_canais c on c.city_id = p.city_id
      where c.id = new.canal_id and pm.ativo and pm.papel = 'administrador'
    ) destinatarios
    join public.reports r on r.id = new.report_id;
  end if;
  return new;
end;
$$;

drop trigger if exists a_orgao_caso_criado on public.orgao_casos;
create trigger a_orgao_caso_criado
after insert on public.orgao_casos
for each row execute function public.orgao_caso_criado();

-- Prefeituras que ja existiam antes da caixa de triagem recebem agora seu
-- canal interno e o passivo da cidade. A propria funcao silencia notificacoes
-- deste backfill; apenas broncas novas avisam a equipe.
select public.garantir_triagem_prefeitura(p.city_id, p.criado_por)
from public.prefeituras p
where p.status = 'ativa';

-- A distribuicao manual e exclusiva do administrador municipal. O destino
-- precisa ser uma secretaria ativa da mesma cidade; a troca tambem limpa uma
-- atribuicao antiga, pois funcionarios pertencem a uma secretaria especifica.
create or replace function public.encaminhar_caso_do_orgao(
  p_report_id uuid,
  p_canal uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caso public.orgao_casos%rowtype;
  v_origem public.orgao_canais%rowtype;
  v_destino public.orgao_canais%rowtype;
begin
  select * into v_caso
  from public.orgao_casos
  where report_id = p_report_id
  for update;
  if not found then raise exception 'Demanda nao encontrada no painel municipal'; end if;

  select * into v_origem from public.orgao_canais where id = v_caso.canal_id;
  select * into v_destino from public.orgao_canais where id = p_canal;
  if not found or not v_destino.ativo or v_destino.canal_triagem then
    raise exception 'Selecione uma secretaria ativa';
  end if;
  if v_destino.city_id is distinct from v_origem.city_id then
    raise exception 'A secretaria precisa pertencer a mesma cidade da demanda';
  end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_destino.city_id) then
    raise exception 'Somente o administrador municipal pode encaminhar demandas';
  end if;

  if v_caso.canal_id = p_canal then
    return jsonb_build_object('ok', true, 'report_id', p_report_id, 'canal_id', p_canal);
  end if;

  update public.orgao_casos
  set canal_id = p_canal,
      atribuido_a = null,
      status = case when status in ('encerrada', 'recusada') then status else 'triagem' end,
      recebido_em = case
        when status not in ('encerrada', 'recusada') then coalesce(recebido_em, now())
        else recebido_em
      end,
      updated_at = now()
  where report_id = p_report_id;

  insert into public.orgao_caso_eventos (
    report_id, canal_id, tipo, de_status, para_status, detalhes, criado_por
  ) values (
    p_report_id, p_canal, 'encaminhada', v_caso.status,
    case when v_caso.status in ('encerrada', 'recusada') then v_caso.status else 'triagem' end,
    jsonb_build_object(
      'origem', 'distribuicao_manual',
      'canal_anterior', v_caso.canal_id,
      'canal_destino', p_canal
    ),
    auth.uid()
  );

  insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
  select m.user_id, 'agency_case', 'Demanda encaminhada para sua secretaria',
         coalesce(r.title, 'Uma demanda municipal foi encaminhada para atendimento.'),
         '/prefeitura/broncas/' || p_report_id::text, p_report_id, false, now()
  from public.orgao_membros m
  join public.reports r on r.id = p_report_id
  where m.canal_id = p_canal and m.ativo;

  if v_caso.status not in ('encerrada', 'recusada') then
    update public.reports
    set status = 'in-progress'
    where id = p_report_id and status = 'pending';
  end if;

  return jsonb_build_object('ok', true, 'report_id', p_report_id, 'canal_id', p_canal);
end;
$$;

-- Uma unica RPC grava a mudanca, a resposta/nota e a etapa publica. Assim nao
-- existe estado alterado sem auditoria por causa de uma falha entre requests.
create or replace function public.atualizar_caso_do_orgao(
  p_report_id uuid,
  p_status text default null,
  p_prioridade text default null,
  p_atribuido_a uuid default null,
  p_protocolo text default null,
  p_prazo_em timestamptz default null,
  p_resposta_publica text default null,
  p_nota_interna text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caso public.orgao_casos%rowtype;
  v_novo public.orgao_casos%rowtype;
  v_orgao text;
  v_etapa text;
  v_resposta text := nullif(btrim(coalesce(p_resposta_publica, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota_interna, '')), '');
begin
  select * into v_caso from public.orgao_casos where report_id = p_report_id for update;
  if v_caso.report_id is null then raise exception 'Demanda nao encontrada no painel do orgao'; end if;
  if not public.pode_operar_caso_do_orgao(auth.uid(), v_caso.canal_id) then
    raise exception 'Sem permissao para operar esta secretaria';
  end if;
  if p_status is not null and p_status not in (
    'nova', 'recebida', 'triagem', 'atribuida', 'programada', 'em_execucao',
    'execucao_informada', 'aguardando_confirmacao', 'encerrada', 'recusada'
  ) then raise exception 'Situacao invalida'; end if;
  if p_prioridade is not null and p_prioridade not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'Prioridade invalida';
  end if;
  if p_status = 'recusada' and v_resposta is null then
    raise exception 'Explique publicamente o motivo da recusa';
  end if;
  if p_atribuido_a is not null and not exists (
    select 1 from public.orgao_membros m
    where m.canal_id = v_caso.canal_id and m.user_id = p_atribuido_a and m.ativo
  ) then raise exception 'O responsavel precisa fazer parte desta secretaria'; end if;

  select nome into v_orgao from public.orgao_canais where id = v_caso.canal_id;

  update public.orgao_casos
  set status = coalesce(p_status, status),
      prioridade = coalesce(p_prioridade, prioridade),
      -- O formulario sempre envia o retrato completo destes campos; NULL
      -- significa limpar atribuicao, protocolo ou prazo.
      atribuido_a = p_atribuido_a,
      protocolo = nullif(btrim(coalesce(p_protocolo, '')), ''),
      prazo_em = p_prazo_em,
      recebido_em = case
        when recebido_em is null and coalesce(p_status, status) <> 'nova' then now()
        else recebido_em
      end,
      ultima_resposta_publica_em = case when v_resposta is not null then now() else ultima_resposta_publica_em end,
      updated_at = now()
  where report_id = p_report_id
  returning * into v_novo;

  if v_caso.status is distinct from v_novo.status
     or v_caso.prioridade is distinct from v_novo.prioridade
     or v_caso.atribuido_a is distinct from v_novo.atribuido_a
     or v_caso.protocolo is distinct from v_novo.protocolo
     or v_caso.prazo_em is distinct from v_novo.prazo_em then
    insert into public.orgao_caso_eventos (
      report_id, canal_id, tipo, de_status, para_status, detalhes, criado_por
    ) values (
      p_report_id, v_caso.canal_id,
      case when v_caso.atribuido_a is distinct from v_novo.atribuido_a then 'atribuida' else 'atualizada' end,
      v_caso.status, v_novo.status,
      jsonb_strip_nulls(jsonb_build_object(
        'prioridade', v_novo.prioridade,
        'atribuido_a', v_novo.atribuido_a,
        'protocolo', v_novo.protocolo,
        'prazo_em', v_novo.prazo_em
      )), auth.uid()
    );
  end if;

  if v_resposta is not null then
    insert into public.orgao_respostas (report_id, canal_id, orgao_nome, autor_id, visibilidade, mensagem)
    values (p_report_id, v_caso.canal_id, v_orgao, auth.uid(), 'publica', v_resposta);
    insert into public.orgao_caso_eventos (report_id, canal_id, tipo, detalhes, criado_por)
    values (p_report_id, v_caso.canal_id, 'resposta_publica', jsonb_build_object('mensagem', v_resposta), auth.uid());
  end if;

  if v_nota is not null then
    insert into public.orgao_respostas (report_id, canal_id, orgao_nome, autor_id, visibilidade, mensagem)
    values (p_report_id, v_caso.canal_id, v_orgao, auth.uid(), 'interna', v_nota);
    insert into public.orgao_caso_eventos (report_id, canal_id, tipo, detalhes, criado_por)
    values (p_report_id, v_caso.canal_id, 'nota_interna', jsonb_build_object('mensagem', v_nota), auth.uid());
  end if;

  if v_caso.status is distinct from v_novo.status then
    v_etapa := case v_novo.status
      when 'recebida' then 'recebida'
      when 'programada' then 'programada'
      when 'execucao_informada' then 'executada'
      when 'aguardando_confirmacao' then 'executada'
      when 'recusada' then 'recusada'
      else null
    end;
    if v_etapa is not null then
      insert into public.report_official_steps (
        report_id, etapa, orgao, protocolo, observacao, registrado_por, registrado_por_papel
      ) values (
        p_report_id, v_etapa, v_orgao, v_novo.protocolo,
        case when v_etapa = 'recusada' then v_resposta else null end,
        auth.uid(), 'orgao'
      );
    end if;
  end if;

  if v_novo.status in ('recebida', 'triagem', 'atribuida', 'programada', 'em_execucao') then
    update public.reports set status = 'in-progress'
    where id = p_report_id and status = 'pending';
  elsif v_novo.status in ('execucao_informada', 'aguardando_confirmacao') then
    update public.reports set status = 'pending_resolution'
    where id = p_report_id and status in ('pending', 'in-progress');
  end if;

  if v_resposta is not null then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select r.author_id, 'agency_response', 'A prefeitura respondeu sua bronca',
           left(v_resposta, 180), '/bronca/' || p_report_id::text, p_report_id, false, now()
    from public.reports r
    where r.id = p_report_id and r.author_id is not null and r.author_id <> auth.uid();
  end if;

  return jsonb_build_object('ok', true, 'report_id', p_report_id, 'status', v_novo.status);
end;
$$;

-- Backfill das broncas aprovadas que ja possuem secretaria ativa configurada.
insert into public.orgao_casos (report_id, canal_id)
select r.id, oc.canal_id
from public.reports r
join public.orgao_categorias oc on oc.city_id = r.city_id and oc.category_id = r.category_id
join public.orgao_canais c on c.id = oc.canal_id and c.ativo and not c.canal_triagem
where coalesce(r.moderation_status, 'approved') = 'approved'
  and not coalesce(r.is_petition, false)
  and r.status in ('pending', 'in-progress', 'pending_resolution')
on conflict (report_id) do update
  set canal_id = excluded.canal_id,
      atribuido_a = case
        when public.orgao_casos.canal_id is distinct from excluded.canal_id then null
        else public.orgao_casos.atribuido_a
      end,
      status = case
        when public.orgao_casos.canal_id is distinct from excluded.canal_id
             and public.orgao_casos.status not in ('encerrada', 'recusada') then 'triagem'
        else public.orgao_casos.status
      end,
      updated_at = case
        when public.orgao_casos.canal_id is distinct from excluded.canal_id then now()
        else public.orgao_casos.updated_at
      end;

alter table public.prefeituras enable row level security;
alter table public.prefeitura_membros enable row level security;
alter table public.prefeitura_solicitacoes enable row level security;
alter table public.prefeitura_convites enable row level security;
alter table public.orgao_membros enable row level security;
alter table public.orgao_casos enable row level security;
alter table public.orgao_caso_eventos enable row level security;
alter table public.orgao_respostas enable row level security;

-- Permite reaplicar a migration com seguranca. PostgreSQL nao oferece
-- `create policy if not exists`, portanto removemos somente as policies que
-- pertencem a este painel antes de recria-las com a definicao atual.
drop policy if exists prefeituras_select on public.prefeituras;
drop policy if exists prefeituras_admin_update on public.prefeituras;
drop policy if exists prefeitura_membros_select on public.prefeitura_membros;
drop policy if exists prefeitura_membros_admin_update on public.prefeitura_membros;
drop policy if exists prefeitura_solicitacoes_select on public.prefeitura_solicitacoes;
drop policy if exists prefeitura_solicitacoes_insert on public.prefeitura_solicitacoes;
drop policy if exists prefeitura_convites_select on public.prefeitura_convites;
drop policy if exists orgao_membros_select on public.orgao_membros;
drop policy if exists orgao_membros_insert on public.orgao_membros;
drop policy if exists orgao_membros_update on public.orgao_membros;
drop policy if exists orgao_membros_delete on public.orgao_membros;
drop policy if exists orgao_casos_select on public.orgao_casos;
drop policy if exists orgao_caso_eventos_select on public.orgao_caso_eventos;
drop policy if exists orgao_respostas_publicas_select on public.orgao_respostas;

create policy prefeituras_select on public.prefeituras
for select to authenticated using (
  public.is_admin(auth.uid()) or public.is_master(auth.uid())
  or public.papel_na_prefeitura(auth.uid(), id) is not null
);
create policy prefeituras_admin_update on public.prefeituras
for update to authenticated
using (public.is_admin(auth.uid()) or public.is_master(auth.uid()))
with check (public.is_admin(auth.uid()) or public.is_master(auth.uid()));

create policy prefeitura_membros_select on public.prefeitura_membros
for select to authenticated using (
  user_id = auth.uid()
  or public.is_admin(auth.uid()) or public.is_master(auth.uid())
  or public.papel_na_prefeitura(auth.uid(), prefeitura_id) = 'administrador'
);
create policy prefeitura_membros_admin_update on public.prefeitura_membros
for update to authenticated
using (public.is_admin(auth.uid()) or public.is_master(auth.uid()))
with check (public.is_admin(auth.uid()) or public.is_master(auth.uid()));

create policy prefeitura_solicitacoes_select on public.prefeitura_solicitacoes
for select to authenticated using (
  user_id = auth.uid() or public.is_admin(auth.uid()) or public.is_master(auth.uid())
);
create policy prefeitura_solicitacoes_insert on public.prefeitura_solicitacoes
for insert to authenticated with check (
  user_id = auth.uid() and status = 'pendente'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tipo_conta = 'cidadao'
  )
);

create policy prefeitura_convites_select on public.prefeitura_convites
for select to authenticated using (
  public.is_admin(auth.uid()) or public.is_master(auth.uid())
  or public.papel_na_prefeitura(auth.uid(), prefeitura_id) = 'administrador'
);

create policy orgao_membros_select on public.orgao_membros
for select to authenticated using (
  user_id = auth.uid() or public.pode_ver_caso_do_orgao(auth.uid(), canal_id)
);
create policy orgao_membros_insert on public.orgao_membros
for insert to authenticated with check (
  public.pode_gerir_equipe_do_orgao(auth.uid(), canal_id)
);
create policy orgao_membros_update on public.orgao_membros
for update to authenticated
using (public.pode_gerir_equipe_do_orgao(auth.uid(), canal_id))
with check (public.pode_gerir_equipe_do_orgao(auth.uid(), canal_id));
create policy orgao_membros_delete on public.orgao_membros
for delete to authenticated using (public.pode_gerir_equipe_do_orgao(auth.uid(), canal_id));

create policy orgao_casos_select on public.orgao_casos
for select to authenticated using (public.pode_ver_caso_do_orgao(auth.uid(), canal_id));

create policy orgao_caso_eventos_select on public.orgao_caso_eventos
for select to authenticated using (
  exists (
    select 1
    from public.orgao_casos caso
    where caso.report_id = orgao_caso_eventos.report_id
      and public.pode_ver_caso_do_orgao(auth.uid(), caso.canal_id)
  )
);

create policy orgao_respostas_publicas_select on public.orgao_respostas
for select using (
  visibilidade = 'publica'
  or exists (
    select 1
    from public.orgao_casos caso
    where caso.report_id = orgao_respostas.report_id
      and public.pode_ver_caso_do_orgao(auth.uid(), caso.canal_id)
  )
);

-- Membros precisam ler o nome do proprio canal, mesmo sem papel de embaixador.
drop policy if exists orgao_canais_membro_select on public.orgao_canais;
create policy orgao_canais_membro_select on public.orgao_canais
for select to authenticated using (public.papel_no_orgao(auth.uid(), id) is not null);

drop policy if exists orgao_canais_admin_delete on public.orgao_canais;
drop policy if exists orgao_canais_prefeitura_delete on public.orgao_canais;
create policy orgao_canais_prefeitura_delete on public.orgao_canais
for delete to authenticated using (public.pode_administrar_prefeitura(auth.uid(), city_id));

revoke all on public.prefeituras, public.prefeitura_membros, public.prefeitura_solicitacoes, public.prefeitura_convites from anon;
revoke all on public.orgao_membros, public.orgao_casos, public.orgao_caso_eventos, public.orgao_respostas from anon;
grant select, update on public.prefeituras to authenticated;
grant select, update on public.prefeitura_membros to authenticated;
grant select on public.prefeitura_convites to authenticated;
grant select, insert on public.prefeitura_solicitacoes to authenticated;
grant select, insert, update, delete on public.orgao_membros to authenticated;
grant select on public.orgao_casos, public.orgao_caso_eventos to authenticated;
grant select on public.orgao_respostas to anon, authenticated;

revoke all on function public.atualizar_caso_do_orgao(uuid, text, text, uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.atualizar_caso_do_orgao(uuid, text, text, uuid, text, timestamptz, text, text) to authenticated;
revoke all on function public.encaminhar_caso_do_orgao(uuid, uuid) from public, anon;
grant execute on function public.encaminhar_caso_do_orgao(uuid, uuid) to authenticated;
revoke all on function public.listar_casos_prefeitura(uuid, text, text) from public, anon;
grant execute on function public.listar_casos_prefeitura(uuid, text, text) to authenticated;
revoke all on function public.resumo_casos_prefeitura(uuid) from public, anon;
grant execute on function public.resumo_casos_prefeitura(uuid) to authenticated;

revoke all on function public.papel_no_orgao(uuid, uuid) from public, anon;
revoke all on function public.papel_na_prefeitura(uuid, uuid) from public, anon;
revoke all on function public.pode_acessar_prefeitura(uuid, bigint) from public, anon;
revoke all on function public.pode_ver_caso_do_orgao(uuid, uuid) from public, anon;
revoke all on function public.pode_operar_caso_do_orgao(uuid, uuid) from public, anon;
revoke all on function public.pode_gerir_equipe_do_orgao(uuid, uuid) from public, anon;
revoke all on function public.pode_administrar_prefeitura(uuid, bigint) from public, anon;
revoke all on function public.pode_gerir_canal_do_orgao(uuid, bigint) from public, anon;
revoke all on function public.marcar_conta_como_prefeitura(uuid) from public, anon, authenticated;
revoke all on function public.proteger_tipo_conta() from public, anon, authenticated;
revoke all on function public.vincular_conta_a_prefeitura() from public, anon, authenticated;
revoke all on function public.garantir_triagem_prefeitura(bigint, uuid) from public, anon, authenticated;
revoke all on function public.validar_membro_do_orgao() from public, anon, authenticated;
revoke all on function public.orgao_canal_so_admin_ativa() from public, anon, authenticated;
revoke all on function public.sincronizar_caso_do_orgao() from public, anon, authenticated;
revoke all on function public.popular_casos_do_canal(uuid) from public, anon, authenticated;
revoke all on function public.orgao_categoria_popula_painel() from public, anon, authenticated;
revoke all on function public.orgao_categoria_retorna_triagem() from public, anon, authenticated;
revoke all on function public.orgao_canal_ativo_popula_painel() from public, anon, authenticated;
revoke all on function public.orgao_caso_criado() from public, anon, authenticated;
revoke all on function public.revisar_solicitacao_prefeitura(uuid, boolean, text) from public, anon;
revoke all on function public.criar_convite_administrador_prefeitura(bigint, text, text) from public, anon;
revoke all on function public.preview_convite_prefeitura(uuid) from public;
revoke all on function public.aceitar_convite_prefeitura(uuid) from public, anon;
revoke all on function public.adicionar_funcionario_prefeitura(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.criar_convite_funcionario_prefeitura(uuid, text, text) from public, anon;
grant execute on function public.papel_no_orgao(uuid, uuid) to authenticated;
grant execute on function public.papel_na_prefeitura(uuid, uuid) to authenticated;
grant execute on function public.pode_acessar_prefeitura(uuid, bigint) to authenticated;
grant execute on function public.pode_ver_caso_do_orgao(uuid, uuid) to authenticated;
grant execute on function public.pode_operar_caso_do_orgao(uuid, uuid) to authenticated;
grant execute on function public.pode_gerir_equipe_do_orgao(uuid, uuid) to authenticated;
grant execute on function public.pode_administrar_prefeitura(uuid, bigint) to authenticated;
grant execute on function public.pode_gerir_canal_do_orgao(uuid, bigint) to authenticated;
grant execute on function public.revisar_solicitacao_prefeitura(uuid, boolean, text) to authenticated;
grant execute on function public.criar_convite_administrador_prefeitura(bigint, text, text) to authenticated;
grant execute on function public.preview_convite_prefeitura(uuid) to anon, authenticated;
grant execute on function public.aceitar_convite_prefeitura(uuid) to authenticated;
grant execute on function public.criar_convite_funcionario_prefeitura(uuid, text, text) to authenticated;

-- Relatorios seguem pelo cron/service role. O admin da plataforma nao dispara
-- operacao de uma prefeitura pelo painel administrativo.
revoke execute on function public.enviar_relatorios_do_orgao(text) from authenticated;

notify pgrst, 'reload schema';
commit;
