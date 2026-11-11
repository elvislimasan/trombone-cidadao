begin;

-- CPF fica separado dos pedidos e dos perfis públicos. Só funções com privilégios
-- podem consultá-lo; o aplicativo envia o número apenas ao solicitar mudas.
create table public.tree_adoption_cpf (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  created_at timestamptz not null default now()
);
alter table public.tree_adoption_cpf enable row level security;
revoke all on public.tree_adoption_cpf from public, anon, authenticated;
create index tree_adoption_cpf_number on public.tree_adoption_cpf(cpf);
create index tree_adoption_completed_by_author_month on public.tree_adoption_requests(author_id,fulfilled_on)
  where request_type='muda' and status='concluida';

create function public.tree_adoption_valid_cpf(p_cpf text) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare v_sum integer; v_digit integer; v_index integer;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf=repeat(left(p_cpf,1),11) then return false; end if;
  for v_index in 1..2 loop
    v_sum=0;
    for v_digit in 1..(8+v_index) loop
      v_sum=v_sum+substring(p_cpf from v_digit for 1)::integer*(10+v_index-v_digit);
    end loop;
    if ((v_sum*10)%11)%10 <> substring(p_cpf from 9+v_index for 1)::integer then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.tree_adoption_valid_cpf(text) from public, anon, authenticated;

-- Mantém a implementação existente de cadastro e sua idempotência, acrescentando
-- a identificação antes do envio. A função antiga deixa de ser chamável pelo app.
alter function public.submit_tree_adoption(jsonb) rename to submit_tree_adoption_without_cpf;
revoke all on function public.submit_tree_adoption_without_cpf(jsonb) from public, anon, authenticated;

create function public.submit_tree_adoption(p_request jsonb) returns public.tree_adoption_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cpf text; v_existing text; v_item jsonb; v_total integer=0;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para enviar a solicitação.' using errcode='42501'; end if;
  if p_request->>'request_type'='muda' then
    v_cpf=regexp_replace(coalesce(p_request->>'requester_cpf',''),'[^0-9]','','g');
    if not public.tree_adoption_valid_cpf(v_cpf) then
      raise exception 'Informe um CPF válido para solicitar mudas.' using errcode='23514';
    end if;
    if jsonb_typeof(p_request->'items') is distinct from 'array' then
      raise exception 'Informe as mudas e quantidades.' using errcode='23514';
    end if;
    for v_item in select value from jsonb_array_elements(p_request->'items') loop
      if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,4}$' then
        raise exception 'Informe quantidades inteiras positivas.' using errcode='23514';
      end if;
      v_total=v_total+(v_item->>'quantity')::integer;
    end loop;
    if v_total not between 1 and 6 then
      raise exception 'Cada pedido de retirada pode ter até 6 mudas.' using errcode='23514';
    end if;
    perform pg_advisory_xact_lock(420,hashtext(auth.uid()::text));
    select cpf into v_existing from public.tree_adoption_cpf where author_id=auth.uid() for update;
    if found then
      if v_existing<>v_cpf then
        raise exception 'O CPF informado difere do registrado para esta conta. Procure a equipe para corrigir o cadastro.' using errcode='23514';
      end if;
    else
      insert into public.tree_adoption_cpf(author_id,cpf) values(auth.uid(),v_cpf);
    end if;
  end if;
  return public.submit_tree_adoption_without_cpf(p_request);
end $$;
revoke all on function public.submit_tree_adoption(jsonb) from public, anon;
grant execute on function public.submit_tree_adoption(jsonb) to authenticated;

-- A cota usa a data real de retirada, inclusive quando a equipe conclui o pedido.
-- Cancelamentos, recusas e pedidos ainda em andamento não entram na soma.
create function public.check_tree_adoption_monthly_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cpf text; v_start date; v_used integer; v_quantity integer;
begin
  if new.request_type<>'muda' or new.status<>'concluida' then return new; end if;
  if tg_op='UPDATE' and old.status='concluida'
    and old.fulfilled_on is not distinct from new.fulfilled_on
    and old.items is not distinct from new.items
    and old.request_type is not distinct from new.request_type
    and old.author_id is not distinct from new.author_id then return new; end if;
  if new.fulfilled_on is null then
    raise exception 'Informe a data da retirada das mudas.' using errcode='23514';
  end if;
  select cpf into v_cpf from public.tree_adoption_cpf where author_id=new.author_id;
  -- Pedidos antigos não tinham CPF. A regra passa a valer quando a pessoa o informa.
  if v_cpf is null then return new; end if;
  perform pg_advisory_xact_lock(421,hashtext(v_cpf));
  v_start=date_trunc('month',new.fulfilled_on)::date;
  select coalesce(sum((item.value->>'quantity')::integer),0) into v_used
    from public.tree_adoption_requests r
    join public.tree_adoption_cpf applicant on applicant.author_id=r.author_id
    cross join lateral jsonb_array_elements(r.items) item
    where applicant.cpf=v_cpf and r.request_type='muda' and r.status='concluida'
      and r.fulfilled_on>=v_start and r.fulfilled_on<(v_start+interval '1 month')::date
      and r.id<>new.id;
  select coalesce(sum((item.value->>'quantity')::integer),0) into v_quantity
    from jsonb_array_elements(new.items) item;
  if v_used+v_quantity>6 then
    raise exception 'Esta retirada ultrapassaria o limite de 6 mudas no mês para este CPF. Confira as retiradas anteriores ou aguarde o próximo mês.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.check_tree_adoption_monthly_receipt() from public, anon, authenticated;
create trigger tree_adoption_monthly_receipt before update of status,fulfilled_on,items,author_id,request_type
  on public.tree_adoption_requests for each row execute function public.check_tree_adoption_monthly_receipt();

notify pgrst,'reload schema';
commit;
